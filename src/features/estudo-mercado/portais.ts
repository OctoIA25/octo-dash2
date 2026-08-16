/**
 * Portais aceitos pelo preenchimento automático do Estudo de Mercado.
 *
 * Fonte única: as páginas usam esta lista tanto para os botões "Pesquisar no ..."
 * quanto para avisar quando o corretor cola um link de portal não suportado.
 */

export interface PortalSuportado {
  nome: string;
  dominio: string;
  buscaUrl: string;
}

export const PORTAIS_SUPORTADOS: PortalSuportado[] = [
  {
    nome: 'ImovelWeb',
    dominio: 'imovelweb.com.br',
    buscaUrl: 'https://www.imovelweb.com.br/imoveis-venda.html',
  },
  {
    nome: 'Chaves na Mão',
    dominio: 'chavesnamao.com.br',
    buscaUrl: 'https://www.chavesnamao.com.br/imoveis-a-venda/',
  },
];

export const PORTAIS_NOMES = PORTAIS_SUPORTADOS.map((p) => p.nome).join(' e ');

/** Retorna o portal do link, ou null se o link for inválido/não suportado. */
export function portalDoLink(link: string): PortalSuportado | null {
  let host: string;
  try {
    // Compara pelo hostname (e não por includes) para que um link de outro
    // domínio com "imovelweb.com.br" na query não passe como suportado.
    host = new URL(link.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  return (
    PORTAIS_SUPORTADOS.find((p) => host === p.dominio || host.endsWith(`.${p.dominio}`)) ?? null
  );
}

export const AVISO_PORTAL_NAO_SUPORTADO =
  `O preenchimento automático só funciona com ${PORTAIS_NOMES}. ` +
  'Use um link desses portais ou preencha os dados manualmente.';
