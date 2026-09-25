import { describe, it, expect } from 'vitest';
import { mapSantaAngelaToLead, mapAssignedAgentName, etapaAvanca } from './leadMapper.js';

// O lead importado nunca sai com nome de corretor: assigned_agent_id é sempre
// null aqui, e nome SEM id faz tg_assign_roleta_to_leads dar early-return — o
// lead fica fora de qualquer distribuição. Foi assim que 506 leads "LOTUS LEADS"
// pararam: o mapper só descartava a string "JAPI LEADS", escrita à mão.
it('nunca grava corretor, nem placeholder nem gente de verdade', () => {
  for (const corretor of ['LOTUS LEADS', '  JAPI LEADS ', 'Ana', '  FERNANDA SOUZA  ', null]) {
    const lead = mapSantaAngelaToLead({ id: 'x', nome: 'F', corretor_nome: corretor }, 't');
    expect(lead.assigned_agent_name).toBe(null);
    expect(lead.assigned_agent_id).toBe(null);
    // e o nome da origem não se perde: fica onde serve para conferência
    expect(lead.custom_fields.santa_angela_corretor_nome).toBe(corretor);
  }
});

it('mapSantaAngelaToLead mapeia campos e status', () => {
  const lead = mapSantaAngelaToLead(
    { id: 'x1', nome: 'Fulano', celular: '11999', email: 'a@b.c',
      situacaocadastropessoa_titulo: 'EM ATENDIMENTO', corretor_nome: 'Ana',
      midia_titulo: 'Site' },
    'tenant-1',
  );
  expect(lead.tenant_id).toBe('tenant-1');
  expect(lead.source).toBe('Santa Angela');
  expect(lead.source_lead_id).toBe('x1');
  expect(lead.phone).toBe('11999');
  expect(lead.status).toBe('Interação');
  expect(lead.assigned_agent_name).toBe(null);
  expect(lead.custom_fields.santa_angela_corretor_nome).toBe('Ana');
  expect(lead.tags).toEqual(['Santa Angela', 'Site']);
  expect(lead.custom_fields.santa_angela_situacao).toBe('EM ATENDIMENTO');
});

it('property_code recebe o NOME do empreendimento, nunca o cpfcnpj', () => {
  const saLead = { id: 'x3', nome: 'Z', cpfcnpj: '15330336848', tipo: '4' };
  const comImovel = mapSantaAngelaToLead(saLead, 't', { id: '55', codigo: '8801', nome: 'RESERVA CASTANHEIRA' });
  expect(comImovel.property_code).toBe('RESERVA CASTANHEIRA');
  expect(comImovel.custom_fields.santa_angela_empreendimento_codigo).toBe('8801');
  expect(comImovel.custom_fields.santa_angela_cpfcnpj).toBe('15330336848'); // CPF fica onde é lugar dele

  const semImovel = mapSantaAngelaToLead(saLead, 't');
  expect(semImovel.property_code).toBe(null);
  expect(semImovel.property_type).toBe(null); // saLead.tipo é tipo de pessoa
});

it('mapSantaAngelaToLead status default = Novos Leads', () => {
  const lead = mapSantaAngelaToLead({ id: 'x2', nome: 'Y' }, 't');
  expect(lead.status).toBe('Novos Leads');
});

it('situação "PROPOSTA" sem qualificador vira status válido na constraint (não "Proposta")', () => {
  // Regressão 02/09: 'Proposta' não passa em leads_status_check → o INSERT
  // falhava e o lead era perdido em todo ciclo. Dois leads reais ficaram
  // fora do dash por meses por causa disso.
  const lead = mapSantaAngelaToLead({ id: 'p', nome: 'X', situacaocadastropessoa_titulo: 'PROPOSTA' }, 't1');
  expect(lead.status).toBe('Proposta Enviada');
  expect(lead.status).not.toBe('Proposta');
});

it('situação desconhecida na origem cai em Novos Leads (nunca status inválido)', () => {
  const inventada = mapSantaAngelaToLead(
    { id: 'p', nome: 'X', situacaocadastropessoa_titulo: 'SITUACAO QUE A ORIGEM INVENTOU' }, 't1');
  expect(inventada.status).toBe('Novos Leads');
});

it('todo status gerado pelo mapper está na lista aceita pela constraint', () => {
  const validos = new Set(['Novos Leads', 'Interação', 'Visita Agendada', 'Visita Realizada',
    'Negociação', 'Proposta Criada', 'Proposta Enviada', 'Proposta Assinada']);
  const situacoes = ['NOVO', 'EM ATENDIMENTO', 'VISITA', 'EM NEGOCIACAO', 'PROPOSTA',
    'PROPOSTA CRIADA', 'PROPOSTA ENVIADA', 'PROPOSTA ASSINADA', 'VENDA', 'AGENDAMENTO',
    'SEM CONTATO', '', undefined];
  for (const s of situacoes) {
    const { status } = mapSantaAngelaToLead({ id: 'p', nome: 'X', situacaocadastropessoa_titulo: s }, 't1');
    expect(validos.has(status), `situação "${s}" gerou status inválido: ${status}`).toBe(true);
  }
});

/**
 * A etapa da origem só empurra o lead para FRENTE. Antes, qualquer diferença
 * fazia a Santa Ângela mandar: o corretor movia o lead no Octo e o ciclo
 * seguinte (1 min) devolvia para "Novos Leads" — 23 voltas em 7 leads entre
 * 12 e 20/09/2026, e a reclamação que abriu esta investigação.
 */
describe('etapaAvanca', () => {
  it('origem à frente do Octo avança o lead', () => {
    expect(etapaAvanca('Interação', 'Negociação')).toBe(true);
    expect(etapaAvanca('Novos Leads', 'Interação')).toBe(true);
  });

  it('origem atrás não puxa o lead de volta', () => {
    expect(etapaAvanca('Interação', 'Novos Leads')).toBe(false);
    expect(etapaAvanca('Negociação', 'Visita Agendada')).toBe(false);
  });

  it('mesma etapa não é avanço (evita escrita inútil a cada minuto)', () => {
    expect(etapaAvanca('Interação', 'Interação')).toBe(false);
  });

  it('etapa fora do funil não é mexida — inclusive lead arquivado', () => {
    expect(etapaAvanca('Arquivado', 'Interação')).toBe(false);
    expect(etapaAvanca('Interação', 'Etapa Inventada')).toBe(false);
    expect(etapaAvanca(null, 'Interação')).toBe(false);
  });

  it('Em Atendimento fica entre Novos Leads e Interação', () => {
    expect(etapaAvanca('Novos Leads', 'Em Atendimento')).toBe(true);
    expect(etapaAvanca('Em Atendimento', 'Interação')).toBe(true);
    expect(etapaAvanca('Interação', 'Em Atendimento')).toBe(false);
  });
});

