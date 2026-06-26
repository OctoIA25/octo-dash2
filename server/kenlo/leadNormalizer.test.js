import { describe, it, expect } from 'vitest';
import { normalizeLead, isTestLead, tokenFingerprint } from './leadNormalizer.js';

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

describe('tokenFingerprint', () => {
  it('gera hash curto estável e não expõe o token', () => {
    const fp = tokenFingerprint('super-secret-token');
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(fp).not.toContain('secret');
    expect(tokenFingerprint('super-secret-token')).toBe(fp);
  });
});
