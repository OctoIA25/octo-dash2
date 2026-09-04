import { describe, expect, it, vi, beforeEach } from 'vitest';

/** Páginas devolvidas pelo PostgREST, na ordem em que .range() as pede. */
let paginas: { data: unknown[] | null; error: { code: string; message: string } | null }[] = [];
let chamada = 0;
let colunasPedidas: string[] = [];

vi.mock('@/lib/supabaseClient', () => {
  const query = (colunas: string) => {
    colunasPedidas.push(colunas);
    const chain: Record<string, unknown> = {};
    for (const m of ['eq', 'not', 'order']) chain[m] = () => chain;
    chain.range = async () => paginas[chamada++] ?? { data: [], error: null };
    return chain;
  };
  return { supabase: { from: () => ({ select: query }) } };
});

const { listarProprietarios } = await import('./proprietarioService');

const imovel = (over: Record<string, unknown>) => ({
  codigo_imovel: 'AP1',
  titulo: null, tipo: 'Apartamento', finalidade: 'residencial',
  bairro: 'Centro', cidade: 'Sorocaba', logradouro: null, numero: null, cep: null,
  area_total: 0, area_util: 0, quartos: 0, banheiros: 0, vagas: 0,
  valor_venda: 0, valor_locacao: 0, exclusivo: false, status_aprovacao: 'aprovado',
  created_at: '2026-01-01T00:00:00Z',
  proprietario_nome: 'Maria Souza', proprietario_telefone: '(15) 99999-1111',
  proprietario_email: null,
  ...over,
});

beforeEach(() => { paginas = []; chamada = 0; colunasPedidas = []; });

describe('listarProprietarios', () => {
  it('agrupa imóveis do mesmo telefone mesmo com o nome digitado diferente', async () => {
    paginas = [{ data: [
      imovel({ codigo_imovel: 'AP1', valor_venda: 500000, created_at: '2026-02-01T00:00:00Z' }),
      imovel({ codigo_imovel: 'AP2', proprietario_nome: 'maria  souza', valor_venda: 300000, exclusivo: true }),
      imovel({ codigo_imovel: 'CA9', proprietario_nome: 'Outro Dono', proprietario_telefone: '(15) 98888-2222', valor_locacao: 2500 }),
    ], error: null }];

    const [maria, outro] = await listarProprietarios('t1');

    expect(maria.total_imoveis).toBe(2);
    expect(maria.imoveis_venda).toBe(2);
    expect(maria.valor_venda_total).toBe(800000);
    expect(maria.exclusivos).toBe(1);
    expect(maria.ultimo_cadastro).toBe('2026-02-01T00:00:00Z');
    expect(outro.imoveis_locacao).toBe(1);
  });

  it('busca a página seguinte quando a primeira vem cheia (teto de 1000 do PostgREST)', async () => {
    const cheia = Array.from({ length: 1000 }, (_, i) => imovel({ codigo_imovel: `A${i}` }));
    paginas = [
      { data: cheia, error: null },
      { data: [imovel({ codigo_imovel: 'ULTIMO', proprietario_telefone: '(15) 97777-3333' })], error: null },
    ];

    const donos = await listarProprietarios('t1');

    expect(chamada).toBe(2);
    expect(donos.map((d) => d.total_imoveis).sort((a, b) => b - a)).toEqual([1000, 1]);
  });

  it('refaz a consulta sem os telefones extras se a migration ainda não rodou', async () => {
    paginas = [
      { data: null, error: { code: '42703', message: 'column does not exist' } },
      { data: [imovel({ valor_venda: 1000 })], error: null },
    ];

    const donos = await listarProprietarios('t1');

    expect(donos).toHaveLength(1);
    expect(colunasPedidas[0]).toContain('proprietario_tel_residencial');
    expect(colunasPedidas[1]).not.toContain('proprietario_tel_residencial');
  });
});
