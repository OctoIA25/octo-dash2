/**
 * O nível do líder vinha vazio para todo mundo.
 *
 * A Gestão de Equipe grava o nível em `permissions.nivel_comissao`; a equipe do
 * repasse lia a coluna `nivel`, que ninguém preenchia. Todo Pleno e Júnior
 * chegava ao motor com um líder "sem nível" — e o motor bloqueia (D062).
 */
import { describe, it, expect, vi } from 'vitest';

const linhas = [
  { user_id: 'lider', permissions: { nivel_comissao: 'coordenador' }, leader_user_id: null, nivel: null },
  { user_id: 'ana', permissions: { nivel_comissao: 'pleno' }, leader_user_id: 'lider', nivel: null },
  { user_id: 'edu', permissions: { nivel_comissao: 'Chefe' }, leader_user_id: 'lider', nivel: null },
  { user_id: 'sol', permissions: null, leader_user_id: null, nivel: null },
];

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: linhas, error: null }) }),
    }),
  },
}));

vi.mock('@/features/corretores/services/tenantMembersService', () => ({
  fetchTenantMembers: () => Promise.resolve(linhas.map((l) => ({ user_id: l.user_id, email: `${l.user_id}@lotus.dev` }))),
}));

import { carregarEquipe } from '../vendasService';

describe('a equipe do repasse', () => {
  it('lê o nível de onde a Gestão de Equipe grava — o líder deixa de chegar vazio', async () => {
    const equipe = await carregarEquipe('lotus');
    const porId = Object.fromEntries(equipe.map((p) => [p.user_id, p]));
    expect(porId.lider.nivel).toBe('coordenador');
    expect(porId.ana).toMatchObject({ nivel: 'pleno', leader_user_id: 'lider' });
  });

  it('nível que o motor não conhece, ou ausente, vira sem nível em vez de quebrar', async () => {
    const equipe = await carregarEquipe('lotus');
    const porId = Object.fromEntries(equipe.map((p) => [p.user_id, p]));
    expect(porId.edu.nivel).toBeNull();
    expect(porId.sol.nivel).toBeNull();
  });
});
