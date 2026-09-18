import { describe, it, expect } from 'vitest';
import { buildOverview } from './kpisCompute.js';

// Conjunto de leads determinístico (cobre venda, funil, resposta, atendimento).
//
// `first_response_at` saiu das fixtures junto com a coluna: desde 18/09 o tempo
// de interação vem das views `primeira_interacao*`, por `counts`, e não de uma
// coluna do lead. Manter a coluna aqui deixaria a fixture mentindo sobre a
// fonte que o código lê.
// `final_sale_value` saiu das fixtures junto com a coluna: desde 18/09 a venda
// vem de `vendas_assinadas`, por `counts`. A coluna está vazia em produção — a
// Lotus tem 0 preenchidas em 1.685 leads — e mantê-la aqui faria a fixture
// mentir sobre a fonte que o código lê.
const FIXED_LEADS = [
  { status: 'novo',      source: 'Instagram', created_at: '2026-06-01T10:00:00Z' },
  { status: 'proposta',  source: 'Facebook',  created_at: '2026-06-02T10:00:00Z' },
  { status: 'assinado',  source: 'Indicação', created_at: '2026-06-03T10:00:00Z' },
  { status: 'visita',    source: 'Instagram', created_at: '2026-06-04T10:00:00Z' },
];

// Três dos quatro leads contatados pela LIA: 30, 60 e 5 minutos → mediana 30,
// taxa de atendimento 75%. O corretor falou com um só, em 45 minutos.
const FIXED_INTERACAO = { interacaoLia: [30, 60, 5], interacaoCorretor: [45] };
const PERIOD = { startDate: '2026-06-01', endDate: '2026-06-30', label: 'Junho/2026' };

describe('buildOverview — regressão do modo legado (sem config)', () => {
  it('snapshot dos números nativos + asserts explícitos', () => {
    const overview = buildOverview({
      period: PERIOD, currentLeads: FIXED_LEADS, previousLeads: [],
      counts: { imoveisAtivos: 7, captacaoExclusiva: 0, captacaoSemExclusividade: 0, tamanhoEquipe: 0, vgv: 650000, vgc: 39000, vendasQtd: 1, vgvPrev: 800, vgcPrev: 24, vendasQtdPrev: 1, ...FIXED_INTERACAO },
      goals: [], commercialCurrent: { vgv: 650000, vgc: 39000, qtd: 1 }, commercialPrevious: { vgv: 800, vgc: 24, qtd: 1 },
      previousLabel: 'Maio/2026',
      // SEM config → caminho legado, que deve permanecer idêntico ao de hoje.
    });
    // Trava o shape e os valores derivados (cards/funnel/sources/priceRanges/commercial).
    expect(overview).toMatchSnapshot();
    // Asserts explícitos de regressão (além do snapshot), nos pontos mais sensíveis:
    const totalLeads = overview.cards.find((c) => c.metricKey === 'totalLeads');
    expect(totalLeads.rawValue).toBe(4);
    expect(totalLeads.target).toBe(null); // legado não tem meta
    // Venda vem de `vendas_assinadas`, não de `leads.final_sale_value`.
    const vendas = overview.cards.find((c) => c.metricKey === 'vendas');
    expect(vendas.rawValue).toBe(1);
    const valor = overview.cards.find((c) => c.metricKey === 'valorVendas');
    expect(valor.rawValue).toBe(650000);
    // Os dois números que esta fatia trocou de fonte, travados explicitamente.
    const tmr = overview.cards.find((c) => c.metricKey === 'tempoMedioResposta');
    expect(tmr.rawValue).toBe(30);           // mediana de [30, 60, 5]
    expect(tmr.displayValue).toBe('30min');
    const taxa = overview.cards.find((c) => c.metricKey === 'taxaAtendimento');
    expect(taxa.displayValue).toBe('75.0%'); // 3 contatados de 4 leads
  });
});
