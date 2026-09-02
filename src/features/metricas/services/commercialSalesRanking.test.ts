import { describe, it, expect, vi } from 'vitest';

// Mesmo builder falso do teste de vendasAssinadas: encadeia tudo e resolve as
// linhas da tabela pedida.
const store = vi.hoisted(() => ({
  proposals: [] as Record<string, unknown>[],
  leads: [] as Record<string, unknown>[],
  tenant_memberships: [] as Record<string, unknown>[],
  user_profiles: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from(table: keyof typeof store) {
      const result = { data: store[table] ?? [], error: null };
      const chain: unknown = new Proxy(
        {},
        {
          get(_alvo, prop) {
            if (prop === 'then') {
              return (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled);
            }
            return () => chain;
          },
        },
      );
      return chain;
    },
  },
}));

import { buscarRankingCorretoresComercial } from './commercialSalesService';

const TENANT = '65c69875-dc83-4062-90f6-6f6adc30df26';
const FERNANDA = '05262739-196d-4888-8d7d-bb84f6bc670d';

describe('buscarRankingCorretoresComercial — uma linha por pessoa', () => {
  it('junta apelido da planilha, nome digitado no funil e agent_user_id na mesma linha', async () => {
    store.tenant_memberships = [{ user_id: FERNANDA, role: 'corretor' }];
    store.user_profiles = [{ id: FERNANDA, email: 'fernanda@lotus.com', full_name: 'Fernanda Souza', avatar_url: null }];
    store.proposals = [
      // Vendas do backfill: dono resolvido, nomes diferentes na planilha.
      { id: 'p1', value: 400000, commission_total: 20000, signed_at: '2026-01-12T12:00:00-03:00', agent_user_id: FERNANDA, agent_name: 'Fernanda', lead_id: null },
      { id: 'p2', value: 600000, commission_total: 30000, signed_at: '2026-03-19T12:00:00-03:00', agent_user_id: FERNANDA, agent_name: 'Fernanda Souza', lead_id: null },
      // Venda nova do funil: sem agent_user_id, só o nome em caixa alta.
      { id: 'p3', value: 500000, commission_total: 25000, signed_at: '2026-09-02T12:00:00-03:00', agent_user_id: null, agent_name: 'FERNANDA SOUZA', lead_id: null },
      // Venda histórica de quem não é mais do tenant: fica pelo nome.
      { id: 'p4', value: 460663.55, commission_total: 23745.54, signed_at: '2026-02-28T12:00:00-03:00', agent_user_id: null, agent_name: 'Nathalia Lobo', lead_id: null },
    ];

    const ranking = await buscarRankingCorretoresComercial(TENANT, 2026);

    expect(ranking).toHaveLength(2);
    expect(ranking[0]).toMatchObject({
      ranking: 1,
      corretor: 'Fernanda Souza',
      userId: FERNANDA,
      vendasFeitas: 3,
      vgvTotal: 1500000,
      vgcTotal: 75000,
      comissaoTotal: 75000,
    });
    expect(ranking[1]).toMatchObject({ ranking: 2, corretor: 'Nathalia Lobo', vendasFeitas: 1 });
  });

  it('filtra por mês de referência usando a data de assinatura', async () => {
    store.tenant_memberships = [];
    store.user_profiles = [];
    store.proposals = [
      { id: 'p1', value: 400000, commission_total: 20000, signed_at: '2026-01-12T12:00:00-03:00', agent_user_id: FERNANDA, agent_name: 'Fernanda', lead_id: null },
      { id: 'p2', value: 600000, commission_total: 30000, signed_at: '2026-03-19T12:00:00-03:00', agent_user_id: FERNANDA, agent_name: 'Fernanda', lead_id: null },
    ];

    const ranking = await buscarRankingCorretoresComercial(TENANT, 2026, 3);
    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toMatchObject({ vendasFeitas: 1, vgvTotal: 600000 });
  });
});
