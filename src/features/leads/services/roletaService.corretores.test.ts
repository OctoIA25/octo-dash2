import { describe, it, expect, vi } from 'vitest';

// Gestor (team_leader) só enxerga a própria linha em tenant_memberships via RLS.
// A lista de corretores tem de vir da RPC get_tenant_members, que já escopa
// admin → tenant inteiro e gestor → a própria equipe.
const tabelasLidas: string[] = [];
const rpc = vi.fn(async () => ({
  data: [
    { user_id: 'u-gestora', role: 'team_leader' },
    { user_id: 'u-corretor', role: 'corretor' },
    { user_id: 'u-admin', role: 'admin' },
  ],
  error: null,
}));
const linhas: Record<string, unknown[]> = {
  tenant_memberships: [{ user_id: 'u-gestora', role: 'team_leader' }],
  user_profiles: [
    { id: 'u-gestora', email: 'f@x.com', full_name: 'Fernanda Souza', phone: null, avatar_url: null },
    { id: 'u-corretor', email: 'c@x.com', full_name: 'Fábio Gonçalves', phone: null, avatar_url: null },
  ],
  roleta_participantes: [],
};

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...(args as [])),
    from: (tabela: string) => {
      tabelasLidas.push(tabela);
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        then: (ok: (r: unknown) => unknown) => ok({ data: linhas[tabela] ?? [], error: null }),
      };
      return q;
    },
  },
}));

import { fetchCorretoresDisponiveis } from './roletaService';

describe('fetchCorretoresDisponiveis', () => {
  it('lista via get_tenant_members — gestor vê a equipe, não só a si', async () => {
    const lista = await fetchCorretoresDisponiveis('t1');

    expect(rpc).toHaveBeenCalledWith('get_tenant_members', { p_tenant_id: 't1' });
    expect(tabelasLidas).not.toContain('tenant_memberships');
    expect(lista.map((c) => c.name)).toEqual(['Fábio Gonçalves', 'Fernanda Souza']);
  });
});
