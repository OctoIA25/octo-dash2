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
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryInnerProps) {
    // Navegou para outra rota: limpa o erro e tenta renderizar a nova rota.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, isChunkError: false });
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

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="max-w-md w-full text-center rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          <h2 className="text-xl font-semibold text-text-primary mb-2">{title}</h2>
          <p className="text-sm text-text-secondary mb-6">{description}</p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
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
