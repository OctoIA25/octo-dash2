import { describe, it, expect } from 'vitest';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import {
  computeFunnelStages,
  countLeadsInStage,
  getFunnelStageOrder,
} from '@/features/leads/utils/funnelStages';

/**
 * Fábrica mínima de ProcessedLead para testes (apenas campos relevantes ao
 * funil; o restante recebe defaults vazios coerentes com a interface).
 */
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

describe('getFunnelStageOrder', () => {
  it('retorna 4 etapas no pré-atendimento, 6 no atendimento e 9 no geral', () => {
    expect(getFunnelStageOrder('pre-atendimento')).toHaveLength(4);
    expect(getFunnelStageOrder('atendimento')).toHaveLength(6);
    expect(getFunnelStageOrder('geral')).toHaveLength(9);
  });

  it('mantém a ordem canônica do funil geral', () => {
    expect(getFunnelStageOrder('geral')).toEqual([
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
});

describe('countLeadsInStage (regressão das regras existentes)', () => {
  it('"Novos Leads" conta o total de leads', () => {
    const leads = [makeLead(), makeLead(), makeLead()];
    expect(countLeadsInStage(leads, 'Novos Leads')).toBe(3);
  });

  it('"Visita Agendada" inclui Data_visita preenchida, exceto quando já é Visita Realizada', () => {
    const leads = [
      makeLead({ etapa_atual: 'Visita Agendada' }),
      makeLead({ etapa_atual: 'Interação', Data_visita: '2026-01-10' }),
      makeLead({ etapa_atual: 'Visita Realizada', Data_visita: '2026-01-10' }), // não conta
    ];
    expect(countLeadsInStage(leads, 'Visita Agendada')).toBe(2);
  });

  it('"Visita Realizada" inclui Imovel_visitado === "Sim"', () => {
    const leads = [
      makeLead({ etapa_atual: 'Visita Realizada' }),
      makeLead({ etapa_atual: 'Interação', Imovel_visitado: 'Sim' }),
      makeLead({ etapa_atual: 'Interação', Imovel_visitado: 'Não' }),
    ];
    expect(countLeadsInStage(leads, 'Visita Realizada')).toBe(2);
  });

  it('"Bolsão" inclui leads sem codigo_imovel', () => {
    const leads = [
      makeLead({ codigo_imovel: '' }),
      makeLead({ etapa_atual: 'Bolsão', codigo_imovel: 'AP001' }),
      makeLead({ codigo_imovel: 'AP002' }),
    ];
    expect(countLeadsInStage(leads, 'Bolsão')).toBe(2);
  });

  it('"Proposta Assinada" inclui fechamentos por etapa, data_finalizacao ou valor_final_venda', () => {
    const leads = [
      makeLead({ etapa_atual: 'Proposta Assinada' }),
      makeLead({ etapa_atual: 'Fechamento' }),
      makeLead({ etapa_atual: 'Interação', data_finalizacao: '2026-02-01' }),
      makeLead({ etapa_atual: 'Interação', valor_final_venda: 500000 }),
      makeLead({ etapa_atual: 'Interação' }), // não conta
    ];
    expect(countLeadsInStage(leads, 'Proposta Assinada')).toBe(4);
  });
});

describe('computeFunnelStages', () => {
  it('calcula contagens e percentuais coerentes no funil geral', () => {
    const leads = [
      makeLead({ etapa_atual: 'Em Atendimento' }),
      makeLead({ etapa_atual: 'Interação' }),
      makeLead({ etapa_atual: 'Visita Agendada' }),
      makeLead({ etapa_atual: 'Proposta Assinada' }),
    ];
    const r = computeFunnelStages(leads, 'geral');

    expect(r.totalLeads).toBe(4);
    // data alinhado a labels (9 etapas)
    expect(r.data).toHaveLength(9);
    expect(r.labels).toHaveLength(9);
    // Novos Leads = total
    expect(r.data[0]).toBe(4);
    // Em Atendimento = 1 → 25%
    expect(r.data[1]).toBe(1);
    expect(r.percentuais[1]).toBe('25.0');
    // Proposta Assinada (última etapa) = 1
    expect(r.data[8]).toBe(1);
    expect(r.propostasAssinadas).toBe(1);
  });

  it('não quebra com lista vazia (sem divisão por zero)', () => {
    const r = computeFunnelStages([], 'geral');
    expect(r.totalLeads).toBe(0);
    expect(r.percentuais.every((p) => p === '0.0')).toBe(true);
    expect(r.taxaConversaoProposta).toBe('0.0');
  });

  it('calcula métricas de proprietário (exclusivo/não exclusivo/feitura)', () => {
    const leads = [
      makeLead({ etapa_atual: 'Exclusivo' }),
      makeLead({ etapa_atual: 'Não Exclusivo' }),
      makeLead({ etapa_atual: 'Feitura de Contrato' }),
      makeLead({ etapa_atual: 'Em Atendimento' }),
    ];
    const r = computeFunnelStages(leads, 'geral');
    expect(r.exclusivo).toBe(1);
    expect(r.naoExclusivo).toBe(1);
    expect(r.feituraContrato).toBe(1);
    expect(r.totalProprietariosConvertidos).toBe(3);
    expect(r.taxaConversaoProprietarios).toBe('75.0');
  });
});
