/**
 * Regressão da auditoria de 08/09/2026 (kenlo_leads no funil e nos relatórios).
 *
 * Dois bugs que não davam erro nenhum, só número errado:
 *
 * 1. ETAPA — o mapa local de stage estava desatualizado (esperava `visit` e
 *    `closed`; o servidor grava `visit_done`, `closed_won`, `closed_lost` e
 *    `visit_scheduled`). Tudo que não casava caía no `|| 'Novos Leads'`:
 *    1.579 leads ativos da Japi, incluindo as 1.283 vendas `closed_won`,
 *    apareciam no funil como lead novo.
 *
 * 2. CORRETOR — o filtro por corretor comparava o UUID do usuário com
 *    `attended_by_name`. Zero linha, sempre: no tenant cuja base é kenlo_leads,
 *    o corretor via Relatórios vazio.
 *
 * Os stages abaixo são os que existem de fato em produção (contados na
 * auditoria), não uma lista inventada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT = 'tenant-1';
const CORRETOR_UUID = '05262739-196d-4888-8d7d-bb84f6bc670d';

const KENLO = [
  { id: 'k-new', tenant_id: TENANT, client_name: 'Novo', stage: 'new', attended_by_id: CORRETOR_UUID, attended_by_name: 'Fernanda Souza', created_at: '2026-08-01T00:00:00Z' },
  { id: 'k-cont', tenant_id: TENANT, client_name: 'Contatado', stage: 'contacted', attended_by_id: CORRETOR_UUID, attended_by_name: 'Fernanda Souza', created_at: '2026-08-02T00:00:00Z' },
  { id: 'k-sched', tenant_id: TENANT, client_name: 'Visita marcada', stage: 'visit_scheduled', attended_by_id: CORRETOR_UUID, attended_by_name: 'Fernanda Souza', created_at: '2026-08-03T00:00:00Z' },
  { id: 'k-done', tenant_id: TENANT, client_name: 'Visitou', stage: 'visit_done', attended_by_id: null, attended_by_name: 'Outro Corretor', created_at: '2026-08-04T00:00:00Z' },
  { id: 'k-won', tenant_id: TENANT, client_name: 'Comprou', stage: 'closed_won', attended_by_id: null, attended_by_name: 'Outro Corretor', created_at: '2026-08-05T00:00:00Z' },
  { id: 'k-lost', tenant_id: TENANT, client_name: 'Perdeu', stage: 'closed_lost', attended_by_id: null, attended_by_name: 'Outro Corretor', created_at: '2026-08-06T00:00:00Z' },
];

/** Colunas usadas em cada `.eq()` — é o que prova qual coluna o filtro tocou. */
const filtros: Array<{ tabela: string; coluna: string; valor: unknown }> = [];

function builder(tabela: string) {
  let range: { from: number; to: number } | null = null;
  let linhas = tabela === 'kenlo_leads' ? KENLO : [];

  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'is', 'ilike', 'order', 'not', 'in']) {
    chain[m] = () => chain;
  }
  chain.eq = (coluna: string, valor: unknown) => {
    filtros.push({ tabela, coluna, valor });
    // O fake honra o filtro: se a coluna não existir na linha, ninguém casa —
    // exatamente o que o PostgREST fazia com o UUID em `attended_by_name`.
    if (coluna !== 'tenant_id') {
      linhas = linhas.filter((l) => (l as Record<string, unknown>)[coluna] === valor);
    }
    return chain;
  };
  chain.range = (from: number, to: number) => { range = { from, to }; return chain; };
  chain.then = (resolve: (r: unknown) => unknown) => {
    const slice = range ? linhas.slice(range.from, range.to + 1) : linhas;
    return Promise.resolve({ data: slice, error: null }).then(resolve);
  };
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));

beforeEach(() => { filtros.length = 0; });

describe('etapa do lead vindo de kenlo_leads', () => {
  it('traduz todos os stages que o servidor grava, sem cair em "Novos Leads"', async () => {
    const { fetchLeadsForMetrics } = await import('./leadsMetricsService');

    const leads = await fetchLeadsForMetrics(TENANT, null, 1);
    const etapaPorId = Object.fromEntries(leads.map((l) => [l.id, l.status]));

    expect(etapaPorId).toEqual({
      'k-new': 'Novos Leads',
      'k-cont': 'Interação',
      'k-sched': 'Visita Agendada',
      'k-done': 'Visita Realizada',
      'k-won': 'Proposta Assinada',
      'k-lost': 'Arquivado',
    });
  });

  it('venda fechada não é contada como lead novo no funil', async () => {
    const { fetchLeadsForMetrics } = await import('./leadsMetricsService');

    const leads = await fetchLeadsForMetrics(TENANT, null, 1);
    const novos = leads.filter((l) => l.status === 'Novos Leads');

    expect(novos).toHaveLength(1);
    expect(novos[0].id).toBe('k-new');
  });
});

describe('filtro por corretor em kenlo_leads', () => {
  it('filtra por attended_by_id, não pelo nome', async () => {
    const { fetchLeadsForMetrics } = await import('./leadsMetricsService');

    await fetchLeadsForMetrics(TENANT, CORRETOR_UUID, 1);

    // A leitura é paginada, então a mesma coluna aparece uma vez por página —
    // o que importa é QUAL coluna, não quantas vezes.
    const doKenlo = filtros.filter((f) => f.tabela === 'kenlo_leads' && f.coluna !== 'tenant_id');
    expect(doKenlo.length).toBeGreaterThan(0);
    expect([...new Set(doKenlo.map((f) => f.coluna))]).toEqual(['attended_by_id']);
    expect(doKenlo.every((f) => f.valor === CORRETOR_UUID)).toBe(true);
  });

  it('corretor recebe os próprios leads em vez de lista vazia', async () => {
    const { fetchLeadsForMetrics } = await import('./leadsMetricsService');

    const leads = await fetchLeadsForMetrics(TENANT, CORRETOR_UUID, 1);

    expect(leads.map((l) => l.id)).toEqual(['k-new', 'k-cont', 'k-sched']);
    expect(leads.every((l) => l.assigned_agent_id === CORRETOR_UUID)).toBe(true);
  });
});
