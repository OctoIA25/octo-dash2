/**
 * Câmbio USD→BRL — camada ÚNICA de conversão (D7). Custo nativo dos LLMs é USD
 * (pricing.js); aqui só convertemos na leitura. A taxa é MANUAL, com histórico
 * (tabela exchange_rates, coluna effective_from) — sem API externa nesta fase.
 *
 * O USD original NUNCA é sobrescrito: a resposta carrega { cost_usd, exchange_rate,
 * cost_brl } para auditoria. Sem taxa vigente na data → cost_brl null (a UI mostra
 * "—"; nunca converte com câmbio inventado).
 *
 * Funções puras: quem busca as linhas de exchange_rates é o endpoint.
 */

/**
 * Taxa vigente numa data: a de maior effective_from que seja <= refDate.
 * @param {Array} rates  linhas { rate, effective_from }
 * @param {Date}  refDate
 * @returns {number|null}
 */
export function pickRate(rates, refDate) {
  const ref = refDate.getTime();
  let best = null;
  for (const r of rates) {
    const eff = Date.parse(r.effective_from);
    if (Number.isNaN(eff) || eff > ref) continue;
    if (best === null || eff > best.eff) best = { eff, rate: r.rate };
  }
  return best ? best.rate : null;
}

/**
 * Converte USD→BRL preservando o original. usd null → brl null; rate null → brl null.
 * @returns {{ cost_usd: number|null, exchange_rate: number|null, cost_brl: number|null }}
 */
export function toBrl(usd, rate) {
  const brl = usd != null && rate != null ? usd * rate : null;
  return { cost_usd: usd ?? null, exchange_rate: rate ?? null, cost_brl: brl };
}
