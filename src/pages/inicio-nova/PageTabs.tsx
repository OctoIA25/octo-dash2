/**
 * PageTabs - Abas contextuais que aparecem no header conforme a rota atual
 * Substituem as "internal tabs" do antigo MainLayoutOptimized.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { fetchTenantBolsaoConfig } from '@/features/leads/services/tenantBolsaoConfigService';
import { useOverflowTabs } from './useOverflowTabs';
import {
  BarChart3,
  Headphones,
  Phone,
  Building2,
  TrendingUp,
  Bot,
  Pencil,
  ClipboardList,
  Target,
  GraduationCap,
  Users,
  Key,
  Filter,
  CheckSquare,
  Calendar,
  LayoutGrid,
  Archive,
  Plug,
  Code,
  Home,
  User,
  Zap,
  Tag,
  Settings2,
  Sparkles,
  MessageCircle,
  DollarSign,
  FileText,
  MapPin,
  Rocket,
  History,
  Megaphone,
} from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  href: string; // either pathname or '?tab=...'
  isQuery?: boolean;
}

interface TabConfig {
  basePath: string; // path prefix that activates this tab group
  label?: string;   // section name shown before the tabs
  tabs: Tab[];
  matchStrategy: 'pathSegment' | 'query';
  queryKey?: string; // for ?tab=... style
}

const TAB_CONFIGS: TabConfig[] = [
  {
    basePath: '/meus-leads',
    label: 'Meus Leads',
    matchStrategy: 'query',
    queryKey: 'sub',
    tabs: [
      { id: 'kanban', label: 'Kanban Interessado', icon: LayoutGrid, href: '/meus-leads?sub=kanban', isQuery: true },
      { id: 'kanban-proprietario', label: 'Kanban Proprietário', icon: Building2, href: '/meus-leads?sub=kanban-proprietario', isQuery: true },
      { id: 'central-leads', label: 'Central de Leads', icon: Users, href: '/meus-leads?sub=central-leads', isQuery: true },
      { id: 'arquivados', label: 'Arquivados', icon: Archive, href: '/meus-leads?sub=arquivados', isQuery: true },
    ],
  },
  {
    basePath: '/leads',
    label: 'Início',
    matchStrategy: 'query',
    queryKey: 'tab',
    tabs: [
      { id: 'funil', label: 'Funil', icon: Filter, href: '/leads?tab=funil', isQuery: true },
      { id: 'okrs', label: 'OKRs', icon: Target, href: '/leads?tab=okrs', isQuery: true },
      { id: 'kpis', label: 'KPIs', icon: BarChart3, href: '/leads?tab=kpis', isQuery: true },
      { id: 'pdi', label: 'PDI', icon: GraduationCap, href: '/leads?tab=pdi', isQuery: true },
      { id: 'tarefas-semana', label: 'Tarefas da Semana', icon: CheckSquare, href: '/leads?tab=tarefas-semana', isQuery: true },
      { id: 'agenda', label: 'Agenda', icon: Calendar, href: '/leads?tab=agenda', isQuery: true },
    ],
  },
  {
    basePath: '/metricas/cliente-interessado',
    label: 'Interessados',
    matchStrategy: 'pathSegment',
    tabs: [
      { id: 'geral', label: 'Visão Geral', icon: BarChart3, href: '/metricas/cliente-interessado/geral' },
      { id: 'pre-atendimento', label: 'Pré-Atendimento', icon: Headphones, href: '/metricas/cliente-interessado/pre-atendimento' },
      { id: 'atendimento', label: 'Atendimento', icon: Phone, href: '/metricas/cliente-interessado/atendimento' },
    ],
  },
  {
    basePath: '/metricas/cliente-proprietario',
    label: 'Proprietários',
    matchStrategy: 'pathSegment',
    tabs: [
      { id: 'cliente-proprietario', label: 'Visão Geral', icon: Building2, href: '/metricas/cliente-proprietario/cliente-proprietario' },
      { id: 'estudo-mercado', label: 'Estudo de Mercado', icon: TrendingUp, href: '/metricas/cliente-proprietario/estudo-mercado' },
    ],
  },
  {
    basePath: '/agentes-ia',
    label: 'Agentes de IA',
    matchStrategy: 'pathSegment',
    tabs: [
      { id: 'agente-marketing', label: 'Marketing', icon: Bot, href: '/agentes-ia/agente-marketing' },
      { id: 'agente-comportamental', label: 'Comportamental', icon: Headphones, href: '/agentes-ia/agente-comportamental' },
      // Telemetria é gestão/owner — filtrada dinamicamente no useMemo (mesmo
      // padrão da aba "Equipes" do Bolsão).
      { id: 'telemetria', label: 'Telemetria', icon: BarChart3, href: '/agentes-ia/telemetria' },
    ],
  },
  {
    basePath: '/relatorios',
    label: 'Relatórios',
    matchStrategy: 'query',
    queryKey: 'tab',
    tabs: [
      { id: 'marketing', label: 'Marketing', icon: TrendingUp, href: '/relatorios?tab=marketing', isQuery: true },
      { id: 'metricas', label: 'Métricas da Equipe', icon: Users, href: '/relatorios?tab=metricas', isQuery: true },
      { id: 'metricas-individuais', label: 'Métricas Individuais', icon: User, href: '/relatorios?tab=metricas-individuais', isQuery: true },
      { id: 'imoveis', label: 'Imóveis', icon: Building2, href: '/relatorios?tab=imoveis', isQuery: true },
      { id: 'financeiro', label: 'Financeiro', icon: DollarSign, href: '/relatorios?tab=financeiro', isQuery: true },
      { id: 'excel', label: 'Excel', icon: FileText, href: '/relatorios?tab=excel', isQuery: true },
    ],
  },
  {
    basePath: '/estudo-mercado',
    label: 'Estudo de Mercado',
    matchStrategy: 'pathSegment',
    tabs: [
      { id: 'avaliacao', label: 'Avaliação', icon: TrendingUp, href: '/estudo-mercado/avaliacao' },
      { id: 'agente-ia', label: 'Editar Estudo', icon: Pencil, href: '/estudo-mercado/agente-ia' },
      { id: 'metricas', label: 'Métricas', icon: BarChart3, href: '/estudo-mercado/metricas' },
    ],
  },
  {
    basePath: '/gestao-equipe',
    label: 'Gestão de Equipe',
    matchStrategy: 'query',
    queryKey: 'tab',
    tabs: [
      { id: 'tarefas', label: 'Tarefas', icon: ClipboardList, href: '/gestao-equipe?tab=tarefas', isQuery: true },
      { id: 'okrs', label: 'OKRs', icon: Target, href: '/gestao-equipe?tab=okrs', isQuery: true },
      { id: 'pdi', label: 'PDI', icon: GraduationCap, href: '/gestao-equipe?tab=pdi', isQuery: true },
      { id: 'equipes', label: 'Equipes', icon: Users, href: '/gestao-equipe?tab=equipes', isQuery: true },
      { id: 'acessos-permissoes', label: 'Acessos e Permissões', icon: Key, href: '/gestao-equipe?tab=acessos-permissoes', isQuery: true },
    ],
  },
  {
    basePath: '/configuracoes',
    label: 'Configurações',
    matchStrategy: 'pathSegment',
    tabs: [],
  },
  {
    basePath: '/bolsao',
    label: 'Bolsão',
    matchStrategy: 'query',
    queryKey: 'tab',
    tabs: [
      { id: 'disponiveis', label: 'Disponíveis', icon: Zap, href: '/bolsao?tab=disponiveis', isQuery: true },
      { id: 'geral', label: 'Todos os Leads', icon: Tag, href: '/bolsao?tab=geral', isQuery: true },
      { id: 'equipes', label: 'Equipes', icon: Users, href: '/bolsao?tab=equipes', isQuery: true },
      { id: 'configuracoes', label: 'Configurações', icon: Settings2, href: '/bolsao?tab=configuracoes', isQuery: true },
    ],
  },
  {
    basePath: '/imoveis',
    label: 'Imóveis',
    matchStrategy: 'query',
    queryKey: 'tab',
    tabs: [
      { id: 'catalogo', label: 'Catálogo Completo', icon: Home, href: '/imoveis?tab=catalogo', isQuery: true },
      { id: 'meus-imoveis', label: 'Meus Imóveis', icon: User, href: '/imoveis?tab=meus-imoveis', isQuery: true },
      { id: 'condominios', label: 'Condomínios', icon: Building2, href: '/imoveis?tab=condominios', isQuery: true },
      { id: 'lancamentos', label: 'Lançamentos', icon: Sparkles, href: '/imoveis?tab=lancamentos', isQuery: true },
      { id: 'mapa-imoveis', label: 'Mapa de Imóveis', icon: MapPin, href: '/imoveis?tab=mapa-imoveis', isQuery: true },
    ],
  },
  {
    basePath: '/notificacoes',
    label: 'Notificações',
    matchStrategy: 'pathSegment',
    tabs: [],
  },
  {
    basePath: '/integracoes',
    label: 'Integrações',
    matchStrategy: 'query',
    queryKey: 'tab',
    tabs: [
      { id: 'integrations', label: 'Integrações', icon: Plug, href: '/integracoes?tab=integrations', isQuery: true },
      { id: 'xml', label: 'XML', icon: Building2, href: '/integracoes?tab=xml', isQuery: true },
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, href: '/integracoes?tab=whatsapp', isQuery: true },
      { id: 'api', label: 'API', icon: Code, href: '/integracoes?tab=api', isQuery: true },
    ],
  },
  {
    basePath: '/recrutamento',
    label: 'Recrutamento',
    matchStrategy: 'pathSegment',
    tabs: [],
  },
  {
    basePath: '/octo-chat',
    label: 'OctoChat',
    matchStrategy: 'pathSegment',
    tabs: [],
  },
  {
    basePath: '/chat',
    label: 'Chat',
    matchStrategy: 'pathSegment',
    tabs: [],
  },
  {
    basePath: '/mapa-imoveis',
    label: 'Mapa de Imóveis',
    matchStrategy: 'pathSegment',
    tabs: [],
  },
  {
    basePath: '/comunicacao',
    label: 'Comunicação',
    matchStrategy: 'pathSegment',
    tabs: [
      { id: 'disparador', label: 'Disparador', icon: Rocket, href: '/comunicacao/disparador' },
      { id: 'publicos', label: 'Públicos', icon: Users, href: '/comunicacao/publicos' },
      { id: 'templates', label: 'Templates', icon: FileText, href: '/comunicacao/templates' },
      { id: 'campanhas', label: 'Campanhas', icon: Megaphone, href: '/comunicacao/campanhas' },
      { id: 'historico', label: 'Histórico', icon: History, href: '/comunicacao/historico' },
    ],
  },
];

/** Classes do botão de aba, compartilhadas entre área visível e medidor. */
function tabButtonClass(active: boolean): string {
  return [
    'h-8 px-2.5 rounded-lg text-[12.5px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
    active
      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100',
  ].join(' ');
}

export function PageTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenantId, isGestao, isOwner } = useAuthContext();

  // Carrega o config do bolsão pra decidir se a aba "Equipes" aparece
  const [teamQueueEnabled, setTeamQueueEnabled] = useState(false);
  const isOnBolsao = location.pathname.startsWith('/bolsao');
  useEffect(() => {
    if (!isOnBolsao || !tenantId || tenantId === 'owner') return;
    let cancelled = false;
    fetchTenantBolsaoConfig(tenantId)
      .then((c) => { if (!cancelled) setTeamQueueEnabled(c.teamQueueEnabled); })
      .catch(() => { /* silencioso */ });
    return () => { cancelled = true; };
  }, [isOnBolsao, tenantId]);

  const { activeConfig, activeTabId } = useMemo(() => {
    const baseCfg = TAB_CONFIGS.find((c) => location.pathname.startsWith(c.basePath));
    if (!baseCfg) return { activeConfig: null, activeTabId: null };

    // Filtros dinâmicos: aba "Equipes" do Bolsão só com team_queue_enabled;
    // aba "Telemetria" dos Agentes só para gestão/owner (corretor não vê
    // custos da empresa — a rota também redireciona, isto é só UX).
    let cfg: TabConfig = baseCfg;
    if (baseCfg.basePath === '/bolsao') {
      cfg = { ...baseCfg, tabs: baseCfg.tabs.filter((t) => t.id !== 'equipes' || teamQueueEnabled) };
    } else if (baseCfg.basePath === '/agentes-ia') {
      cfg = { ...baseCfg, tabs: baseCfg.tabs.filter((t) => t.id !== 'telemetria' || isGestao || isOwner) };
    }

    let activeId: string | null = null;
    if (cfg.matchStrategy === 'pathSegment') {
      const remainder = location.pathname.slice(cfg.basePath.length).replace(/^\//, '').split('/')[0];
      activeId = remainder || cfg.tabs[0]?.id || null;
    } else if (cfg.matchStrategy === 'query' && cfg.queryKey) {
      const params = new URLSearchParams(location.search);
      activeId = params.get(cfg.queryKey) || cfg.tabs[0]?.id || null;
    }
    return { activeConfig: cfg, activeTabId: activeId };
  }, [location.pathname, location.search, teamQueueEnabled, isGestao, isOwner]);

  const tabs = activeConfig?.tabs ?? EMPTY_TABS;
  const { visibleTabs, overflowTabs, containerRef, registerTab } = useOverflowTabs(
    tabs,
    activeTabId,
  );

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  // Fecha o "Mais" ao trocar de rota.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname, location.search]);

  if (!activeConfig) return null;

  const goTo = (href: string) => {
    setMoreOpen(false);
    navigate(href);
  };

  return (
    <div key={activeConfig.basePath} className="flex items-center gap-2 flex-1 min-w-0">
      {activeConfig.label && (
        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          {activeConfig.label}
        </span>
      )}
      {activeConfig.label && tabs.length > 0 && (
        <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />
      )}

      {/* Trilho visível: abas que cabem + botão "Mais". */}
      <div ref={containerRef} className="flex items-center gap-1.5 flex-1 min-w-0">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.href)}
              className={tabButtonClass(active)}
            >
              <Icon
                className={`w-[14px] h-[14px] ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}
                strokeWidth={active ? 2.2 : 2}
              />
              {tab.label}
            </button>
          );
        })}

        {overflowTabs.length > 0 && (
          <div ref={moreRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={tabButtonClass(overflowTabs.some((t) => t.id === activeTabId))}
            >
              <MoreHorizontal className="w-[14px] h-[14px] text-slate-400" strokeWidth={2} />
              Mais
              <ChevronDown
                className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
                strokeWidth={2}
              />
            </button>

            {moreOpen && (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+6px)] min-w-[220px] max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50"
              >
                {overflowTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = tab.id === activeTabId;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="menuitem"
                      onClick={() => goTo(tab.href)}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left',
                        active
                          ? 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
                      ].join(' ')}
                    >
                      <Icon
                        className={`w-4 h-4 ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}
                        strokeWidth={2}
                      />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Medidor invisível: renderiza TODAS as abas fora da tela para capturar
          a largura individual de cada uma. Não afeta o layout. */}
      <div aria-hidden className="absolute -left-[9999px] top-0 flex items-center gap-1.5 pointer-events-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <span key={tab.id} ref={registerTab(tab.id)} className={tabButtonClass(false)}>
              <Icon className="w-[14px] h-[14px]" strokeWidth={2} />
              {tab.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Referência estável para evitar recriar o array vazio a cada render. */
const EMPTY_TABS: Tab[] = [];
