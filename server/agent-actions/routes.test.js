import { describe, it, expect } from 'vitest';
import { __test__ } from './routes.js';

const { resolveUserContext, statusFor, isPlatformOwner, resolvePublicSourceMode } = __test__;

describe('routes.statusFor — mapeamento de erro → HTTP', () => {
  it('permissão → 403', () => {
    expect(statusFor('forbidden_no_broker_identity')).toBe(403);
    expect(statusFor('not_a_member')).toBe(403);
  });
  it('não encontrado → 404', () => {
    expect(statusFor('run_not_found')).toBe(404);
  });
  it('validação → 400', () => {
    expect(statusFor('message_required')).toBe(400);
    expect(statusFor('already_confirmed')).toBe(400);
    expect(statusFor('unsupported_action:x')).toBe(400);
    expect(statusFor('invalid_segment')).toBe(400);
  });
  it('falha do n8n → 502', () => {
    expect(statusFor('n8n_error')).toBe(502);
  });
  it('desconhecido → 500', () => {
    expect(statusFor('persist_failed')).toBe(500);
    expect(statusFor(null)).toBe(500);
  });
});

describe('routes.isPlatformOwner', () => {
  it('reconhece o email do owner (case-insensitive)', () => {
    expect(isPlatformOwner('octo.inteligenciaimobiliaria@gmail.com')).toBe(true);
    expect(isPlatformOwner('OCTO.inteligenciaimobiliaria@GMAIL.com')).toBe(true);
    expect(isPlatformOwner('outro@x.com')).toBe(false);
  });
});

/** Fake simples por tabela. */
function fakeSupabase(tables) {
  return {
    from(table) {
      const cfg = tables[table] || {};
      const node = {
        select: () => node,
        eq: () => node,
        ilike: () => node,
        maybeSingle: async () => ({ data: cfg.data ?? null, error: cfg.error ?? null }),
      };
      return node;
    },
  };
}

/** Fake supabase para resolvePublicSourceMode: permite customizar por tabela e comportamento. */
function fakeSupabaseForMode({ data = null, error = null, throws = false } = {}) {
  return {
    from() {
      const node = {
        select: () => node,
        eq: () => node,
        maybeSingle: async () => {
          if (throws) throw new Error('network_timeout');
          return { data, error };
        },
      };
      return node;
    },
  };
}

describe('routes.resolvePublicSourceMode', () => {
  it('retorna o mode da tabela quando a linha existe', async () => {
    const supabase = fakeSupabaseForMode({ data: { mode: 'shadow_leads' } });
    const result = await resolvePublicSourceMode(supabase, 't1');
    expect(result).toBe('shadow_leads');
  });

  it('retorna kenlo_only quando não existe linha (data null, sem error)', async () => {
    const supabase = fakeSupabaseForMode({ data: null, error: null });
    const result = await resolvePublicSourceMode(supabase, 't1');
    expect(result).toBe('kenlo_only');
  });

  it('retorna kenlo_only quando a query retorna error', async () => {
    const supabase = fakeSupabaseForMode({ data: null, error: { message: 'table not found' } });
    const result = await resolvePublicSourceMode(supabase, 't1');
    expect(result).toBe('kenlo_only');
  });

  it('retorna kenlo_only quando a query lança exceção (rede, timeout)', async () => {
    const supabase = fakeSupabaseForMode({ throws: true });
    const result = await resolvePublicSourceMode(supabase, 't1');
    expect(result).toBe('kenlo_only');
  });

  it('respeita AGENT_PUBLIC_SOURCE_DEFAULT como fallback quando não há linha', async () => {
    const original = process.env.AGENT_PUBLIC_SOURCE_DEFAULT;
    process.env.AGENT_PUBLIC_SOURCE_DEFAULT = 'leads_only';
    const supabase = fakeSupabaseForMode({ data: null });
    const result = await resolvePublicSourceMode(supabase, 't1');
    if (original === undefined) delete process.env.AGENT_PUBLIC_SOURCE_DEFAULT;
    else process.env.AGENT_PUBLIC_SOURCE_DEFAULT = original;
    expect(result).toBe('leads_only');
  });
});

describe('routes.resolveUserContext — permissões', () => {
  it('platform owner: role owner sem membership', async () => {
    const supabase = fakeSupabase({});
    const ctx = await resolveUserContext(supabase, { userEmail: 'octo.inteligenciaimobiliaria@gmail.com' }, 't1');
    expect(ctx).toEqual({ ok: true, role: 'owner', brokerName: null });
  });

  it('não-membro é bloqueado', async () => {
    const supabase = fakeSupabase({ tenant_memberships: { data: null } });
    const ctx = await resolveUserContext(supabase, { userEmail: 'x@y.com', userId: 'u' }, 't1');
    expect(ctx).toEqual({ ok: false, error: 'not_a_member' });
  });

  it('admin: role admin, sem brokerName', async () => {
    const supabase = fakeSupabase({ tenant_memberships: { data: { role: 'admin' } } });
    const ctx = await resolveUserContext(supabase, { userEmail: 'a@y.com', userId: 'u' }, 't1');
    expect(ctx).toEqual({ ok: true, role: 'admin', brokerName: null });
  });

  it('corretor: resolve brokerName de Corretores', async () => {
    const supabase = fakeSupabase({
      tenant_memberships: { data: { role: 'corretor' } },
      Corretores: { data: { nm_corretor: 'Maria Corretora' } },
    });
    const ctx = await resolveUserContext(supabase, { userEmail: 'm@y.com', userId: 'u' }, 't1');
    expect(ctx).toEqual({ ok: true, role: 'corretor', brokerName: 'Maria Corretora' });
  });
});
