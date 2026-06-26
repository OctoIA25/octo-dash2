/**
 * HistoricoDisparos — lista os disparos do tenant (Comunicação › Histórico).
 * Somente leitura. Progresso ao vivo (Task 6) e detalhe (Task 5) são plugados
 * em camadas; aqui ficam a lista, os filtros e os estados.
 *
 * Visual premium espelha PublicosManager/CampanhasManager (wrapper centralizado,
 * header com resumo dinâmico, cards slate, badges de estado, empty-state e
 * skeleton). A lógica — estados, fetch, filtros, progresso ao vivo, detalhe — é
 * preservada integralmente; apenas a apresentação muda.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  History, Send, CheckCircle2, XCircle, Loader2, Clock, Search, X,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { listRuns, getRunProgress, type RunSummary, type RunProgress } from '../services/historicoService';
import { getRunReport, type RunReport } from '../services/disparadorService';

/** Rótulo + cores do badge de estado + ícone do chip. Paleta restrita: slate + acentos por estado. */
const STATUS_META: Record<string, { label: string; badge: string; chip: string; Icon: typeof Send }> = {
  done: {
    label: 'Concluído',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  failed: {
    label: 'Falhou',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
    chip: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    Icon: XCircle,
  },
  running: {
    label: 'Enviando',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    chip: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    Icon: Loader2,
  },
  pending: {
    label: 'Pendente',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
    Icon: Clock,
  },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.pending;
}

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-md text-[11px] font-semibold ${m.badge}`}>
      {m.label}
    </span>
  );
}

/** Mini-stat do detalhe (número em destaque + label uppercase). */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-[18px] font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">
        {value.toLocaleString('pt-BR')}
      </p>
      <p className="mt-1 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

const STATUS_FILTERS = ['', 'done', 'failed', 'running', 'pending'] as const;
const INPUT_CLASS = 'h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[12.5px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600';

export function HistoricoDisparos() {
  const { tenantId } = useAuthContext();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport['run'] | null>(null);
  const [failures, setFailures] = useState<NonNullable<RunReport['failures']>>([]);

  const tenantReady = Boolean(tenantId && tenantId !== 'owner');
  const [progress, setProgress] = useState<Record<string, RunProgress>>({});

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(h);
  }, [q]);

  useEffect(() => {
    if (!tenantReady) return;
    let active = true;
    setLoading(true);
    setError(false);
    listRuns(tenantId as string, {
      status: status || undefined,
      q: debouncedQ || undefined,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    })
      .then((res) => { if (active) { setRuns(res.ok ? res.runs : []); if (!res.ok) setError(true); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, tenantReady, status, debouncedQ, from, to]);

  useEffect(() => {
    if (!tenantReady) return;
    const runningIds = runs.filter((r) => r.status === 'running').map((r) => r.id);
    if (runningIds.length === 0) return;

    let active = true;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const results = await Promise.all(
          runningIds.map((id) =>
            getRunProgress(tenantId as string, id).then((p) => [id, p] as const).catch(() => null),
          ),
        );
        if (!active) return;
        setProgress((prev) => {
          const next = { ...prev };
          for (const r of results) if (r && r[1]?.ok) next[r[0]] = r[1];
          return next;
        });
      } finally {
        inFlight = false;
      }
    };
    tick();
    const handle = setInterval(tick, 4000);
    return () => { active = false; clearInterval(handle); };
  // `progress` é intencionalmente OMITIDO das deps: o tick chama setProgress, e
  // incluí-lo recriaria o intervalo a cada atualização (loop). `runs` recria o
  // intervalo só quando a lista muda (filtro/refetch) — o que é desejável.
  }, [tenantId, tenantReady, runs]);

  const fmtDate = useMemo(
    () => (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    [],
  );

  async function openDetail(run: RunSummary) {
    setOpenId(run.id);
    setReport(null);
    setFailures([]);
    const rep = await getRunReport(tenantId as string, run.id);
    setReport(rep.run || null);
    setFailures(rep.failures || []);
  }

  if (!tenantReady) {
    return (
      <div className="px-6 py-5 h-full overflow-y-auto">
        <div className="max-w-[1100px] mx-auto">
          <EmptyState
            title="Selecione uma imobiliária"
            help="Escolha uma imobiliária para ver o histórico de disparos."
          />
        </div>
      </div>
    );
  }

  // Resumo dinâmico derivado dos disparos carregados. Como a lista pode ser
  // paginada/filtrada, o resumo descreve o que está em tela.
  const total = runs.length;
  const sumSent = runs.reduce((acc, r) => acc + r.sent_count, 0);
  const sumFailed = runs.reduce((acc, r) => acc + r.failed_count, 0);
  const summary = total > 0
    ? `${total} disparo${total === 1 ? '' : 's'} · ${sumSent.toLocaleString('pt-BR')} enviado${sumSent === 1 ? '' : 's'}${sumFailed > 0 ? ` · ${sumFailed.toLocaleString('pt-BR')} falha${sumFailed === 1 ? '' : 's'}` : ''}`
    : 'Nenhum disparo no período';

  const showSkeleton = loading && runs.length === 0;
  const showEmpty = !loading && runs.length === 0;

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto">
        {/* Header da seção */}
        <div className="mb-5">
          <h2 className="text-[18px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">Histórico de disparos</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">{summary}</p>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || 'all'}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`h-8 px-3 rounded-lg text-[12.5px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 ${
                status === s
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {s ? statusMeta(s).label : 'Todos'}
            </button>
          ))}

          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <label className="flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-slate-400">
              De
              <input
                type="date"
                aria-label="Data inicial"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-slate-400">
              até
              <input
                type="date"
                aria-label="Data final"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar disparos pelo comando"
                placeholder="Buscar pelo comando…"
                className={`${INPUT_CLASS} pl-8 ${q ? 'pr-8' : ''} w-[180px]`}
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  aria-label="Limpar busca"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">
            Não foi possível carregar o histórico.
          </div>
        )}

        {/* Skeleton de carregamento */}
        {showSkeleton && (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
          </div>
        )}

        {/* Empty-state (read-only: sem ação) */}
        {showEmpty && (
          <EmptyState
            withIcon
            title="Nenhum disparo ainda"
            help="Os envios das suas campanhas e disparos aparecem aqui."
          />
        )}

        {/* Lista de disparos (linhas de timeline refinadas) */}
        {!showSkeleton && runs.length > 0 && (
          <ul className="space-y-2">
            {runs.map((run) => {
              const m = statusMeta(run.status);
              const { Icon } = m;
              const isRunning = run.status === 'running';
              return (
                <li key={run.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(run)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(run); } }}
                    className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
                  >
                    <div className="flex items-start gap-3">
                      {/* Chip do estado (ícone) */}
                      <span className={`shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg ${m.chip}`}>
                        <Icon className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} aria-hidden />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p
                            className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate"
                            title={run.command_text ?? undefined}
                          >
                            {run.command_text || 'Enviado sem comando'}
                          </p>
                          <StatusBadge status={run.status} />
                        </div>

                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span className="text-[11.5px] text-slate-400 dark:text-slate-500 tabular-nums">{fmtDate(run.created_at)}</span>
                          <span className="text-[11.5px] tabular-nums">
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{run.sent_count.toLocaleString('pt-BR')}</span>
                            <span className="text-slate-400 dark:text-slate-500"> enviados</span>
                            {run.failed_count > 0 && (
                              <>
                                <span className="text-slate-300 dark:text-slate-600"> · </span>
                                <span className="text-rose-600 dark:text-rose-400 font-semibold">{run.failed_count.toLocaleString('pt-BR')}</span>
                                <span className="text-slate-400 dark:text-slate-500"> falhas</span>
                              </>
                            )}
                          </span>
                        </div>

                        {/* Progresso ao vivo (apenas para runs em andamento) */}
                        {isRunning && (() => {
                          const p = progress[run.id];
                          const totalRun = p?.total || run.found_count || 0;
                          const done = p?.done ?? 0;
                          const pct = totalRun > 0 ? Math.min(100, Math.round((done / totalRun) * 100)) : 0;
                          return (
                            <div className="mt-2.5">
                              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                                {done.toLocaleString('pt-BR')} / {totalRun.toLocaleString('pt-BR')} enviados
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Detalhe do disparo (expande sob a linha clicada) */}
                  {openId === run.id && (
                    <aside className="mt-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Detalhe do disparo</h3>
                        <button
                          type="button"
                          onClick={() => setOpenId(null)}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 rounded px-1"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                          Fechar
                        </button>
                      </div>
                      {!report ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-hidden>
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                              <span className="block h-4 w-10 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                              <span className="mt-2 block h-2.5 w-14 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                            <Stat label="Encontrados" value={report.found_count} />
                            <Stat label="Elegíveis" value={report.eligible_count} />
                            <Stat label="Enviados" value={report.sent_count} />
                            <Stat label="Falhas" value={report.failed_count} />
                          </div>
                          {failures.length > 0 ? (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                              {failures.map((f, i) => (
                                <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                                  <span className="text-slate-700 dark:text-slate-300 truncate">{f.lead_name || f.lead_phone || '—'}</span>
                                  <span className="text-rose-500 dark:text-rose-400 truncate text-[11.5px]">{f.error || f.status}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[12px] text-slate-400 dark:text-slate-500">Sem falhas neste disparo.</p>
                          )}
                        </>
                      )}
                    </aside>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Linha-fantasma exibida enquanto o histórico carrega. */
function RowSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="h-3.5 w-44 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <span className="h-6 w-16 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="h-3 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <span className="h-3 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Empty-state premium reutilizável (sem-disparo e sem-tenant). Read-only: sem ação. */
function EmptyState({ title, help, withIcon }: { title: string; help: string; withIcon?: boolean }) {
  return (
    <div className="py-16 flex flex-col items-center text-center">
      {withIcon && (
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <History className="h-6 w-6" aria-hidden />
        </span>
      )}
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-sm text-[12.5px] text-slate-400 dark:text-slate-500">{help}</p>
    </div>
  );
}

export default HistoricoDisparos;
