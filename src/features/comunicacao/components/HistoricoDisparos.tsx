/**
 * HistoricoDisparos — lista os disparos do tenant (Comunicação › Histórico).
 * Somente leitura. Progresso ao vivo (Task 6) e detalhe (Task 5) são plugados
 * em camadas; aqui ficam a lista, os filtros e os estados.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { listRuns, getRunProgress, type RunSummary, type RunProgress } from '../services/historicoService';
import { getRunReport, type RunReport } from '../services/disparadorService';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  done: { label: 'Concluído', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  failed: { label: 'Falhou', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' },
  running: { label: 'Enviando', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
  pending: { label: 'Pendente', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return <span className={`inline-flex items-center h-6 px-2 rounded-md text-[11px] font-semibold ${m.cls}`}>{m.label}</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-[15px] font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}

const STATUS_FILTERS = ['', 'done', 'failed', 'running', 'pending'] as const;

export function HistoricoDisparos() {
  const { tenantId } = useAuthContext();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
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
    listRuns(tenantId as string, { status: status || undefined, q: debouncedQ || undefined })
      .then((res) => { if (active) { setRuns(res.ok ? res.runs : []); if (!res.ok) setError(true); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, tenantReady, status, debouncedQ]);

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
          for (const r of results) if (r) next[r[0]] = r[1];
          return next;
        });
      } finally {
        inFlight = false;
      }
    };
    tick();
    const handle = setInterval(tick, 4000);
    return () => { active = false; clearInterval(handle); };
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
    return <div className="px-6 py-10 text-center text-[13px] text-slate-400">Selecione uma imobiliária para ver o histórico.</div>;
  }

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || 'all'}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`h-8 px-3 rounded-lg text-[12.5px] font-semibold transition-colors ${
                status === s ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {s ? (STATUS_META[s]?.label ?? s) : 'Todos'}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar disparos pelo comando"
            placeholder="Buscar pelo comando…"
            className="h-8 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[12.5px] text-slate-700 dark:text-slate-200 flex-1 min-w-[160px]"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">
            Não foi possível carregar o histórico.
          </div>
        )}

        {loading && runs.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Carregando…</div>
        ) : runs.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Nenhum disparo ainda.</div>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li
                key={run.id}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(run)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(run); } }}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate" title={run.command_text ?? undefined}>
                    {run.command_text || '(sem comando)'}
                  </p>
                  <StatusBadge status={run.status} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11.5px] text-slate-400">
                  <span>{fmtDate(run.created_at)}</span>
                  <span className="tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{run.sent_count}</span> enviados
                    {run.failed_count > 0 && (
                      <> · <span className="text-rose-600 dark:text-rose-400 font-semibold">{run.failed_count}</span> falhas</>
                    )}
                  </span>
                </div>
                {run.status === 'running' && (() => {
                  const p = progress[run.id];
                  const total = p?.total || run.found_count || 0;
                  const done = p?.done ?? 0;
                  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                  return (
                    <div className="mt-2">
                      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400 tabular-nums">
                        {done.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')} enviados
                      </p>
                    </div>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}

        {openId && (
          <aside className="mt-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Detalhe do disparo</h3>
              <button type="button" onClick={() => setOpenId(null)} className="text-[12px] text-slate-400 hover:text-slate-600">Fechar</button>
            </div>
            {!report ? (
              <p className="text-[12px] text-slate-400">Carregando…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <Stat label="Encontrados" value={report.found_count} />
                  <Stat label="Elegíveis" value={report.eligible_count} />
                  <Stat label="Enviados" value={report.sent_count} />
                  <Stat label="Falhas" value={report.failed_count} />
                </div>
                {failures.length > 0 ? (
                  <ul className="space-y-1">
                    {failures.map((f, i) => (
                      <li key={i} className="flex items-center justify-between text-[12px] border-t border-slate-100 dark:border-slate-800 pt-1">
                        <span className="text-slate-700 dark:text-slate-300 truncate">{f.lead_name || f.lead_phone || '—'}</span>
                        <span className="text-rose-500 dark:text-rose-400 truncate ml-2">{f.error || f.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-slate-400">Sem falhas neste disparo.</p>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export default HistoricoDisparos;
