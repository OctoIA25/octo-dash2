import { describe, it, expect, vi, beforeEach } from 'vitest';

// Query builder falso: qualquer método encadeia, o await resolve as linhas da
// tabela pedida. Só precisa aguentar `.select().eq().not().gte().lte().range()`.
const store = vi.hoisted(() => ({
  proposals: [] as Record<string, unknown>[],
  leads: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from(table: 'proposals' | 'leads') {
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

import { buscarVendasAssinadas, agruparPorCorretor, somarVendas } from './vendasAssinadasService';

const TENANT = '65c69875-dc83-4062-90f6-6f6adc30df26';

beforeEach(() => {
  store.proposals = [];
  store.leads = [];
});

describe('buscarVendasAssinadas — VGC', () => {
  it('usa o override da planilha quando commission_total > 0', async () => {
    store.proposals = [
      { id: 'p1', value: 668421.24, commission_total: 33421.06, signed_at: '2026-01-22T12:00:00-03:00', agent_user_id: 'u1', agent_name: 'David Venturini', lead_id: null },
    ];

    const [venda] = await buscarVendasAssinadas(TENANT, '2026-01-01', '2026-12-31');
    expect(venda.vgv).toBe(668421.24);
    expect(venda.vgc).toBe(33421.06);
  });

  it('sem override, deriva 3,5% em lançamento e 6% no resto', async () => {
    store.proposals = [
      { id: 'p1', value: 800000, commission_total: 0, signed_at: '2026-03-10T12:00:00-03:00', agent_user_id: 'u1', agent_name: 'Fernanda Souza', lead_id: 'l1' },
      { id: 'p2', value: 500000, commission_total: null, signed_at: '2026-03-11T12:00:00-03:00', agent_user_id: 'u2', agent_name: 'André Marcondes', lead_id: 'l2' },
    ];
    store.leads = [
      { id: 'l1', classification: ['lancamento'] },
      { id: 'l2', classification: ['pronto'] },
    ];

    const vendas = await buscarVendasAssinadas(TENANT, '2026-01-01', '2026-12-31');
    expect(vendas.map((v) => v.vgc)).toEqual([28000, 30000]);
  });
});

describe('buscarVendasAssinadas — mês no fuso do escritório', () => {
  it('venda de 31/01 às 22h BRT (1º/02 em UTC) fica em janeiro', async () => {
    store.proposals = [
      { id: 'p1', value: 100000, commission_total: 6000, signed_at: '2026-02-01T01:00:00Z', agent_user_id: 'u1', agent_name: 'Fernanda Souza', lead_id: null },
    ];

    const [venda] = await buscarVendasAssinadas(TENANT, '2026-01-01', '2026-01-31');
    expect(venda.dataAssinatura).toBe('2026-01-31');
    expect(venda.mes).toBe(1);
  });

  it('descarta a venda que cai fora do intervalo depois da conversão de fuso', async () => {
    store.proposals = [
      { id: 'p1', value: 100000, commission_total: 6000, signed_at: '2026-02-01T01:00:00Z', agent_user_id: 'u1', agent_name: 'Fernanda Souza', lead_id: null },
    ];

    expect(await buscarVendasAssinadas(TENANT, '2026-02-01', '2026-02-28')).toEqual([]);
  });
});

describe('agruparPorCorretor — fim da duplicação de apelido', () => {
  it('mesma pessoa com nomes diferentes soma numa linha só quando o user é o mesmo', () => {
    const vendas = [
      { id: 'p1', leadId: 'l1', agentUserId: 'u1', agentNome: 'Fernanda', vgv: 100, vgc: 10, dataAssinatura: '2026-01-05', mes: 1, ano: 2026 },
      { id: 'p2', leadId: 'l2', agentUserId: 'u1', agentNome: 'Fernanda Souza', vgv: 200, vgc: 20, dataAssinatura: '2026-02-05', mes: 2, ano: 2026 },
      { id: 'p3', leadId: null, agentUserId: null, agentNome: 'Eduardo', vgv: 50, vgc: 5, dataAssinatura: '2026-01-15', mes: 1, ano: 2026 },
    ];

    const porCorretor = agruparPorCorretor(vendas);
    expect(porCorretor).toHaveLength(2);
    expect(porCorretor[0]).toMatchObject({ agentUserId: 'u1', vendas: 2, vgv: 300, vgc: 30 });
    // Venda histórica sem usuário resolvido continua pelo nome da planilha.
    expect(porCorretor[1]).toMatchObject({ agentUserId: null, agentNome: 'Eduardo', vendas: 1 });
    expect(somarVendas(vendas)).toEqual({ vgv: 350, vgc: 35, vendas: 3 });
  });
});
