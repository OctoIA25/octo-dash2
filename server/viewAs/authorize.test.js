import { describe, it, expect } from 'vitest';
import { authorizeActingUser, canViewAsOthers, searchTenantUsers } from './authorize.js';

const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

/**
 * Fake Supabase mínimo: filtra as linhas em memória pelos .eq()/.in() aplicados.
 * Cobre os três acessos de authorize.js — tenant_memberships, tenant_brokers e
 * user_profiles.
 */
function makeSupabase({ memberships = [], brokers = [], profiles = [] } = {}) {
  const rowsByTable = {
    tenant_memberships: memberships,
    tenant_brokers: brokers,
    user_profiles: profiles,
  };

  return {
    from(table) {
      const eqFilters = {};
      const inFilters = {};
      const matches = (row) =>
        Object.entries(eqFilters).every(([col, val]) => row[col] === val) &&
        Object.entries(inFilters).every(([col, vals]) => vals.includes(row[col]));
      const rows = () => (rowsByTable[table] || []).filter(matches);

      const node = {
        select: () => node,
        limit: () => node,
        eq(col, val) {
          eqFilters[col] = val;
          return node;
        },
        in(col, vals) {
          inFilters[col] = vals;
          return node;
        },
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (resolve) => resolve({ data: rows(), error: null }),
      };
      return node;
    },
  };
}

describe('canViewAsOthers', () => {
  it('libera o owner da plataforma mesmo sem membership', async () => {
    const supabase = makeSupabase({ memberships: [] });
    const allowed = await canViewAsOthers(supabase, {
      userId: 'owner-1',
      userEmail: OWNER_EMAIL,
      tenantId: TENANT_A,
    });
    expect(allowed).toBe(true);
  });

  it('libera admin do tenant', async () => {
    const supabase = makeSupabase({
      memberships: [{ tenant_id: TENANT_A, user_id: 'admin-1', role: 'admin' }],
    });
    const allowed = await canViewAsOthers(supabase, {
      userId: 'admin-1',
      userEmail: 'admin@imob.com',
      tenantId: TENANT_A,
    });
    expect(allowed).toBe(true);
  });

  it('bloqueia corretor', async () => {
    const supabase = makeSupabase({
      memberships: [{ tenant_id: TENANT_A, user_id: 'corretor-1', role: 'corretor' }],
    });
    const allowed = await canViewAsOthers(supabase, {
      userId: 'corretor-1',
      userEmail: 'corretor@imob.com',
      tenantId: TENANT_A,
    });
    expect(allowed).toBe(false);
  });

  it('bloqueia admin de OUTRO tenant', async () => {
    const supabase = makeSupabase({
      memberships: [{ tenant_id: TENANT_B, user_id: 'admin-b', role: 'admin' }],
    });
    const allowed = await canViewAsOthers(supabase, {
      userId: 'admin-b',
      userEmail: 'admin-b@imob.com',
      tenantId: TENANT_A,
    });
    expect(allowed).toBe(false);
  });
});

describe('authorizeActingUser', () => {
  const adminSupabase = () =>
    makeSupabase({
      memberships: [
        { tenant_id: TENANT_A, user_id: 'admin-1', role: 'admin' },
        { tenant_id: TENANT_A, user_id: 'corretor-1', role: 'corretor' },
        { tenant_id: TENANT_B, user_id: 'corretor-b', role: 'corretor' },
      ],
    });

  it('sem actingUserId devolve contexto nulo (usa o próprio usuário)', async () => {
    const result = await authorizeActingUser(adminSupabase(), {
      userId: 'admin-1',
      userEmail: 'admin@imob.com',
      tenantId: TENANT_A,
      actingUserId: undefined,
    });
    expect(result).toEqual({ ok: true, actingUserId: null });
  });

  it('actingUserId igual ao próprio usuário devolve contexto nulo', async () => {
    const result = await authorizeActingUser(adminSupabase(), {
      userId: 'admin-1',
      userEmail: 'admin@imob.com',
      tenantId: TENANT_A,
      actingUserId: 'admin-1',
    });
    expect(result).toEqual({ ok: true, actingUserId: null });
  });

  it('admin assume corretor do mesmo tenant', async () => {
    const result = await authorizeActingUser(adminSupabase(), {
      userId: 'admin-1',
      userEmail: 'admin@imob.com',
      tenantId: TENANT_A,
      actingUserId: 'corretor-1',
    });
    expect(result).toEqual({ ok: true, actingUserId: 'corretor-1' });
  });

  it('corretor NÃO pode injetar actingUserId de outro usuário', async () => {
    const result = await authorizeActingUser(adminSupabase(), {
      userId: 'corretor-1',
      userEmail: 'corretor@imob.com',
      tenantId: TENANT_A,
      actingUserId: 'admin-1',
    });
    expect(result).toEqual({ ok: false, status: 403, error: 'view_as_forbidden' });
  });

  it('admin do tenant A NÃO pode assumir usuário do tenant B', async () => {
    const result = await authorizeActingUser(adminSupabase(), {
      userId: 'admin-1',
      userEmail: 'admin@imob.com',
      tenantId: TENANT_A,
      actingUserId: 'corretor-b',
    });
    expect(result).toEqual({ ok: false, status: 403, error: 'view_as_target_not_in_tenant' });
  });

  it('owner da plataforma também não escapa do tenant resolvido', async () => {
    const result = await authorizeActingUser(adminSupabase(), {
      userId: 'owner-1',
      userEmail: OWNER_EMAIL,
      tenantId: TENANT_A,
      actingUserId: 'corretor-b',
    });
    expect(result).toEqual({ ok: false, status: 403, error: 'view_as_target_not_in_tenant' });
  });
});

describe('searchTenantUsers', () => {
  const supabase = () =>
    makeSupabase({
      memberships: [
        { tenant_id: TENANT_A, user_id: 'u-admin', role: 'admin' },
        { tenant_id: TENANT_A, user_id: 'u-ana', role: 'corretor' },
        { tenant_id: TENANT_A, user_id: 'u-bruno', role: 'corretor' },
        { tenant_id: TENANT_B, user_id: 'u-outro', role: 'corretor' },
      ],
      brokers: [
        { tenant_id: TENANT_A, auth_user_id: 'u-ana', name: 'Ana Giglio', email: 'ana@imob.com' },
        { tenant_id: TENANT_B, auth_user_id: 'u-outro', name: 'Outro', email: 'outro@b.com' },
      ],
      profiles: [
        { id: 'u-bruno', full_name: 'Bruno Souza', email: 'bruno@imob.com' },
        { id: 'u-admin', full_name: 'Admin', email: 'admin@imob.com' },
      ],
    });

  it('lista só o tenant pedido e exclui o próprio usuário', async () => {
    const users = await searchTenantUsers(supabase(), {
      tenantId: TENANT_A,
      excludeUserId: 'u-admin',
    });
    expect(users.map((u) => u.userId)).toEqual(['u-ana', 'u-bruno']);
  });

  it('usa tenant_brokers como primário e user_profiles como fallback', async () => {
    const users = await searchTenantUsers(supabase(), { tenantId: TENANT_A });
    const byId = Object.fromEntries(users.map((u) => [u.userId, u.name]));
    expect(byId['u-ana']).toBe('Ana Giglio');
    expect(byId['u-bruno']).toBe('Bruno Souza');
  });

  it('filtra por nome', async () => {
    const users = await searchTenantUsers(supabase(), { tenantId: TENANT_A, term: 'ana' });
    expect(users.map((u) => u.userId)).toEqual(['u-ana']);
  });

  it('filtra por e-mail', async () => {
    const users = await searchTenantUsers(supabase(), { tenantId: TENANT_A, term: 'bruno@' });
    expect(users.map((u) => u.userId)).toEqual(['u-bruno']);
  });

  it('nunca devolve usuário de outro tenant', async () => {
    const users = await searchTenantUsers(supabase(), { tenantId: TENANT_A, term: 'outro' });
    expect(users).toEqual([]);
  });
});
