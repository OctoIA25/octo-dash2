import { describe, it, expect, vi } from 'vitest';
import { billableEventsFromByModel, sumVgcBrl } from './costQuery.js';

describe('billableEventsFromByModel — denominador do custo médio', () => {
  it('soma eventos só dos modelos com preço conhecido (cost_usd != null)', () => {
    // by_model já enriquecido por costForModelBreakdown
    const byModel = [
      { model: 'gpt-4o-mini', events: 100, cost_usd: 0.5 },
      { model: 'llama-do-n8n', events: 40, cost_usd: null }, // sem preço → fora
    ];
    expect(billableEventsFromByModel(byModel)).toBe(100);
  });

  it('lista vazia → 0', () => {
    expect(billableEventsFromByModel([])).toBe(0);
    expect(billableEventsFromByModel(undefined)).toBe(0);
  });
});

describe('sumVgcBrl — VGC do período (commercial_sales.valor_vgc)', () => {
  function makeSupabase(pages) {
    let call = 0;
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      gte() { return chain; },
      lte() { return chain; },
      range() { const data = pages[call] ?? []; call += 1; return Promise.resolve({ data, error: null }); },
    };
    return { from: vi.fn(() => chain) };
  }

  it('soma valor_vgc de todas as páginas, tolerando string e null', async () => {
    const supabase = makeSupabase([[{ valor_vgc: '1000.5' }, { valor_vgc: 500 }, { valor_vgc: null }]]);
    const total = await sumVgcBrl(supabase, 'T', '2026-07-01', '2026-07-31');
    expect(total).toBeCloseTo(1500.5, 10);
  });

  it('sem vendas → 0 (não null: é um total real de zero VGC)', async () => {
    const supabase = makeSupabase([[]]);
    expect(await sumVgcBrl(supabase, 'T', '2026-07-01', '2026-07-31')).toBe(0);
  });

  it('erro do banco propaga', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ lte: () => ({
          range: () => Promise.resolve({ data: null, error: { message: 'db down' } }),
        }) }) }) }) }),
      }),
    };
    await expect(sumVgcBrl(supabase, 'T', '2026-07-01', '2026-07-31')).rejects.toThrow('db down');
  });
});
