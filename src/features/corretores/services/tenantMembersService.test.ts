import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, tabelas } = vi.hoisted(() => ({
  rpc: vi.fn(),
  tabelas: {} as Record<string, unknown>,
}));

/** Encadeamento PostgREST (.select().eq().in()) que resolve no resultado da tabela. */
const cadeia = (resultado: unknown): unknown =>
  new Proxy(Promise.resolve(resultado), {
    get: (alvo, prop) =>
      prop === 'then' ? alvo.then.bind(alvo) : () => cadeia(resultado),
  });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, from: (tabela: string) => cadeia(tabelas[tabela]) },
}));

import { fetchTenantMembers } from './tenantMembersService';

describe('fetchTenantMembers — leitura direta (RPC falhou)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout' } });
  });

  // O bug relatado: tenant_memberships não tem e-mail e o mapper caía no user_id,
  // então o card mostrava um UUID no lugar do e-mail.
  it('pega o e-mail em tenant_brokers e nunca mostra o user_id', async () => {
    tabelas.tenant_memberships = {
      data: [
        { id: 'm1', user_id: '11111111-1111-4111-8111-111111111111', tenant_id: 't1', role: 'team_leader' },
        { id: 'm2', user_id: '22222222-2222-4222-8222-222222222222', tenant_id: 't1', role: 'corretor' },
      ],
      error: null,
    };
    tabelas.tenant_brokers = {
      data: [{ auth_user_id: '11111111-1111-4111-8111-111111111111', email: 'gestora@imob.com' }],
      error: null,
    };

    const membros = await fetchTenantMembers('t1');

    // Sem e-mail em lugar nenhum, o membro sai da lista em vez de virar UUID.
    expect(membros.map((m) => [m.user_id, m.email])).toEqual([
      ['11111111-1111-4111-8111-111111111111', 'gestora@imob.com'],
    ]);
  });
});
