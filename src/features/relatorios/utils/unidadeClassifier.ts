/**
 * Classificação de leads por TIPO DE IMÓVEL / UNIDADE.
 *
 * Contexto de modelagem (verificado no código, não assumido):
 *  - O lead NÃO possui tipo de imóvel estruturado. Ele carrega apenas
 *    `codigo_imovel` (= `leads.property_code`).
 *  - O tipo estruturado vive em `imoveis_locais` (`tipo` texto livre e
 *    `tipo_simplificado` com valores: casa | apartamento | terreno |
 *    comercial | rural | outro), com chave única (tenant_id, codigo_imovel).
 *
 * Estratégia: cruzar o `codigo_imovel` do lead com `imoveis_locais` (JOIN em
 * memória via Map, uma única query — sem N+1) e derivar a categoria.
 *
 * Decisões de produto (acordadas com o solicitante):
 *  - Categorias: Apartamento, Casa, Terreno, Galpão, Outros, Não informado.
 *  - "Galpão" NÃO é um valor de `tipo_simplificado` (cai em "comercial"); por
 *    isso é detectado pelo texto livre `tipo` (precedência sobre o simplificado).
 *  - "Lançamentos" foi intencionalmente OMITIDO: é uma tabela separada
 *    (`lancamentos`) sem vínculo com o lead no modelo atual. Quando esse
 *    vínculo existir, basta adicioná-lo aqui (ver README do relatório).
 *  - Lead sem `codigo_imovel`, ou com código sem correspondência em
 *    `imoveis_locais`, é classificado como "Não informado" (documenta lacunas
 *    de dado em vez de mascará-las).
 */

import { ProcessedLead } from '@/data/realLeadsProcessor';

/** Categorias exibidas, na ordem canônica do relatório. */
export const UNIDADE_CATEGORIES = [
  'Apartamento',
  'Casa',
  'Terreno',
  'Galpão',
  'Outros',
  'Não informado',
] as const;

export type UnidadeCategoria = (typeof UNIDADE_CATEGORIES)[number];

export const CATEGORIA_NAO_INFORMADO: UnidadeCategoria = 'Não informado';
export const CATEGORIA_OUTROS: UnidadeCategoria = 'Outros';

/** Informação de tipo proveniente de `imoveis_locais`. */
export interface ImovelTipoInfo {
  /** `imoveis_locais.tipo` — texto livre (ex.: "Galpão Industrial"). */
  tipo?: string | null;
  /** `imoveis_locais.tipo_simplificado` — enum simplificado. */
  tipoSimplificado?: string | null;
}

/** Linha mínima de `imoveis_locais` necessária para classificar. */
export interface ImovelLocalRow {
  codigo_imovel: string | null;
  tipo?: string | null;
  tipo_simplificado?: string | null;
}

/**
 * Normaliza o código do imóvel para servir de chave de junção entre `leads` e
 * `imoveis_locais`, tolerando diferenças de caixa, espaços e hífens.
 * Ex.: "ap-001 " e "AP001" → "AP001".
 */
export function normalizeCodigoKey(codigo: string | null | undefined): string {
  if (!codigo) return '';
  return codigo.trim().toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Constrói o mapa { codigoNormalizado -> tipo } a partir das linhas de
 * `imoveis_locais`. Em caso de códigos duplicados após normalização, mantém o
 * primeiro com tipo preenchido (determinístico).
 */
export function buildImovelTipoMap(rows: ImovelLocalRow[]): Map<string, ImovelTipoInfo> {
  const map = new Map<string, ImovelTipoInfo>();
  for (const row of rows || []) {
    const key = normalizeCodigoKey(row.codigo_imovel);
    if (!key) continue;
    if (map.has(key)) continue;
    map.set(key, { tipo: row.tipo ?? null, tipoSimplificado: row.tipo_simplificado ?? null });
  }
  return map;
}

/** Detecta se o texto livre do tipo corresponde a um galpão. */
function isGalpao(tipo?: string | null): boolean {
  if (!tipo) return false;
  // cobre "Galpão", "Galpao", "Galpão Industrial", acentuado ou não
  return /galp[aã]o/i.test(tipo);
}

/**
 * Mapeia a informação de tipo de um imóvel para a categoria do relatório.
 * Exportada para teste isolado das regras de mapeamento.
 */
export function categoriaFromTipo(info: ImovelTipoInfo | undefined): UnidadeCategoria {
  if (!info) return CATEGORIA_NAO_INFORMADO;

  // Precedência: "Galpão" é identificado pelo texto livre, pois o
  // tipo_simplificado o agrupa genericamente em "comercial".
  if (isGalpao(info.tipo)) return 'Galpão';

  switch ((info.tipoSimplificado || '').toLowerCase()) {
    case 'apartamento':
      return 'Apartamento';
    case 'casa':
      return 'Casa';
    case 'terreno':
      return 'Terreno';
    // 'comercial' (sem ser galpão), 'rural', 'outro' e quaisquer valores
    // inesperados caem em "Outros".
    default:
      return CATEGORIA_OUTROS;
  }
}

/**
 * Classifica um lead na categoria de unidade, usando o mapa de tipos.
 * Lead sem código ou sem correspondência → "Não informado".
 */
export function classifyUnidade(
  lead: ProcessedLead,
  tipoMap: Map<string, ImovelTipoInfo>
): UnidadeCategoria {
  const key = normalizeCodigoKey(lead.codigo_imovel);
  if (!key) return CATEGORIA_NAO_INFORMADO;

  const info = tipoMap.get(key);
  if (!info) return CATEGORIA_NAO_INFORMADO;

  return categoriaFromTipo(info);
}
