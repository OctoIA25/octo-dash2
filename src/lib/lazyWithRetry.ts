import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

/**
 * RECUPERAÇÃO DE CHUNKS DINÂMICOS APÓS DEPLOY
 * ===========================================
 * Quando um novo deploy sobe, os arquivos em /assets/*.js ganham um hash novo
 * (ex.: MeusLeadsPage-B4bYbcGl.js -> MeusLeadsPage-DGwAGteR.js). Uma aba que já
 * estava aberta (ou um index.html cacheado por CDN/browser) ainda referencia os
 * hashes ANTIGOS, que não existem mais no servidor. O servidor responde 404 (ou,
 * em deploys antigos, devolvia o index.html com Content-Type text/html), e o
 * browser quebra com:
 *   - "bloqueado devido a um tipo MIME não permitido (text/html)"
 *   - "error loading dynamically imported module"
 *
 * A correção é recuperar NO PRÓPRIO ponto do import() — e não só via eventos
 * globais (vite:preloadError / unhandledrejection), porque o React.lazy captura a
 * rejeição internamente e ela nem sempre chega aos handlers de window. Ao detectar
 * um erro de chunk, recarregamos a página UMA vez para buscar o index.html novo
 * (que aponta para os hashes atuais). Uma trava em sessionStorage evita loop.
 */

const RELOAD_KEY = "chunk-reload-ts";
// Janela da trava: depois de um reload, ignoramos novos erros de chunk por este
// período para não entrar em loop caso o asset esteja realmente ausente.
const RELOAD_GUARD_MS = 15_000;

/** Detecta erros típicos de falha ao carregar um módulo/chunk dinâmico. */
export function isChunkLoadError(error: unknown): boolean {
  const message = String(
    (error as { message?: string } | null | undefined)?.message ?? error ?? ""
  );
  // Mensagens reais de falha de import dinâmico por browser:
  //  Chrome:  "Failed to fetch dynamically imported module: <url>"
  //           "Failed to load module script: Expected a JavaScript module script
  //            but the server responded with a MIME type of \"text/html\"..."
  //  Firefox: "error loading dynamically imported module"
  //           "...was blocked because of a disallowed MIME type (\"text/html\")"
  //  Safari:  "Importing a module script failed."
  // NÃO casamos "text/html"/"MIME type" soltos para não confundir com respostas
  // HTML de erro de API (ex.: 500 vindo como página HTML), que dispararia reload.
  return /dynamically imported module|Importing a module script failed|Failed to (?:fetch|load) (?:dynamically imported module|module script)|error loading dynamically imported module|Loading chunk \S+ failed|Loading CSS chunk|module script failed|expected a JavaScript module|disallowed MIME type/i.test(
    message
  );
}

function reloadedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    return Date.now() - last < RELOAD_GUARD_MS;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage indisponível (modo privado restrito): segue sem trava */
  }
}

/**
 * Força um reload único para buscar o index.html novo. Usado tanto pelo
 * lazyWithRetry quanto pelos handlers globais (vite:preloadError / rejection),
 * compartilhando a MESMA trava para nunca recarregar mais de uma vez por janela.
 * @returns true se disparou o reload; false se a trava impediu (deixa o erro subir).
 */
export function recoverFromChunkError(): boolean {
  if (reloadedRecently()) return false;
  markReloaded();
  window.location.reload();
  return true;
}

/**
 * Igual ao React.lazy, mas com auto-recuperação de chunk obsoleto após deploy.
 * - Faz uma re-tentativa imediata do import() (cobre falhas de rede transitórias).
 * - Se ainda falhar com erro de chunk, recarrega a página uma vez (busca o
 *   index.html atual). Mantém o Suspense em loading enquanto o reload acontece.
 * - Se já recarregou nesta janela, deixa o erro subir para o ErrorBoundary, que
 *   mostra uma tela de "recarregar" em vez de white-screen ou loop infinito.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (firstError) {
      // 1ª falha: tenta de novo na hora (rede instável, chunk ainda subindo).
      if (!isChunkLoadError(firstError)) throw firstError;
      try {
        return await factory();
      } catch (secondError) {
        // 2ª falha com erro de chunk = deploy trocou os hashes. Recarrega 1x.
        if (isChunkLoadError(secondError) && recoverFromChunkError()) {
          // Reload em andamento: mantém o Suspense suspenso (não pisca erro).
          return new Promise<{ default: T }>(() => {});
        }
        // Já recarregou nesta janela: entrega ao ErrorBoundary.
        throw secondError;
      }
    }
  });
}
