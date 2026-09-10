/**
 * 🏠 CATÁLOGO DE IMÓVEIS DO TENANT — fonte única de leitura
 *
 * Duas fontes, sempre as duas:
 * 1. XML do tenant (`tenant_xml_config` → cache de sessão em localStorage);
 * 2. cadastro próprio em `imoveis_locais` (imóvel criado pelo "Novo Imóvel").
 *
 * Substitui o `kenloService.fetchImoveisFromKenlo` nas telas de lead. Aquele
 * serviço não conhece tenant: serve o arquivo estático `public/temp_kenlo.xml`
 * (snapshot congelado de outra base) e ignora `imoveis_locais` — por isso um
 * código existente na aba Imóveis aparecia como "não encontrado" no lead.
 */

import { supabase } from '@/lib/supabaseClient';
import type { Imovel } from './kenloService';
import {
  getImovelByCodigo,
  getTenantImoveis,
  loadXmlDataFromSupabase,
} from './imoveisXmlService';
import type { ImovelLocalConvertivel } from '../utils/convertLocalToImovel';
import { mergeCatalogoImoveis } from '../utils/mergeCatalogoImoveis';

/** PostgREST corta em 1000 linhas sem erro, por isso o loop de páginas. */
const PAGINA = 1000;

/**
 * O cache de sessão só é preenchido por quem passou pela aba Imóveis. Abrir um
 * lead direto na Central deixaria o catálogo XML vazio, então repomos do backup
 * no Supabase — o mesmo caminho do useImoveisData.
 */
const carregarImoveisXml = async (tenantId: string): Promise<Imovel[]> => {
  const emCache = getTenantImoveis(tenantId);
  if (emCache.length > 0) return emCache;

  await loadXmlDataFromSupabase(tenantId);
  return getTenantImoveis(tenantId);
};

/**
 * `select('*')` de propósito: a lista de colunas de `imoveis_locais` cresce a
 * cada migration e uma coluna ainda não aplicada em produção derrubaria a
 * consulta inteira com 42703.
 */
const fetchImoveisLocais = async (tenantId: string): Promise<ImovelLocalConvertivel[]> => {
  const linhas: ImovelLocalConvertivel[] = [];

  for (let pagina = 0; ; pagina += 1) {
    const { data, error } = await supabase
      .from('imoveis_locais')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);

    if (error) {
      console.error(
        '[catalogoImoveis] erro ao ler imoveis_locais:',
        error.code,
        error.message,
        error.details,
        error.hint,
      );
      // Sem os locais o catálogo fica incompleto, mas o XML ainda serve.
      return linhas;
    }

    const lote = (data ?? []) as unknown as ImovelLocalConvertivel[];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }

  return linhas;
};

/** Escapa os curingas do ILIKE — o código vem do lead, que é entrada externa. */
const escaparLike = (valor: string): string => valor.replace(/[\\%_]/g, (c) => `\\${c}`);

const buscarImovelLocalPorCodigo = async (
  tenantId: string,
  codigo: string,
): Promise<ImovelLocalConvertivel | null> => {
  const { data, error } = await supabase
    .from('imoveis_locais')
    .select('*')
    .eq('tenant_id', tenantId)
    .ilike('codigo_imovel', escaparLike(codigo))
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      '[catalogoImoveis] erro ao buscar imóvel local:',
      error.code,
      error.message,
      error.details,
      error.hint,
    );
    return null;
  }

  return (data as unknown as ImovelLocalConvertivel | null) ?? null;
};

/** Catálogo completo do tenant (XML + cadastro local). */
export const fetchCatalogoImoveis = async (tenantId: string): Promise<Imovel[]> => {
  if (!tenantId || tenantId === 'owner') return [];

  const [imoveisXml, imoveisLocais] = await Promise.all([
    carregarImoveisXml(tenantId),
    fetchImoveisLocais(tenantId),
  ]);

  return mergeCatalogoImoveis(imoveisXml, imoveisLocais);
};

/**
 * Resolve um código de imóvel no catálogo do tenant. Consulta pontual no banco
 * em vez de baixar `imoveis_locais` inteiro — a tela do lead precisa de um só.
 */
export const fetchImovelDoTenantPorCodigo = async (
  tenantId: string,
  codigo: string,
): Promise<Imovel | null> => {
  const codigoLimpo = (codigo ?? '').trim();
  if (!tenantId || tenantId === 'owner' || !codigoLimpo) return null;

  const [, local] = await Promise.all([
    carregarImoveisXml(tenantId),
    buscarImovelLocalPorCodigo(tenantId, codigoLimpo),
  ]);

  const doXml = getImovelByCodigo(tenantId, codigoLimpo);
  if (!doXml && !local) return null;

  // Mesmo merge do catálogo, para o imóvel resolvido aqui não divergir do que a
  // aba Imóveis mostra (fotos e captador do cadastro local vencem o XML).
  return mergeCatalogoImoveis(doXml ? [doXml] : [], local ? [local] : [])[0] ?? null;
};
