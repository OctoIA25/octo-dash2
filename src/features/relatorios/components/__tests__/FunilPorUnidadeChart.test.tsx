import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import {
  buildImovelTipoMap,
  ImovelLocalRow,
} from '@/features/relatorios/utils/unidadeClassifier';

// Mocka o <Bar> (canvas/Chart.js) por um stub que expõe os dados recebidos,
// permitindo validar labels/datasets sem renderizar o gráfico real.
let lastBarProps: { data?: any } = {};
vi.mock('react-chartjs-2', () => ({
  Bar: (props: { data?: any }) => {
    lastBarProps = props;
    return <div data-testid="bar-chart" />;
  },
}));

import { FunilPorUnidadeChart } from '@/features/relatorios/components/FunilPorUnidadeChart';

function makeLead(overrides: Partial<ProcessedLead> = {}): ProcessedLead {
  return {
    id_lead: 0,
    nome_lead: '',
    origem_lead: '',
    data_entrada: '',
    status_temperatura: '',
    etapa_atual: '',
    codigo_imovel: '',
    valor_imovel: 0,
    tipo_negocio: '',
    corretor_responsavel: '',
    data_finalizacao: '',
    Data_visita: '',
    observacoes: '',
    Preferencias_lead: '',
    Imovel_visitado: '',
    Conversa: '',
    ...overrides,
  };
}

const rows: ImovelLocalRow[] = [
  { codigo_imovel: 'AP001', tipo: 'Apartamento', tipo_simplificado: 'apartamento' },
  { codigo_imovel: 'CS002', tipo: 'Casa', tipo_simplificado: 'casa' },
];
const tipoMap = buildImovelTipoMap(rows);

describe('FunilPorUnidadeChart (colunas agrupadas)', () => {
  it('usa as etapas do funil como labels (eixo X)', () => {
    render(
      <FunilPorUnidadeChart
        leads={[makeLead({ codigo_imovel: 'AP001', etapa_atual: 'Em Atendimento' })]}
        tipoMap={tipoMap}
      />
    );
    expect(lastBarProps.data.labels).toEqual([
      'Novos Leads',
      'Em Atendimento',
      'Interação',
      'Visita Agendada',
      'Visita Realizada',
      'Negociação',
      'Proposta Criada',
      'Proposta Enviada',
      'Proposta Assinada',
    ]);
  });

  it('cria uma série (dataset) por categoria não-vazia, com a contagem por etapa', () => {
    const leads = [
      makeLead({ codigo_imovel: 'AP001', etapa_atual: 'Em Atendimento' }),
      makeLead({ codigo_imovel: 'AP001', etapa_atual: 'Proposta Assinada' }),
      makeLead({ codigo_imovel: 'CS002', etapa_atual: 'Interação' }),
      makeLead({ codigo_imovel: '' }), // Não informado
    ];
    render(<FunilPorUnidadeChart leads={leads} tipoMap={tipoMap} />);

    const labels = lastBarProps.data.datasets.map((d: { label: string }) => d.label);
    expect(labels.some((l: string) => l.startsWith('Apartamento'))).toBe(true);
    expect(labels.some((l: string) => l.startsWith('Casa'))).toBe(true);
    expect(labels.some((l: string) => l.startsWith('Não informado'))).toBe(true);
    // categoria sem leads não vira série
    expect(labels.some((l: string) => l.startsWith('Galpão'))).toBe(false);

    // Apartamento: 2 leads → "Novos Leads" (idx 0) = 2
    const apto = lastBarProps.data.datasets.find((d: { label: string }) =>
      d.label.startsWith('Apartamento')
    );
    expect(apto.data[0]).toBe(2);
  });

  it('exibe total geral no cabeçalho', () => {
    const leads = [
      makeLead({ codigo_imovel: 'AP001' }),
      makeLead({ codigo_imovel: 'CS002' }),
      makeLead({ codigo_imovel: '' }),
    ];
    render(<FunilPorUnidadeChart leads={leads} tipoMap={tipoMap} />);
    expect(screen.getByText('3 leads')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('mostra estado de carregamento', () => {
    render(<FunilPorUnidadeChart leads={[]} tipoMap={tipoMap} isLoading />);
    expect(screen.getByText(/Carregando funil por unidade/i)).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há leads', () => {
    render(<FunilPorUnidadeChart leads={[]} tipoMap={tipoMap} />);
    expect(screen.getByText(/Nenhum lead encontrado/i)).toBeInTheDocument();
  });

  it('reflete apenas o subconjunto filtrado (compatível com filtros)', () => {
    render(
      <FunilPorUnidadeChart
        leads={[makeLead({ codigo_imovel: 'AP001', etapa_atual: 'Em Atendimento' })]}
        tipoMap={tipoMap}
      />
    );
    const labels = lastBarProps.data.datasets.map((d: { label: string }) => d.label);
    expect(labels.some((l: string) => l.startsWith('Apartamento'))).toBe(true);
    expect(labels.some((l: string) => l.startsWith('Casa'))).toBe(false);
  });
});
