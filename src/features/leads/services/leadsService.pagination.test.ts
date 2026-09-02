/**
 * Regressão do corte silencioso de 1000 linhas do PostgREST.
 *
 * Em 02/09 o tenant Lotus passou de 1.048 para 1.386 leads (import histórico da
 * Santa Ângela) e os 386 mais ANTIGOS desapareceram do Kanban — sem erro, sem
 * log. As listagens de `leads` ordenavam por created_at DESC e não paginavam,
 * então o PostgREST devolvia só as 1000 primeiras linhas e ninguém sabia que
 * havia mais. Um lead de 2019 (QUERMEM, posição 1.318 na ordenação) simplesmente
 * não existia para a tela.
 *
 * O teste roda contra um fake do supabase que HONRA o `.range()` e recusa
 * qualquer consulta sem ele — é o mesmo contrato do PostgREST real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TOTAL_LEADS = 1386;   // igual ao caso real
const TENANT = 'tenant-1';

// Fake mínimo do query builder: acumula filtros, exige .range() e fatia a base.
function makeSupabaseFake(totalLeads: number) {
  const chamadas: Array<{ from: number; to: number }> = [];
  const base = Array.from({ length: totalLeads }, (_, i) => ({
    id: `lead-${String(i).padStart(4, '0')}`,
    name: `Lead ${i}`,
    // i=0 é o mais recente; o último é o mais antigo (o "lead de 2019")
    created_at: new Date(Date.UTC(2026, 0, 1) - i * 86400000).toISOString(),
    status: 'Novos Leads',
    lead_type: 1,
  }));

  const builder = (tabela: string) => {
    let range: { from: number; to: number } | null = null;
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'ilike', 'order', 'not', 'in']) {
      chain[m] = () => chain;
    }
    chain.range = (from: number, to: number) => { range = { from, to }; return chain; };
    chain.then = (resolve: (r: unknown) => unknown) => {
      if (tabela !== 'leads') return Promise.resolve({ data: [], error: null }).then(resolve);
      if (!range) {
        // Contrato do PostgREST: sem range, no máximo 1000 linhas e SEM aviso.
        // Falhar aqui é o ponto do teste — listagem sem paginação é o bug.
        return Promise.resolve({
          data: null,
          error: { message: 'listagem de leads sem .range(): truncaria em 1000 linhas' },
        }).then(resolve);
      }
      chamadas.push(range);
      return Promise.resolve({ data: base.slice(range.from, range.to + 1), error: null }).then(resolve);
    };
    return chain;
  };

  return { supabase: { from: builder }, chamadas, base };
}

const fake = makeSupabaseFake(TOTAL_LEADS);
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => fake.supabase.from(t) } }));

describe('listagens de leads paginam além das 1000 linhas do PostgREST', () => {
  beforeEach(() => { fake.chamadas.length = 0; });

  it('fetchTodosLeadsCRM traz TODOS os leads, não só os 1000 mais recentes', async () => {
    const { fetchTodosLeadsCRM } = await import('./leadsService');
    const leads = await fetchTodosLeadsCRM(TENANT, 1);

    expect(leads.length).toBe(TOTAL_LEADS);
    expect(leads.length).toBeGreaterThan(1000); // o corte que escondia os antigos
  });

  it('o lead MAIS ANTIGO (o caso QUERMEM) está no resultado', async () => {
    const { fetchTodosLeadsCRM } = await import('./leadsService');
    const leads = await fetchTodosLeadsCRM(TENANT, 1);

    const maisAntigo = fake.base[fake.base.length - 1];
    expect(leads.some((l) => l.id === maisAntigo.id)).toBe(true);
  });

  it('pagina em janelas de 1000 (mais de uma requisição)', async () => {
    const { fetchTodosLeadsCRM } = await import('./leadsService');
    await fetchTodosLeadsCRM(TENANT, 1);

    expect(fake.chamadas.length).toBeGreaterThan(1);
    expect(fake.chamadas[0]).toEqual({ from: 0, to: 999 });
    expect(fake.chamadas.some((c) => c.from === 1000)).toBe(true);
  });

  it('fetchLeadsDoCorretorCRM também pagina (não só a visão de gestão)', async () => {
    const { fetchLeadsDoCorretorCRM } = await import('./leadsService');
    const leads = await fetchLeadsDoCorretorCRM('user-1', TENANT, undefined, 1);

    expect(leads.length).toBe(TOTAL_LEADS);
  });

  it('fetchLeadsDoCorretorPorNome também pagina', async () => {
    const { fetchLeadsDoCorretorPorNome } = await import('./leadsService');
    const leads = await fetchLeadsDoCorretorPorNome('FLAVIA CEOLIN', TENANT, 1);

    expect(leads.length).toBe(TOTAL_LEADS);
  });
});
