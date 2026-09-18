import { describe, it, expect } from 'vitest';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { computeFunnelStages, countLeadsInStage, getFunnelStageOrder, isEtapaVisita, isEtapaVisitaAgendada, isEtapaVisitaRealizada, contarVisitasAgendadasPara,
  isEtapaFechamento,
  isEtapaPreAtendimento,
  temCorretor,
  baseDistingueVendaDeLocacao,
  baseTemValorDeImovel,
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

  // Até 17/09 o Funil também olhava Data_visita e Imovel_visitado. Os dois
  // derivam de `leads.visit_date`, vazia em 100% dos 5.202 leads da base: as
  // condições nunca eram verdadeiras e só davam a impressão de existir uma
  // segunda fonte para o mesmo número. A etapa passou a ser a única fonte.
  it('"Visita Agendada" ignora Data_visita — a etapa é a única fonte', () => {
    const leads = [
      makeLead({ etapa_atual: 'Visita Agendada' }),
      makeLead({ etapa_atual: 'Interação', Data_visita: '2026-01-10' }),
      makeLead({ etapa_atual: 'Visita Realizada', Data_visita: '2026-01-10' }),
    ];
    expect(countLeadsInStage(leads, 'Visita Agendada')).toBe(1);
  });

  it('"Visita Realizada" ignora Imovel_visitado — a etapa é a única fonte', () => {
    const leads = [
      makeLead({ etapa_atual: 'Visita Realizada' }),
      makeLead({ etapa_atual: 'Interação', Imovel_visitado: 'Sim' }),
      makeLead({ etapa_atual: 'Interação', Imovel_visitado: 'Não' }),
    ];
    expect(countLeadsInStage(leads, 'Visita Realizada')).toBe(1);
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

describe('funil de Cliente Proprietário', () => {
  const lead = (etapa: string, extra: Partial<ProcessedLead> = {}): ProcessedLead =>
    makeLead({ etapa_atual: etapa, ...extra });

  it('usa as 11 etapas próprias, não as do funil de Interessado', () => {
    const r = computeFunnelStages([], 'proprietario');
    expect(r.labels).toHaveLength(11);
    expect(r.labels[0]).toBe('Novos Proprietários');
    expect(r.labels[10]).toBe('Feitura de Contrato');
    expect(r.labels).not.toContain('Novos Leads');
  });

  it('conta cada lead em exatamente uma etapa (soma = total)', () => {
    // O lead em Exclusivo tem data de visita: antes ele era contado também em
    // Primeira Visita, e o total das etapas passava do número de leads.
    const leads = [
      lead('Novos Proprietários'),
      lead('Exclusivo', { Data_visita: '2026-08-01', Imovel_visitado: 'Sim' }),
      lead('Primeira Visita', { Data_visita: '2026-08-02' }),
    ];

    const r = computeFunnelStages(leads, 'proprietario');

    expect(r.data.reduce((s, v) => s + v, 0)).toBe(leads.length);
    expect(r.data[r.labels.indexOf('Primeira Visita')]).toBe(1);
    expect(r.data[r.labels.indexOf('Exclusivo')]).toBe(1);
  });

  it('não conta etapas do funil de Interessado como exclusividade', () => {
    const r = computeFunnelStages(
      [lead('Proposta Criada'), lead('Proposta Enviada')],
      'proprietario',
    );

    expect(r.data[r.labels.indexOf('Exclusivo')]).toBe(0);
    expect(r.data[r.labels.indexOf('Não Exclusivo')]).toBe(0);
    expect(r.exclusivo).toBe(0);
    expect(r.naoExclusivo).toBe(0);
  });

  it('aceita variações de grafia gravadas em leads.status', () => {
    const r = computeFunnelStages(
      [lead('Novo Proprietário'), lead('novos-proprietarios'), lead('NÃO EXCLUSIVO')],
      'proprietario',
    );

    expect(r.data[r.labels.indexOf('Novos Proprietários')]).toBe(2);
    expect(r.naoExclusivo).toBe(1);
  });
});


/**
 * A regra de "isto e uma visita" mora aqui e e usada por nove telas: o funil, os
 * KPIs, Metricas (dois cards e o ranking de corretores), Relatorios, Imoveis e a
 * tela Inicio. Antes cada uma respondia do seu jeito — algumas pela etapa, outras
 * pela coluna `visit_date`, vazia em 100% dos 5.210 leads da base.
 *
 * Espelha FUNNEL_ORDER de server/kpis/kpisCompute.js de proposito: se as duas
 * regras divergirem, servidor e front voltam a mostrar numeros diferentes para o
 * mesmo rotulo, que foi o problema original.
 */
describe('regra da visita, compartilhada entre as telas', () => {
  it('separa agendada de realizada', () => {
    expect(isEtapaVisitaAgendada('Visita Agendada')).toBe(true);
    expect(isEtapaVisitaRealizada('Visita Agendada')).toBe(false);
    expect(isEtapaVisitaRealizada('Visita Realizada')).toBe(true);
    expect(isEtapaVisitaAgendada('Visita Realizada')).toBe(false);
  });

  it('as duas somadas sao "chegou a visita" — o denominador das taxas', () => {
    for (const etapa of ['Visita Agendada', 'Visita Realizada', 'visita realizada']) {
      expect(isEtapaVisita(etapa)).toBe(true);
    }
    for (const etapa of ['Novos Leads', 'Interação', 'Negociação', 'Proposta Assinada']) {
      expect(isEtapaVisita(etapa)).toBe(false);
    }
  });

  it('aceita as grafias que existem na base e nao quebra com vazio', () => {
    expect(isEtapaVisitaAgendada('visita agendada')).toBe(true);
    expect(isEtapaVisitaRealizada('  VISITA REALIZADA  ')).toBe(true);
    for (const vazio of ['', null, undefined]) {
      expect(isEtapaVisita(vazio)).toBe(false);
      expect(isEtapaVisitaAgendada(vazio)).toBe(false);
      expect(isEtapaVisitaRealizada(vazio)).toBe(false);
    }
  });

  it('nenhuma etapa pode ser agendada E realizada ao mesmo tempo', () => {
    // As oito etapas que existem hoje em producao.
    const etapas = ['Novos Leads', 'Interação', 'Negociação', 'Visita Agendada',
      'Proposta Enviada', 'Proposta Assinada', 'Visita Realizada', 'Novos Proprietários'];
    for (const e of etapas) {
      expect(isEtapaVisitaAgendada(e) && isEtapaVisitaRealizada(e)).toBe(false);
      expect(isEtapaVisita(e)).toBe(isEtapaVisitaAgendada(e) || isEtapaVisitaRealizada(e));
    }
  });
});


/**
 * "Sem dados" e "zero" sao coisas diferentes, e confundi-las foi o que produziu
 * metade dos problemas deste trabalho: o card dizia 0 visitas e todo mundo lia
 * "nao houve visita", quando o certo era "nao temos como saber". A coluna
 * `Data_visita` esta vazia em 100% dos 5.210 leads da base e nada no sistema a
 * grava, entao hoje a resposta e sempre null.
 */
describe('visitas agendadas para um dia', () => {
  it('devolve null quando nenhum lead tem data — nao da para medir', () => {
    const leads = [{ Data_visita: null }, { Data_visita: '' }, { Data_visita: '   ' }];
    expect(contarVisitasAgendadasPara(leads, '2026-09-18')).toBeNull();
  });

  it('devolve 0 quando ha datas, mas nenhuma e do dia pedido', () => {
    const leads = [{ Data_visita: '2026-09-17' }, { Data_visita: '2026-09-19' }];
    expect(contarVisitasAgendadasPara(leads, '2026-09-18')).toBe(0);
  });

  it('conta as do dia pedido', () => {
    const leads = [
      { Data_visita: '2026-09-18' },
      { Data_visita: '2026-09-18' },
      { Data_visita: '2026-09-17' },
      { Data_visita: null },
    ];
    expect(contarVisitasAgendadasPara(leads, '2026-09-18')).toBe(2);
  });

  it('nao quebra com lista vazia nem nula', () => {
    expect(contarVisitasAgendadasPara([], '2026-09-18')).toBeNull();
    expect(contarVisitasAgendadasPara(null, '2026-09-18')).toBeNull();
    expect(contarVisitasAgendadasPara(undefined, '2026-09-18')).toBeNull();
  });
});

/**
 * As etapas que EXISTEM de verdade em `leads.status`, medidas em produção em
 * 18/09/2026 nos 5.234 leads da base:
 *
 *   Novos Leads 4.147 · Interação 1.017 · Negociação 47 · Visita Agendada 12
 *   Proposta Enviada 5 · Proposta Assinada 4 · Novos Proprietários 1
 *   Visita Realizada 1
 *
 * Os testes abaixo usam esse vocabulário, e só ele. Foi por não usá-lo que os
 * cards da tela de Métricas ficaram errados: eles comparavam a etapa com
 * 'Pré-Atendimento', 'Aguardando Atendimento', 'Novo Lead', 'Negócio Fechado'
 * e 'Finalizado' — cinco strings que nunca foram gravadas.
 */
const ETAPAS_REAIS = [
  'Novos Leads', 'Interação', 'Negociação', 'Visita Agendada',
  'Proposta Enviada', 'Proposta Assinada', 'Novos Proprietários', 'Visita Realizada',
];

describe('isEtapaFechamento', () => {
  it('reconhece a etapa de fechamento que a base tem', () => {
    expect(isEtapaFechamento('Proposta Assinada')).toBe(true);
  });

  it('nao confunde proposta enviada com assinada', () => {
    expect(isEtapaFechamento('Proposta Enviada')).toBe(false);
    expect(isEtapaFechamento('Negociação')).toBe(false);
  });

  // As strings que o código comparava e que não existem: continuam sendo
  // reconhecidas se um dia aparecerem, mas não são mais a ÚNICA forma de casar.
  it('continua aceitando as grafias antigas, se voltarem a existir', () => {
    expect(isEtapaFechamento('Negócio Fechado')).toBe(true);
    expect(isEtapaFechamento('Finalizado')).toBe(true);
  });

  it('exatamente uma etapa real da base e fechamento', () => {
    expect(ETAPAS_REAIS.filter(isEtapaFechamento)).toEqual(['Proposta Assinada']);
  });
});

describe('isEtapaPreAtendimento', () => {
  // O defeito em uma linha: 'Novos Leads' é a etapa de entrada e ficava DE FORA.
  it('inclui a etapa de entrada, que e onde estao 4.147 dos 5.234 leads', () => {
    expect(isEtapaPreAtendimento('Novos Leads')).toBe(true);
  });

  it('inclui interacao e atendimento', () => {
    expect(isEtapaPreAtendimento('Interação')).toBe(true);
    expect(isEtapaPreAtendimento('Em Atendimento')).toBe(true);
  });

  it('para no momento em que o lead avanca', () => {
    expect(isEtapaPreAtendimento('Visita Agendada')).toBe(false);
    expect(isEtapaPreAtendimento('Visita Realizada')).toBe(false);
    expect(isEtapaPreAtendimento('Proposta Assinada')).toBe(false);
  });

  it('lead sem etapa conta como recem-chegado, nao como fora do funil', () => {
    expect(isEtapaPreAtendimento('')).toBe(true);
    expect(isEtapaPreAtendimento(null)).toBe(true);
  });

  it('cobre tres das oito etapas reais', () => {
    expect(ETAPAS_REAIS.filter(isEtapaPreAtendimento).sort())
      .toEqual(['Interação', 'Novos Leads', 'Novos Proprietários']);
  });
});

describe('temCorretor', () => {
  /**
   * `corretor_responsavel` NUNCA vem vazio: sem nome, o mapeamento grava o
   * texto 'Não atribuído'. Testar só por string preenchida conta todo mundo
   * como atribuído — era o efeito do card "Encaminhados Aos Corretores", que
   * na Imobiliária Japi anunciava 2.553 com ZERO leads tendo corretor.
   */
  it('o sentinel "Não atribuído" nao conta como corretor', () => {
    expect(temCorretor({ assigned_agent_id: null, corretor_responsavel: 'Não atribuído' })).toBe(false);
    expect(temCorretor({ assigned_agent_id: null, corretor_responsavel: 'nao atribuido' })).toBe(false);
  });

  it('id de corretor conta', () => {
    expect(temCorretor({ assigned_agent_id: 'abc', corretor_responsavel: 'Não atribuído' })).toBe(true);
  });

  it('nome de verdade conta, mesmo sem id', () => {
    expect(temCorretor({ assigned_agent_id: null, corretor_responsavel: 'Fernanda Souza' })).toBe(true);
  });

  it('vazio e espaco em branco nao contam', () => {
    expect(temCorretor({ assigned_agent_id: null, corretor_responsavel: '' })).toBe(false);
    expect(temCorretor({ assigned_agent_id: null, corretor_responsavel: '   ' })).toBe(false);
    expect(temCorretor({})).toBe(false);
  });
});

describe('baseDistingueVendaDeLocacao', () => {
  /**
   * Em produção `property_type` está vazia em 100% dos 5.234 leads, e não há
   * segunda fonte: só 12 leads casam com um imóvel pelo código, e os 29
   * imóveis cadastrados têm todos `finalidade = 'venda'`. Medido em 18/09/2026.
   */
  it('base sem property_type nenhum: nao distingue', () => {
    expect(baseDistingueVendaDeLocacao([
      { property_type: null }, { property_type: '' }, { property_type: '   ' }, {},
    ])).toBe(false);
  });

  it('um lead com property_type ja basta para a aba voltar a medir', () => {
    expect(baseDistingueVendaDeLocacao([
      { property_type: null }, { property_type: 'Locação' },
    ])).toBe(true);
  });

  // `tipo_negocio` não responde isto: ele assume 'Venda' quando não sabe, então
  // quem perguntar a ele ouve sempre "sim, é venda". Por isso a função olha a
  // coluna crua, e não o campo derivado.
  it('nao se deixa enganar por tipo_negocio derivado', () => {
    const leadSemInfo = { property_type: null, tipo_negocio: 'Venda' } as { property_type: string | null };
    expect(baseDistingueVendaDeLocacao([leadSemInfo])).toBe(false);
  });

  it('lista vazia ou nula nao quebra', () => {
    expect(baseDistingueVendaDeLocacao([])).toBe(false);
    expect(baseDistingueVendaDeLocacao(null)).toBe(false);
    expect(baseDistingueVendaDeLocacao(undefined)).toBe(false);
  });
});

describe('baseTemValorDeImovel', () => {
  /**
   * `leads.property_value` (projetado em `valor_imovel`) está preenchido em
   * ZERO das 5.235 linhas em produção — medido em 18/09/2026 — e o adaptador
   * do Kenlo crava `property_value: null`. Somar a coluna dá sempre R$ 0, e
   * R$ 0 num card de pipeline se lê como "a carteira não vale nada".
   */
  it('base sem nenhum valor: nao da para somar', () => {
    expect(baseTemValorDeImovel([
      { valor_imovel: null }, { valor_imovel: 0 }, { valor_imovel: undefined }, {},
    ])).toBe(false);
  });

  it('um imovel com valor ja basta para o card voltar a somar', () => {
    expect(baseTemValorDeImovel([{ valor_imovel: null }, { valor_imovel: 450000 }])).toBe(true);
  });

  it('valor zero nao conta como valor', () => {
    expect(baseTemValorDeImovel([{ valor_imovel: 0 }])).toBe(false);
  });

  it('lista vazia ou nula nao quebra', () => {
    expect(baseTemValorDeImovel([])).toBe(false);
    expect(baseTemValorDeImovel(null)).toBe(false);
  });
});
