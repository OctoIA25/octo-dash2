/**
 * `fetchLeadsCRMPorId` — a Central de Atividades passou a pedir SÓ os leads
 * que as atividades referenciam.
 *
 * Antes ela chamava `fetchTodosLeadsCRM` e baixava a base inteira do tenant
 * para escrever o nome do cliente ao lado de algumas dezenas de linhas.
 * Medido em produção em 18/09/2026: Imobiliária Japi 9.494 linhas · 6,92 MB
 * em 12 idas ao banco; Lotus 1.656 · 1,05 MB. Era daí que saíam os "mais de
 * 60 s" numa conexão ruim — não de falta de índice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Chamada { tabela: string; ids: string[]; arquivados: boolean }

const chamadas: Chamada[] = [];

// Fake do PostgREST: registra cada `in('id', ...)` e devolve só o que existe.
function fake(tabela: string) {
  const filtros: Record<string, unknown> = {};
  let ids: string[] = [];
  let pediuNaoArquivados = false;
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'not', 'range']) chain[m] = () => chain;
  chain.is = (coluna: string, valor: unknown) => {
    if (coluna === 'archived_at' && valor === null) pediuNaoArquivados = true;
    return chain;
  };
  chain.in = (_c: string, valores: string[]) => { ids = valores; return chain; };
  chain.then = (resolve: (r: unknown) => unknown) => {
    chamadas.push({ tabela, ids: [...ids], arquivados: !pediuNaoArquivados });
    const base = tabela === 'leads' ? BASE_CRM : BASE_KENLO;
    const data = ids.map((id) => base[id]).filter(Boolean);
    return Promise.resolve({ data, error: null }).then(resolve);
  };
  void filtros;
  return chain;
}

// 250 leads no CRM (força o fatiamento em blocos de 100) e um só no kenlo.
const BASE_CRM: Record<string, Record<string, unknown>> = {};
for (let i = 0; i < 250; i++) {
  BASE_CRM[`crm-${i}`] = { id: `crm-${i}`, name: `Lead ${i}`, status: 'Novos Leads', lead_type: 1 };
}
const BASE_KENLO: Record<string, Record<string, unknown>> = {
  'kenlo-1': { id: 'kenlo-1', client_name: 'Veio do portal', stage: 'Novos Leads', tenant_id: 't1' },
};

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => fake(t) } }));

const TENANT = 't1';

describe('fetchLeadsCRMPorId', () => {
  beforeEach(() => { chamadas.length = 0; });

  it('lista vazia não vai ao banco', async () => {
    const { fetchLeadsCRMPorId } = await import('./leadsService');
    expect(await fetchLeadsCRMPorId(TENANT, [])).toEqual([]);
    expect(chamadas.length).toBe(0);
  });

  it('sem tenant não vai ao banco (escopo multi-tenant obrigatório)', async () => {
    const { fetchLeadsCRMPorId } = await import('./leadsService');
    expect(await fetchLeadsCRMPorId('', ['crm-1'])).toEqual([]);
    expect(chamadas.length).toBe(0);
  });

  it('traz os leads pedidos, e só eles', async () => {
    const { fetchLeadsCRMPorId } = await import('./leadsService');
    const r = await fetchLeadsCRMPorId(TENANT, ['crm-3', 'crm-7']);
    expect(r.map((l) => l.id).sort()).toEqual(['crm-3', 'crm-7']);
  });

  it('fatia em blocos de 100 — `in` com centenas de uuid estoura a URL', async () => {
    const { fetchLeadsCRMPorId } = await import('./leadsService');
    const ids = Array.from({ length: 250 }, (_, i) => `crm-${i}`);
    const r = await fetchLeadsCRMPorId(TENANT, ids);

    expect(r.length).toBe(250);
    const emLeads = chamadas.filter((c) => c.tabela === 'leads');
    expect(emLeads.length).toBe(3);
    expect(emLeads.every((c) => c.ids.length <= 100)).toBe(true);
  });

  it('id que não está em `leads` é procurado em `kenlo_leads`', async () => {
    const { fetchLeadsCRMPorId } = await import('./leadsService');
    const r = await fetchLeadsCRMPorId(TENANT, ['crm-1', 'kenlo-1']);

    expect(r.map((l) => l.id).sort()).toEqual(['crm-1', 'kenlo-1']);
    expect(chamadas.some((c) => c.tabela === 'kenlo_leads')).toBe(true);
  });

  it('quando o CRM responde tudo, NÃO toca em kenlo_leads', async () => {
    const { fetchLeadsCRMPorId } = await import('./leadsService');
    await fetchLeadsCRMPorId(TENANT, ['crm-1', 'crm-2']);
    expect(chamadas.some((c) => c.tabela === 'kenlo_leads')).toBe(false);
  });

  it('não enriquece com lead arquivado — mesmo recorte de fetchTodosLeadsCRM', async () => {
    const { fetchLeadsCRMPorId } = await import('./leadsService');
    await fetchLeadsCRMPorId(TENANT, ['crm-1', 'kenlo-1']);
    expect(chamadas.every((c) => c.arquivados === false)).toBe(true);
  });
});
