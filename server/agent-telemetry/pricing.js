/**
 * Preços por modelo (USD por 1M tokens) — T4, revisto no P2.8.
 *
 * A TABELA `ia_precos` MANDA; este mapa é rede de segurança para modelo ainda
 * não cadastrado. Decidido pelo chefe em 21/09/2026.
 *
 * Por que isso importou: a tela passou a mostrar DOIS custos discordando — o
 * novo painel somava US$ 0,03 lendo a tabela, e este bloco dizia "< US$ 0,01"
 * porque o mapa abaixo não conhece nenhum modelo da Anthropic, que é o provedor
 * da LIA. Dois números para a mesma pergunta é pior que número nenhum.
 *
 * Preços de referência por modelo (USD por 1M tokens) — T4.
 * Fonte: tabela pública da OpenAI (referência 2025 — conferir preço vigente ao
 * adicionar/atualizar modelo; manter este mapa é mais barato que congelar
 * custo errado no banco).
 *
 * Custo é SEMPRE derivado na leitura: tokens reais × este mapa. Modelo fora do
 * mapa → custo null (a UI mostra "—"; nunca estimativa silenciosa).
 *
 * Semântica OpenAI: cached_tokens é SUBCONJUNTO de input_tokens
 * (prompt_tokens inclui os cacheados) — o custo desconta o trecho cacheado do
 * preço cheio de input e cobra o preço de cache.
 */
export const MODEL_PRICES_PER_MTOK = {
  'gpt-4.1': { input: 2.0, cached: 0.5, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-4o': { input: 2.5, cached: 1.25, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
};

/**
 * Custo em USD de um agregado de tokens de UM modelo.
 * Retorna { usd } ou null quando não dá para afirmar custo (modelo sem preço
 * ou nenhum token registrado — "não informado ≠ 0").
 */
export function costFromTokens({ model, input_tokens, output_tokens, cached_tokens }, tabela = null) {
  // Tabela primeiro; o mapa do código só cobre o que ela ainda não tem.
  const price = tabela?.[model] ?? MODEL_PRICES_PER_MTOK[model];
  if (!price) return null;

  const input = Math.max(0, Number(input_tokens) || 0);
  const output = Math.max(0, Number(output_tokens) || 0);
  // clamp: cache nunca excede o input (dado corrompido não vira custo negativo)
  const cached = Math.min(input, Math.max(0, Number(cached_tokens) || 0));
  if (input === 0 && output === 0) return null;

  const usd =
    ((input - cached) * price.input + cached * price.cached + output * price.output) / 1_000_000;
  return { usd };
}

/**
 * Enriquece o by_model do summary com custo por modelo e devolve o total.
 * Modelos sem preço entram em unknown_models (custo não-afirmável).
 */
export function costForModelBreakdown(byModel = [], tabela = null) {
  let totalUsd = 0;
  let hasKnown = false;
  const unknownModels = [];

  const rows = byModel.map((row) => {
    const cost = costFromTokens(row, tabela);
    if (cost) {
      hasKnown = true;
      totalUsd += cost.usd;
      return { ...row, cost_usd: cost.usd };
    }
    if (row.model) unknownModels.push(row.model);
    return { ...row, cost_usd: null };
  });

  return { rows, totalUsd: hasKnown ? totalUsd : null, unknownModels };
}

/**
 * Os preços cadastrados, no formato do mapa acima.
 *
 * Erro de leitura devolve `null` e quem chama cai no mapa do código — custo de
 * referência desatualizado é melhor do que custo "—" por causa de uma consulta
 * que falhou.
 */
export async function precosCadastrados(supabase, tenantId, logger = null) {
  try {
    const { data, error } = await supabase
      .from('ia_precos')
      .select('modelo, tenant_id, vigente_de, preco_entrada_por_milhao, preco_cache_por_milhao, preco_saida_por_milhao')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .lte('vigente_de', new Date().toISOString().slice(0, 10))
      // Preço próprio do tenant e vigência mais recente por último: o `for`
      // abaixo sobrescreve, então quem vem depois vence.
      .order('vigente_de', { ascending: true })
      .order('tenant_id', { ascending: true, nullsFirst: true });
    if (error) throw error;

    const mapa = {};
    for (const p of data || []) {
      mapa[p.modelo] = {
        input: Number(p.preco_entrada_por_milhao),
        cached: p.preco_cache_por_milhao == null ? Number(p.preco_entrada_por_milhao) : Number(p.preco_cache_por_milhao),
        output: Number(p.preco_saida_por_milhao),
      };
    }
    return Object.keys(mapa).length > 0 ? mapa : null;
  } catch (e) {
    logger?.warn?.(`[telemetry] preços cadastrados não lidos: ${e?.message ?? e}`);
    return null;
  }
}
