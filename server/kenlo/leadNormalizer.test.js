import { describe, it, expect } from 'vitest';
import { normalizeLead, isTestLead, tokenFingerprint, kenloFingerprint, mergeLeadUpdate } from './leadNormalizer.js';

const baseRaw = {
  _id: 'abc123',
  timestamp: '2026-06-25T10:00:00.000Z',
  client: { name: 'Maria', ddd: '11', phone: '988887777', email: 'maria@x.com' },
  interest: { reference: 'IM-42', type: 'sale', isSale: true, isRent: false, image: 'http://img' },
  message: 'Tenho interesse',
  attendedBy: { name: 'Corretor João' },
  idMediaOrigin: 1546,
};

describe('normalizeLead', () => {
  it('achata client/interest/attendedBy e resolve portal', () => {
    const row = normalizeLead(baseRaw, 'tenant-1');
    expect(row.tenant_id).toBe('tenant-1');
    expect(row.external_id).toBe('abc123');
    expect(row.client_name).toBe('Maria');
    expect(row.client_phone).toBe('11988887777');
    expect(row.client_email).toBe('maria@x.com');
    expect(row.portal).toBe('Cliquei Mudei');
    expect(row.interest_reference).toBe('IM-42');
    expect(row.attended_by_name).toBe('Corretor João');
    expect(row.lead_timestamp).toBe('2026-06-25T10:00:00.000Z');
    expect(row.raw_data).toEqual(baseRaw);
  });

  it('não duplica DDD quando o telefone já o contém', () => {
    const row = normalizeLead({ ...baseRaw, client: { ddd: '11', phone: '11988887777' } }, 't');
    expect(row.client_phone).toBe('11988887777');
  });

  it('usa referenceLead quando reference ausente', () => {
    const row = normalizeLead({ ...baseRaw, interest: { referenceLead: 'RL-9' } }, 't');
    expect(row.interest_reference).toBe('RL-9');
  });

  // Mapeamento de etapa do funil — derivado por evidência (3.513 leads reais):
  // status=1 → 0% corretor (lead novo); status=2/5 → 80% corretor (atendido).
  it('status=1 do Kenlo → stage "new" (Novos Leads)', () => {
    const row = normalizeLead({ ...baseRaw, status: 1 }, 't');
    expect(row.stage).toBe('new');
  });

  it('status=2 do Kenlo → stage "contacted" (Interação)', () => {
    const row = normalizeLead({ ...baseRaw, status: 2 }, 't');
    expect(row.stage).toBe('contacted');
  });

  it('status=5 do Kenlo → stage "contacted" (atendido, conservador)', () => {
    const row = normalizeLead({ ...baseRaw, status: 5 }, 't');
    expect(row.stage).toBe('contacted');
  });

  it('sem status conhecido mas COM corretor → "contacted"; sem corretor → "new"', () => {
    const comCorretor = normalizeLead({ ...baseRaw, status: 99, attendedBy: { name: 'Ana' } }, 't');
    expect(comCorretor.stage).toBe('contacted');
    const semCorretor = normalizeLead({ ...baseRaw, status: 99, attendedBy: null }, 't');
    expect(semCorretor.stage).toBe('new');
  });
});

describe('isTestLead', () => {
  it('detecta validador OLX, lead de teste e telefone 999999999', () => {
    expect(isTestLead({ _id: '67571a368b8373fff6d92ebc' })).toBe(true);
    expect(isTestLead({ client: { name: 'Olx Validador URL' } })).toBe(true);
    expect(isTestLead({ client: { email: 'olx.validador.url@email.com' } })).toBe(true);
    expect(isTestLead({ client: { phone: '11999999999' } })).toBe(true);
    expect(isTestLead({ message: 'isso é um Lead de Teste' })).toBe(true);
    expect(isTestLead(baseRaw)).toBe(false);
  });
});

describe('kenloFingerprint', () => {
  it('muda quando um campo sincronizado do Kenlo muda', () => {
    const a = normalizeLead({ ...baseRaw, status: 1 }, 't');
    const b = normalizeLead({ ...baseRaw, status: 2 }, 't'); // stage muda new→contacted no payload
    expect(kenloFingerprint(a)).not.toBe(kenloFingerprint(b));
  });

  it('é estável: mesmo payload → mesmo hash', () => {
    const a = normalizeLead(baseRaw, 't');
    const b = normalizeLead(baseRaw, 't');
    expect(kenloFingerprint(a)).toBe(kenloFingerprint(b));
  });

  it('NÃO muda quando só um campo local do CRM difere (temperature/archived)', () => {
    const row = normalizeLead(baseRaw, 't');
    const comLocal = { ...row, temperature: 'hot', archived_at: '2026-01-01T00:00:00Z' };
    expect(kenloFingerprint(comLocal)).toBe(kenloFingerprint(row));
  });
});

describe('mergeLeadUpdate (merge column-scoped Kenlo→CRM)', () => {
  const incoming = normalizeLead(
    { ...baseRaw, client: { name: 'Maria Atualizada', ddd: '11', phone: '988887777' }, status: 2, attendedBy: { name: 'Carlos' } },
    't',
  );

  it('atualiza campos do Kenlo (nome, telefone, message, interest, raw_data)', () => {
    const existing = { id: 'row-1', stage: 'new', attended_by_name: null, attended_by_id: null,
      client_name: 'Maria', temperature: null, archived_at: null, kenlo_fingerprint: 'antigo' };
    const patch = mergeLeadUpdate(incoming, existing);
    expect(patch.client_name).toBe('Maria Atualizada');
    expect(patch.raw_data).toEqual(incoming.raw_data);
  });

  it('NÃO rebaixa stage: lead existente preserva o stage do CRM (corretor venceu)', () => {
    const existing = { id: 'row-1', stage: 'qualified', attended_by_name: 'X', attended_by_id: 'u1',
      temperature: null, archived_at: null, kenlo_fingerprint: 'antigo' };
    const patch = mergeLeadUpdate(incoming, existing);
    expect(patch).not.toHaveProperty('stage'); // nunca sobrescreve stage de lead existente
  });

  it('attended_by: preenche só se o CRM estiver vazio', () => {
    const vazio = { id: 'r', stage: 'new', attended_by_name: null, attended_by_id: null, kenlo_fingerprint: 'x' };
    const patchVazio = mergeLeadUpdate(incoming, vazio);
    expect(patchVazio.attended_by_name).toBe('Carlos');

    const ocupado = { id: 'r', stage: 'new', attended_by_name: 'João Manual', attended_by_id: 'u9', kenlo_fingerprint: 'x' };
    const patchOcupado = mergeLeadUpdate(incoming, ocupado);
    expect(patchOcupado).not.toHaveProperty('attended_by_name');
    expect(patchOcupado).not.toHaveProperty('attended_by_id');
  });

  it('NUNCA inclui colunas 100% locais no patch (archived_at, first_response_at, temperature, is_exclusive)', () => {
    const existing = { id: 'r', stage: 'new', attended_by_name: null, attended_by_id: null,
      temperature: 'hot', archived_at: '2026-01-01', first_response_at: '2026-01-02', is_exclusive: true, kenlo_fingerprint: 'x' };
    const patch = mergeLeadUpdate(incoming, existing);
    for (const local of ['archived_at', 'archive_reason', 'first_response_at', 'temperature', 'is_exclusive']) {
      expect(patch).not.toHaveProperty(local);
    }
  });

  it('retorna null quando nada do Kenlo mudou (hash igual) → evita UPDATE desnecessário', () => {
    const existing = { id: 'r', stage: incoming.stage, attended_by_name: incoming.attended_by_name,
      attended_by_id: 'u1', client_name: incoming.client_name, kenlo_fingerprint: kenloFingerprint(incoming) };
    expect(mergeLeadUpdate(incoming, existing)).toBeNull();
  });

  it('inclui o novo kenlo_fingerprint no patch quando há mudança', () => {
    const existing = { id: 'r', stage: 'new', attended_by_name: null, attended_by_id: null, kenlo_fingerprint: 'antigo' };
    const patch = mergeLeadUpdate(incoming, existing);
    expect(patch.kenlo_fingerprint).toBe(kenloFingerprint(incoming));
  });
});

describe('tokenFingerprint', () => {
  it('gera hash curto estável e não expõe o token', () => {
    const fp = tokenFingerprint('super-secret-token');
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(fp).not.toContain('secret');
    expect(tokenFingerprint('super-secret-token')).toBe(fp);
  });
});
