/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 * 
 * 🚀 OTIMIZAÇÕES DE PERFORMANCE:
 * - Lazy loading de todas as páginas
 * - React.Suspense para carregamento assíncrono
 * - Sistema de rotas dedicadas para cada seção
 * - Navegação instantânea sem re-render completo
 */

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import DashboardLayout from "./pages/DashboardLayout";
import NotFound from "./pages/NotFound";
import { LeadViewPage } from "@/features/leads/pages/LeadViewPage";
import { ImovelViewPage } from "@/features/imoveis/pages/ImovelViewPage";
import { MinimalLoginScreen } from "@/components/MinimalLoginScreen";
import { OctoDashLoader } from "@/components/ui/OctoDashLoader";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useKenloPolling } from "@/features/imoveis/hooks/useKenloPolling";
import { OwnerDashboard } from "@/components/OwnerDashboard";
import { ApiDocsPage } from "@/features/api-docs/pages/ApiDocsPage";
import { GoogleOAuthCallbackPage } from "@/features/agenda/pages/GoogleOAuthCallbackPage";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      gcTime: 1000 * 60 * 10, // 10 minutos
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const AppContent = () => {
  
  const { isAuthenticated, isLoading, isOwner, tenantId } = useAuthContext();
  
  // Inicializar tema - aplicado automaticamente em todo o site
  useTheme();
  
  // Iniciar polling global do Kenlo quando autenticado
  useKenloPolling();

  // Loading inicial APENAS na primeira verificação
  // Após isso, transições são instantâneas
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-in fade-in duration-500" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <OctoDashLoader message="Iniciando OctoDash..." size="lg" />
      </div>
    );
  }

  // Owner que ainda não selecionou tenant (tenantId === 'owner') -> mostra OwnerDashboard
  // Owner que já selecionou tenant (tenantId !== 'owner') -> mostra DashboardLayout como se fosse admin do tenant
  const showOwnerDashboard = isOwner && tenantId === 'owner';
  
  
  return (
    <BrowserRouter>
            <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <div className="animate-in fade-in duration-700">
                <Routes>
                  {/* 🌐 ROTA PÚBLICA - Documentação da API (sem autenticação) */}
                  <Route path="/apidocs/*" element={<ApiDocsPage />} />
                  
                  {/* Callback OAuth Google Calendar (abre em popup) */}
                  <Route path="/oauth/google/callback" element={<GoogleOAuthCallbackPage />} />
                  
                  {/* Rotas especiais fora do layout (mantém seu próprio layout) */}
                  <Route path="/lead/:id" element={
                    isAuthenticated ? <LeadViewPage /> : <MinimalLoginScreen />
                  } />
                  <Route path="/imovel/:codigo" element={
                    isAuthenticated ? <ImovelViewPage /> : <MinimalLoginScreen />
                  } />
                  
                  {/* Rotas protegidas - requerem autenticação */}
                  <Route path="/*" element={
                    isAuthenticated ? (
                      showOwnerDashboard ? <OwnerDashboard /> : <DashboardLayout />
                    ) : (
                      <MinimalLoginScreen />
                    )
                  } />
                </Routes>
              </div>
            </div>
    </BrowserRouter>
  );
};

const App = () => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      themes={['light', 'dark', 'gray']}
      storageKey="octo-dash-theme-v2"
    >
      <QueryClientProvider client={queryClient}>
        <ReactQueryDevtools/>
        <TooltipProvider>
          <AuthProvider>
            <NotificationsProvider>
              <AppContent />
            </NotificationsProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
