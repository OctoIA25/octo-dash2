/**
 * CampanhasManager — lista de campanhas com agregados de runs.
 * Permite criar, editar, excluir e ver os disparos de cada campanha.
 * Visual premium espelha PublicosManager (cards slate, métricas em destaque,
 * badges de estado, empty-state e skeleton). A lógica é preservada integralmente.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Eye, Repeat, Clock, Megaphone, ArrowLeft, XCircle,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  listCampaigns, deleteCampaign, listCampaignRuns, cancelSchedule,
  type CampaignWithStats, type CampaignRun,
} from '../services/campaignsService';
import { describeRecurrence } from '../recurrence';
import { CampanhaWizard } from './CampanhaWizard';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Rascunho', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  active:   { label: 'Ativa',    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  archived: { label: 'Arquivada', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-md text-[11px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const RUN_STATUS_LABEL: Record<string, string> = {
  pending:   'Pendente',
  running:   'Enviando',
  done:      'Concluído',
  completed: 'Concluído',
  failed:    'Falhou',
};

/** Mini-stat de destaque (número grande + label uppercase) usado no card de campanha. */
function MiniStat({ value, label, tone }: { value: number; label: string; tone: 'emerald' | 'rose' | 'slate' }) {
  const valueCls = tone === 'emerald'
    ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'rose'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="min-w-0">
      <p className={`text-[18px] font-bold tabular-nums leading-none ${valueCls}`}>
        {value.toLocaleString('pt-BR')}
      </p>
      <p className="mt-1 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

export function CampanhasManager() {
  const { tenantId } = useAuthContext();
  const tenantReady = Boolean(tenantId && tenantId !== 'owner');

  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignWithStats | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [runs, setRuns] = useState<CampaignRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  async function reload() {
    if (!tenantReady) return;
    setLoading(true);
    setError(false);
    try {
      const res = await listCampaigns(tenantId as string);
      if (!res.ok) { setError(true); setCampaigns([]); return; }
      setCampaigns(res.campaigns);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, [tenantId, tenantReady]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openDetail(camp: CampaignWithStats) {
    setDetailId(camp.id);
    setRuns([]);
    setRunsLoading(true);
    try {
      const res = await listCampaignRuns(tenantId as string, camp.id);
      if (res.ok) setRuns(res.runs);
    } catch { /* silencioso — lista vazia */ } finally {
      setRunsLoading(false);
    }
  }

  async function cancelScheduleFor(camp: CampaignWithStats) {
    if (!window.confirm(`Cancelar o agendamento da campanha "${camp.name}"?`)) return;
    try {
      const res = await cancelSchedule(tenantId as string, camp.id);
      if (!res.ok) { toast.error('Não foi possível cancelar o agendamento.'); return; }
      toast.success('Agendamento cancelado.');
      reload();
    } catch {
      toast.error('Não foi possível cancelar o agendamento.');
    }
  }

  async function cancelRecurrenceFor(camp: CampaignWithStats) {
    if (!window.confirm(`Cancelar a recorrência da campanha "${camp.name}"?`)) return;
    try {
      const res = await cancelSchedule(tenantId as string, camp.id);
      if (!res.ok) { toast.error('Não foi possível cancelar a recorrência.'); return; }
      toast.success('Recorrência cancelada.');
      reload();
    } catch {
      toast.error('Não foi possível cancelar a recorrência.');
    }
  }

  async function remove(camp: CampaignWithStats) {
    if (!window.confirm(`Excluir a campanha "${camp.name}"?`)) return;
    try {
      const res = await deleteCampaign(tenantId as string, camp.id);
      if (!res.ok) {
        toast.error(res.error === 'delete_failed' ? 'Não foi possível excluir (em uso?)' : 'Não foi possível excluir.');
        return;
      }
      reload();
    } catch {
      toast.error('Não foi possível excluir.');
    }
  }

  if (!tenantReady) {
    return (
      <div className="px-6 py-5 h-full overflow-y-auto">
        <div className="max-w-[1100px] mx-auto">
          <EmptyState
            title="Selecione uma imobiliária"
            help="Escolha uma imobiliária para gerenciar suas campanhas de comunicação."
          />
        </div>
      </div>
    );
  }

  if (wizardOpen) {
    return (
      <CampanhaWizard
        tenantId={tenantId as string}
        editing={editing}
        onClose={() => setWizardOpen(false)}
        onSaved={() => { setWizardOpen(false); reload(); }}
      />
    );
  }

  if (detailId !== null) {
    const camp = campaigns.find((c) => c.id === detailId);
    return (
      <div className="px-6 py-5 h-full overflow-y-auto">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={() => setDetailId(null)}
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Voltar
            </button>
            <h2 className="text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate" title={camp?.name}>
              Disparos — {camp?.name}
            </h2>
          </div>

          {runsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => <RunSkeleton key={i} />)}
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              withIcon
              icon={<Clock className="h-6 w-6" aria-hidden />}
              title="Nenhum disparo ainda"
              help="Quando esta campanha for disparada, o histórico de envios aparecerá aqui."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {runs.map((run) => {
                const done = run.status === 'completed' || run.status === 'done';
                const failed = run.status === 'failed';
                const badgeCls = done
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : failed
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
                return (
                  <div
                    key={run.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">
                        {formatDate(run.created_at)}
                      </span>
                      <span className={`inline-flex items-center h-6 px-2 rounded-md text-[11px] font-semibold ${badgeCls}`}>
                        {RUN_STATUS_LABEL[run.status] ?? run.status}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <MiniStat value={run.sent_count} label="Enviados" tone="emerald" />
                      <MiniStat value={run.failed_count} label="Falhas" tone={run.failed_count > 0 ? 'rose' : 'slate'} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Resumo dinâmico: nº de campanhas e soma de mensagens enviadas.
  const total = campaigns.length;
  const sumSent = campaigns.reduce((acc, c) => acc + c.total_sent, 0);
  const summary = total > 0
    ? `${total} campanha${total === 1 ? '' : 's'} · ${sumSent.toLocaleString('pt-BR')} enviado${sumSent === 1 ? '' : 's'}`
    : 'Nenhuma campanha cadastrada';

  const showSkeleton = loading && campaigns.length === 0;
  const showEmpty = !loading && campaigns.length === 0;

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto">
        {/* Header da seção */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">Campanhas</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">{summary}</p>
          </div>
          <button
            type="button"
            onClick={() => { setEditing(null); setWizardOpen(true); }}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nova campanha
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">
            Não foi possível carregar as campanhas.
          </div>
        )}

        {/* Skeleton de carregamento */}
        {showSkeleton && (
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {/* Empty-state */}
        {showEmpty && (
          <EmptyState
            withIcon
            icon={<Megaphone className="h-6 w-6" aria-hidden />}
            title="Nenhuma campanha ainda"
            help="Crie uma campanha para disparar mensagens segmentadas."
            action={{ label: 'Criar primeira campanha', onClick: () => { setEditing(null); setWizardOpen(true); } }}
          />
        )}

        {/* Grid de cards */}
        {!showSkeleton && campaigns.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {campaigns.map((camp) => (
              <div
                key={camp.id}
                className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors p-4"
              >
                {/* Topo: nome + selo de estado */}
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 truncate" title={camp.name}>
                    {camp.name}
                  </p>
                  {camp.recurrence ? (
                    <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                      <Repeat className="h-3 w-3" aria-hidden />
                      {describeRecurrence(camp.recurrence)}
                    </span>
                  ) : camp.schedule_status === 'scheduled' ? (
                    <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
                      <Clock className="h-3 w-3" aria-hidden />
                      Agendada {formatDate(camp.scheduled_at)}
                    </span>
                  ) : (
                    <StatusBadge status={camp.status} />
                  )}
                </div>

                {/* Métricas em destaque */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <MiniStat value={camp.total_sent} label="Enviados" tone="emerald" />
                  <MiniStat value={camp.total_failed} label="Falhas" tone={camp.total_failed > 0 ? 'rose' : 'slate'} />
                  <MiniStat value={camp.runs_count} label="Disparos" tone="slate" />
                </div>

                {/* Datas / próxima execução / erro de agendamento */}
                <div className="mt-3 space-y-0.5">
                  <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
                    Último disparo: {formatDate(camp.last_dispatched_at)}
                  </p>
                  {camp.recurrence && (
                    <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
                      Próxima: {formatDate(camp.scheduled_at)}
                    </p>
                  )}
                  {camp.schedule_status === 'error' && (
                    <p className="text-[11.5px] text-rose-600 dark:text-rose-400">
                      {`⚠️ Falha no agendamento: ${camp.schedule_error || 'motivo não informado'}`}
                    </p>
                  )}
                </div>

                {/* Ações */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openDetail(camp)}
                    className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    Ver disparos
                  </button>
                  {camp.recurrence ? (
                    <button
                      type="button"
                      onClick={() => cancelRecurrenceFor(camp)}
                      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-700"
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden />
                      Cancelar recorrência
                    </button>
                  ) : camp.schedule_status === 'scheduled' && (
                    <button
                      type="button"
                      onClick={() => cancelScheduleFor(camp)}
                      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-700"
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden />
                      Cancelar agendamento
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-0.5 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => { setEditing(camp); setWizardOpen(true); }}
                      aria-label={`Editar ${camp.name}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 focus:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(camp)}
                      aria-label={`Excluir ${camp.name}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-700 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Card-fantasma exibido enquanto a lista de campanhas carrega. */
function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="h-3.5 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <span className="h-6 w-16 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <span className="block h-4 w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <span className="mt-1 block h-2.5 w-12 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
      <div className="mt-3 h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

/** Card-fantasma exibido enquanto os disparos carregam. */
function RunSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="h-3.5 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <span className="h-6 w-16 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i}>
            <span className="block h-4 w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <span className="mt-1 block h-2.5 w-12 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Empty-state premium reutilizável (sem-campanha, sem-disparo e sem-tenant). */
function EmptyState({ title, help, withIcon, icon, action }: {
  title: string;
  help: string;
  withIcon?: boolean;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      {withIcon && (
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          {icon ?? <Megaphone className="h-6 w-6" aria-hidden />}
        </span>
      )}
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-sm text-[12.5px] text-slate-400 dark:text-slate-500">{help}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {action.label}
        </button>
      )}
    </div>
  );
}

export default CampanhasManager;
