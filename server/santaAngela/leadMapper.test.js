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

it('mapSantaAngelaToLead status default = Novos Leads', () => {
  const lead = mapSantaAngelaToLead({ id: 'x2', nome: 'Y' }, 't');
  expect(lead.status).toBe('Novos Leads');
});
