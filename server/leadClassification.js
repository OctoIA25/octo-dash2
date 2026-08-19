/**
 * Classificação de lead — validação e escrita.
 *
 * Fica fora das rotas de propósito: os dois entrypoints (api-server e
 * proxy-production) chamam este módulo, então não há como as duas versões
 * divergirem. `api-server.js` tem LEADS_TABLE = 'kenlo_leads' e o
 * proxy-production grava em `leads` — divergência que já custou caro neste repo.
 *
 * A ORIGEM NUNCA VEM DO BODY. Quem chama informa o `source` a partir do
 * contexto de autenticação; a rota da IA passa 'lia' fixo.
 */

export const CLASSIFICACOES = ['lancamento', 'pronto', 'locacao', 'indefinido'];

/** Sinônimos que a Lia e o n8n podem mandar, no espírito do /temperature. */
const SINONIMOS = {
  lancamento: 'lancamento', lancamentos: 'lancamento',
  pronto: 'pronto', prontos: 'pronto', 'imovel pronto': 'pronto',
  locacao: 'locacao', aluguel: 'locacao', alugado: 'locacao', alugados: 'locacao', rent: 'locacao',
  indefinido: 'indefinido', desconhecido: 'indefinido',
};

/** Mesmo idioma de normalização do banco: minúsculas, sem acento, espaços colapsados. */
const normalizar = (v) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();

/** Ordem canônica de gravação — a mesma do front e do Bolsão. Ver ORDEM_CANONICA. */
const ordenar = (valores) =>
  [...valores].sort((a, b) => CLASSIFICACOES.indexOf(a) - CLASSIFICACOES.indexOf(b));

/**
 * Aceita `"locacao"` OU `["lancamento", "locacao"]` — a coluna virou text[] na
 * 20260818, mas o contrato antigo da Lia manda string e continua valendo.
 * Devolve sempre ARRAY normalizado: sem duplicata, em ordem canônica, e com
 * 'indefinido' exclusiva (é a ausência de classificação, não uma a mais).
 * Um valor inválido no meio da lista REPROVA a requisição inteira: gravar o
 * resto em silêncio deixaria a Lia achando que marcou o que não marcou.
 */
export function resolveClassification(input) {
  // `!input` cobre undefined/null/'' num só teste (classification nunca é 0/false).
  if (!input) {
    return { ok: false, error: 'classification é obrigatório' };
  }
  const entradas = Array.isArray(input) ? input : [input];
  if (entradas.length === 0) {
    return { ok: false, error: 'classification é obrigatório' };
  }

  const valores = [];
  for (const entrada of entradas) {
    const value = SINONIMOS[normalizar(entrada)];
    if (!value) {
      return {
        ok: false,
        error: `classification inválida: "${entrada}". Use ${CLASSIFICACOES.join(', ')}`,
      };
    }
    if (!valores.includes(value)) valores.push(value);
  }

  const reais = valores.filter((v) => v !== 'indefinido');
  return { ok: true, value: reais.length > 0 ? ordenar(reais) : ['indefinido'] };
}

/**
 * O lead pode morar em qualquer uma das duas tabelas fonte. Procura em `leads`
 * primeiro (menor, e é onde a Lia cria) e cai para `kenlo_leads`.
 * Só aceita UUID: a Lia recebe `id` no payload do webhook lead.created.
 */
const TABELAS_FONTE = ['leads', 'kenlo_leads'];

/**
 * Isola o loop de busca para `applyClassification` sobrar simples (só
 * interpreta um resultado, sem laço próprio). Falha de infraestrutura no
 * SELECT (timeout, pool esgotado, conexão caiu) é DISTINTA de "não achei":
 * a primeira é 500 e para na hora — a segunda segue procurando na próxima
 * tabela e só vira 404 se nenhuma das duas tiver o lead.
 */
async function encontrarLead(supabase, tenantId, leadId) {
  for (const tabela of TABELAS_FONTE) {
    const { data: atual, error } = await supabase
      .from(tabela).select('id, classification')
      .eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
    if (error) {
      console.error(`❌ [leadClassification] SELECT falhou em ${tabela}:`, error);
      return { status: 'error', error };
    }
    if (atual) return { status: 'found', tabela, atual };
  }
  return { status: 'not_found' };
}

export async function applyClassification(supabase, { tenantId, leadId, classification, source }) {
  const achado = await encontrarLead(supabase, tenantId, leadId);
  if (achado.status === 'error') return { ok: false, status: 500, error: achado.error.message };
  if (achado.status === 'not_found') {
    // 404 e não 403: não revelar existência de lead de outro tenant.
    return { ok: false, status: 404, error: `Lead ${leadId} não encontrado no tenant` };
  }

  const { tabela, atual } = achado;
  const { error } = await supabase.from(tabela).update({
    classification,
    classification_source: source,
    classification_updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).eq('id', leadId);

  if (error) {
    console.error(`❌ [leadClassification] UPDATE falhou em ${tabela}:`, error);
    return { ok: false, status: 500, error: error.message };
  }
  return {
    ok: true,
    tabela,
    // Linha antiga (pré-20260818) ainda pode vir como string: normaliza o log.
    from: atual.classification == null ? ['indefinido'] : [atual.classification].flat(),
    to: classification,
  };
}

/**
 * Handler HTTP da rota `PATCH /api/v1/leads/:id/classification` (contrato da
 * Lia). Compartilhado pelos dois entrypoints (proxy-production e api-server)
 * para que não haja como as duas versões divergirem — mesma razão de existir
 * do resto deste módulo.
 *
 * A origem NÃO vem do body: esta rota é autenticada por API Key, logo é
 * sempre 'lia', independente do que o chamador mandar em `source`. Escrita
 * do Dash passa pelo Supabase direto e é carimbada como 'dashboard' por
 * trigger — não passa por aqui.
 */
export async function handleClassificationPatch(req, res, supabase) {
  try {
    const resolved = resolveClassification(req.body?.classification);
    if (!resolved.ok) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: resolved.error }
      });
    }

    const result = await applyClassification(supabase, {
      tenantId: req.tenantId,
      leadId: req.params.id,
      classification: resolved.value,
      source: 'lia',
    });

    if (!result.ok) {
      if (result.status === 404) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: result.error }
        });
      }
      // 500: result.error é texto cru do Supabase (pode vazar schema/colunas
      // internas) — não repassar a um chamador externo (Lia/n8n). Loga aqui.
      console.error('❌ Erro ao classificar lead (applyClassification):', result.error);
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Erro ao classificar lead' }
      });
    }

    console.log(
      `🏷️  Classificação: lead ${req.params.id} (${result.tabela}) ` +
      `${result.from.join('+')} → ${result.to.join('+')} [lia] tenant=${req.tenantId}`
    );

    res.json({
      success: true,
      data: { id: req.params.id, classification: result.to, source: 'lia' },
      changes: { classification: { from: result.from, to: result.to } }
    });
  } catch (error) {
    console.error('❌ Erro ao classificar lead:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
}
