/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * DashboardLayout - Layout principal com rotas otimizadas
 * Gerencia sidebar e renderização de páginas por rota
 */

import React, { Suspense, useState, useCallback, useMemo } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { RouteErrorBoundary } from '@/shared/components/RouteErrorBoundary';
import { Routes, Route, Navigate, useOutletContext, useLocation } from 'react-router-dom';
import { NovoLayout } from './inicio-nova/NovoLayout';
import { InicioNovaPage } from './inicio-nova/InicioNovaPage';
import { useLeadsData } from '@/features/leads/hooks/useLeadsData';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  ADMIN_SIDEBAR_PERMISSIONS,
  CORRETOR_SIDEBAR_PERMISSIONS,
  SidebarPermission,
  TEAM_LEADER_SIDEBAR_PERMISSIONS
} from '@/types/permissions';

const DEBUG_LOGS = import.meta.env?.VITE_DEBUG_LOGS === 'true';

const SIDEBAR_PERMISSION_ORDER: SidebarPermission[] = [
  'leads',
  'notificacoes',
  'metricas',
  'juridico',
  'estudo-mercado',
  'recrutamento',
  'gestao-equipe',
  'imoveis',
  'agentes-ia',
  'comunicacao',
  'octo-chat',
  'chat',
  'integracoes',
  'central-leads',
  'relatorios',
  'metas',
  'excel'
];

const DEFAULT_ROUTE_BY_PERMISSION: Partial<Record<SidebarPermission, string>> = {
  leads: '/leads',
  notificacoes: '/notificacoes',
  metricas: '/metricas/cliente-interessado',
  juridico: '/juridico/visao-geral',
  'estudo-mercado': '/estudo-mercado/avaliacao',
  recrutamento: '/recrutamento',
  'gestao-equipe': '/gestao-equipe',
  imoveis: '/imoveis',
  'agentes-ia': '/agentes-ia/agente-marketing',
  comunicacao: '/comunicacao/disparador',
  'octo-chat': '/octo-chat',
  chat: '/chat',
  integracoes: '/integracoes',
  'central-leads': '/central-leads',
  relatorios: '/relatorios',
  metas: '/metas',
  'excel': '/excel'
};

// 🚀 LAZY LOADING - Páginas carregadas sob demanda
const LeadsPage = lazyWithRetry(() => import('@/features/leads/pages/LeadsPage').then(
  m => ({ default: m.LeadsPage }),
  error => {
    console.error('❌ Erro ao carregar LeadsPage:', error);
    // Retornar um componente de erro
    return { 
      default: () => (
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold mb-4">Erro ao carregar página de Leads</h2>
          <p className="text-red-400">{error instanceof Error ? error.message : 'Erro desconhecido'}</p>
        </div>
      )
    };
  }
));
const MeusLeadsPage = lazyWithRetry(() => import('@/features/leads/pages/MeusLeadsPage').then(m => ({ default: m.MeusLeadsPage })));
const MetricasPage = lazyWithRetry(() => import('@/features/metricas/pages/MetricasPage').then(m => ({ default: m.MetricasPage })));
const ClienteInteressadoPage = lazyWithRetry(() => import('@/features/leads/pages/ClienteInteressadoPage').then(m => ({ default: m.ClienteInteressadoPage })));
const ClienteProprietarioPage = lazyWithRetry(() => import('@/features/leads/pages/ClienteProprietarioPage').then(m => ({ default: m.ClienteProprietarioPage })));
const EquipePage = lazyWithRetry(() => import('@/features/corretores/pages/EquipePage').then(m => ({ default: m.EquipePage })));
const RecrutamentoPage = lazyWithRetry(() => import('@/features/corretores/pages/RecrutamentoPage').then(m => ({ default: m.RecrutamentoPage })));
const GestaoEquipePage = lazyWithRetry(() => import('@/features/corretores/pages/GestaoEquipePage').then(m => ({ default: m.GestaoEquipePage })));
const BolsaoPage = lazyWithRetry(() => import('@/features/leads/pages/BolsaoPage').then(m => ({ default: m.BolsaoPage })));
const CentralLeadsPage = lazyWithRetry(() => import('@/features/leads/pages/CentralLeadsPage').then(m => ({ default: m.CentralLeadsPage })));
const CorretoresPage = lazyWithRetry(() => import('@/features/corretores/pages/CorretoresPage').then(m => ({ default: m.CorretoresPage })));
const ImoveisPage = lazyWithRetry(() => import('@/features/imoveis/pages/ImoveisPage').then(m => ({ default: m.ImoveisPage })));
const LancamentoViewPage = lazyWithRetry(() => import('@/features/imoveis/pages/LancamentoViewPage').then(m => ({ default: m.LancamentoViewPage })));
const AgentesIaPage = lazyWithRetry(() => import('@/features/agentes-ia/pages/AgentesIaPage').then(m => ({ default: m.AgentesIaPage })));
const AgentesTelemetriaPage = lazyWithRetry(() => import('@/features/agentes-ia/pages/AgentesTelemetriaPage').then(m => ({ default: m.AgentesTelemetriaPage })));
const ComunicacaoPage = lazyWithRetry(() => import('@/features/comunicacao').then(m => ({ default: m.ComunicacaoPage })));
const OctoChatPage = lazyWithRetry(() => import('@/features/agentes-ia/pages/OctoChatPage').then(m => ({ default: m.OctoChatPage })));
const ChatPage = lazyWithRetry(() => import('@/features/chat/pages/ChatPage').then(m => ({ default: m.ChatPage })));
const ConfiguracoesPage = lazyWithRetry(() => import('@/features/settings/pages/ConfiguracoesPage').then(m => ({ default: m.ConfiguracoesPage })));
const Importar16PersonalitiesPage = lazyWithRetry(() => import('@/features/corretores/pages/Importar16PersonalitiesPage'));
const AdminTestesDashboard = lazyWithRetry(() => import('@/features/corretores/components/AdminTestesDashboard').then(m => ({ default: m.AdminTestesDashboard })));
const AdminTestesGeraisPage = lazyWithRetry(() => import('@/features/corretores/pages/AdminTestesGeraisPage').then(m => ({ default: m.AdminTestesGeraisPage })));
const IntegracoesPage = lazyWithRetry(() => import('@/features/settings/pages/IntegracoesPage').then(m => ({ default: m.IntegracoesPage })));
const RelatoriosPage = lazyWithRetry(() => import('@/features/relatorios/pages/RelatoriosPage').then(m => ({ default: m.RelatoriosPage })));
const EstudoMercadoPage = lazyWithRetry(() => import('@/features/estudo-mercado/pages/EstudoMercadoPage').then(m => ({ default: m.EstudoMercadoPage })));
const EstudoMercadoAgentePage = lazyWithRetry(() => import('@/features/estudo-mercado/pages/EstudoMercadoAgentePage').then(m => ({ default: m.EstudoMercadoAgentePage })));
const EstudoMercadoMetricasPage = lazyWithRetry(() => import('@/features/estudo-mercado/pages/EstudoMercadoMetricasPage').then(m => ({ default: m.EstudoMercadoMetricasPage })));
const NotificacoesPage = lazyWithRetry(() => import('@/features/notificacoes/pages/NotificacoesPage').then(m => ({ default: m.NotificacoesPage })));
const JuridicoPage = lazyWithRetry(() => import('@/features/juridico/pages/JuridicoPage').then(m => ({ default: m.JuridicoPage })));
const MetasPage = lazyWithRetry(() => import('@/features/metas/pages/MetasPage').then(m => ({ default: m.MetasPage })));
const KpiAdminPage = lazyWithRetry(() => import('@/features/kpis').then(m => ({ default: m.KpiAdminPage })));
const EnpsResponderPage = lazyWithRetry(() => import('@/features/enps/pages/EnpsResponderPage').then(m => ({ default: m.EnpsResponderPage })));

// Loading Fallback para páginas individuais
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
    <OctoDashLoader message="Carregando seção..." size="md" />
  </div>
);

const DashboardLayout = () => {
  if (DEBUG_LOGS) console.log(' DashboardLayout renderizando...');

  const { tenantId, user, isOwner } = useAuthContext();
  const location = useLocation();

  // Hook de dados - centralizado aqui para compartilhar entre todas as páginas
  const { leads, isLoading, lastUpdate, newLeadsCount, error, refetch, isRefetching } = useLeadsData();

  if (DEBUG_LOGS) console.log(' DashboardLayout - dados:', { leadsCount: leads?.length, isLoading, error: error?.substring(0, 50) });
  
  // Estados para controle da atualização
  const [isDirectUpdating, setIsDirectUpdating] = useState(false);
  
  // Função para atualizar dados do Supabase
  const handleDirectSupabaseCall = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (isDirectUpdating) return;

    if (DEBUG_LOGS) console.log(' Botão de refresh clicado - atualizando do Supabase');
    
    try {
      setIsDirectUpdating(true);
      await refetch();
      if (DEBUG_LOGS) console.log(' Dados atualizados via refetch principal!');
    } catch (error) {
      console.error(' Erro ao atualizar dados:', error);
    } finally {
      setTimeout(() => {
        setIsDirectUpdating(false);
      }, 1000);
    }
  }, [isDirectUpdating, refetch]);

  // Garantir que sempre temos dados para exibir
  const safeLeads = leads.length > 0 ? leads : [];
  const allowedSidebarPermissions = useMemo(() => {
    const userSidebarPermissions = user?.sidebarPermissions ?? [];
    const tenantAllowedFeatures = user?.tenantAllowedFeatures;
    const isTenantUser = !!tenantId && tenantId !== 'owner';

    if (isOwner) {
      return SIDEBAR_PERMISSION_ORDER;
    }

    if (isTenantUser && Array.isArray(tenantAllowedFeatures)) {
      if (user?.systemRole === 'admin' || user?.systemRole === 'team_leader') {
        return SIDEBAR_PERMISSION_ORDER.filter(permission => tenantAllowedFeatures.includes(permission));
      }

      if (userSidebarPermissions.length > 0) {
        return SIDEBAR_PERMISSION_ORDER.filter(permission => 
          tenantAllowedFeatures.includes(permission) && userSidebarPermissions.includes(permission)
        );
      }

      return SIDEBAR_PERMISSION_ORDER.filter(permission => tenantAllowedFeatures.includes(permission));
    }

    if (user?.systemRole === 'admin') {
      return SIDEBAR_PERMISSION_ORDER.filter(permission => ADMIN_SIDEBAR_PERMISSIONS.includes(permission));
    }

    if (user?.systemRole === 'team_leader') {
      return SIDEBAR_PERMISSION_ORDER.filter(permission => TEAM_LEADER_SIDEBAR_PERMISSIONS.includes(permission));
    }

    if (userSidebarPermissions.length > 0) {
      return SIDEBAR_PERMISSION_ORDER.filter(permission => userSidebarPermissions.includes(permission));
    }

    return SIDEBAR_PERMISSION_ORDER.filter(permission => CORRETOR_SIDEBAR_PERMISSIONS.includes(permission));
  }, [isOwner, tenantId, user?.sidebarPermissions, user?.systemRole, user?.tenantAllowedFeatures]);

  const defaultAllowedRoute = useMemo(() => {
    const firstAllowedPermission = allowedSidebarPermissions.find(permission => DEFAULT_ROUTE_BY_PERMISSION[permission]);
    return (firstAllowedPermission && DEFAULT_ROUTE_BY_PERMISSION[firstAllowedPermission]) || '/leads';
  }, [allowedSidebarPermissions]);

  const canAccess = useCallback((permission: SidebarPermission) => {
    return allowedSidebarPermissions.includes(permission);
  }, [allowedSidebarPermissions]);

  // O loader de tela cheia só faz sentido para as rotas que REALMENTE consomem o
  // `leads` deste layout por prop (recebem safeLeads). As demais (Início, Meus Leads,
  // Métricas, Imóveis, etc.) fazem seu próprio fetch e têm loading interno — prendê-las
  // a este gate as deixa ~segundos em "Carregando CRM..." esperando dados que não usam.
  const ROTAS_QUE_USAM_LEADS_DO_LAYOUT = ['/recrutamento', '/gestao-equipe', '/bolsao', '/configuracoes'];
  const rotaUsaLeadsDoLayout = ROTAS_QUE_USAM_LEADS_DO_LAYOUT.some((r) => location.pathname.startsWith(r));
  if (isLoading && leads.length === 0 && !error && rotaUsaLeadsDoLayout) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <OctoDashLoader message="Carregando CRM..." size="lg" />
      </div>
    );
  }

  return (
    <NovoLayout
      leads={safeLeads}
      onRefresh={handleDirectSupabaseCall}
      isRefreshing={isDirectUpdating || isRefetching}
    >
      <RouteErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route index element={<Navigate to={defaultAllowedRoute} replace />} />
          
          <Route
            path="leads"
            element={
              canAccess('leads') ? (
                <InicioNovaPage />
              ) : (
                <Navigate to={defaultAllowedRoute} replace />
              )
            }
          />
          
          <Route 
            path="meus-leads" 
            element={
              canAccess('metricas') ? (
                <MeusLeadsPage />
              ) : (
                <Navigate to={defaultAllowedRoute} replace />
              )
            } 
          />
          
          <Route
            path="metricas/proposta"
            element={<Navigate to="/juridico/proposta" replace />}
          />

          <Route
            path="metricas/:subsection/:subsubsection?"
            element={canAccess('metricas') ? <MetricasPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />

          <Route
            path="juridico/:section?"
            element={canAccess('juridico') ? <JuridicoPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />
          
          <Route 
            path="cliente-interessado/:subsection?" 
            element={canAccess('metricas') ? <ClienteInteressadoPage /> : <Navigate to={defaultAllowedRoute} replace />} 
          />
          
          <Route 
            path="cliente-proprietario/:subsection?" 
            element={canAccess('metricas') ? <ClienteProprietarioPage /> : <Navigate to={defaultAllowedRoute} replace />} 
          />
          
          <Route 
            path="recrutamento" 
            element={
              canAccess('recrutamento') ? (
                <RecrutamentoPage 
                  leads={safeLeads}
                  onRefresh={handleDirectSupabaseCall}
                  isRefreshing={isDirectUpdating || isRefetching}
                />
              ) : (
                <Navigate to={defaultAllowedRoute} replace />
              )
            } 
          />
          
          <Route 
            path="gestao-equipe" 
            element={
              canAccess('gestao-equipe') ? (
                <GestaoEquipePage 
                  leads={safeLeads}
                  onRefresh={handleDirectSupabaseCall}
                  isRefreshing={isDirectUpdating || isRefetching}
                />
              ) : (
                <Navigate to={defaultAllowedRoute} replace />
              )
            } 
          />
          
          <Route 
            path="bolsao" 
            element={
              canAccess('metricas') ? (
                <BolsaoPage 
                  leads={safeLeads}
                  onRefresh={handleDirectSupabaseCall}
                  isRefreshing={isDirectUpdating || isRefetching}
                />
              ) : (
                <Navigate to={defaultAllowedRoute} replace />
              )
            } 
          />
          
          <Route 
            path="corretores" 
            element={<Navigate to={canAccess('gestao-equipe') ? '/gestao-equipe?tab=corretores' : defaultAllowedRoute} replace />}
          />
          
          <Route
            path="imoveis"
            element={
              canAccess('imoveis') ? <ImoveisPage /> : <Navigate to={defaultAllowedRoute} replace />
            }
          />

          <Route
            path="imoveis/lancamentos/:id"
            element={
              canAccess('imoveis') ? <LancamentoViewPage /> : <Navigate to={defaultAllowedRoute} replace />
            }
          />

          <Route
            path="mapa-imoveis"
            element={<Navigate to={canAccess('imoveis') ? '/imoveis?tab=mapa-imoveis' : defaultAllowedRoute} replace />}
          />

          {/* Redirect do caminho legado do Disparador → módulo Comunicação.
              DEVE vir ANTES de agentes-ia/:agent? (rota mais específica primeiro). */}
          <Route
            path="agentes-ia/disparador"
            element={<Navigate to="/comunicacao/disparador" replace />}
          />

          {/* Telemetria: rota específica ANTES de :agent?; o gate gestão/owner
              fino é da própria página (corretor é redirecionado lá dentro). */}
          <Route
            path="agentes-ia/telemetria"
            element={canAccess('agentes-ia') ? <AgentesTelemetriaPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />

          <Route
            path="agentes-ia/:agent?"
            element={canAccess('agentes-ia') ? <AgentesIaPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />

          <Route
            path="comunicacao/:section?"
            element={canAccess('comunicacao') ? <ComunicacaoPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />

          {/* ponytail: Octo Chat oculto a pedido; rota preservada comentada, só reabilitar */}
          {/* <Route
            path="octo-chat"
            element={canAccess('octo-chat') ? <OctoChatPage /> : <Navigate to={defaultAllowedRoute} replace />}
          /> */}

          <Route
            path="chat"
            element={canAccess('chat') ? <ChatPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />

          <Route
            path="configuracoes"
            element={<ConfiguracoesPage leads={leads} />} 
          />
          
          <Route 
            path="importar-16personalities" 
            element={<Importar16PersonalitiesPage />} 
          />
          
          <Route
            path="admin-testes"
            element={canAccess('agentes-ia') ? <AdminTestesDashboard /> : <Navigate to={defaultAllowedRoute} replace />}
          />
          
          <Route 
            path="integracoes" 
            element={canAccess('integracoes') ? <IntegracoesPage /> : <Navigate to={defaultAllowedRoute} replace />} 
          />
          
          <Route
            path="central-leads"
            element={canAccess('central-leads') ? <CentralLeadsPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />
          
          <Route 
            path="notificacoes" 
            element={canAccess('notificacoes') ? <NotificacoesPage /> : <Navigate to={defaultAllowedRoute} replace />} 
          />
          
          <Route 
            path="atividades" 
            element={<Navigate to={defaultAllowedRoute} replace />} 
          />
          
          <Route 
            path="relatorios" 
            element={canAccess('relatorios') ? <RelatoriosPage /> : <Navigate to={defaultAllowedRoute} replace />} 
          />

          {/* eNPS: página de resposta do corretor (in-app, autenticada, sem gate de
              permissão — todo corretor logado responde a própria pesquisa; spec §7). */}
          <Route path="enps/responder" element={<EnpsResponderPage />} />
          
          <Route 
            path="estudo-mercado/avaliacao" 
            element={canAccess('estudo-mercado') ? <EstudoMercadoPage /> : <Navigate to={defaultAllowedRoute} replace />} 
          />
          <Route 
            path="estudo-mercado/agente-ia" 
            element={canAccess('estudo-mercado') ? <EstudoMercadoAgentePage /> : <Navigate to={defaultAllowedRoute} replace />} 
          />
          <Route 
            path="estudo-mercado/metricas" 
            element={canAccess('estudo-mercado') ? <EstudoMercadoMetricasPage /> : <Navigate to={defaultAllowedRoute} replace />} 
          />
          <Route 
            path="estudo-mercado" 
            element={<Navigate to={canAccess('estudo-mercado') ? '/estudo-mercado/avaliacao' : defaultAllowedRoute} replace />} 
          />
          
          <Route
            path="admin-testes-gerais"
            element={canAccess('agentes-ia') ? <AdminTestesGeraisPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />

          <Route
            path="metas"
            element={canAccess('metas') ? <MetasPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />

          <Route
            path="kpis-admin"
            element={canAccess('metricas') ? <KpiAdminPage /> : <Navigate to={defaultAllowedRoute} replace />}
          />

          <Route
            path="relatorios/importacao"
            element={<Navigate to={canAccess('excel') ? '/relatorios?tab=excel' : defaultAllowedRoute} replace />}
          />

          <Route path="*" element={<Navigate to={defaultAllowedRoute} replace />} />
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
    </NovoLayout>
  );
};

export default DashboardLayout;

