import { useEffect, useMemo, useState } from 'react';
import { PropostaPage } from '@/features/leads/pages/PropostaPage';
import {
  Briefcase,
  Users,
  Wallet,
  Percent,
  Receipt,
  TrendingUp,
  LayoutGrid,
  ListChecks,
  Filter,
  Building2,
  Handshake,
  CalendarDays,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { fetchSavedProposals, SavedProposal } from '@/features/leads/services/proposalsService';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import { crmLeadToSavedProposal } from '../utils/crmLeadToSavedProposal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTenantBrokerPhotos } from '../hooks/useTenantBrokerPhotos';
import { JURIDICO_KANBAN_COLUMNS, getProposalColumn } from '../utils/kanbanColumns';
import { JuridicoKanbanCard } from '../components/JuridicoKanbanCard';

type ViewMode = 'kanban' | 'lista';
type FinancingFilter = 'todos' | 'com' | 'sem';

const formatCurrencyWithCents = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatCurrencyCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: value >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
  }).format(value || 0);

const parseAmount = (value: number | string | null | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value || '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getInitials = (name: string) => {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('');
};

const DAYS_RECENT = 7;
const COMMISSION_RATE = 0.054;

export function VisaoGeralPage() {
  const { tenantId, user } = useAuthContext();
  const { getPhoto } = useTenantBrokerPhotos(tenantId);
  const { leads } = useLeadsMetrics();
  const [savedProposals, setSavedProposals] = useState<SavedProposal[]>([]);

  const proposals = useMemo<SavedProposal[]>(() => {
    const savedLeadIds = new Set(savedProposals.map((p) => p.lead_id).filter(Boolean) as string[]);
    const leadStubs = leads
      .filter((lead) => !savedLeadIds.has(lead.id))
      .map(crmLeadToSavedProposal)
      .filter((p): p is SavedProposal => p !== null);
    return [...savedProposals, ...leadStubs];
  }, [savedProposals, leads]);
  const [openedProposalId, setOpenedProposalId] = useState<string | null>(null);
  const openedProposal = useMemo(
    () => proposals.find((p) => p.id === openedProposalId) || null,
    [proposals, openedProposalId],
  );

  const openProposal = (proposalId: string) => {
    setOpenedProposalId(proposalId);
  };
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [financingFilter, setFinancingFilter] = useState<FinancingFilter>('todos');
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [onlyRecent, setOnlyRecent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId || tenantId === 'owner') {
      setSavedProposals([]);
      return;
    }
    setIsLoading(true);
    fetchSavedProposals(tenantId)
      .then((data) => {
        if (!cancelled) setSavedProposals(data);
      })
      .catch(() => {
        if (!cancelled) setSavedProposals([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const activeProposals = useMemo(
    () => proposals.filter((proposal) => proposal.stage_id !== 'arquivado'),
    [proposals],
  );

  const filtered = useMemo(() => {
    return activeProposals.filter((proposal) => {
      if (financingFilter === 'com' && !proposal.has_financing) return false;
      if (financingFilter === 'sem' && proposal.has_financing) return false;
      if (onlyMine && proposal.agent_user_id !== user?.id) return false;
      if (onlyAttention && !proposal.transaction_form?.activeDealSubstageId) return false;
      if (onlyRecent) {
        const updated = new Date(proposal.updated_at).getTime();
        if (Number.isNaN(updated)) return false;
        const daysAgo = (Date.now() - updated) / (1000 * 60 * 60 * 24);
        if (daysAgo > DAYS_RECENT) return false;
      }
      return true;
    });
  }, [activeProposals, financingFilter, onlyMine, onlyAttention, onlyRecent, user?.id]);

  const metrics = useMemo(() => {
    const negocios = filtered.length;
    const clientes = new Set(
      filtered
        .flatMap((p) => p.parties.filter((party) => party.party_type === 'comprador'))
        .map((party) => (party.cpf || party.full_name || '').trim().toLowerCase())
        .filter(Boolean),
    ).size;
    const vgv = filtered.reduce((sum, p) => sum + parseAmount(p.value), 0);
    const ticketMedio = negocios > 0 ? vgv / negocios : 0;
    const vgc = vgv * COMMISSION_RATE;
    const vgcMedio = negocios > 0 ? vgc / negocios : 0;
    return { negocios, clientes, vgv, vgc, vgcMedio, ticketMedio };
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, SavedProposal[]>();
    JURIDICO_KANBAN_COLUMNS.forEach((col) => map.set(col.id, []));
    filtered.forEach((proposal) => {
      const colId = getProposalColumn(proposal);
      const bucket = map.get(colId);
      if (bucket) bucket.push(proposal);
    });
    return map;
  }, [filtered]);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-auto p-4 sm:p-6">
      {/* Métricas topo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon={Briefcase} label="Negócios" value={String(metrics.negocios)} />
        <MetricCard icon={Users} label="Clientes" value={String(metrics.clientes)} />
        <MetricCard icon={Wallet} label="VGC" value={formatCurrencyCompact(metrics.vgc)} hint={`${(COMMISSION_RATE * 100).toFixed(1)}%`} />
        <MetricCard icon={Percent} label="VGC médio" value={formatCurrencyCompact(metrics.vgcMedio)} />
        <MetricCard icon={Receipt} label="Ticket médio" value={formatCurrencyCompact(metrics.ticketMedio)} />
        <MetricCard icon={TrendingUp} label="VGV" value={formatCurrencyCompact(metrics.vgv)} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="inline-flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
          <ToolbarToggle active={viewMode === 'kanban'} onClick={() => setViewMode('kanban')} icon={LayoutGrid}>
            Kanban
          </ToolbarToggle>
          <ToolbarToggle active={viewMode === 'lista'} onClick={() => setViewMode('lista')} icon={ListChecks}>
            Lista
          </ToolbarToggle>
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-800" />

        <div className="inline-flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
          <ToolbarToggle active={financingFilter === 'todos'} onClick={() => setFinancingFilter('todos')}>
            Todos
          </ToolbarToggle>
          <ToolbarToggle active={financingFilter === 'com'} onClick={() => setFinancingFilter('com')}>
            Com financiamento
          </ToolbarToggle>
          <ToolbarToggle active={financingFilter === 'sem'} onClick={() => setFinancingFilter('sem')}>
            Sem financiamento
          </ToolbarToggle>
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-800" />

        <FilterChip icon={Handshake} active={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
          Minhas parcerias
        </FilterChip>
        <FilterChip icon={Building2} active onClick={() => undefined}>
          Somente desta imobiliária
        </FilterChip>
        <FilterChip icon={AlertTriangle} active={onlyAttention} onClick={() => setOnlyAttention((v) => !v)}>
          Subetapas em atenção
        </FilterChip>
        <FilterChip icon={CalendarDays} active={onlyRecent} onClick={() => setOnlyRecent((v) => !v)}>
          Mudança recente
        </FilterChip>

        <div className="ml-auto flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          {filtered.length} de {activeProposals.length} negócios
        </div>
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">Carregando propostas...</div>
      ) : viewMode === 'kanban' ? (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {JURIDICO_KANBAN_COLUMNS.map((col) => {
            const items = grouped.get(col.id) || [];
            return (
              <section
                key={col.id}
                className="flex w-[300px] shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <header
                  className="rounded-t-lg border-b px-3 py-2.5"
                  style={{ borderColor: `${col.color}33`, backgroundColor: `${col.color}10` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[12px] font-bold uppercase tracking-wide" style={{ color: col.color }}>
                        {col.title}
                      </h3>
                      {col.subtitle && (
                        <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{col.subtitle}</p>
                      )}
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ backgroundColor: `${col.color}22`, color: col.color }}
                    >
                      {items.length}
                    </span>
                  </div>
                </header>
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[11px] text-slate-400 dark:text-slate-500">Sem negócios</p>
                  ) : (
                    items.map((proposal) => (
                      <JuridicoKanbanCard
                        key={proposal.id}
                        proposal={proposal}
                        brokerPhoto={getPhoto({ userId: proposal.agent_user_id, name: proposal.agent_name })}
                        onClick={() => openProposal(proposal.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <ListView proposals={filtered} getPhoto={getPhoto} onOpen={openProposal} />
      )}

      {openedProposalId && (
        <PropostaPage
          embeddedProposalId={openedProposalId}
          embeddedProposal={openedProposal}
          onEmbeddedClose={() => setOpenedProposalId(null)}
        />
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

function ToolbarToggle({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-colors',
        active
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

function FilterChip({
  icon: Icon,
  active,
  onClick,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function ListView({
  proposals,
  getPhoto,
  onOpen,
}: {
  proposals: SavedProposal[];
  getPhoto: (params: { userId?: string | null; name?: string | null; email?: string | null }) => string | undefined;
  onOpen: (proposalId: string) => void;
}) {
  if (proposals.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">Nenhum negócio encontrado com os filtros atuais.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 font-semibold">Cliente</th>
            <th className="px-3 py-2 font-semibold">Imóvel</th>
            <th className="px-3 py-2 font-semibold">Valor</th>
            <th className="px-3 py-2 font-semibold">Etapa</th>
            <th className="px-3 py-2 font-semibold">Corretor</th>
            <th className="px-3 py-2 font-semibold">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((proposal) => {
            const buyer = proposal.parties.find((p) => p.party_type === 'comprador');
            const photo = getPhoto({ userId: proposal.agent_user_id, name: proposal.agent_name });
            const column = JURIDICO_KANBAN_COLUMNS.find((c) => c.id === getProposalColumn(proposal));
            return (
              <tr
                key={proposal.id}
                onClick={() => onOpen(proposal.id)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">{buyer?.full_name?.trim() || 'Pendente'}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{proposal.property_reference || '—'}</td>
                <td className="px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrencyWithCents(parseAmount(proposal.value))}</td>
                <td className="px-3 py-2">
                  {column ? (
                    <Badge variant="outline" style={{ borderColor: `${column.color}55`, color: column.color }}>
                      {column.title}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      {photo && <AvatarImage src={photo} alt={proposal.agent_name} />}
                      <AvatarFallback className="bg-slate-200 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {getInitials(proposal.agent_name || '?')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-slate-700 dark:text-slate-200">{proposal.agent_name || 'A definir'}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" />
                    {new Date(proposal.updated_at).toLocaleDateString('pt-BR')}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
