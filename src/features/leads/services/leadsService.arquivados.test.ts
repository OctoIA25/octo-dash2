/**
 * Regressão de vazamento entre imobiliárias na lista de Arquivados.
 *
 * `fetchTodosLeadsArquivadosCRM()` e `fetchLeadsArquivadosDoCorretor()` eram as
 * duas únicas listagens de `leads` deste arquivo sem filtro de tenant — as
 * outras quinze já faziam `if (tenantId) q = q.eq('tenant_id', tenantId)`.
 *
 * Quem segurava era só a RLS, e ela tem uma exceção: a conta owner tem bypass
 * na leads_select_policy e é membro comum de vários tenants. Logada (ou
 * impersonando a Lotus), ela via na mesma lista os arquivados de outras
 * imobiliárias, sem nada na tela indicando isso.
 *
 * O fake honra os filtros, como o PostgREST: se a consulta não mandar
 * tenant_id, ele devolve as linhas dos dois tenants — que é exatamente o bug.
 */
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const CORRETOR = 'user-1';

const BASE = [
  { id: 'a1', name: 'Arquivado A1', tenant_id: TENANT_A, assigned_agent_id: CORRETOR, archived_at: '2026-09-01T10:00:00Z', status: 'Novos Leads', lead_type: 1, created_at: '2026-08-01T10:00:00Z' },
  { id: 'a2', name: 'Arquivado A2', tenant_id: TENANT_A, assigned_agent_id: 'outro',  archived_at: '2026-09-02T10:00:00Z', status: 'Novos Leads', lead_type: 1, created_at: '2026-08-02T10:00:00Z' },
  { id: 'b1', name: 'Arquivado B1', tenant_id: TENANT_B, assigned_agent_id: CORRETOR, archived_at: '2026-09-03T10:00:00Z', status: 'Novos Leads', lead_type: 1, created_at: '2026-08-03T10:00:00Z' },
  { id: 'a3', name: 'Ativo A3',     tenant_id: TENANT_A, assigned_agent_id: CORRETOR, archived_at: null,                   status: 'Novos Leads', lead_type: 1, created_at: '2026-08-04T10:00:00Z' },
];

// Fake do query builder que APLICA os filtros, como o PostgREST faria.
function builder(tabela: string) {
  const eqs: Array<[string, unknown]> = [];
  let soArquivados = false;
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'is', 'ilike', 'in', 'range']) chain[m] = () => chain;
  chain.eq = (col: string, val: unknown) => { eqs.push([col, val]); return chain; };
  chain.not = (col: string, op: string, val: unknown) => {
    if (col === 'archived_at' && op === 'is' && val === null) soArquivados = true;
    return chain;
  };
  chain.then = (resolve: (r: unknown) => unknown) => {
    if (tabela !== 'leads') return Promise.resolve({ data: [], error: null }).then(resolve);
    const data = BASE.filter((l) => {
      if (soArquivados && l.archived_at === null) return false;
      return eqs.every(([col, val]) => (l as Record<string, unknown>)[col] === val);
    });
    return Promise.resolve({ data, error: null }).then(resolve);
  };
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));

describe('Arquivados não mistura imobiliárias', () => {
  it('fetchTodosLeadsArquivadosCRM traz só os arquivados do tenant pedido', async () => {
    const { fetchTodosLeadsArquivadosCRM } = await import('./leadsService');
    const leads = await fetchTodosLeadsArquivadosCRM(TENANT_A);

    expect(leads.map((l) => l.id).sort()).toEqual(['a1', 'a2']);
    expect(leads.map((l) => l.id)).not.toContain('b1'); // o lead da outra imobiliária
    expect(leads.map((l) => l.id)).not.toContain('a3'); // o que não está arquivado
  });

  it('fetchLeadsArquivadosDoCorretor não traz o lead do mesmo corretor em outro tenant', async () => {
    const { fetchLeadsArquivadosDoCorretor } = await import('./leadsService');
    const leads = await fetchLeadsArquivadosDoCorretor(CORRETOR, TENANT_A);

    expect(leads.map((l) => l.id)).toEqual(['a1']);
    expect(leads.map((l) => l.id)).not.toContain('b1');
  });
});
