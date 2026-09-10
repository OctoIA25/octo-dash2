/**
 * "Todos os imóveis em que o lead se interessou" não sai de uma tabela de
 * interesses — ela não existe. Cada anúncio visto num portal vira uma LINHA de
 * lead própria, nas duas fontes (`leads` do CRM e `kenlo_leads`). Estes testes
 * travam as três decisões dessa junção: as duas fontes entram, o mesmo código
 * não aparece duas vezes, e uma fonte quebrada não apaga a outra.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT = 'tenant-1';

const respostas: Record<string, { data: unknown[] | null; error: unknown }> = {
  leads: { data: [], error: null },
  kenlo_leads: { data: [], error: null },
};

function builder(tabela: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) chain[m] = () => chain;
  chain.then = (resolve: (r: unknown) => unknown) =>
    Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(resolve);
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));

const carregar = async () => {
  const { fetchImoveisDeInteresse } = await import('./leadsService');
  return fetchImoveisDeInteresse(TENANT, ['5511999990000', '11999990000']);
};

beforeEach(() => {
  respostas.leads = { data: [], error: null };
  respostas.kenlo_leads = { data: [], error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchImoveisDeInteresse', () => {
  it('junta as duas fontes e ordena do mais recente para o mais antigo', async () => {
    respostas.leads = {
      data: [{ property_code: 'AP100', source: 'ZAP', created_at: '2026-03-01T10:00:00Z' }],
      error: null,
    };
    respostas.kenlo_leads = {
      data: [
        { interest_reference: 'CA200', portal: 'OLX', lead_timestamp: '2026-05-01T10:00:00Z' },
      ],
      error: null,
    };

    const imoveis = await carregar();
    expect(imoveis.map((i) => i.codigo)).toEqual(['CA200', 'AP100']);
    expect(imoveis[0].portal).toBe('OLX');
  });

  it('o mesmo imóvel visto várias vezes aparece UMA vez, com o contato mais recente', async () => {
    respostas.leads = {
      data: [
        { property_code: 'AP100', source: 'Site', created_at: '2026-06-01T10:00:00Z' },
        { property_code: 'ap100', source: 'ZAP', created_at: '2026-01-01T10:00:00Z' },
      ],
      error: null,
    };

    const imoveis = await carregar();
    expect(imoveis).toHaveLength(1);
    expect(imoveis[0].portal).toBe('Site');
  });

  it('uma fonte que falha não apaga os imóveis da outra', async () => {
    respostas.leads = { data: null, error: { message: 'boom' } };
    respostas.kenlo_leads = {
      data: [{ interest_reference: 'CA200', portal: 'OLX', created_at: '2026-05-01T10:00:00Z' }],
      error: null,
    };

    const imoveis = await carregar();
    expect(imoveis.map((i) => i.codigo)).toEqual(['CA200']);
  });

  it('sem telefone conhecido não consulta nada', async () => {
    const { fetchImoveisDeInteresse } = await import('./leadsService');
    expect(await fetchImoveisDeInteresse(TENANT, [])).toEqual([]);
    expect(await fetchImoveisDeInteresse('owner', ['5511999990000'])).toEqual([]);
  });
});
