/**
 * A rota pela qual a LIA avisa pessoas: comunicado ou alerta.
 *
 * Toda a regra de negócio (quem recebe, cópia ao gestor, idempotência,
 * atomicidade) mora em public.publicar_comunicado — a mesma função que a tela
 * usa via enviar_comunicado. Aqui só: autenticar, validar, limitar, traduzir.
 *
 * A imobiliária vem da CHAVE (validateApiKey → req.tenantId), nunca do corpo.
 * Registrar nos DOIS entrypoints antes do catch-all 404.
 */
import { normalizarComunicado } from './normalize.js';
import { createTenantRateLimiter } from '../communication/rateLimiter.js';

const erro = (res, status, code, message, details) =>
  res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });

/** O que publicar_comunicado levanta → o campo que a LIA precisa corrigir. */
const ERROS_DO_BANCO = {
  destinatario_desconhecido: { campo: 'publico.emails', motivo: 'DESTINATARIO_DESCONHECIDO', message: 'e-mail(s) sem membro nesta imobiliária' },
  lead_nao_encontrado: { campo: 'link.id', motivo: 'LEAD_NAO_ENCONTRADO', message: 'lead não encontrado nesta imobiliária' },
  sem_destinatarios: { campo: 'publico', motivo: 'SEM_DESTINATARIOS', message: 'ninguém para receber' },
};

function erroConhecido(res, error) {
  const conhecido = ERROS_DO_BANCO[error?.message];
  if (!conhecido) return false;
  const valores = error.details ? { valores: String(error.details).split(', ') } : {};
  erro(res, 422, 'VALIDATION_ERROR', conhecido.message, [{ campo: conhecido.campo, motivo: conhecido.motivo, ...valores }]);
  return true;
}

export function registerComunicadosRoutes(
  app,
  supabase,
  validateApiKey,
  // ponytail: balde em memória por processo — produção é 1 contêiner; limitador no banco se escalar horizontalmente.
  { limiter = createTenantRateLimiter({ ratePerSec: 0.2, burst: 20 }) } = {},
) {
  app.post('/api/v1/comunicados', validateApiKey, async (req, res) => {
    const corpo = req.body;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
      return erro(res, 400, 'BODY_INVALIDO', 'mande um objeto JSON');
    }
    const n = normalizarComunicado(corpo);
    if (!n.ok) return erro(res, 422, 'VALIDATION_ERROR', 'campos inválidos', n.details);

    if (!limiter.tryRemove(req.tenantId)) {
      res.set('Retry-After', '5');
      return erro(res, 429, 'RATE_LIMITED', 'muitos envios desta imobiliária; tente de novo em 5 s');
    }

    const inicio = Date.now();
    const { row } = n;
    try {
      const { data, error } = await supabase.rpc('publicar_comunicado', {
        p_tenant_id: req.tenantId,
        p_origem: 'lia',
        p_autor_user_id: null,
        p_categoria: row.categoria,
        p_titulo: row.titulo,
        p_mensagem: row.mensagem,
        p_prioridade: row.prioridade,
        p_publico_tipo: row.publico.tipo,
        p_equipe_ids: [],
        p_emails: row.publico.emails,
        p_copiar_gestor: row.publico.copiarGestor,
        p_link_type: row.link?.tipo ?? null,
        p_link_id: row.link?.id ?? null,
        p_idempotency_key: row.idempotencyKey,
      });
      if (error) {
        if (erroConhecido(res, error)) return undefined;
        throw error;
      }
      const r = Array.isArray(data) ? data[0] : data;
      console.info('[comunicados] publicado', { tenantId: req.tenantId, destinatarios: r.destinatarios, criado: r.criado, ms: Date.now() - inicio });
      return res.status(r.criado ? 201 : 200).json({
        success: true,
        data: { id: r.comunicado_id, destinatarios: r.destinatarios, criado: r.criado },
      });
    } catch (err) {
      // Nunca a chave, o título ou a mensagem no log.
      console.error('[comunicados] falha ao publicar', { tenantId: req.tenantId, code: err?.code, ms: Date.now() - inicio });
      return erro(res, 500, 'SERVER_ERROR', 'erro inesperado');
    }
  });
}
