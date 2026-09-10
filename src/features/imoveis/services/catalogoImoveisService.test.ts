import { describe, expect, it, vi, beforeEach } from 'vitest';

/** Resposta que o PostgREST devolve para a busca pontual por código. */
let respostaLocal: { data: unknown; error: { code: string; message: string } | null } = {
  data: null,
  error: null,
};
/** Filtros aplicados na última consulta, para conferir o escape do ILIKE. */
let filtros: Record<string, unknown> = {};
/** Imóveis no cache de sessão (localStorage do tenant). */
let imoveisXml: unknown[] = [];
let loadXmlChamadas = 0;

vi.mock('@/lib/supabaseClient', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (coluna: string, valor: unknown) => {
    filtros[coluna] = valor;
    return chain;
  };
  chain.ilike = (coluna: string, valor: unknown) => {
    filtros[`ilike:${coluna}`] = valor;
    return chain;
  };
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = async () => respostaLocal;
  chain.range = async () => respostaLocal;
  return { supabase: { from: () => chain } };
});

vi.mock('./imoveisXmlService', async () => {
  const real = await vi.importActual<typeof import('./imoveisXmlService')>('./imoveisXmlService');
  return {
    ...real,
    getTenantImoveis: () => imoveisXml,
    loadXmlDataFromSupabase: async () => {
      loadXmlChamadas += 1;
      return true;
    },
    getImovelByCodigo: (_tenantId: string, codigo: string) =>
      (imoveisXml as { referencia: string }[]).find(
        (i) => i.referencia.toUpperCase() === codigo.trim().toUpperCase(),
      ) ?? null,
  };
});

const { fetchImovelDoTenantPorCodigo } = await import('./catalogoImoveisService');

const linhaLocal = (over: Record<string, unknown> = {}) => ({
  codigo_imovel: 'CA054',
  titulo: 'Casa cadastrada na mão',
  tipo: 'Casa',
  tipo_simplificado: 'casa',
  finalidade: 'venda',
  bairro: 'Jardim Europa',
  cidade: 'Sorocaba',
  estado: 'SP',
  valor_venda: 900000,
  valor_locacao: 0,
  valor_iptu: 0,
  valor_condominio: 0,
  area_total: 200,
  area_util: 150,
  quartos: 3,
  suites: 1,
  vagas: 2,
  banheiros: 2,
  descricao: '',
  fotos: [],
  captador_id: null,
  updated_at: null,
  ...over,
});

beforeEach(() => {
  respostaLocal = { data: null, error: null };
  filtros = {};
  imoveisXml = [];
  loadXmlChamadas = 0;
});

describe('fetchImovelDoTenantPorCodigo', () => {
  it('encontra o imóvel que só existe no banco (imoveis_locais)', async () => {
    respostaLocal = { data: linhaLocal(), error: null };

    const imovel = await fetchImovelDoTenantPorCodigo('t1', 'CA054');

    expect(imovel?.referencia).toBe('CA054');
    expect(imovel?.titulo).toBe('Casa cadastrada na mão');
    expect(imovel?.valor_venda).toBe(900000);
    expect(filtros['tenant_id']).toBe('t1');
  });

  it('encontra o imóvel que só existe no XML do tenant', async () => {
    imoveisXml = [{ referencia: 'AP0001', titulo: 'Apto do XML', fotos: [] }];

    const imovel = await fetchImovelDoTenantPorCodigo('t1', ' ap0001 ');

    expect(imovel?.titulo).toBe('Apto do XML');
  });

  it('devolve null quando o código não existe em nenhuma das duas fontes', async () => {
    expect(await fetchImovelDoTenantPorCodigo('t1', 'ZZ999')).toBeNull();
  });

  it('repõe o cache do XML pelo backup quando a sessão ainda não carregou imóveis', async () => {
    await fetchImovelDoTenantPorCodigo('t1', 'CA054');

    expect(loadXmlChamadas).toBe(1);
  });

  it('escapa curingas do ILIKE vindos do código do lead', async () => {
    await fetchImovelDoTenantPorCodigo('t1', 'CA%54');

    expect(filtros['ilike:codigo_imovel']).toBe('CA\\%54');
  });

  it('não quebra quando a leitura do banco falha — segue com o XML', async () => {
    imoveisXml = [{ referencia: 'CA054', titulo: 'Casa do XML', fotos: [] }];
    respostaLocal = { data: null, error: { code: '42501', message: 'permission denied' } };

    const imovel = await fetchImovelDoTenantPorCodigo('t1', 'CA054');

    expect(imovel?.titulo).toBe('Casa do XML');
  });

  it('ignora o contexto owner, que não tem catálogo próprio', async () => {
    expect(await fetchImovelDoTenantPorCodigo('owner', 'CA054')).toBeNull();
  });

  // Linha real do CA054 (tenant Lotus), com os numeric em string e as fotos em
  // objeto — o formato que o PostgREST devolve de verdade.
  it('monta o CA054 exatamente como ele está em imoveis_locais', async () => {
    respostaLocal = {
      data: linhaLocal({
        titulo: 'Casa com 3 dormitórios à venda na Colônia, Jundiaí-SP',
        bairro: 'Jardim Colonial',
        cidade: 'Jundiaí',
        valor_venda: '790000',
        valor_locacao: '0',
        valor_iptu: '1500',
        area_total: '250',
        area_util: '250',
        salas: 2,
        fotos: [
          { id: 'f1', url: 'https://cdn/capa.jpg', isCapa: true, legenda: '' },
          { id: 'f2', url: 'https://cdn/2.jpg', isCapa: false, legenda: '' },
        ],
      }),
      error: null,
    };

    const imovel = await fetchImovelDoTenantPorCodigo('65c69875-dc83-4062-90f6-6f6adc30df26', 'CA054');

    expect(imovel?.titulo).toBe('Casa com 3 dormitórios à venda na Colônia, Jundiaí-SP');
    expect(imovel?.bairro).toBe('Jardim Colonial');
    expect(imovel?.cidade).toBe('Jundiaí');
    expect(imovel?.valor_venda).toBe(790000);
    expect(imovel?.valor_locacao).toBe(0);
    expect(imovel?.area_total).toBe(250);
    expect(imovel?.salas).toBe(2);
    expect(imovel?.quartos).toBe(3);
    expect(imovel?.fotos).toEqual(['https://cdn/capa.jpg', 'https://cdn/2.jpg']);
  });
});
