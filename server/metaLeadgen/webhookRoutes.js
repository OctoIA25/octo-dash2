/**
 * Receiver do webhook leadgen da Meta.
 *
 * URL POR TENANT: o :token do path identifica o tenant ANTES de qualquer
 * validação. É a única ordem possível — a assinatura é HMAC com o app_secret
 * DAQUELE tenant (cada imobiliária tem o próprio app), e o identificador do
 * tenant só existiria dentro do corpo que ainda não foi validado.
 *
 * O receiver SÓ PERSISTE. Buscar o lead no Graph e injetar no CRM é trabalho do
 * processor: a Meta corta a conexão em poucos segundos e trata demora como
 * falha, então trabalho pesado aqui vira reentrega.
 *
 * Requer req.rawBody — o corpo cru, montado pelo callback `verify` do
 * express.json nos entrypoints. O corpo já parseado não serve: o HMAC é sobre
 * os bytes exatos, e re-serializar muda espaçamento e ordem de chaves.
 */
import { verifyMetaSignature } from './signature.js';
import { createMetaConfigResolver } from './configResolver.js';

const EVENTS_TABLE = 'meta_leadgen_events';

// ponytail: teto por requisição. Não é mais proteção do event loop (o upsert
// abaixo é uma chamada só, não um await por evento) — é só guarda de memória
// contra um corpo absurdo. Lead ads real manda um punhado de eventos por
// entrega, então o teto folgado nunca deveria ser tocado em produção.
const MAX_EVENTS_POR_REQUISICAO = 5000;

// Meta só aceita string/number nesses campos; qualquer outro tipo (objeto,
// array) é lixo que a Task 8 consumiria sem aviso. Mesmo rigor que
// signature.js já usa para não confiar cegamente no formato do payload.
function toIdString(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return null;
}

export function registerMetaWebhookRoutes(app, supabase, options = {}) {
  const resolver = options.resolver || createMetaConfigResolver({ supabase });

  // Handshake da assinatura do webhook. A Meta chama uma vez, na hora em que a
  // imobiliária salva a URL no app dela.
  app.get('/api/v1/integrations/meta/webhook/:token', async (req, res) => {
    try {
      const cfg = await resolver.resolveByWebhookToken(req.params?.token);
      if (!cfg) return res.status(404).json({ ok: false, error: 'not_found' });

      const mode = req.query?.['hub.mode'];
      const verifyToken = req.query?.['hub.verify_token'];
      const challenge = req.query?.['hub.challenge'];
      if (mode !== 'subscribe' || verifyToken !== cfg.verifyToken) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      // A Meta exige o challenge cru, sem JSON em volta.
      return res.status(200).set('content-type', 'text/plain').send(String(challenge ?? ''));
    } catch (err) {
      console.error('[meta-leadgen] handshake falhou:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/v1/integrations/meta/webhook/:token', async (req, res) => {
    try {
      const cfg = await resolver.resolveByWebhookToken(req.params?.token);
      // 404 igual para token inexistente e integração desativada: responder
      // diferente confirmaria a existência de um tenant para quem chuta tokens.
      if (!cfg || cfg.status !== 'active') return res.status(404).json({ ok: false, error: 'not_found' });

      const signature = req.headers?.['x-hub-signature-256'];
      if (!verifyMetaSignature(req.rawBody, signature, cfg.appSecret)) {
        console.warn(`[meta-leadgen] assinatura inválida tenant=${cfg.tenantId}`);
        return res.status(401).json({ ok: false, error: 'invalid_signature' });
      }

      const eventos = [];
      for (const entry of req.body?.entry || []) {
        // changes de formato inesperado (não-array) não pode lançar — pula a
        // entrada, igual ao que já fazemos com `field` fora de 'leadgen'.
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          if (change?.field !== 'leadgen') continue;
          const v = change.value || {};
          const leadgenId = toIdString(v.leadgen_id);
          if (!leadgenId) {
            console.warn('[meta-leadgen] leadgen_id ausente ou de tipo inválido, evento ignorado');
            continue;
          }
          eventos.push({
            leadgen_id: leadgenId,
            tenant_id: cfg.tenantId,
            page_id: toIdString(v.page_id) ?? toIdString(entry?.id),
            form_id: toIdString(v.form_id),
            ad_id: toIdString(v.ad_id),
            raw: v,
            status: 'pending',
          });
        }
      }

      // Teto de eventos por requisição: o restante é descartado, sempre com
      // log explícito (nunca em silêncio). NÃO vira 500: o corte é posicional
      // e determinístico — a reentrega da Meta manda o mesmo payload inteiro,
      // então cairia sempre no mesmo evento cortado, gerando reentregas
      // infinitas e inúteis até a Meta desistir. Retentar não recupera nada
      // aqui; o log é o que dá visibilidade do que ficou de fora.
      let descartados = 0;
      if (eventos.length > MAX_EVENTS_POR_REQUISICAO) {
        descartados = eventos.length - MAX_EVENTS_POR_REQUISICAO;
        eventos.length = MAX_EVENTS_POR_REQUISICAO;
        console.warn(
          `[meta-leadgen] payload tenant=${cfg.tenantId} excedeu o teto de ${MAX_EVENTS_POR_REQUISICAO} eventos, descartando ${descartados}`
        );
      }

      if (eventos.length > 0) {
        // Upsert em lote: uma chamada só ao banco em vez de um await por
        // evento — é isso que tira o laço sequencial do caminho quente do
        // webhook (o processo Node é compartilhado por todos os tenants).
        // `ignoreDuplicates: true` vira ON CONFLICT DO NOTHING: a reentrega da
        // Meta manda leadgen_id repetido, e o banco absorve isso sem erro — a
        // idempotência não sumiu, só trocou de lugar (era o 23505 do INSERT).
        const { error } = await supabase
          .from(EVENTS_TABLE)
          .upsert(eventos, { onConflict: 'leadgen_id', ignoreDuplicates: true });

        if (error) {
          console.error(`[meta-leadgen] falha ao enfileirar eventos: ${error.message}`);
          // 500 de propósito: a Meta reenvia o payload inteiro em não-200, e
          // isso é seguro aqui porque o ON CONFLICT DO NOTHING torna a
          // reentrega idempotente. Responder 200 com o upsert falho perderia
          // esses leads para sempre — a Meta nunca mais reenviaria.
          return res.status(500).json({ ok: false, error: 'upsert_failed' });
        }
      }

      return res.status(200).json({ ok: true, received: eventos.length });
    } catch (err) {
      console.error('[meta-leadgen] receiver falhou:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}
