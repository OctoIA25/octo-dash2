import { describe, it, expect } from 'vitest';
import { makeBrokerLookups } from './brokerLookups.js';

// Fake supabase: roteia por tabela. tenant_brokers e tenant_memberships usam
// .select().eq().not()/.eq(); imoveis_corretores usa .select().eq().eq().maybeSingle().
function fakeSupabase({ brokers = [], members = [], imovel = null } = {}) {
  return {
    from(table) {
      if (table === 'imoveis_corretores') {
        return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: imovel, error: null }) }; } }; } }; } };
      }
      if (table === 'tenant_brokers') {
        return { select() { return { eq() { return { not: async () => ({ data: brokers, error: null }) }; } }; } };
      }
      // tenant_memberships
      return { select() { return { eq: async () => ({ data: members, error: null }) }; } };
    },
  };
}

describe('brokerLookups', () => {
  it('getCorretorByPropertyCode lê imoveis_corretores (normaliza código p/ maiúsculo)', async () => {
    const { getCorretorByPropertyCode } = makeBrokerLookups(
      fakeSupabase({ imovel: { corretor_id: 'c9', corretor_nome: 'Ana' } }));
    const r = await getCorretorByPropertyCode('t1', 'im-7');
    expect(r).toEqual({ nome: 'Ana', id: 'c9' });
  });

  it('getCorretorByPropertyCode devolve null sem match', async () => {
    const { getCorretorByPropertyCode } = makeBrokerLookups(fakeSupabase({ imovel: null }));
    expect(await getCorretorByPropertyCode('t1', 'X')).toBeNull();
  });

  it('findCorretorInSystem casa por nome em tenant_brokers e retorna auth_user_id', async () => {
    const { findCorretorInSystem } = makeBrokerLookups(fakeSupabase({
      brokers: [{ id: 'b1', auth_user_id: 'u1', name: 'João Silva', email: 'j@x.com', phone: '11999998888' }],
    }));
    const r = await findCorretorInSystem('t1', { nome: 'joao silva' });
    expect(r).toEqual({ id: 'u1', nome: 'João Silva', matchType: 'nome' });
  });

  it('findCorretorInSystem retorna null quando nada bate', async () => {
    const { findCorretorInSystem } = makeBrokerLookups(fakeSupabase({ brokers: [], members: [] }));
    expect(await findCorretorInSystem('t1', { nome: 'Ninguém' })).toBeNull();
  });
});
