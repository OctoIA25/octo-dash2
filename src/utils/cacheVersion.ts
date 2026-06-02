import { clearAllXmlStorage } from '@/features/imoveis/services/imoveisXmlService';

/**
 * 🧹 VERSÃO DO CACHE LOCAL DE IMÓVEIS (localStorage)
 *
 * Os imóveis ficam cacheados no navegador de cada usuário em
 * `xml_imoveis_data__tenant__<tenantId>`. Quando uma correção de dados é feita
 * no backend (ex.: bug cross-tenant do feed XML), esse cache NÃO é atualizado
 * sozinho — o app lê o localStorage primeiro e só rebusca se estiver vazio.
 *
 * 👉 INCREMENTE este número sempre que precisar forçar a limpeza do cache de
 *    imóveis/corretores em TODOS os navegadores. Na próxima vez que o usuário
 *    abrir o app (com o build novo), o cache antigo é apagado UMA única vez e os
 *    dados são recarregados do Supabase (`tenant_xml_config`), já corrigido.
 */
export const IMOVEIS_CACHE_VERSION = 1;

const CACHE_VERSION_KEY = 'octo_imoveis_cache_version';

/**
 * Compara a versão de cache salva no navegador com a versão atual do build.
 * Se diferirem (ou se nunca tiver sido gravada), limpa o cache local de XML/imóveis
 * e grava a versão atual. Deve rodar no boot, ANTES do app renderizar.
 */
export const runStartupCacheCleanup = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const stored = Number(localStorage.getItem(CACHE_VERSION_KEY) ?? '0');
    if (stored !== IMOVEIS_CACHE_VERSION) {
      clearAllXmlStorage();
      localStorage.setItem(CACHE_VERSION_KEY, String(IMOVEIS_CACHE_VERSION));
      console.info(
        `[cache] Cache de imóveis limpo (v${stored} → v${IMOVEIS_CACHE_VERSION}).`
      );
    }
  } catch (err) {
    console.warn('[cache] Falha ao verificar versão do cache de imóveis:', err);
  }
};
