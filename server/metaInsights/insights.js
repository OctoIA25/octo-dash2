/**
 * Gasto de anúncios da Meta (P3.5) — o caminho e a tradução da resposta.
 *
 * Funções puras. Quem faz a chamada é o `createMetaGraphClient` do P2.7, que já
 * trata retry, timeout e a classificação de rate limit da Meta (que NÃO usa
 * 429: vem como error.code 4/17/32/613 sobre 400 ou 403).
 *
 * O grão é o ANÚNCIO (`level=ad`), e não a campanha. É o menor que a Meta
 * entrega, e dele se soma para conjunto e campanha — o contrário não existe.
 */

/** Campos do endpoint de insights. Nomes da Marketing API, não os nossos. */
export const CAMPOS_INSIGHTS = [
  'campaign_id', 'campaign_name',
  'adset_id', 'adset_name',
  'ad_id', 'ad_name',
  'objective', 'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm',
  'actions', 'date_start',
].join(',');

/**
 * Os tipos de ação que significam "lead de formulário".
 *
 * `leadgen_grouped` é o agregado que a Meta passou a usar; `lead` é o clássico.
 * Os dois aparecem conforme a conta e a versão, então ambos contam.
 */
const ACOES_DE_LEAD = ['leadgen_grouped', 'lead', 'offsite_conversion.fb_pixel_lead'];

/** Clique-para-WhatsApp: o "resultado" é uma conversa, e não um lead. */
const ACAO_CONVERSA = 'onsite_conversion.messaging_conversation_started_7d';

/**
 * O caminho do Graph para um período.
 *
 * `time_increment=1` é o que faz a Meta devolver UMA LINHA POR DIA em vez de um
 * total do período — sem ele não dá para regravar só os últimos dias nem montar
 * o gráfico diário.
 */
export function caminhoDeInsights(adAccountId, de, ate, limite = 500) {
  const conta = String(adAccountId || '').replace(/^act_/, '');
  if (!/^\d+$/.test(conta)) {
    throw new Error(`conta de anúncios inválida: ${adAccountId}`);
  }
  const intervalo = encodeURIComponent(JSON.stringify({ since: de, until: ate }));
  return `act_${conta}/insights?level=ad&time_increment=1&time_range=${intervalo}&limit=${limite}`;
}

/** Número da Meta: vem como string, e vazio não é zero — é ausente. */
function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function inteiro(v) {
  const n = numero(v);
  return n === null ? 0 : Math.round(n);
}

/** Soma o valor de um tipo de ação. A Meta devolve os valores como string. */
function valorDaAcao(acoes, tipos) {
  if (!Array.isArray(acoes)) return 0;
  const alvos = Array.isArray(tipos) ? tipos : [tipos];
  for (const alvo of alvos) {
    const achado = acoes.find((a) => a?.action_type === alvo);
    if (achado) return inteiro(achado.value);
  }
  return 0;
}

/**
 * O que a Meta conta como resultado desta linha.
 *
 * É o campo que separa a campanha de formulário da de clique-para-WhatsApp, e
 * por isso decide se dá para atribuir lead a lead. Medido na conta da Lotus em
 * 21/09: duas das quatro campanhas são de conversa, somando 38% do gasto.
 */
export function indicadorDoResultado(acoes) {
  if (!Array.isArray(acoes)) return '';
  if (acoes.some((a) => ACOES_DE_LEAD.includes(a?.action_type))) return 'actions:lead';
  if (acoes.some((a) => a?.action_type === ACAO_CONVERSA)) return `actions:${ACAO_CONVERSA}`;
  return '';
}

/**
 * Traduz a resposta do Graph para as linhas da tabela.
 *
 * Linha sem `ad_id` ou sem data é DESCARTADA em vez de gravada com campo vazio:
 * a chave única é (tenant, data, anúncio), e uma linha sem chave viraria
 * duplicata a cada sincronização.
 */
export function linhasDeInsights(payload, tenantId) {
  const dados = Array.isArray(payload?.data) ? payload.data : [];
  const linhas = [];
  const descartadas = [];

  for (const d of dados) {
    const adId = d?.ad_id ? String(d.ad_id) : '';
    const data = d?.date_start ? String(d.date_start) : '';
    if (!adId || !data) {
      descartadas.push({ ad_id: adId || '(sem)', data: data || '(sem)' });
      continue;
    }
    const acoes = d.actions;
    linhas.push({
      tenant_id: tenantId,
      data,
      campaign_id: d.campaign_id ? String(d.campaign_id) : '',
      campaign_nome: d.campaign_name ?? '',
      adset_id: d.adset_id ? String(d.adset_id) : null,
      adset_nome: d.adset_name ?? '',
      ad_id: adId,
      ad_nome: d.ad_name ?? '',
      objetivo: d.objective ?? '',
      resultado_indicador: indicadorDoResultado(acoes),
      resultados: valorDaAcao(acoes, [...ACOES_DE_LEAD, ACAO_CONVERSA]),
      gasto: numero(d.spend) ?? 0,
      impressoes: inteiro(d.impressions),
      cliques: inteiro(d.clicks),
      // Guardados como a Meta mandou, para conferir o dia. O número do PERÍODO
      // é recalculado no banco: somar CPCs diários dá a média das médias.
      ctr: numero(d.ctr),
      cpc: numero(d.cpc),
      cpm: numero(d.cpm),
      leads_meta: valorDaAcao(acoes, ACOES_DE_LEAD),
    });
  }

  // Linha sem campanha não some, mas é agrupável só por si mesma. Vale avisar.
  return { linhas, descartadas };
}

/**
 * Quantos dias regravar.
 *
 * A Meta ajusta números depois do fato: atribuição de conversão chega com dias
 * de atraso, e o gasto de ontem ainda muda. Por isso a sincronização repete os
 * últimos dias de propósito — e é a chave única da tabela que impede isso de
 * dobrar o mês.
 */
export function janelaDeSincronizacao(hoje, dias = 7) {
  const fim = new Date(`${hoje}T12:00:00Z`);
  if (Number.isNaN(fim.getTime())) throw new Error(`data inválida: ${hoje}`);
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - (Math.max(1, dias) - 1));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { de: iso(inicio), ate: iso(fim) };
}
