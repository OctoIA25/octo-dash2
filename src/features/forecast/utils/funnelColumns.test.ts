import { describe, it, expect } from 'vitest';
import { agruparPorEtapa, FORECAST_COLUMNS } from './funnelColumns';
import type { ForecastRow } from './forecastRow';

const linha = (over: Partial<ForecastRow> = {}): ForecastRow => ({
  proposalId: 'p1',
  stageId: 'negociacao',
  corretor: 'Ana Souza',
  lead: 'João Pereira',
  empreendimento: 'Vista Verde',
  unidade: '1204',
  valor: 100_000,
  comissao: { percentual: 6, valor: 6_000 },
  dataAtendimento: '2026-08-01T09:00:00Z',
  ultimoAtendimento: '2026-08-18T17:30:00Z',
  previsaoFechamento: null,
  estadoAtual: '',
  ...over,
});

describe('FORECAST_COLUMNS', () => {
  it('são as seis etapas ativas, na ordem do funil', () => {
    expect(FORECAST_COLUMNS.map((c) => c.id)).toEqual([
      'negociacao',
      'proposta-criada',
      'proposta-enviada',
      'propostas-respondidas',
      'feitura-contrato',
      'proposta-assinada',
    ]);
  });

  it('não inclui arquivado — ele nem chega do banco', () => {
    expect(FORECAST_COLUMNS.some((c) => c.id === 'arquivado')).toBe(false);
  });
});

describe('agruparPorEtapa', () => {
  it('devolve sempre as seis colunas, mesmo vazias', () => {
    const colunas = agruparPorEtapa([]);
    expect(colunas).toHaveLength(6);
    expect(colunas.every((c) => c.rows.length === 0)).toBe(true);
    expect(colunas[0].totais).toEqual({ valor: 0, comissao: 0 });
  });

  it('põe cada negócio na coluna da sua etapa', () => {
    const colunas = agruparPorEtapa([
      linha({ proposalId: 'a', stageId: 'negociacao' }),
      linha({ proposalId: 'b', stageId: 'proposta-assinada' }),
      linha({ proposalId: 'c', stageId: 'negociacao' }),
    ]);

    const porId = Object.fromEntries(colunas.map((c) => [c.column.id, c.rows.map((r) => r.proposalId)]));
    expect(porId['negociacao']).toEqual(['a', 'c']);
    expect(porId['proposta-assinada']).toEqual(['b']);
    expect(porId['proposta-criada']).toEqual([]);
  });

  it('preserva a ordem que veio da query dentro da coluna', () => {
    const colunas = agruparPorEtapa([
      linha({ proposalId: 'recente' }),
      linha({ proposalId: 'antigo' }),
    ]);
    expect(colunas[0].rows.map((r) => r.proposalId)).toEqual(['recente', 'antigo']);
  });

  it('soma valor e comissão por coluna — é o número do cabeçalho', () => {
    const colunas = agruparPorEtapa([
      linha({ stageId: 'negociacao', valor: 800_000, comissao: { percentual: 6, valor: 48_000 } }),
      linha({ stageId: 'negociacao', valor: 200_000, comissao: { percentual: 6, valor: 12_000 } }),
      linha({ stageId: 'feitura-contrato', valor: 500_000, comissao: { percentual: 3.5, valor: 17_500 } }),
    ]);

    expect(colunas[0].totais).toEqual({ valor: 1_000_000, comissao: 60_000 });
    expect(colunas.find((c) => c.column.id === 'feitura-contrato')?.totais).toEqual({
      valor: 500_000,
      comissao: 17_500,
    });
  });

  it('etapa desconhecida cai na primeira coluna em vez de sumir da tela', () => {
    const colunas = agruparPorEtapa([linha({ proposalId: 'x', stageId: 'etapa-que-nao-existe' })]);
    expect(colunas[0].rows.map((r) => r.proposalId)).toEqual(['x']);
    expect(colunas.slice(1).every((c) => c.rows.length === 0)).toBe(true);
  });
});
