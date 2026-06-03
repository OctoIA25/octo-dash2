import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Importar helpers do console (diagnóstico e reset de testes)
import "./utils/consoleHelpers.ts";

// Limpar cache local de imóveis quando a versão do cache muda (cache busting).
// Roda ANTES de renderizar para que useImoveisData já leia o localStorage limpo.
import { runStartupCacheCleanup } from "./utils/cacheVersion";

runStartupCacheCleanup();

// Recuperação automática de falha ao carregar chunk dinâmico (React.lazy).
// Backstop global: o lazyWithRetry já recupera no próprio ponto do import(), mas
// mantemos estes handlers para chunks que falhem fora de uma rota lazy (ex.: um
// import() disparado por um handler de evento). Compartilham a MESMA trava de
// reload do lazyWithRetry, então nunca recarregam mais de uma vez por janela.
import { recoverFromChunkError, isChunkLoadError } from "./lib/lazyWithRetry";

window.addEventListener("vite:preloadError", () => recoverFromChunkError());
window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadError(event?.reason)) {
    recoverFromChunkError();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
