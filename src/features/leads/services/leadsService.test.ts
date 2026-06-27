import { describe, it, expect } from 'vitest';
import { mapKenloToKanbanLead, mapToKanbanLead } from './leadsService';

describe('mapKenloToKanbanLead — event time vs processing time', () => {
  const base = {
    id: 'k1',
    client_name: 'Maria',
    client_phone: '11999990000',
    lead_timestamp: '2026-03-10T08:00:00.000Z', // data REAL do lead (event time)
    created_at: '2026-06-27T12:00:00.000Z',      // data de import (processing time)
    stage: 'new',
  };

  it('event_at usa lead_timestamp (data real), não a data de import', () => {
    const lead = mapKenloToKanbanLead(base);
    expect(lead.event_at).toBe('2026-03-10T08:00:00.000Z');
  });

  it('REGRESSÃO bolsão: created_at e assigned_at continuam sendo a data de IMPORT', () => {
    // O bolsão calcula expiração com created_at/assigned_at. Se virassem event_at
    // (data antiga), leads importados expirariam de imediato. Esta é a trava.
    const lead = mapKenloToKanbanLead(base);
    expect(lead.created_at).toBe('2026-06-27T12:00:00.000Z');
    expect(lead.assigned_at).toBe('2026-06-27T12:00:00.000Z');
  });

  it('fallback: sem lead_timestamp, event_at cai na data de import', () => {
    const semTs = { ...base, lead_timestamp: undefined };
    const lead = mapKenloToKanbanLead(semTs);
    expect(lead.event_at).toBe('2026-06-27T12:00:00.000Z');
  });
});

describe('mapToKanbanLead (CRM) — event_at uniforme', () => {
  it('no CRM, created_at já é a data real → event_at = created_at', () => {
    const crm = {
      id: 'c1',
      created_at: '2026-05-01T10:00:00.000Z',
      property_code: null,
      name: 'João',
      phone: '11988887777',
      status: 'Novos Leads',
      lead_type: 1,
    } as unknown as Parameters<typeof mapToKanbanLead>[0];
    const lead = mapToKanbanLead(crm);
    expect(lead.event_at).toBe('2026-05-01T10:00:00.000Z');
  });
});
