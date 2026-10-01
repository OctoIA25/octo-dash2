/**
 * As metas automáticas de VGV e VGC não atualizavam desde 02/09.
 *
 * O commit que trocou a origem para as propostas assinadas passou a chamar
 * `buscarVendasAssinadas` e `somarVendas` sem importá-las. Em execução, cada
 * sincronização dava "não está definido" — e a sincronização engole o erro de
 * propósito (uma meta não derruba as outras). As 12 metas de VGC da Lotus são
 * automáticas: nenhuma saía do lugar, sem aviso nenhum.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/features/metricas/services/vendasAssinadasService', () => ({
  buscarVendasAssinadas: vi.fn(async () => [{ vgv: 500000, vgc: 25000 }, { vgv: 300000, vgc: 18000 }]),
  somarVendas: (vendas: Array<{ vgv: number; vgc: number }>) =>
    vendas.reduce<{ vgv: number; vgc: number; vendas: number }>(
      (a, v) => ({ vgv: a.vgv + v.vgv, vgc: a.vgc + v.vgc, vendas: a.vendas + 1 }), { vgv: 0, vgc: 0, vendas: 0 }),
}));

import { getMetricSource } from '../../services/metricSources';

describe('as fontes de VGV e VGC calculam de verdade', () => {
  it('VGC soma a comissão das vendas assinadas no período', async () => {
    await expect(getMetricSource('vgc')!.compute('lotus', '2026-10-01', '2026-12-31')).resolves.toBe(43000);
  });

  it('VGV soma o valor das vendas assinadas no período', async () => {
    await expect(getMetricSource('vgv')!.compute('lotus', '2026-10-01', '2026-12-31')).resolves.toBe(800000);
  });
});
