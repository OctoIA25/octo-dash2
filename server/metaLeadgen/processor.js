/**
 * Evento da fila → lead no CRM.
 *
 * Injeta via POST /api/v1/leads (loopback, com a API key do tenant) em vez de
 * extrair um ingestLead() das ~490 linhas da rota. Aquela rota JÁ É o contrato
 * público de entrada de lead, documentado e usado por integradores externos; o
 * processor é mais um produtor externo. Extrair criaria uma segunda porta para
 * o mesmo fluxo, e duas portas divergem — uma ganha um campo que a outra não
 * ganha. De brinde, herdamos roleta, bolsão e o trigger que aciona a Lia sem
 * duplicar nada.
 *
 * A classificação retry vs failed é o coração deste módulo. Sem o corte no 4xx,
 * um formulário sem nome e sem telefone (que a rota recusa com 400) viraria
 * retry para sempre.
 */
import { loadMetaEnv } from './metaConfig.js';
import { createMetaGraphClient } from './graphClient.js';
import { createMetaConfigResolver, CONFIG_TABLE } from './configResolver.js';
import { normalizeLeadgen } from './normalizer.js';
import { getDeletedTenantIds } from '../utils/tenantSoftDelete.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const EVENTS_TABLE = 'meta_leadgen_events';
const RETRIABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

export function createMetaLeadgenProcessor({
  supabase,
  resolver = createMetaConfigResolver({ supabase }),
  graphClient = createMetaGraphClient({}),
  fetchImpl = fetch,
  processEnv = process.env,
  logger = noopLogger,
  now = Date.now,
}) {
  const cfg = loadMetaEnv(processEnv);

  async function apiKeyFor(tenantId) {
    const { data, error } = await supabase
      .from('tenant_api_keys').select('api_key')
      .eq('tenant_id', tenantId).eq('provider', 'crm').eq('status', 'active')
      .limit(1);
    if (error) { logger.warn(`[meta-leadgen] lookup de api key falhou: ${error.message}`); return null; }
    return data?.[0]?.api_key || null;
  }

  async function mark(event, patch) {
    const { error } = await supabase.from(EVENTS_TABLE).update(patch).eq('id', event.id);
    if (error) logger.warn(`[meta-leadgen] falha ao marcar evento ${event.id}: ${error.message}`);
  }

  async function markDone(event) {
    await mark(event, { status: 'done', attempts: (event.attempts || 0) + 1, last_error: null, processed_at: new Date(now()).toISOString() });
    return { status: 'done' };
  }

  async function markFailed(event, attempts, motivo) {
    await mark(event, { status: 'failed', attempts, last_error: motivo, processed_at: new Date(now()).toISOString() });
    return { status: 'failed', error: motivo };
  }

  // attempts já esgotados viram failed mesmo em erro retriable: sem teto, um
  // erro transitório que nunca passa ocupa a fila para sempre.
  async function retryOrFail(event, motivo) {
    const attempts = (event.attempts || 0) + 1;
    if (attempts >= cfg.maxAttempts) {
      return markFailed(event, attempts, `${motivo} (esgotou ${attempts} tentativas)`);
    }
    await mark(event, { status: 'pending', attempts, last_error: motivo });
    return { status: 'retry', error: motivo };
  }

  async function fail(event, motivo) {
    return markFailed(event, (event.attempts || 0) + 1, motivo);
  }

  async function processEvent(event) {
    // retryOrFail, não fail: resolveByTenant devolve `null` tanto para "tenant
    // sem config" quanto para erro do Supabase (o catch do resolver engole os
    // dois). Marcar `failed` é terminal e invisível — ninguém lê a tabela de
    // eventos — então um hiccup do banco destruiria lead pago em silêncio. O
    // teto de maxAttempts garante que o tenant genuinamente sem config acaba em
    // failed do mesmo jeito, só que depois de alguns ciclos. Mesmo raciocínio
    // do erro do SELECT de duplicidade logo abaixo.
    const config = await resolver.resolveByTenant(event.tenant_id);
    if (!config) return retryOrFail(event, 'config de Meta Lead Ads indisponível (tenant sem configuração ou leitura falhou)');

    // Recuperação de crash: se o processo morrer entre o POST (que já criou o
    // lead) e o UPDATE que marca `done`, o evento continua `pending` e seria
    // reprocessado — postando o mesmo lead de novo (segunda atribuição da
    // roleta, segundo disparo da Lia). O UNIQUE em leadgen_id na própria
    // tabela de eventos só protege contra reentrega do WEBHOOK; não protege
    // contra o processor reprocessar uma linha pending. Por isso checa aqui
    // se já existe lead com esse leadgen_id antes de fazer qualquer outra
    // coisa. Vem ANTES do fetchLead de propósito: recuperação que depende de
    // uma chamada externa (Graph API) dar certo não é recuperação — se o
    // token tivesse sido revogado depois da tentativa anterior, o evento
    // ficaria preso em failed/retry por um lead que já foi criado com
    // sucesso. Também não depende da API key, então nem precisa buscá-la
    // quando o lead já existe.
    // NÃO é atômico com o POST: dois processos rodando processPending ao
    // mesmo tempo podem passar os dois por aqui antes de qualquer um postar
    // (ver comentário em processPending).
    // ponytail: full scan por tenant em `leads` sem índice — ~3200 linhas
    // hoje, consulta escopada por tenant_id é rápida o bastante. Se a tabela
    // crescer, um índice parcial em custom_fields->raw_data->meta->>leadgen_id
    // resolve.
    const existing = await supabase
      .from('leads').select('id')
      .eq('tenant_id', event.tenant_id)
      .eq('custom_fields->raw_data->meta->>leadgen_id', event.leadgen_id)
      .limit(1);
    if (existing.error) {
      // Falhar para o lado de tentar de novo custa só mais um ciclo; falhar
      // para o lado de postar arrisca o duplicado que essa checagem existe
      // pra evitar.
      return retryOrFail(event, `checagem de duplicidade falhou: ${existing.error.message}`);
    }
    if (existing.data?.length) {
      logger.info(`[meta-leadgen] evento ${event.id} pulado — lead ${event.leadgen_id} já existe (recuperação de reprocessamento)`);
      return markDone(event);
    }

    // Mesma ambiguidade do config: apiKeyFor devolve null para "não existe" e
    // para erro do banco.
    const apiKey = await apiKeyFor(event.tenant_id);
    if (!apiKey) return retryOrFail(event, 'API key crm ativa indisponível (gere uma em Integrações, ou a leitura falhou)');

    // accessToken nulo NÃO significa só "não configurado": decifragem falha
    // sempre que EMAIL_ENCRYPTION_KEY some do ambiente, e uma env faltando no
    // boot destruiria o backlog inteiro em minutos se isso fosse permanente.
    if (!config.accessToken) {
      return retryOrFail(event, 'token de acesso indisponível na config do tenant (não configurado ou decifragem falhou)');
    }

    const fetched = await graphClient.fetchLead(event.leadgen_id, config.accessToken);
    if (!fetched.ok) {
      const motivo = `Graph API: ${fetched.error}`;
      return fetched.retriable ? retryOrFail(event, motivo) : fail(event, motivo);
    }

    const payload = normalizeLeadgen(fetched.lead, {
      leadgenId: event.leadgen_id,
      pageId: event.page_id, formId: event.form_id, adId: event.ad_id,
    });

    let resp;
    try {
      resp = await fetchImpl(`${cfg.selfBaseUrl}/api/v1/leads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Rede caiu ou o próprio processo está subindo: sempre vale outra tentativa.
      return retryOrFail(event, `self-call falhou: ${e?.message || 'erro de rede'}`);
    }

    if (resp.ok) return markDone(event);

    let body = null;
    try { body = await resp.json(); } catch { body = null; }
    const motivo = `POST /api/v1/leads ${resp.status}: ${body?.error?.message || body?.error || 'sem detalhe'}`;
    // 4xx (fora 429) é o payload sendo recusado — retry devolveria o mesmo 400.
    return RETRIABLE_HTTP.has(resp.status) ? retryOrFail(event, motivo) : fail(event, motivo);
  }

  // ponytail: dois processos rodando processPending ao mesmo tempo (deploy
  // com o processo antigo ainda vivo, scale-out acidental) podem os dois
  // pegar o mesmo evento pending e passar os dois pela checagem de
  // duplicidade em processEvent antes de qualquer um postar — a checagem
  // estreita a janela de corrida, não elimina. Não há claim atômico da linha
  // ainda. Se aparecer lead duplicado sem crash no meio, é aqui que olhar.
  // Tenants elegíveis: integração ativa e tenant não soft-deletado. Devolve
  // null quando a leitura falha (o ciclo inteiro é pulado — pausar é mais
  // seguro que processar tenant que talvez não devesse).
  async function elegibleTenantIds() {
    const { data, error } = await supabase
      .from(CONFIG_TABLE).select('tenant_id').eq('status', 'active');
    if (error) { logger.warn(`[meta-leadgen] leitura de tenants elegíveis falhou: ${error.message}`); return null; }
    const ids = [...new Set((data || []).map((r) => r.tenant_id).filter(Boolean))];
    if (!ids.length) return [];
    const deletados = await getDeletedTenantIds(supabase, ids);
    return ids.filter((id) => !deletados.has(id));
  }

  async function processPending() {
    const zero = { processed: 0, done: 0, retry: 0, failed: 0 };

    // Filtra na CONSULTA, não dentro do laço: pular o evento depois de buscá-lo
    // deixaria um backlog de tenant inativo ocupar o lote inteiro a cada tick e
    // sufocar os tenants ativos. Evento de tenant inelegível fica `pending` —
    // reativar o tenant volta a drenar a fila, nada de lead pago virando lixo.
    const tenantIds = await elegibleTenantIds();
    if (!tenantIds || !tenantIds.length) return zero;

    const { data, error } = await supabase
      .from(EVENTS_TABLE).select('*')
      .eq('status', 'pending')
      .in('tenant_id', tenantIds)
      .order('created_at', { ascending: true })
      .limit(cfg.batchSize);
    if (error) { logger.warn(`[meta-leadgen] varredura falhou: ${error.message}`); return zero; }

    const stats = { processed: 0, done: 0, retry: 0, failed: 0 };
    for (const event of data || []) {
      stats.processed++;
      try {
        const r = await processEvent(event);
        stats[r.status]++;
      } catch (e) {
        // Um evento defeituoso não pode derrubar o lote inteiro.
        logger.error(`[meta-leadgen] evento ${event.id} estourou: ${e?.message}`);
        stats.failed++;
        await mark(event, { status: 'failed', attempts: (event.attempts || 0) + 1, last_error: e?.message || 'erro inesperado', processed_at: new Date(now()).toISOString() });
      }
    }
    if (stats.processed) {
      logger.info(`[meta-leadgen] {"event":"meta.process","processed":${stats.processed},"done":${stats.done},"retry":${stats.retry},"failed":${stats.failed}}`);
    }
    return stats;
  }

  return { processEvent, processPending };
}
