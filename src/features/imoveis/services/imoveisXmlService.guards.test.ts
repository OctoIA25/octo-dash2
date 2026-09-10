/**
 * Guardas contra o modo de falha que apagava o catálogo: /api/kenlo não existia
 * em produção, a requisição caía no catch-all da SPA e voltava index.html com
 * HTTP 200. O cliente tratava aquilo como feed, extraía zero imóveis e o sync
 * gravava a lista vazia por cima do cache da sessão e do backup no Supabase.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabaseClient', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.upsert = async () => ({ error: null });
  chain.update = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.single = async () => ({ data: null, error: null });
  return { supabase: { from: () => chain } };
});

const {
  pareceXmlDeImoveis,
  fetchXmlTextViaProxy,
  syncTenantImoveisFromXml,
  getImoveisStorageKey,
  getXmlUrlStorageKey,
  getTenantImoveis,
} = await import('./imoveisXmlService');

const INDEX_HTML = `<!doctype html><html lang="pt-BR"><head><title>Octo</title></head><body><div id="root"></div></body></html>`;

const XML_COM_IMOVEL = `<?xml version="1.0" encoding="UTF-8"?><Document><imoveis><Imovel><referencia>CA001</referencia><titulo>Casa</titulo></Imovel></imoveis></Document>`;

const XML_SEM_IMOVEL = `<?xml version="1.0" encoding="UTF-8"?><Document><imoveis></imoveis></Document>`;

const respostaFetch = (corpo: string, ok = true) =>
  ({ ok, status: ok ? 200 : 500, text: async () => corpo }) as Response;

const TENANT = 'tenant-1';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('pareceXmlDeImoveis', () => {
  it('reconhece o feed', () => {
    expect(pareceXmlDeImoveis(XML_COM_IMOVEL)).toBe(true);
    expect(pareceXmlDeImoveis(XML_SEM_IMOVEL)).toBe(true);
    expect(pareceXmlDeImoveis('  <Document/>')).toBe(true);
  });

  it('rejeita o index.html da SPA — o caso que causou o estrago', () => {
    expect(pareceXmlDeImoveis(INDEX_HTML)).toBe(false);
    expect(pareceXmlDeImoveis('<html><body>404</body></html>')).toBe(false);
  });

  it('rejeita corpo vazio ou que não é markup', () => {
    expect(pareceXmlDeImoveis('')).toBe(false);
    expect(pareceXmlDeImoveis('Not Found')).toBe(false);
  });
});

describe('fetchXmlTextViaProxy', () => {
  it('falha explicitamente quando a rota devolve o HTML da SPA com 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaFetch(INDEX_HTML)));

    await expect(fetchXmlTextViaProxy('https://feed.example.com/x.xml')).rejects.toThrow(
      /não é XML de imóveis/,
    );
  });

  it('devolve o texto quando é XML de verdade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaFetch(XML_COM_IMOVEL)));

    await expect(fetchXmlTextViaProxy('https://feed.example.com/x.xml')).resolves.toContain('CA001');
  });
});

describe('syncTenantImoveisFromXml — não apaga catálogo', () => {
  const semearCatalogo = () => {
    localStorage.setItem(getXmlUrlStorageKey(TENANT), 'https://feed.example.com/x.xml');
    localStorage.setItem(
      getImoveisStorageKey(TENANT),
      JSON.stringify([{ referencia: 'CA001', titulo: 'Casa já sincronizada' }]),
    );
  };

  it('aborta quando o XML vem sem nenhum imóvel e já existe catálogo carregado', async () => {
    semearCatalogo();
    vi.stubGlobal('fetch', vi.fn(async () => respostaFetch(XML_SEM_IMOVEL)));

    await expect(syncTenantImoveisFromXml(TENANT)).rejects.toThrow(/não apagar os imóveis/);

    expect(getTenantImoveis(TENANT)).toHaveLength(1);
  });

  it('aborta e preserva o catálogo quando a resposta é o HTML da SPA', async () => {
    semearCatalogo();
    vi.stubGlobal('fetch', vi.fn(async () => respostaFetch(INDEX_HTML)));

    await expect(syncTenantImoveisFromXml(TENANT)).rejects.toThrow(/não é XML de imóveis/);

    expect(getTenantImoveis(TENANT)).toHaveLength(1);
  });

  it('feed legitimamente vazio passa quando ainda não há catálogo guardado', async () => {
    localStorage.setItem(getXmlUrlStorageKey(TENANT), 'https://feed.example.com/x.xml');
    vi.stubGlobal('fetch', vi.fn(async () => respostaFetch(XML_SEM_IMOVEL)));

    await expect(syncTenantImoveisFromXml(TENANT)).resolves.toEqual({ count: 0 });
  });
});
