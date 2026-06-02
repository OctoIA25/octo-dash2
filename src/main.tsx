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
// Ocorre quando há um novo deploy com a aba aberta: o app em memória referencia
// chunks com hash que não existem mais no servidor. Recarregamos a página, com
// guarda de tempo para não entrar em loop caso o asset esteja realmente ausente.
const recoverFromChunkError = () => {
  const KEY = "chunk-reload-ts";
  const last = Number(sessionStorage.getItem(KEY) || 0);
  const now = Date.now();
  if (now - last < 10_000) return; // evita loop de reload
  sessionStorage.setItem(KEY, String(now));
  window.location.reload();
};

window.addEventListener("vite:preloadError", recoverFromChunkError);
window.addEventListener("unhandledrejection", (event) => {
  const message = String(event?.reason?.message || event?.reason || "");
  if (/dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(message)) {
    recoverFromChunkError();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
