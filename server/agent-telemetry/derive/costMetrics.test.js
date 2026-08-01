import { describe, it, expect } from 'vitest';
import { computeCostMetrics } from './costMetrics.js';

// Entradas já coletadas: custo total (USD, do summary), câmbio, e denominadores
// de negócio (chamadas com custo, leads atendidos, vendas fechadas, VGC em BRL).
const base = {
  costUsd: 10,
  rate: 5,
  billableEvents: 100, // llm_call com usage e preço conhecido
  attendedLeads: 50,
  closedSales: 2,
  vgcBrl: 1000,
};

describe('computeCostMetrics — cards financeiros com N/A honesto (nunca 0 fingido)', () => {
  it('converte custo total para BRL preservando o USD', () => {
    const m = computeCostMetrics(base);
    expect(m.total.cost_usd).toBe(10);
    expect(m.total.exchange_rate).toBe(5);
    expect(m.total.cost_brl).toBe(50);
  });

  it('custo médio por evento = brl / eventos faturáveis', () => {
    const m = computeCostMetrics(base);
    expect(m.per_event.value_brl).toBeCloseTo(0.5, 10); // 50 / 100
    expect(m.per_event.denominator).toBe(100);
  });

  it('custo por lead atendido e por venda fechada', () => {
    const m = computeCostMetrics(base);
    expect(m.per_lead.value_brl).toBeCloseTo(1, 10); // 50 / 50
    expect(m.per_sale.value_brl).toBeCloseTo(25, 10); // 50 / 2
  });

  it('% custo IA sobre VGC = custo_brl / vgc * 100', () => {
    const m = computeCostMetrics(base);
    expect(m.pct_over_vgc.value).toBeCloseTo(5, 10); // 50 / 1000 * 100
  });

  it('sem câmbio na data → todos os cards em BRL são null (mas o USD total fica)', () => {
    const m = computeCostMetrics({ ...base, rate: null });
    expect(m.total.cost_usd).toBe(10);
    expect(m.total.cost_brl).toBeNull();
    expect(m.per_event.value_brl).toBeNull();
    expect(m.per_lead.value_brl).toBeNull();
    expect(m.pct_over_vgc.value).toBeNull();
  });

  it('custo USD null (nenhum modelo precificável) → cards BRL null, não zero', () => {
    const m = computeCostMetrics({ ...base, costUsd: null });
    expect(m.total.cost_brl).toBeNull();
    expect(m.per_event.value_brl).toBeNull();
  });

  it('denominador zero → card null (N/A), nunca divisão por zero', () => {
    const m = computeCostMetrics({ ...base, attendedLeads: 0, closedSales: 0, vgcBrl: 0 });
    expect(m.per_lead.value_brl).toBeNull();
    expect(m.per_sale.value_brl).toBeNull();
    expect(m.pct_over_vgc.value).toBeNull();
    // per_event ainda tem denominador → segue calculável
    expect(m.per_event.value_brl).toBeCloseTo(0.5, 10);
  });

  it('custo real de ZERO (0 USD, câmbio ok) é 0, não N/A — distingue "sem custo" de "sem dado"', () => {
    const m = computeCostMetrics({ ...base, costUsd: 0 });
    expect(m.total.cost_brl).toBe(0);
    expect(m.per_event.value_brl).toBe(0);
  });
});
