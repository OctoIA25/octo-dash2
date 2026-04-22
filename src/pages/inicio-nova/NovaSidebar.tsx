/**
 * NovaSidebar - Sidebar com 3 níveis (paridade total com o CRM antigo)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Bell,
  BarChart3,
  TrendingUp,
  UserCheck,
  Users,
  Building2,
  Bot,
  MessageCircle,
  Plug,
  ChevronDown,
  ChevronRight,
  Search,
  Inbox,
  FileText,
  Headphones,
  Pencil,
  Settings,
  MapPin,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { SidebarPermission } from '@/types/permissions';
import octoLogo from '@/assets/octodash-logo.png';

interface SubItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  route: string;
}

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  route: string;
  permission: SidebarPermission;
  subItems?: SubItem[];
}

interface SidebarGroup {
  title?: string;
  items: SidebarItem[];
}

const GROUPS: SidebarGroup[] = [
  {
    items: [
      { id: 'leads', label: 'Início', icon: Home, route: '/leads', permission: 'leads' },
      { id: 'notificacoes', label: 'Notificações', icon: Bell, route: '/notificacoes', permission: 'notificacoes' },
    ],
  },
  {
    title: 'COMERCIAL',
    items: [
      {
        id: 'metricas',
        label: 'Comercial',
        icon: BarChart3,
        route: '/metricas/cliente-interessado',
        permission: 'metricas',
        subItems: [
          { id: 'meus-leads', label: 'Meus Leads', icon: Inbox, route: '/meus-leads' },
          { id: 'bolsao', label: 'Bolsão', icon: Inbox, route: '/bolsao' },
          { id: 'cliente-interessado', label: 'Funil Cliente Interessado', icon: Users, route: '/metricas/cliente-interessado' },
          { id: 'cliente-proprietario', label: 'Cliente Proprietário', icon: Building2, route: '/metricas/cliente-proprietario' },
          { id: 'proposta', label: 'Proposta', icon: FileText, route: '/metricas/proposta' },
        ],
      },
      { id: 'imoveis', label: 'Imóveis', icon: Building2, route: '/imoveis', permission: 'imoveis' },
      { id: 'mapa-imoveis', label: 'Mapa de Imóveis', icon: MapPin, route: '/mapa-imoveis', permission: 'imoveis' },
    ],
  },
  {
    title: 'EQUIPE',
    items: [
      { id: 'gestao-equipe', label: 'Gestão de Equipe', icon: Users, route: '/gestao-equipe', permission: 'gestao-equipe' },
      { id: 'recrutamento', label: 'Recrutamento', icon: UserCheck, route: '/recrutamento', permission: 'recrutamento' },
    ],
  },
  {
    title: 'INTELIGÊNCIA',
    items: [
      {
        id: 'agentes-ia',
        label: 'Agentes de IA',
        icon: Bot,
        route: '/agentes-ia/agente-marketing',
        permission: 'agentes-ia',
        subItems: [
          { id: 'agente-marketing', label: 'Marketing', icon: Bot, route: '/agentes-ia/agente-marketing' },
          { id: 'agente-comportamental', label: 'Comportamental', icon: Headphones, route: '/agentes-ia/agente-comportamental' },
        ],
      },
      {
        id: 'estudo-mercado',
        label: 'Estudo de Mercado',
        icon: TrendingUp,
        route: '/estudo-mercado/avaliacao',
        permission: 'estudo-mercado',
        subItems: [
          { id: 'avaliacao', label: 'Avaliação', icon: TrendingUp, route: '/estudo-mercado/avaliacao' },
          { id: 'agente-ia', label: 'Editar Estudo', icon: Pencil, route: '/estudo-mercado/agente-ia' },
          { id: 'metricas', label: 'Métricas', icon: BarChart3, route: '/estudo-mercado/metricas' },
        ],
      },
      { id: 'octo-chat', label: 'Octo Chat', icon: MessageCircle, route: '/octo-chat', permission: 'octo-chat' },
    ],
  },
  {
    title: 'SISTEMA',
    items: [
      { id: 'integracoes', label: 'Integrações', icon: Plug, route: '/integracoes', permission: 'integracoes' },
      { id: 'relatorios', label: 'Relatórios', icon: BarChart3, route: '/relatorios', permission: 'relatorios' },
      { id: 'configuracoes', label: 'Configurações', icon: Settings, route: '/configuracoes', permission: 'leads' },
    ],
  },
];

const ALL_ITEMS: SidebarItem[] = GROUPS.flatMap((g) => g.items);

function routeBase(route: string): string {
  return route.split('?')[0];
}

export function NovaSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantName, user, isOwner } = useAuthContext();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const q = normalize(query);
  const isSearching = q.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const allowedPermissions: SidebarPermission[] = (() => {
    if (isOwner) return ALL_ITEMS.map((i) => i.permission);
    const userPerms = user?.sidebarPermissions ?? [];
    const tenantPerms = user?.tenantAllowedFeatures;
    if (Array.isArray(tenantPerms)) {
      if (userPerms.length > 0) {
        return userPerms.filter((p) => tenantPerms.includes(p));
      }
      return tenantPerms;
    }
    return userPerms;
  })();

  const visibleItems = ALL_ITEMS.filter((i) => allowedPermissions.includes(i.permission));

  const filteredGroups = useMemo(() => {
    if (!isSearching) return GROUPS;
    return GROUPS.map((group) => {
      const items = group.items
        .filter((i) => allowedPermissions.includes(i.permission))
        .map((item) => {
          const itemMatches = normalize(item.label).includes(q);
          const matchedSubs = item.subItems?.filter((s) => normalize(s.label).includes(q)) ?? [];
          if (itemMatches) return item;
          if (matchedSubs.length > 0) return { ...item, subItems: matchedSubs };
          return null;
        })
        .filter((x): x is SidebarItem => x !== null);
      return { ...group, items };
    }).filter((g) => g.items.length > 0);
  }, [q, isSearching, allowedPermissions]);

  const firstResult = useMemo(() => {
    if (!isSearching) return null;
    for (const g of filteredGroups) {
      for (const it of g.items) {
        if (normalize(it.label).includes(q)) return it.route;
        if (it.subItems && it.subItems.length > 0) return it.subItems[0].route;
      }
    }
    return null;
  }, [filteredGroups, isSearching, q]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQuery('');
      searchRef.current?.blur();
    } else if (e.key === 'Enter' && firstResult) {
      navigate(firstResult);
      setQuery('');
    }
  };

  const currentPath = location.pathname;
  const currentSearch = location.search;

  const isRouteActiveExact = (route: string) => {
    const base = routeBase(route);
    const query = route.includes('?') ? route.split('?')[1] : '';
    if (base === '/leads') {
      return currentPath === '/leads' || currentPath === '/';
    }
    const pathMatch = currentPath === base || currentPath.startsWith(base + '/');
    if (!query) return pathMatch;
    return pathMatch && currentSearch.includes(query);
  };

  const subItemActive = (sub: SubItem) => isRouteActiveExact(sub.route);

  const itemActive = (item: SidebarItem) => {
    if (isRouteActiveExact(item.route)) return true;
    if (item.subItems?.some(subItemActive)) return true;
    return false;
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleItemClick = (item: SidebarItem) => {
    if (item.subItems && item.subItems.length > 0 && !isSearching) {
      toggleExpanded(item.id);
      return;
    }
    navigate(item.route);
    setQuery('');
  };

  return (
    <aside className="w-[248px] h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-14 px-5 flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800">
        <img src={octoLogo} alt="Octo" className="w-7 h-7 object-contain" />
        <span className="font-semibold text-slate-900 dark:text-slate-100 text-[15px] tracking-tight">Octo IA</span>
      </div>

      {/* Workspace selector */}
      <div className="px-3 pt-3">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
        >
          <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center text-white text-[13px] font-semibold">
            {(tenantName || 'I').charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 text-left text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">
            {tenantName || 'Imobiliária'}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Busca */}
      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full h-8 pl-8 pr-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[12px] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-slate-400 dark:focus:border-slate-600 focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 transition-all"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[9px] text-slate-500 dark:text-slate-400 font-mono">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Menu items agrupados */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {isSearching && filteredGroups.length === 0 && (
          <p className="px-2.5 text-[12px] text-slate-400 dark:text-slate-500">
            Nada encontrado para "{query}"
          </p>
        )}
        {filteredGroups.map((group, gIdx) => {
          const groupItems = isSearching
            ? group.items
            : group.items.filter((i) => allowedPermissions.includes(i.permission));
          if (groupItems.length === 0) return null;
          return (
            <div key={gIdx}>
              {group.title && (
                <p className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {groupItems.map((item) => {
            const Icon = item.icon;
            const active = itemActive(item);
            const hasSubs = !!item.subItems && item.subItems.length > 0;
            const isExpanded = isSearching ? hasSubs : (expanded[item.id] ?? active);

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={[
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors relative focus:outline-none',
                    active
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100',
                  ].join(' ')}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r bg-slate-900 dark:bg-slate-100" />
                  )}
                  <Icon className={`w-[18px] h-[18px] ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500'}`} strokeWidth={active ? 2.2 : 2} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {hasSubs && (
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      strokeWidth={2}
                    />
                  )}
                </button>

                {/* Submenu (2º nível) */}
                {hasSubs && isExpanded && (
                  <ul className="mt-0.5 ml-4 pl-3 border-l border-slate-200 dark:border-slate-800 space-y-0.5">
                    {item.subItems!.map((sub) => {
                      const SubIcon = sub.icon;
                      const subActive = subItemActive(sub);
                      return (
                        <li key={sub.id}>
                          <button
                            type="button"
                            onClick={() => { navigate(sub.route); setQuery(''); }}
                            className={[
                              'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium transition-colors focus:outline-none',
                              subActive
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100',
                            ].join(' ')}
                          >
                            <SubIcon className={`w-[15px] h-[15px] ${subActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`} strokeWidth={subActive ? 2.2 : 2} />
                            <span className="flex-1 text-left">{sub.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="p-3">
        <p className="px-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium">Octo IA v2.0</p>
      </div>
    </aside>
  );
}
