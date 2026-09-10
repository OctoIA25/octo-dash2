import { describe, it, expect } from 'vitest';
import { podeAlterarTelefoneDe } from './memberPhonePermission';

const equipes = [{ id: 'equipe-1', leader_user_ids: ['gestor-2', 'gestor-3'] }];
const corretor = { user_id: 'corretor-1', leader_user_id: 'gestor-1', team_id: 'equipe-1' };

const chamar = (over: Partial<Parameters<typeof podeAlterarTelefoneDe>[0]>) =>
  podeAlterarTelefoneDe({
    alvo: corretor,
    usuarioId: 'estranho',
    isTenantAdmin: false,
    minhaRole: 'corretor',
    equipes,
    ...over,
  });

describe('podeAlterarTelefoneDe', () => {
  it('o corretor muda o próprio número', () => {
    expect(chamar({ usuarioId: 'corretor-1' })).toBe(true);
  });

  it('admin/owner muda o de qualquer um', () => {
    expect(chamar({ isTenantAdmin: true })).toBe(true);
  });

  it('gestor muda o do corretor que lidera (líder primário)', () => {
    expect(chamar({ usuarioId: 'gestor-1', minhaRole: 'team_leader' })).toBe(true);
  });

  it('gestor secundário da equipe do corretor também muda', () => {
    expect(chamar({ usuarioId: 'gestor-2', minhaRole: 'team_leader' })).toBe(true);
  });

  it('gestor NÃO muda o de corretor de outra equipe', () => {
    expect(
      chamar({
        usuarioId: 'gestor-9',
        minhaRole: 'team_leader',
        alvo: { user_id: 'corretor-1', leader_user_id: 'gestor-1', team_id: 'equipe-outra' },
      }),
    ).toBe(false);
  });

  it('corretor NÃO muda o número do colega', () => {
    expect(chamar({ usuarioId: 'corretor-2' })).toBe(false);
  });

  it('sem usuário logado ou sem membro aberto, ninguém muda nada', () => {
    expect(chamar({ usuarioId: null, isTenantAdmin: true })).toBe(false);
    expect(chamar({ alvo: null, isTenantAdmin: true })).toBe(false);
  });
});
