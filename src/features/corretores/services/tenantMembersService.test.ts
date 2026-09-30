import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, tabelas, chamadas } = vi.hoisted(() => ({
  rpc: vi.fn(),
  tabelas: {} as Record<string, unknown>,
  /** Cada passo da cadeia: ['update', payload], ['eq', 'id', x]... */
  chamadas: [] as unknown[][],
}));

/** Encadeamento PostgREST (.select().eq().in()) que resolve no resultado da tabela. */
const cadeia = (resultado: unknown): unknown =>
  new Proxy(Promise.resolve(resultado), {
    get: (alvo, prop) =>
      prop === 'then'
        ? alvo.then.bind(alvo)
        : (...args: unknown[]) => {
            chamadas.push([prop, ...args]);
            return cadeia(resultado);
          },
  });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, from: (tabela: string) => cadeia(tabelas[tabela]) },
}));

import { fetchTenantMembers, updateMemberPermissions } from './tenantMembersService';

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
      data: [{ auth_user_id: '11111111-1111-4111-8111-111111111111', email: 'gestora@imob.com', name: 'Mariana Mamede' }],
      error: null,
    };

    const membros = await fetchTenantMembers('t1');

    // Sem e-mail em lugar nenhum, o membro sai da lista em vez de virar UUID.
    expect(membros.map((m) => [m.user_id, m.email])).toEqual([
      ['11111111-1111-4111-8111-111111111111', 'gestora@imob.com'],
    ]);
    // E o nome vem do mesmo cadastro — é o que o card de Gestão de Equipe mostra.
    expect(membros[0].name).toBe('Mariana Mamede');
  });
});

// 30/09 — o card de membro mostra o NOME, e não mais o e-mail.
describe('fetchTenantMembers — o nome da pessoa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabelas.tenant_memberships = { data: [], error: null };
  });

  it('vem da RPC (tenant_brokers.name), aparado', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'm1', user_id: 'u1', tenant_id: 't1', role: 'corretor', email: 'alexandra.niero@lotus.com', name: '  Alexandra Niero ' }],
      error: null,
    });
    const [m] = await fetchTenantMembers('t1');
    expect([m.email, m.name]).toEqual(['alexandra.niero@lotus.com', 'Alexandra Niero']);
  });

  // A RPC devolve '' quando o cadastro não tem nome; o card cai no e-mail.
  it('nome vazio vira null, e nunca um nome inventado', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'm1', user_id: 'u1', tenant_id: 't1', role: 'corretor', email: 'sem.nome@lotus.com', name: '' }],
      error: null,
    });
    const [m] = await fetchTenantMembers('t1');
    expect(m.name).toBeNull();
  });

  // Sem e-mail, o mapper usa o `name` no lugar do e-mail. Aí o nome não pode
  // aparecer duas vezes como se fossem dois dados.
  it('nome que foi parar no lugar do e-mail não conta como nome', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'm1', user_id: 'u1', tenant_id: 't1', role: 'corretor', email: '', name: 'Fulano' }],
      error: null,
    });
    const [m] = await fetchTenantMembers('t1');
    expect([m.email, m.name]).toEqual(['Fulano', null]);
  });
});

describe('updateMemberPermissions — colunas ao lado do jsonb', () => {
  beforeEach(() => {
    chamadas.length = 0;
    tabelas.tenant_memberships = { data: [{ id: 'm1' }], error: null };
  });

  const payload = () => chamadas.find(([passo]) => passo === 'update')?.[1];

  it('grava CRECI e especialidades quando vêm', async () => {
    await updateMemberPermissions('m1', { atuacao: ['prontos'] }, {
      creci: '123-F',
      especialidades: ['Apartamento', 'Alto padrão'],
    });
    expect(payload()).toEqual({
      permissions: { atuacao: ['prontos'] },
      creci: '123-F',
      especialidades: ['Apartamento', 'Alto padrão'],
    });
  });

  it('null limpa a coluna', async () => {
    await updateMemberPermissions('m1', {}, { especialidades: null });
    expect(payload()).toEqual({ permissions: {}, especialidades: null });
  });

  // O bloqueio por atividade só mexe no jsonb: se
  // "não passei" virasse null, cada bloqueio apagaria o CRECI e as especialidades.
  it('sem colunas, não encosta em CRECI nem em especialidades', async () => {
    await updateMemberPermissions('m1', { bloqueio: true });
    expect(payload()).toEqual({ permissions: { bloqueio: true } });
  });
});
