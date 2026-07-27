import { describe, it, expect } from 'vitest';
import { getActiveCorretores } from './roster.js';

// Fake supabase: cada .from(table) devolve um builder cujos .eq/.in encadeiam
// e cuja await resolve o {data,error} canônico da tabela.
function makeSupabase(tables) {
  return {
    from(table) {
      const result = tables[table] ?? { data: [], error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        then: (resolve) => resolve(result),
      };
      return builder;
    },
  };
}

describe('getActiveCorretores', () => {
  it('junta contato de tenant_brokers e faz fallback p/ user_profiles quando ausente', async () => {
    const supabase = makeSupabase({
      tenant_memberships: {
        data: [
          { user_id: 'u1', leader_user_id: 'lead1' },   // tem broker
          { user_id: 'u2', leader_user_id: null },       // sem broker → fallback profiles
        ],
        error: null,
      },
      tenant_brokers: {
        data: [
          { auth_user_id: 'u1', email: 'u1@corr.com', phone: '11999990000' },
        ],
        error: null,
      },
      user_profiles: {
        data: [
          { id: 'u2', email: 'u2@corr.com', phone: null },
        ],
        error: null,
      },
    });

    const roster = await getActiveCorretores(supabase, 'tenant-1');
    expect(roster).toHaveLength(2);

    const u1 = roster.find((c) => c.userId === 'u1');
    expect(u1).toMatchObject({ userId: 'u1', leaderUserId: 'lead1', email: 'u1@corr.com' });
    expect(u1.phone).toBeTruthy(); // telefone resolvido pelo broker

    const u2 = roster.find((c) => c.userId === 'u2');
    // fallback p/ user_profiles: email vem do profile, phone best-effort (null)
    expect(u2).toMatchObject({ userId: 'u2', leaderUserId: null, email: 'u2@corr.com', phone: null });
  });

  it('sem corretores ⇒ array vazio (não busca contato)', async () => {
    const supabase = makeSupabase({
      tenant_memberships: { data: [], error: null },
    });
    expect(await getActiveCorretores(supabase, 'tenant-1')).toEqual([]);
  });
});
