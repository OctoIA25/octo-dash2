/**
 * NovaSidebar - Sidebar com 3 níveis (paridade total com o CRM antigo)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Bell,
  CheckSquare2,
  BarChart3,
  TrendingUp,
  UserCheck,
  Users,
  Building2,
  Bot,
  MessageCircle,
  MessageSquare,
  Plug,
  ChevronRight,
  Search,
  Inbox,
  FileText,
  Headphones,
  ClipboardList,
  Megaphone,
  Pencil,
  Settings,
  MapPin,
  Scale,
  LayoutGrid,
  Target,
  Calculator,
  Receipt,
  Wallet,
  Shield,
  BookOpen,
  NotebookPen,
  HelpCircle,
  FileSignature,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { SidebarPermission, permissoesDeSidebar } from '@/types/permissions';
import octoLogo from '@/assets/octodash-logo.png';

interface SubItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  route: string;
  /**
   * Permissão própria do sub-item. Quando definida, o sub-item só aparece se o
   * usuário tiver acesso a ela (independente da permissão do item pai). Quando
   * ausente, o sub-item herda a visibilidade do pai (comportamento padrão).
   */
  permission?: SidebarPermission;
}

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
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
          { id: 'comissionamento', label: 'Comissionamento', icon: Calculator, route: '/metricas/comissionamento' },
          // P2.2 — o simulador é ferramenta de quem vende: permissão 'leads',
          // a mesma do corretor. Quem edita a TABELA de condição é que precisa
          // administrar a casa, e isso o banco é que decide.
          { id: 'simulador', label: 'Simulador de pagamento', icon: Calculator, route: '/ferramentas/simulador' },
        ],
      },
      {
        id: 'imoveis',
        label: 'Imóveis',
        icon: Building2,
        route: '/imoveis',
        permission: 'imoveis',
        subItems: [
          { id: 'imoveis-catalogo', label: 'Catálogo', icon: Home, route: '/imoveis?tab=catalogo' },
          { id: 'mapa-imoveis', label: 'Mapa de Imóveis', icon: MapPin, route: '/imoveis?tab=mapa-imoveis' },
        ],
      },
      { id: 'metas', label: 'Metas', icon: Target, route: '/metas', permission: 'metas' },
    ],
  },
  {
    // P3.7 — o plano pede uma seção Marketing no menu, junto com Formulários
    // da Meta, Campanhas e ROI. As telas continuam onde estão; o que muda é
    // haver um caminho direto até elas.
    title: 'MARKETING',
    items: [
      {
        id: 'mkt-demandas',
        label: 'Marketing',
        icon: Megaphone,
        route: '/marketing/demandas',
        permission: 'relatorios',
        subItems: [
          { id: 'mkt-demandas', label: 'Demandas', icon: ClipboardList, route: '/marketing/demandas' },
          { id: 'mkt-campanhas', label: 'Campanhas e ROI', icon: Target, route: '/relatorios?tab=marketing&view=campanhas' },
          { id: 'mkt-anuncios', label: 'Anúncios', icon: BarChart3, route: '/relatorios?tab=marketing&view=anuncios' },
          { id: 'mkt-formularios', label: 'Formulários da Meta', icon: ClipboardList, route: '/relatorios?tab=formularios-meta' },
        ],
      },
    ],
  },
  {
    // P4.5 — o Financeiro é seção própria: o plano manda restringi-lo a quem
    // cuida do dinheiro, e ele não é um relatório comercial.
    //
    // Até 23/09/2026 esta seção usava a permissão 'relatorios' — o comentário
    // acima dizia "restringi-lo a quem cuida do dinheiro" e a chave escolhida
    // era a dos relatórios, que o team_leader tem. Agora tem chave própria.
    title: 'FINANCEIRO',
    items: [
      {
        id: 'financeiro',
        label: 'Financeiro',
        icon: Wallet,
        route: '/financeiro',
        permission: 'financeiro',
        subItems: [
          { id: 'fin-receber', label: 'A receber', icon: Receipt, route: '/financeiro' },
        ],
      },
    ],
  },
  {
    title: 'EQUIPE',
    items: [
      { id: 'gestao-equipe', label: 'Gestão de Equipe', icon: Users, route: '/gestao-equipe', permission: 'gestao-equipe' },
      { id: 'recrutamento', label: 'Recrutamento', icon: UserCheck, route: '/recrutamento', permission: 'recrutamento' },
      // P4.2 — materiais de estudo. Permissão 'leads' de propósito: o plano de
      // carreira e as regras de comissão são para o corretor ler, e ele não
      // tem 'gestao-equipe'. Quem gere edita; todo membro lê.
      { id: 'materiais', label: 'Materiais de estudo', icon: BookOpen, route: '/materiais', permission: 'leads' },
      // P4.8 — atas de reunião. Permissão 'gestao-equipe': a ata guarda a
      // conversa inteira da gestão, e quem só faz o trabalho recebe a tarefa na
      // agenda, não a conversa.
      { id: 'reunioes', label: 'Reuniões', icon: NotebookPen, route: '/reunioes', permission: 'gestao-equipe' },
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
          { id: 'comunicacao', label: 'Comunicação', icon: Megaphone, route: '/comunicacao/disparador', permission: 'comunicacao' },
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
      //{ id: 'octo-chat', label: 'Octo Chat', icon: MessageCircle, route: '/octo-chat', permission: 'octo-chat' },
      { id: 'chat', label: 'WhatsApp', icon: MessageSquare, route: '/chat', permission: 'chat' },
    ],
  },
  {
    title: 'JURÍDICO',
    items: [
      {
        id: 'juridico',
        label: 'Jurídico',
        icon: Scale,
        route: '/juridico/visao-geral',
        permission: 'juridico',
        subItems: [
          { id: 'juridico-visao-geral', label: 'Visão Geral', icon: LayoutGrid, route: '/juridico/visao-geral' },
          { id: 'juridico-proposta', label: 'Propostas', icon: FileText, route: '/juridico/proposta' },
          // P4.3 — os contratos do corretor moram no Jurídico, como o plano pede.
          { id: 'juridico-contratos', label: 'Contratos do corretor', icon: FileSignature, route: '/juridico/contratos' },
          // 24/09, a pedido do chefe: "pode liberar na Dash, mas dentro de
          // Jurídico". Ela estava em dois lugares — Comercial e Financeiro —,
          // e agora está num só. A ROTA continua `/comercial/vendas`: mudá-la
          // quebraria os links que alguém já tenha guardado, e o endereço não
          // é o que o chefe vê.
          //
          // A PERMISSÃO continua sendo 'financeiro', e não 'juridico': o menu
          // tem de concordar com a rota e com o banco. A rota exige
          // `financeiro`, e as funções do banco conferem `financeiro_pode_ver`
          // por dentro. Dar a permissão do Jurídico aqui faria o item aparecer
          // para quem a tela vai recusar — que é o defeito que o P0.1 levou
          // uma semana para achar, só que ao contrário.
          { id: 'juridico-vendas', label: 'Conferência de vendas', icon: Receipt, route: '/comercial/vendas', permission: 'financeiro' },
        ],
      },
    ],
  },
  {
    title: 'SISTEMA',
    items: [
      { id: 'integracoes', label: 'Integrações', icon: Plug, route: '/integracoes', permission: 'integracoes' },
      { id: 'relatorios', label: 'Relatórios', icon: BarChart3, route: '/relatorios', permission: 'relatorios' },
      // P4.9 — Ajuda. Permissão 'leads' de propósito: uma ajuda que só quem
      // administra lê não ajuda ninguém.
      { id: 'ajuda', label: 'Ajuda', icon: HelpCircle, route: '/ajuda', permission: 'leads' },
      {
        id: 'configuracoes', label: 'Configurações', icon: Settings, route: '/configuracoes', permission: 'leads',
        // P4.1 — Cargos morava em EQUIPE, ao lado de Gestão de Equipe. Mudou
        // para cá em 24/09/2026 a pedido do chefe: "este item, ideal manter em
        // configurações".
        //
        // A ROTA CONTINUA `/cargos`. Mover o item de menu é mudança de lugar,
        // não de endereço — trocar a rota quebraria todo link que alguém já
        // tenha salvo, e ninguém receberia erro: cairia no redirecionamento
        // padrão, que parece "não tenho acesso".
        //
        // A permissão continua `gestao-equipe`, e não a de Configurações
        // (`leads`, que todo mundo tem): quem monta cargo decide o acesso dos
        // outros. Ficar dentro de Configurações não pode afrouxar isso.
        subItems: [
          { id: 'cargos', label: 'Cargos', icon: Shield, route: '/cargos', permission: 'gestao-equipe' },
        ],
      },
    ],
  },
];

function routeBase(route: string): string {
  return route.split('?')[0];
}

export function NovaSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantName, user, isOwner, tenantId } = useAuthContext();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const q = normalize(query);
  const isSearching = q.length > 0;

  const ALL_ITEMS: SidebarItem[] = GROUPS.flatMap((g) => g.items);
  // Permissões de TODOS os itens — top-level E sub-items com permissão própria
  // (ex.: Comunicação aninhada sob Agentes de IA). Sem incluir os sub-items aqui,
  // canAccess('comunicacao') seria false até para o owner, escondendo o item.
  const ALL_PERMISSIONS: SidebarPermission[] = ALL_ITEMS.flatMap((i) => [
    i.permission,
    ...(i.subItems ?? []).map((s) => s.permission).filter((p): p is SidebarPermission => Boolean(p)),
  ]);

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

  // A MESMA regra que libera a rota (ver permissoesDeSidebar). Antes esta
  // cópia não abria a exceção de admin/team_leader e escondia do menu uma
  // tela que a rota deixava aberta.
  const allowedPermissions: SidebarPermission[] = permissoesDeSidebar({
    isOwner,
    isTenantUser: !!tenantId && tenantId !== 'owner',
    systemRole: user?.systemRole,
    tenantAllowedFeatures: user?.tenantAllowedFeatures,
    sidebarPermissions: user?.sidebarPermissions,
    permissoesDoCargo: user?.permissoesDoCargo,
  });

  const canAccess = useCallback(
    (permission: SidebarPermission) => allowedPermissions.includes(permission),
    [allowedPermissions],
  );

  /**
   * Sub-items visíveis: um sub com `permission` própria só aparece se o usuário
   * tiver acesso a ela (independente do pai); sem `permission`, herda o pai —
   * só aparece se o usuário tiver a permissão do item pai. Espelha os guards de
   * rota (canAccess) e evita expor links inalcançáveis.
   */
  const visibleSubItems = useCallback(
    (item: SidebarItem): SubItem[] =>
      (item.subItems ?? []).filter((sub) =>
        sub.permission ? canAccess(sub.permission) : canAccess(item.permission),
      ),
    [canAccess],
  );

  /**
   * Visibilidade do item pai: aparece se o usuário tem a permissão do próprio
   * item OU a permissão de algum sub-item próprio (ex.: Comunicação aninhada sob
   * Agentes de IA continua visível para quem só tem 'comunicacao').
   */
  const isItemVisible = useCallback(
    (item: SidebarItem) => canAccess(item.permission) || visibleSubItems(item).length > 0,
    [canAccess, visibleSubItems],
  );

  const filteredGroups = useMemo(() => {
    if (!isSearching) return GROUPS;
    return GROUPS.map((group) => {
      const items = group.items
        .filter(isItemVisible)
        .map((item): SidebarItem | null => {
          const subs = visibleSubItems(item);
          const itemMatches = normalize(item.label).includes(q);
          const matchedSubs = subs.filter((s) => normalize(s.label).includes(q));
          if (itemMatches) return { ...item, subItems: subs };
          if (matchedSubs.length > 0) return { ...item, subItems: matchedSubs };
          return null;
        })
        .filter((x): x is SidebarItem => x !== null);
      return { ...group, items };
    }).filter((g) => g.items.length > 0);
  }, [q, isSearching, isItemVisible, visibleSubItems]);

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

      {/* Workspace selector — troca de tenant só existe para owner. Para os
          demais é só um rótulo: sem chevron nem hover, para não prometer um
          menu que não abre. */}
      <div className="px-3 pt-3">
        {isOwner ? (
          <TenantSwitcher />
        ) : (
          <div className="w-full flex items-center gap-2 px-2.5 py-2">
            <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center text-white text-[13px] font-semibold shrink-0">
              {(tenantName || 'I').charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 text-left text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">
              {tenantName || 'Imobiliária'}
            </span>
          </div>
        )}
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
            : group.items.filter(isItemVisible);
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
            // No modo busca, os sub-items já vêm filtrados por permissão (via
            // filteredGroups). Fora da busca, filtramos aqui pelos sub-items
            // visíveis ao usuário.
            const subs = isSearching ? (item.subItems ?? []) : visibleSubItems(item);
            const hasSubs = subs.length > 0;
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
                    {subs.map((sub) => {
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
