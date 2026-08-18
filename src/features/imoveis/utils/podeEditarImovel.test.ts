import { describe, it, expect } from 'vitest';
import { podeEditarImovel } from './podeEditarImovel';

const corretor = {
  temRegistroLocal: true,
  systemRole: 'corretor',
  userId: 'user-1',
  userEmail: 'corretor@octo.com',
};

describe('podeEditarImovel', () => {
  it('bloqueia imóvel sem registro local, mesmo para owner', () => {
    expect(podeEditarImovel({ ...corretor, temRegistroLocal: false, systemRole: 'owner' })).toBe(false);
  });

  it('libera owner e admin independentemente do caixa alta do role', () => {
    expect(podeEditarImovel({ ...corretor, systemRole: 'Owner' })).toBe(true);
    expect(podeEditarImovel({ ...corretor, systemRole: 'ADMIN' })).toBe(true);
  });

  it('libera o captador pelo e-mail', () => {
    expect(podeEditarImovel({ ...corretor, captadorEmail: 'Corretor@Octo.com' })).toBe(true);
  });

  it('libera quem cadastrou o imóvel', () => {
    expect(podeEditarImovel({ ...corretor, criadoPor: 'user-1' })).toBe(true);
  });

  it('bloqueia corretor que não é captador nem criador', () => {
    expect(
      podeEditarImovel({ ...corretor, captadorEmail: 'outro@octo.com', criadoPor: 'user-2' })
    ).toBe(false);
  });

  it('não confunde campos vazios dos dois lados', () => {
    expect(podeEditarImovel({ temRegistroLocal: true, systemRole: 'corretor' })).toBe(false);
    expect(
      podeEditarImovel({ temRegistroLocal: true, systemRole: 'corretor', criadoPor: null, userId: null })
    ).toBe(false);
  });
});
