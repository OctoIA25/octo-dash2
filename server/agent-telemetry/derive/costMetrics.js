/**
 * Cards financeiros da telemetria (Fatia B). Combina custo (USD do summary) +
 * câmbio + denominadores de negócio em métricas com N/A HONESTO:
 *   - sem câmbio na data      → cost_brl e derivados null (o USD original fica)
 *   - custo USD não-afirmável → BRL null
 *   - denominador zero        → card null (nunca divisão por zero)
 *   - custo real de 0         → 0 (distingue "sem custo" de "sem dado")
 *
 * Funções puras: o endpoint coleta (summary, câmbio, counts) e chama isto.
 */

import { toBrl } from '../pricing/exchange.js';

/** num/den com N/A: null se num é null/indefinido OU den <= 0. 0/den>0 = 0 (real). */
function ratio(num, den) {
  if (num == null || !den || den <= 0) return null;
  return num / den;
}

/**
 * @param {object} input
 *   costUsd        custo total em USD (summary.cost.total_usd) — pode ser null
 *   rate           câmbio USD/BRL vigente na janela — pode ser null
 *   billableEvents nº de chamadas com custo (denominador do custo médio)
 *   attendedLeads  leads com first_response_at na janela
 *   closedSales    leads com final_sale_value > 0 na janela
 *   vgcBrl         VGC do período (commercial_sales.valor_vgc), já em BRL
 */
export function computeCostMetrics({ costUsd, rate, billableEvents, attendedLeads, closedSales, vgcBrl }) {
  const total = toBrl(costUsd, rate);
  const brl = total.cost_brl; // null se sem custo ou sem câmbio

  return {
    total,
    per_event: { value_brl: ratio(brl, billableEvents), denominator: billableEvents },
    per_lead: { value_brl: ratio(brl, attendedLeads), denominator: attendedLeads },
    per_sale: { value_brl: ratio(brl, closedSales), denominator: closedSales },
    // % é razão × 100; mesmo N/A (VGC 0 ou sem custo → null).
    pct_over_vgc: { value: brl != null && vgcBrl > 0 ? (brl / vgcBrl) * 100 : null, vgc_brl: vgcBrl },
  };
}
