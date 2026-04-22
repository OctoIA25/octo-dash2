/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Página: Gestão de Equipe
 * Rota: /gestao-equipe
 * 
 * Esta página foi movida da aba Início (LeadSection)
 * Renderiza o AdminDashboard para gestão completa da equipe
 */

import { useEffect, Suspense } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { AdminDashboard } from '@/components/AdminDashboard';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { SidebarProvider } from '@/contexts/SidebarContext';

interface GestaoEquipePageProps {
  leads: ProcessedLead[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const LoadingFallback = () => (
  <div className="w-full h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
    <OctoDashLoader message="Carregando Gestão de Equipe..." size="lg" />
  </div>
);

export const GestaoEquipePage = ({ leads, onRefresh, isRefreshing }: GestaoEquipePageProps) => {
  // Sincronizar com localStorage
  useEffect(() => {
    localStorage.setItem('selectedSection', 'gestao-equipe');
  }, []);

  return (
    <SidebarProvider>
      <div className="w-full min-h-full overflow-auto bg-white dark:bg-slate-900 dark:bg-gray-950">
        <div className="p-6 md:p-8">
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <AdminDashboard />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </SidebarProvider>
  );
};
