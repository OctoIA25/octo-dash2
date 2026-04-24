/**
 * PageTabs - Abas contextuais que aparecem no header conforme a rota atual
 * Substituem as "internal tabs" do antigo MainLayoutOptimized.
 */

import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
    matchStrategy: 'pathSegment',
    tabs: [],
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
    basePath: '/mapa-imoveis',
    label: 'Mapa de Imóveis',
    matchStrategy: 'pathSegment',
    tabs: [],
  },
];

export function PageTabs() {
  const location = useLocation();
  const navigate = useNavigate();

  const { activeConfig, activeTabId } = useMemo(() => {
    const cfg = TAB_CONFIGS.find((c) => location.pathname.startsWith(c.basePath));
    if (!cfg) return { activeConfig: null, activeTabId: null };

    let activeId: string | null = null;
    if (cfg.matchStrategy === 'pathSegment') {
      const remainder = location.pathname.slice(cfg.basePath.length).replace(/^\//, '').split('/')[0];
      activeId = remainder || cfg.tabs[0]?.id || null;
    } else if (cfg.matchStrategy === 'query' && cfg.queryKey) {
      const params = new URLSearchParams(location.search);
      activeId = params.get(cfg.queryKey) || cfg.tabs[0]?.id || null;
    }
    return { activeConfig: cfg, activeTabId: activeId };
  }, [location.pathname, location.search]);

  if (!activeConfig) return null;

  return (
    <div
      key={activeConfig.basePath}
      className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto"
    >
      {activeConfig.label && (
        <span
          className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap animate-in fade-in-0 slide-in-from-left-2 duration-200 ease-out"
          style={{ animationFillMode: 'both' }}
        >
          {activeConfig.label}
        </span>
      )}
      {activeConfig.label && activeConfig.tabs.length > 0 && (
        <span
          className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0 animate-in fade-in-0 duration-150 ease-out"
          style={{ animationDelay: '60ms', animationFillMode: 'both' }}
        />
      )}
      {activeConfig.tabs.map((tab, idx) => {
        const Icon = tab.icon;
        const active = tab.id === activeTabId;
        const delay = activeConfig.label ? 80 + idx * 45 : idx * 45;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.href)}
            style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
            className={[
              'h-8 px-3 rounded-lg text-[12.5px] font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap focus:outline-none',
              'animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out',
              active
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100',
            ].join(' ')}
          >
            <Icon className={`w-[14px] h-[14px] ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`} strokeWidth={active ? 2.2 : 2} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
