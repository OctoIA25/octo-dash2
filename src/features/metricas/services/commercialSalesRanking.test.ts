import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mesmo builder falso do teste de vendasAssinadas: encadeia tudo e resolve as
// linhas da tabela pedida.
const store = vi.hoisted(() => ({
  proposals: [] as Record<string, unknown>[],
  leads: [] as Record<string, unknown>[],
  tenant_memberships: [] as Record<string, unknown>[],
  user_profiles: [] as Record<string, unknown>[],
  /** Erro por tabela — para exercitar a leitura de membros que falha. */
  errors: {} as Record<string, { message: string } | undefined>,
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from(table: keyof typeof store) {
      const erro = store.errors[table as string] ?? null;
      const result = { data: erro ? null : store[table] ?? [], error: erro };
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

import {
  buscarRankingCorretoresComercial,
  limparCacheResolverComercial,
  ratearComissaoDasVendas,
} from './commercialSalesService';

// O resolver de usuários é cacheado por 60s no módulo; cada teste tem o seu
// cadastro de níveis, então o cache morre entre eles.
beforeEach(() => {
  limparCacheResolverComercial();
  store.errors = {};
});

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

  it('rateia a comissão pelo motor Lotus e ordena pela parte do corretor', async () => {
    const COORD = 'b1a1c0de-0000-4000-8000-000000000001';
    store.tenant_memberships = [
      // Pleno (45%) sob Coordenador (teto 60%): 45% corretor, 15% líder, 40% Lotus.
      { user_id: FERNANDA, role: 'corretor', permissions: { nivel_comissao: 'pleno' }, leader_user_id: COORD },
      // Coordenador é líder de si mesmo (D062): 60% dele, 40% Lotus.
      { user_id: COORD, role: 'corretor', permissions: { nivel_comissao: 'coordenador' }, leader_user_id: null },
    ];
    store.user_profiles = [
      { id: FERNANDA, email: 'fernanda@lotus.com', full_name: 'Fernanda Souza', avatar_url: null },
      { id: COORD, email: 'gabi@lotus.com', full_name: 'Gabriele Fávaro', avatar_url: null },
    ];
    store.proposals = [
      { id: 'p1', value: 400000, commission_total: 20000, signed_at: '2026-01-12T12:00:00-03:00', agent_user_id: FERNANDA, agent_name: 'Fernanda', lead_id: null },
      { id: 'p2', value: 300000, commission_total: 15000, signed_at: '2026-02-10T12:00:00-03:00', agent_user_id: COORD, agent_name: 'Gabi', lead_id: null },
    ];

    const ranking = await buscarRankingCorretoresComercial(TENANT, 2026);

    // Gabi recebe 9.000 (60% de 15.000) e Fernanda 9.000 (45% de 20.000) —
    // empate na parte do corretor, desempatado pela comissão total.
    expect(ranking[0]).toMatchObject({
      corretor: 'Fernanda Souza',
      comissaoTotal: 20000,
      comissaoCorretor: 9000,
      comissaoImobiliaria: 8000,
      ticketMedio: 400000,
    });
    expect(ranking[1]).toMatchObject({
      corretor: 'Gabriele Fávaro',
      comissaoTotal: 15000,
      comissaoCorretor: 9000,
      comissaoImobiliaria: 6000,
    });
  });

  it('devolve rateio nulo quando falta nível ou Líder Direto (nunca zero)', async () => {
    store.tenant_memberships = [
      // Sem nível cadastrado.
      { user_id: FERNANDA, role: 'corretor', permissions: {}, leader_user_id: null },
    ];
    store.user_profiles = [{ id: FERNANDA, email: 'fernanda@lotus.com', full_name: 'Fernanda Souza', avatar_url: null }];
    store.proposals = [
      { id: 'p1', value: 400000, commission_total: 20000, signed_at: '2026-01-12T12:00:00-03:00', agent_user_id: FERNANDA, agent_name: 'Fernanda', lead_id: null },
      // Pleno sem Líder Direto: o motor bloqueia (L003), não inventa split.
      { id: 'p2', value: 300000, commission_total: 15000, signed_at: '2026-02-10T12:00:00-03:00', agent_user_id: null, agent_name: 'Nathalia Lobo', lead_id: null },
    ];

    const ranking = await buscarRankingCorretoresComercial(TENANT, 2026);

    expect(ranking.map((r) => [r.comissaoCorretor, r.comissaoImobiliaria])).toEqual([
      [null, null],
      [null, null],
    ]);
    // Sem rateio, a ordem cai no VGC — o maior primeiro.
    expect(ranking[0]).toMatchObject({ corretor: 'Fernanda Souza', comissaoTotal: 20000 });
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

describe('ratearComissaoDasVendas — total do período', () => {
  const venda = (over: Partial<Parameters<typeof ratearComissaoDasVendas>[1][number]>) => ({
    id: 'x', leadId: null, agentUserId: null, agentNome: '', vgv: 0, vgc: 0,
    dataAssinatura: '2026-01-12', mes: 1, ano: 2026, ...over,
  });

  it('agrupa por corretor antes de ratear e soma o líquido da imobiliária', async () => {
    const COORD = 'b1a1c0de-0000-4000-8000-000000000001';
    const SEM_NIVEL = 'b1a1c0de-0000-4000-8000-000000000002';
    store.tenant_memberships = [
      { user_id: FERNANDA, role: 'corretor', permissions: { nivel_comissao: 'pleno' }, leader_user_id: COORD },
      { user_id: COORD, role: 'corretor', permissions: { nivel_comissao: 'coordenador' }, leader_user_id: null },
      { user_id: SEM_NIVEL, role: 'corretor', permissions: {}, leader_user_id: null },
    ];
    store.user_profiles = [
      { id: FERNANDA, email: 'fernanda@lotus.com', full_name: 'Fernanda Souza', avatar_url: null },
      { id: COORD, email: 'gabi@lotus.com', full_name: 'Gabriele Fávaro', avatar_url: null },
      { id: SEM_NIVEL, email: 'novato@lotus.com', full_name: 'Novato', avatar_url: null },
    ];

    const total = await ratearComissaoDasVendas(TENANT, [
      // Duas vendas da mesma pessoa, uma delas só com o nome: um bolo só.
      venda({ id: 'p1', agentUserId: FERNANDA, agentNome: 'Fernanda', vgc: 12000 }),
      venda({ id: 'p2', agentUserId: null, agentNome: 'FERNANDA SOUZA', vgc: 8000 }),
      venda({ id: 'p3', agentUserId: COORD, agentNome: 'Gabi', vgc: 15000 }),
      // Sem nível: o motor bloqueia e a comissão fica fora dos dois totais.
      venda({ id: 'p4', agentUserId: SEM_NIVEL, agentNome: 'Novato', vgc: 50000 }),
    ]);

    // Fernanda (pleno sob coordenador): 45% de 20.000 = 9.000, Lotus 8.000.
    // Gabi (coordenador, líder de si mesma): 60% de 15.000 = 9.000, Lotus 6.000.
    expect(total).toEqual({ corretor: 18000, imobiliaria: 14000, semRateio: 1, resolverIndisponivel: false });
  });

  it('membros ilegíveis: marca resolverIndisponivel em vez de acusar falta de cadastro', async () => {
    store.errors.tenant_memberships = { message: 'canceling statement due to statement timeout' };
    store.user_profiles = [];

    const total = await ratearComissaoDasVendas(TENANT, [
      venda({ id: 'p1', agentUserId: FERNANDA, agentNome: 'Fernanda', vgc: 12000 }),
    ]);

    // Ninguém rateia (o motor não tem nível para ninguém), mas o motivo é a
    // leitura, não o cadastro — a tela usa isso para trocar a mensagem.
    expect(total).toEqual({ corretor: 0, imobiliaria: 0, semRateio: 1, resolverIndisponivel: true });
  });
});
