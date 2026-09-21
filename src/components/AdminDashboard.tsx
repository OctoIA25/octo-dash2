/**
 * Dashboard de Gestão Completa - Design Moderno
 * Inspirado em ClickUp, Notion e Material Design 3
 * As tabs são gerenciadas pelo header superior (PageTabs)
 */

import { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AdminTaskManager } from './AdminTaskManager';
import { EquipeSection } from '@/features/corretores/components/EquipeSection';
import { EquipesManagerSection } from '@/features/corretores/components/EquipesManagerSection';
import { Bot, ArrowRight } from 'lucide-react';
import { useLeadsData } from '@/features/leads/hooks/useLeadsData';

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Ler a tab ativa da URL (controlada pelo header superior)
  const activeTab = (searchParams.get('tab') as 'tarefas' | 'okrs' | 'pdi' | 'acessos-permissoes' | 'equipes') || 'tarefas';

  useEffect(() => {
    if (searchParams.get('tab') === 'metricas') {
      navigate('/gestao-equipe?tab=tarefas', { replace: true });
    }
  }, [navigate, searchParams]);
  
  // Leads só para a aba Acessos e Permissões — a varredura do tenant inteiro não
  // roda nas outras abas (a padrão é Tarefas).
  const { leads } = useLeadsData({ enabled: activeTab === 'acessos-permissoes' });

  return (
    <div className="w-full min-h-screen overflow-x-hidden">
      {/* Action bar — CTA para Agente Elaine no padrão do dashboard */}
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => navigate('/agentes-ia/elaine')}
          className="group inline-flex items-center gap-3 h-11 pl-3 pr-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/10 transition-all"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-sm shadow-blue-500/30 flex items-center justify-center">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              Agente Elaine
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Insights comportamentais da equipe
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-blue-500 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Conteúdo */}
      <div>
        {activeTab === 'tarefas' && <AdminTaskManager />}
        
        {/* P3.4 — estas duas abas mostravam "Em breve" para funcionalidades que
            JÁ existiam e funcionavam em /leads?tab=. Quem abria por aqui
            concluía que o recurso não existia. Agora há um endereço só, e
            estas rotas levam até ele em vez de manter uma segunda tela. */}
        {activeTab === 'okrs' && <Navigate to="/okrs" replace />}
        {activeTab === 'pdi' && <Navigate to="/pdi" replace />}

        {activeTab === 'equipes' && <EquipesManagerSection />}
        {activeTab === 'acessos-permissoes' && <EquipeSection leads={leads} />}
      </div>
    </div>
  );
};
