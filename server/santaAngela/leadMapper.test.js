import { describe, it, expect } from 'vitest';
import { mapSantaAngelaToLead, mapAssignedAgentName } from './leadMapper.js';

it('mapAssignedAgentName ignora "JAPI LEADS" e trim', () => {
  expect(mapAssignedAgentName('  JAPI LEADS ')).toBe(null);
  expect(mapAssignedAgentName('  Ana  ')).toBe('Ana');
  expect(mapAssignedAgentName(null)).toBe(null);
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
  expect(lead.assigned_agent_name).toBe('Ana');
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
