import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectMock = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: () => ({ select: selectMock }) },
}));
vi.mock('@/features/corretores/services/tenantMembersService', () => ({
  fetchTenantMembers: vi.fn(),
}));

import { fetchCaptadores, mapCaptadoresPorId } from './useCaptadores';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';

/** Encadeamento .select().eq().in() do PostgREST. */
const mockBrokers = (result: { data?: unknown[]; error?: { message: string } }) => {
  selectMock.mockReturnValue({ eq: () => ({ in: async () => result }) });
};

const membro = (user_id: string, email: string, extra: Record<string, unknown> = {}) =>
  ({ user_id, email, id: user_id, tenant_id: 't1', role: 'corretor', created_at: '', ...extra }) as never;

describe('fetchCaptadores', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa o nome de tenant_brokers quando existe', async () => {
    vi.mocked(fetchTenantMembers).mockResolvedValue([membro('u1', 'ana@x.com')]);
    mockBrokers({ data: [{ auth_user_id: 'u1', name: 'Ana Prado' }] });

    expect(await fetchCaptadores('t1')).toEqual([{ user_id: 'u1', nome: 'Ana Prado' }]);
  });

  it('cai no e-mail quando o membro não tem linha em tenant_brokers', async () => {
    vi.mocked(fetchTenantMembers).mockResolvedValue([membro('u1', 'ana@x.com'), membro('u2', 'bruno@x.com')]);
    mockBrokers({ data: [{ auth_user_id: 'u1', name: 'Ana Prado' }] });

    expect(await fetchCaptadores('t1')).toEqual([
      { user_id: 'u1', nome: 'Ana Prado' },
      { user_id: 'u2', nome: 'bruno@x.com' },
    ]);
  });

  it('ignora linha de broker sem auth_user_id ou sem nome', async () => {
    vi.mocked(fetchTenantMembers).mockResolvedValue([membro('u1', 'ana@x.com')]);
    mockBrokers({ data: [{ auth_user_id: null, name: 'Órfã' }, { auth_user_id: 'u1', name: null }] });

    expect(await fetchCaptadores('t1')).toEqual([{ user_id: 'u1', nome: 'ana@x.com' }]);
  });

  // Mesmo caso do CRECI/get_tenant_members: coluna nova some sem erro. A lista
  // não pode vir vazia por isso — o select ainda funciona com o e-mail.
  it('erro ao buscar nomes não derruba a lista', async () => {
    vi.mocked(fetchTenantMembers).mockResolvedValue([membro('u1', 'ana@x.com')]);
    mockBrokers({ error: { message: 'column "name" does not exist' } });

    expect(await fetchCaptadores('t1')).toEqual([{ user_id: 'u1', nome: 'ana@x.com' }]);
  });

  it('ordena por nome em pt-BR', async () => {
    vi.mocked(fetchTenantMembers).mockResolvedValue([membro('u1', 'z@x.com'), membro('u2', 'a@x.com')]);
    mockBrokers({ data: [{ auth_user_id: 'u1', name: 'Ática' }, { auth_user_id: 'u2', name: 'Alberto' }] });

    expect((await fetchCaptadores('t1')).map((c) => c.nome)).toEqual(['Alberto', 'Ática']);
  });

  it('resolve o líder direto (leader_user_id) em nome e nível', async () => {
    vi.mocked(fetchTenantMembers).mockResolvedValue([
      membro('u1', 'ana@x.com', { leader_user_id: 'u2' }),
      membro('u2', 'bia@x.com', { permissions: { nivel_comissao: 'coordenador' } }),
    ]);
    mockBrokers({ data: [{ auth_user_id: 'u1', name: 'Ana' }, { auth_user_id: 'u2', name: 'Bia' }] });

    expect(await fetchCaptadores('t1')).toEqual([
      { user_id: 'u1', nome: 'Ana', lider: { nome: 'Bia', nivel: 'coordenador' } },
      { user_id: 'u2', nome: 'Bia', nivel: 'coordenador' },
    ]);
  });

  it('ignora líder apontando para si mesmo ou fora da equipe', async () => {
    vi.mocked(fetchTenantMembers).mockResolvedValue([
      membro('u1', 'ana@x.com', { leader_user_id: 'u1' }),
      membro('u2', 'bia@x.com', { leader_user_id: 'u-fora' }),
    ]);
    mockBrokers({ data: [] });

    expect(await fetchCaptadores('t1')).toEqual([
      { user_id: 'u1', nome: 'ana@x.com' },
      { user_id: 'u2', nome: 'bia@x.com' },
    ]);
  });

  it('tenant sem membros não consulta tenant_brokers', async () => {
    vi.mocked(fetchTenantMembers).mockResolvedValue([]);

    expect(await fetchCaptadores('t1')).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });
});

describe('mapCaptadoresPorId', () => {
  it('vira o mapa user_id → nome que resolverCaptador consome', () => {
    expect(mapCaptadoresPorId([{ user_id: 'u1', nome: 'Ana' }])).toEqual({ u1: 'Ana' });
  });
});
