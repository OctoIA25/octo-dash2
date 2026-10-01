import { describe, expect, it } from 'vitest';
import { periodoDoFiltro } from './periodoDoFiltro';

// 30/09/2026 às 23h30 em São Paulo — em Greenwich já é 01/10.
const virada = new Date('2026-10-01T02:30:00Z');

describe('o filtro de período vira datas da safra', () => {
  it('"todo o período" não tem safra', () => {
    expect(periodoDoFiltro('all', 8, 2026, '', '', virada)).toBeNull();
  });

  it('mês escolhido vai do dia 1 ao último dia — fevereiro incluído', () => {
    expect(periodoDoFiltro('month', 9, 2026, '', '', virada)).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(periodoDoFiltro('month', 1, 2028, '', '', virada)).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
  });

  it('hoje e últimos 7 dias contam no dia de São Paulo, não no de Greenwich', () => {
    expect(periodoDoFiltro('today', 0, 2026, '', '', virada)).toEqual({ de: '2026-09-30', ate: '2026-09-30' });
    expect(periodoDoFiltro('week', 0, 2026, '', '', virada)).toEqual({ de: '2026-09-23', ate: '2026-09-30' });
  });

  it('ano e datas livres; datas invertidas não viram safra', () => {
    expect(periodoDoFiltro('year', 0, 2026, '', '', virada)).toEqual({ de: '2026-01-01', ate: '2026-12-31' });
    expect(periodoDoFiltro('custom', 0, 2026, '2026-09-01', '2026-09-15', virada)).toEqual({ de: '2026-09-01', ate: '2026-09-15' });
    expect(periodoDoFiltro('custom', 0, 2026, '2026-09-15', '2026-09-01', virada)).toBeNull();
  });
});
