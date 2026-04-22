/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { MainLayout } from "@/components/MainLayout";
import DashboardLayout from "@/pages/DashboardLayout";
import { useLeadsData } from "@/features/leads/hooks/useLeadsData";
import { useOptimizedData } from "@/hooks/useOptimizedData";
import { useAuth } from "@/hooks/useAuth";
import { OctoDashLoader } from "@/components/ui/OctoDashLoader";
import { useState, useEffect, useCallback } from "react";
// Usando exclusivamente Supabase PostgreSQL
import { 
  RefreshCw,
  WifiOff,
  CheckCircle,
  RotateCw
} from "lucide-react";

const Index = () => {
  
  // Hook de autenticação
  const { user } = useAuth();
  
  // Usar hook personalizado para dados atualizados automaticamente
  const { leads, isLoading, lastUpdate, newLeadsCount, error, refetch, isRefetching, isBackgroundUpdate } = useLeadsData();
  
  
  // Garantir que sempre temos dados para exibir (evita tela branca)
  const safeLeads = leads.length > 0 ? leads : [];
  
  // Usar dados otimizados com memoização
  const optimizedData = useOptimizedData(leads);

  // Estados simplificados para controle da atualização direta do Supabase
  const [isDirectUpdating, setIsDirectUpdating] = useState(false);
  const [directUpdateTime, setDirectUpdateTime] = useState<Date | null>(null);
  const [directUpdateCount, setDirectUpdateCount] = useState(0);
  
  // Função para atualizar dados do Supabase diretamente SEM TELA BRANCA
  const handleDirectSupabaseCall = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (isDirectUpdating) return;
    
    
    // Usar o refetch do hook principal ao invés de chamada direta
    // Isso garante consistência e evita telas brancas
    try {
      setIsDirectUpdating(true);
      await refetch();
      setDirectUpdateTime(new Date());
      setDirectUpdateCount(prev => prev + 1);
    } catch (error) {
      console.error('❌ Erro ao atualizar dados:', error);
    } finally {
      setTimeout(() => {
        setIsDirectUpdating(false);
      }, 1000);
    }
  }, [isDirectUpdating, refetch]);

  // Remover useEffects redundantes que causavam loops de render
  // CanvasJS será carregado sob demanda quando necessário
  

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <WifiOff className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-text-primary text-lg">Erro ao carregar dados</p>
          <p className="text-text-secondary text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Loading otimizado - mostrar conteúdo IMEDIATAMENTE se já temos dados
  // Apenas mostrar loading se for o primeiro carregamento sem dados
  if (isLoading && leads.length === 0 && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <OctoDashLoader message="Carregando dados..." size="md" />
      </div>
    );
  }

  // Layout principal - renderiza IMEDIATAMENTE
  // Usando DashboardLayout para suporte a rotas aninhadas
  return <DashboardLayout />;
};

export default Index;
