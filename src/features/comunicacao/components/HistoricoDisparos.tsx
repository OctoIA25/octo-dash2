/**
 * HistoricoDisparos — lista os disparos do tenant (Comunicação › Histórico).
 * Somente leitura. Progresso ao vivo (Task 6) e detalhe (Task 5) são plugados
 * em camadas; aqui ficam a lista, os filtros e os estados.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { listRuns, type RunSummary } from '../services/historicoService';

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

const STATUS_FILTERS = ['', 'done', 'failed', 'running', 'pending'] as const;

export function HistoricoDisparos() {
  const { tenantId } = useAuthContext();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const tenantReady = Boolean(tenantId && tenantId !== 'owner');

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

  const fmtDate = useMemo(
    () => (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    [],
  );

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
              <li key={run.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default HistoricoDisparos;
