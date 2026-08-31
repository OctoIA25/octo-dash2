/**
 * phonesFromMemberships — o filtro "Corretores" do chat depende deste parser:
 * ele transforma `permissions.whatsapp_phones` (JSONB livre, gravado pelo
 * Gerenciador de Permissões) num Set de telefones canônicos.
 */
import { describe, it, expect } from 'vitest';
import { phonesFromMemberships } from './useCorretorPhones';

describe('phonesFromMemberships', () => {
  it('normaliza e junta números de vários membros', () => {
    const phones = phonesFromMemberships([
      { phones: ['(11) 98888-7777'] },
      { phones: ['+55 21 97777-6666', '11 96666-5555'] },
    ]);
    expect(phones).toEqual(new Set(['5511988887777', '5521977776666', '5511966665555']));
  });

  it('ignora linhas sem array e entradas que não são string ou são curtas demais', () => {
    const phones = phonesFromMemberships([
      { phones: null },
      { phones: 'não-array' },
      { phones: [123 as unknown as string, '999', '(11) 98888-7777'] },
    ]);
    expect(phones).toEqual(new Set(['5511988887777']));
  });

  it('lista vazia de linhas produz Set vazio', () => {
    expect(phonesFromMemberships([]).size).toBe(0);
  });
});
