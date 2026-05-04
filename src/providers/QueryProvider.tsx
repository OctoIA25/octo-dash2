import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// 🧠 Cérebro do React Query - gerencia todo o cache
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Quanto tempo os dados ficam "frescos" (não precisam buscar de novo)
      staleTime: 5 * 60 * 1000,
      // Quanto tempo os dados ficam no cache antes de serem descartados
      gcTime: 10 * 60 * 1000,
      // Quantas vezes tentar buscar se der erro
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// Componente que envolve toda a aplicação com poder de cache
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Ferramenta de debug - só aparece em desenvolvimento */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}