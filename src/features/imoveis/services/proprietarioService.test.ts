import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * O proprietário só chega pelas RPCs (que filtram por autorização no banco); o
 * select de imoveis_locais traz as colunas do imóvel. Os fakes devolvem páginas
 * na ordem em que .range() as pede, separadas por origem.
 */
type Resposta = { data: unknown; error: { message: string } | null };

const h = vi.hoisted(() => ({
  paginasTabela: [] as Resposta[],
  paginasRpc: [] as Resposta[],
  respostaRpc: { data: [], error: null } as Resposta,
  respostaIn: { data: [], error: null } as Resposta,
  colunasPedidas: [] as string[],
  neqs: [] as unknown[][],
  rpcs: [] as Array<{ nome: string; args: Record<string, unknown> }>,
}));

vi.mock('@/lib/supabaseClient', () => {
  const from = () => ({
    select: (colunas: string) => {
      h.colunasPedidas.push(colunas);
      const chain: Record<string, unknown> = {};
      for (const m of ['eq', 'order']) chain[m] = () => chain;
      chain.neq = (...args: unknown[]) => { h.neqs.push(args); return chain; };
      chain.in = async () => h.respostaIn;
      chain.range = async () => h.paginasTabela.shift() ?? { data: [], error: null };
      return chain;
    },
  });
  const rpc = (nome: string, args: Record<string, unknown>) => {
    h.rpcs.push({ nome, args });
    const chain = {
      range: async () => h.paginasRpc.shift() ?? { data: [], error: null },
      limit: async () => h.respostaRpc,
      then: (ok: (v: Resposta) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(h.respostaRpc).then(ok, err),
    };
    return chain;
  };
  return { supabase: { from, rpc } };
});

const { listarProprietarios, buscarProprietariosPorNome, buscarProprietarioDoImovel, verificarImovelDuplicado } =
  await import('./proprietarioService');

const imovel = (over: Record<string, unknown> = {}) => ({
  codigo_imovel: 'AP1',
  titulo: null, tipo: 'Apartamento', finalidade: 'residencial',
  bairro: 'Centro', cidade: 'Sorocaba', logradouro: null, numero: null, cep: null,
  area_total: 0, area_util: 0, quartos: 0, banheiros: 0, vagas: 0,
  valor_venda: 0, valor_locacao: 0, exclusivo: false, status_aprovacao: 'aprovado',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

const dono = (over: Record<string, unknown> = {}) => ({
  codigo_imovel: 'AP1',
  proprietario_nome: 'Maria Souza', proprietario_telefone: '(15) 99999-1111',
  proprietario_tel_residencial: null, proprietario_tel_comercial: null, proprietario_email: null,
  ...over,
});

beforeEach(() => {
  h.paginasTabela = [];
  h.paginasRpc = [];
  h.respostaRpc = { data: [], error: null };
  h.respostaIn = { data: [], error: null };
  h.colunasPedidas = [];
  h.neqs = [];
  h.rpcs = [];
});

describe('listarProprietarios', () => {
  it('agrupa imóveis do mesmo telefone mesmo com o nome digitado diferente', async () => {
    h.paginasTabela = [{ data: [
      imovel({ codigo_imovel: 'AP1', valor_venda: 500000, created_at: '2026-02-01T00:00:00Z' }),
      imovel({ codigo_imovel: 'AP2', valor_venda: 300000, exclusivo: true }),
      imovel({ codigo_imovel: 'CA9', valor_locacao: 2500 }),
    ], error: null }];
    h.paginasRpc = [{ data: [
      dono({ codigo_imovel: 'AP1' }),
      dono({ codigo_imovel: 'AP2', proprietario_nome: 'maria  souza' }),
      dono({ codigo_imovel: 'CA9', proprietario_nome: 'Outro Dono', proprietario_telefone: '(15) 98888-2222' }),
    ], error: null }];

    const [maria, outro] = await listarProprietarios('t1');

    expect(maria.total_imoveis).toBe(2);
    expect(maria.imoveis_venda).toBe(2);
    expect(maria.valor_venda_total).toBe(800000);
    expect(maria.exclusivos).toBe(1);
    expect(maria.ultimo_cadastro).toBe('2026-02-01T00:00:00Z');
    expect(outro.imoveis_locacao).toBe(1);
  });

  it('só lista o proprietário que a RPC autorizou — imóvel sem linha na RPC fica de fora', async () => {
    h.paginasTabela = [{ data: [imovel({ codigo_imovel: 'MEU' }), imovel({ codigo_imovel: 'DE_OUTRO' })], error: null }];
    h.paginasRpc = [{ data: [dono({ codigo_imovel: 'MEU' })], error: null }];

    const donos = await listarProprietarios('t1');

    expect(donos).toHaveLength(1);
    expect(donos[0].imoveis.map((i) => i.codigo_imovel)).toEqual(['MEU']);
    expect(h.rpcs).toEqual([{ nome: 'imoveis_proprietarios', args: { p_tenant_id: 't1' } }]);
  });

  it('nunca pede coluna do proprietário ao select da tabela', async () => {
    await listarProprietarios('t1');

    expect(h.colunasPedidas).toHaveLength(1);
    expect(h.colunasPedidas[0]).not.toMatch(/proprietario/);
  });

  it('busca a página seguinte quando a primeira vem cheia (teto de 1000 do PostgREST)', async () => {
    const cheia = Array.from({ length: 1000 }, (_, i) => imovel({ codigo_imovel: `A${i}` }));
    h.paginasTabela = [{ data: cheia, error: null }, { data: [imovel({ codigo_imovel: 'ULTIMO' })], error: null }];
    h.paginasRpc = [
      { data: cheia.map((i) => dono({ codigo_imovel: i.codigo_imovel })), error: null },
      { data: [dono({ codigo_imovel: 'ULTIMO', proprietario_telefone: '(15) 97777-3333' })], error: null },
    ];

    const donos = await listarProprietarios('t1');

    expect(donos.map((d) => d.total_imoveis).sort((a, b) => b - a)).toEqual([1000, 1]);
  });

  it('não lista imóvel em rascunho (cadastro incompleto)', async () => {
    await listarProprietarios('t1');

    expect(h.neqs).toEqual([['status_aprovacao', 'rascunho']]);
  });

  it('erro em qualquer das leituras devolve lista vazia em vez de meia planilha', async () => {
    h.paginasTabela = [{ data: [imovel()], error: null }];
    h.paginasRpc = [{ data: null, error: { message: 'permission denied' } }];

    expect(await listarProprietarios('t1')).toEqual([]);
  });
});

describe('buscarProprietariosPorNome', () => {
  it('busca pela RPC (só autorizados) e completa com as colunas do imóvel', async () => {
    h.respostaRpc = { data: [dono({ codigo_imovel: 'AP1' })], error: null };
    h.respostaIn = { data: [imovel({ codigo_imovel: 'AP1', bairro: 'Vila Nova' })], error: null };

    const [match] = await buscarProprietariosPorNome('t1', ' mar ');

    expect(h.rpcs[0]).toEqual({ nome: 'imoveis_proprietarios', args: { p_tenant_id: 't1', p_busca: 'mar' } });
    expect(match).toMatchObject({ nome: 'Maria Souza', telefone: '(15) 99999-1111', total_imoveis: 1 });
    expect(match.imoveis[0].bairro).toBe('Vila Nova');
    expect(h.colunasPedidas[0]).not.toMatch(/proprietario/);
  });

  it('menos de 2 letras não consulta', async () => {
    expect(await buscarProprietariosPorNome('t1', 'm')).toEqual([]);
    expect(h.rpcs).toHaveLength(0);
  });
});

describe('buscarProprietarioDoImovel', () => {
  it('devolve a linha autorizada e null quando o banco não devolve nada', async () => {
    h.respostaRpc = { data: [dono()], error: null };
    expect(await buscarProprietarioDoImovel('t1', 'AP1')).toMatchObject({ proprietario_nome: 'Maria Souza' });
    expect(h.rpcs[0].args).toEqual({ p_tenant_id: 't1', p_codigo: 'AP1' });

    h.respostaRpc = { data: [], error: null };
    expect(await buscarProprietarioDoImovel('t1', 'AP1')).toBeNull();
  });

  it('erro propaga (não é o mesmo que "sem permissão")', async () => {
    h.respostaRpc = { data: null, error: { message: 'rede caiu' } };
    await expect(buscarProprietarioDoImovel('t1', 'AP1')).rejects.toThrow('rede caiu');
  });
});

describe('verificarImovelDuplicado', () => {
  it('compara no banco e repassa os critérios', async () => {
    h.respostaRpc = {
      data: [{ codigo_imovel: 'AP9', titulo: 'Apto', tipo: 'Apartamento', bairro: 'Centro', cidade: 'Sorocaba', logradouro: 'Rua A', numero: '1', motivo: 'mesmo_endereco' }],
      error: null,
    };

    const matches = await verificarImovelDuplicado({
      tenantId: 't1', proprietarioNome: ' Maria ', logradouro: 'Rua A', numero: '1', cep: '', ignorarCodigo: 'AP1', areaTotal: null,
    });

    expect(h.rpcs[0].nome).toBe('imoveis_duplicados_proprietario');
    expect(h.rpcs[0].args).toMatchObject({
      p_tenant_id: 't1', p_proprietario_nome: 'Maria', p_logradouro: 'Rua A', p_numero: '1', p_cep: null, p_ignorar_codigo: 'AP1',
    });
    expect(matches.map((m) => m.motivo)).toEqual(['mesmo_endereco']);
  });
});
