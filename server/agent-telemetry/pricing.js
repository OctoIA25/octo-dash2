/**
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
export function costFromTokens({ model, input_tokens, output_tokens, cached_tokens }) {
  const price = MODEL_PRICES_PER_MTOK[model];
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
export function costForModelBreakdown(byModel = []) {
  let totalUsd = 0;
  let hasKnown = false;
  const unknownModels = [];

  const rows = byModel.map((row) => {
    const cost = costFromTokens(row);
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
