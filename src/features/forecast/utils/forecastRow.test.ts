import { describe, it, expect } from 'vitest';
import {
  somarForecast,
  toForecastRow,
  type ForecastLeadRow,
  type ForecastProposalRow,
} from './forecastRow';

const proposta = (over: Partial<ForecastProposalRow> = {}): ForecastProposalRow => ({
  id: 'p1',
  lead_id: 'l1',
  stage_id: 'negociacao',
  agent_name: 'Ana Souza',
  property_reference: 'AP1234',
  value: 800_000,
  forecast_empreendimento: null,
  forecast_unidade: null,
  forecast_previsao: null,
  forecast_estado: null,
  updated_at: '2026-08-19T10:00:00Z',
  ...over,
});

const lead = (over: Partial<ForecastLeadRow> = {}): ForecastLeadRow => ({
  id: 'l1',
  name: 'João Pereira',
  assigned_at: '2026-08-01T09:00:00Z',
  created_at: '2026-07-30T09:00:00Z',
  updated_at: '2026-08-18T17:30:00Z',
  classification: 'pronto',
  ...over,
});

describe('toForecastRow — colunas que vêm prontas', () => {
  it('corretor, lead, valor e datas saem das duas fontes', () => {
    const linha = toForecastRow(proposta(), lead());

    expect(linha.corretor).toBe('Ana Souza');
    expect(linha.lead).toBe('João Pereira');
    expect(linha.valor).toBe(800_000);
    expect(linha.dataAtendimento).toBe('2026-08-01T09:00:00Z');
    expect(linha.ultimoAtendimento).toBe('2026-08-18T17:30:00Z');
  });

  it('terceiros: 6% sobre o valor', () => {
    const linha = toForecastRow(proposta(), lead({ classification: 'pronto' }));
    expect(linha.comissao).toEqual({ percentual: 6, valor: 48_000 });
  });

  it('lançamento: 3,5% sobre o valor', () => {
    const linha = toForecastRow(proposta(), lead({ classification: ['lancamento'] }));
    expect(linha.comissao).toEqual({ percentual: 3.5, valor: 28_000 });
  });

  it('lead sem assigned_at cai para created_at, não some da coluna', () => {
    const linha = toForecastRow(proposta(), lead({ assigned_at: null }));
    expect(linha.dataAtendimento).toBe('2026-07-30T09:00:00Z');
  });
});

describe('toForecastRow — empreendimento e unidade', () => {
  it('terceiros sem nada digitado: replica o código do imóvel nas duas colunas', () => {
    const linha = toForecastRow(proposta(), lead({ classification: 'pronto' }));
    expect(linha.empreendimento).toBe('AP1234');
    expect(linha.unidade).toBe('AP1234');
  });

  it('lançamento sem nada digitado: em branco — o código não é o nome do empreendimento', () => {
    const linha = toForecastRow(proposta(), lead({ classification: 'lancamento' }));
    expect(linha.empreendimento).toBe('');
    expect(linha.unidade).toBe('');
  });

  it('o que foi digitado sempre vence o pré-preenchimento', () => {
    const linha = toForecastRow(
      proposta({ forecast_empreendimento: 'Residencial Vista Verde', forecast_unidade: '1204' }),
      lead({ classification: 'pronto' }),
    );
    expect(linha.empreendimento).toBe('Residencial Vista Verde');
    expect(linha.unidade).toBe('1204');
  });

  it('string em branco no banco não passa por "digitado"', () => {
    const linha = toForecastRow(
      proposta({ forecast_empreendimento: '   ' }),
      lead({ classification: 'pronto' }),
    );
    expect(linha.empreendimento).toBe('AP1234');
  });
});

describe('toForecastRow — campos que nascem vazios', () => {
  it('previsão e estado ficam em branco até alguém preencher', () => {
    const linha = toForecastRow(proposta(), lead());
    expect(linha.previsaoFechamento).toBeNull();
    expect(linha.estadoAtual).toBe('');
  });

  it('devolve o que foi preenchido', () => {
    const linha = toForecastRow(
      proposta({ forecast_previsao: '2026-09-30', forecast_estado: 'Aguardando análise do banco' }),
      lead(),
    );
    expect(linha.previsaoFechamento).toBe('2026-09-30');
    expect(linha.estadoAtual).toBe('Aguardando análise do banco');
  });
});

describe('toForecastRow — proposta sem lead vinculado (draft/manual)', () => {
  it('usa o comprador como nome e trata como terceiros', () => {
    const linha = toForecastRow(
      proposta({
        lead_id: null,
        parties: [
          { party_type: 'vendedor', full_name: 'Imobiliária X' },
          { party_type: 'comprador', full_name: 'Maria Lima' },
        ],
      }),
      null,
    );

    expect(linha.lead).toBe('Maria Lima');
    expect(linha.comissao.percentual).toBe(6);
    expect(linha.dataAtendimento).toBeNull();
    expect(linha.ultimoAtendimento).toBeNull();
  });

  it('sem lead e sem partes não quebra — colunas vazias', () => {
    const linha = toForecastRow(proposta({ lead_id: null, agent_name: null }), null);
    expect(linha.lead).toBe('');
    expect(linha.corretor).toBe('');
  });
});

describe('somarForecast', () => {
  it('soma valor e comissão do conjunto visível', () => {
    const linhas = [
      toForecastRow(proposta({ id: 'a' }), lead({ classification: 'pronto' })),
      toForecastRow(proposta({ id: 'b', value: 400_000 }), lead({ classification: 'lancamento' })),
    ];

    expect(somarForecast(linhas)).toEqual({ valor: 1_200_000, comissao: 48_000 + 14_000 });
  });

  it('lista vazia soma zero', () => {
    expect(somarForecast([])).toEqual({ valor: 0, comissao: 0 });
  });
});
