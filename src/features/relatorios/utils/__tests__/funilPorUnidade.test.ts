import { describe, it, expect } from 'vitest';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import {
  buildFunilPorUnidade,
  groupLeadsByUnidade,
} from '@/features/relatorios/utils/funilPorUnidade';
import {
  buildImovelTipoMap,
  ImovelLocalRow,
} from '@/features/relatorios/utils/unidadeClassifier';
import { computeFunnelStages } from '@/features/leads/utils/funnelStages';

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
  { codigo_imovel: 'GL004', tipo: 'Galpão', tipo_simplificado: 'comercial' },
];
const tipoMap = buildImovelTipoMap(rows);

const leads: ProcessedLead[] = [
  makeLead({ codigo_imovel: 'AP001', etapa_atual: 'Em Atendimento' }),
  makeLead({ codigo_imovel: 'AP001', etapa_atual: 'Proposta Assinada' }),
  makeLead({ codigo_imovel: 'CS002', etapa_atual: 'Interação' }),
  makeLead({ codigo_imovel: 'GL004', etapa_atual: 'Visita Agendada' }),
  makeLead({ codigo_imovel: '', etapa_atual: 'Em Atendimento' }), // Não informado
];

describe('groupLeadsByUnidade', () => {
  it('agrupa na ordem canônica e omite categorias vazias', () => {
    const grupos = groupLeadsByUnidade(leads, tipoMap);
    expect([...grupos.keys()]).toEqual(['Apartamento', 'Casa', 'Galpão', 'Não informado']);
    expect(grupos.get('Apartamento')).toHaveLength(2);
    expect(grupos.get('Casa')).toHaveLength(1);
    expect(grupos.get('Galpão')).toHaveLength(1);
    expect(grupos.get('Não informado')).toHaveLength(1);
  });

  it('a soma dos grupos é igual ao total de leads', () => {
    const grupos = groupLeadsByUnidade(leads, tipoMap);
    const soma = [...grupos.values()].reduce((acc, arr) => acc + arr.length, 0);
    expect(soma).toBe(leads.length);
  });
});

describe('buildFunilPorUnidade', () => {
  it('produz um funil por categoria coerente com computeFunnelStages do subconjunto', () => {
    const resultado = buildFunilPorUnidade(leads, tipoMap, 'geral');

    const apto = resultado.find((g) => g.categoria === 'Apartamento')!;
    expect(apto.total).toBe(2);

    const esperado = computeFunnelStages(apto.leads, 'geral');
    expect(apto.funnel.data).toEqual(esperado.data);
    // Apartamento: 1 Em Atendimento + 1 Proposta Assinada, total 2
    expect(apto.funnel.data[0]).toBe(2); // Novos Leads = total da categoria
    expect(apto.funnel.propostasAssinadas).toBe(1);
  });

  it('consistência: total geral por unidade == funil único sobre todos os leads', () => {
    const resultado = buildFunilPorUnidade(leads, tipoMap, 'geral');
    const totalPorUnidade = resultado.reduce((acc, g) => acc + g.total, 0);
    const funilUnico = computeFunnelStages(leads, 'geral');
    expect(totalPorUnidade).toBe(funilUnico.totalLeads);
  });

  it('retorna lista vazia quando não há leads', () => {
    expect(buildFunilPorUnidade([], tipoMap, 'geral')).toEqual([]);
  });
});
