import React from "react";
import { useLocation } from "react-router-dom";
import { isChunkLoadError } from "@/lib/lazyWithRetry";

interface RouteErrorBoundaryInnerProps {
  children: React.ReactNode;
  /** Muda a cada navegação; ao mudar, reseta o estado de erro do boundary. */
  resetKey: string;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
  errorMessage: string;
}

/**
 * Rede de segurança para as rotas com lazy loading.
 *
 * O lazyWithRetry já recarrega a página sozinho quando detecta um chunk obsoleto
 * após deploy. Este boundary é o ÚLTIMO recurso: se a recuperação automática já
 * foi consumida (a trava de reload impediu um novo loop) e o import ainda falha,
 * mostramos uma tela amigável de "recarregar" em vez de um white-screen.
 *
 * IMPORTANTE: o estado de erro é resetado a cada troca de rota (resetKey =
 * pathname). Assim, um erro de RENDER de uma página específica (não um chunk)
 * não prende o app inteiro: o usuário navega para outra seção pela sidebar (que
 * fica FORA deste boundary) e a tela volta a funcionar, em vez de ficar travada
 * num "recarregar" que recarrega a mesma rota quebrada.
 */
class RouteErrorBoundaryInner extends React.Component<
  RouteErrorBoundaryInnerProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryInnerProps) {
    super(props);
    this.state = { hasError: false, isChunkError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return {
      hasError: true,
      isChunkError: isChunkLoadError(error),
      errorMessage: error?.message || String(error),
    };
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryInnerProps) {
    // Navegou para outra rota: limpa o erro e tenta renderizar a nova rota.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, isChunkError: false, errorMessage: '' });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("❌ RouteErrorBoundary capturou um erro:", error, info);
  }

  handleReload = () => {
    // Limpa a trava de reload para garantir que o recarregamento manual aconteça.
    try {
      sessionStorage.removeItem("chunk-reload-ts");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.state.isChunkError
      ? "Nova versão disponível"
      : "Algo deu errado nesta página";
    const description = this.state.isChunkError
      ? "O aplicativo foi atualizado. Recarregue a página para carregar a versão mais recente."
      : "Não foi possível exibir esta seção. Tente outra seção pela barra lateral ou recarregue a página.";

    // Cores explícitas (slate + dark:) em vez de tokens legados: o fallback
    // precisa ser visível em qualquer tema — `var(--bg-primary)` cru é um
    // triple HSL inválido como background-color e deixava esta tela "branca".
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-white p-6 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">{title}</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          {!this.state.isChunkError && this.state.errorMessage && (
            <p className="mt-4 break-words rounded-lg bg-slate-50 px-3 py-2 text-left text-[12px] leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              {this.state.errorMessage}
            </p>
          )}
          <button
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Wrapper funcional que injeta o pathname atual como resetKey, de modo que o
 * boundary se recupera automaticamente ao navegar para outra rota.
 */
export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <RouteErrorBoundaryInner resetKey={location.pathname}>
      {children}
    </RouteErrorBoundaryInner>
  );
}
