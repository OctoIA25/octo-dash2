/**
 * CampanhasManager — lista de campanhas com agregados de runs.
 * Permite criar, editar, excluir e ver os disparos de cada campanha.
 * Visual espelha TemplatesManager (cards slate, badges, estados loading/erro/vazio).
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  listCampaigns, deleteCampaign, listCampaignRuns,
  type CampaignWithStats, type CampaignRun,
} from '../services/campaignsService';
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
      <div className="px-6 py-10 text-center text-[13px] text-slate-400">
        Selecione uma imobiliária para gerenciar campanhas.
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
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => setDetailId(null)}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-[12.5px] text-slate-600 dark:text-slate-300"
            >
              ← Voltar
            </button>
            <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
              Disparos — {camp?.name}
            </h2>
          </div>

          {runsLoading ? (
            <div className="py-16 text-center text-[13px] text-slate-400">Carregando…</div>
          ) : runs.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-slate-400">Nenhum disparo encontrado.</div>
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li key={run.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                      {formatDate(run.created_at)}
                    </span>
                    <span className={`inline-flex items-center h-5 px-2 rounded text-[11px] font-semibold ${run.status === 'completed' || run.status === 'done' ? 'bg-emerald-50 text-emerald-700' : run.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                      {RUN_STATUS_LABEL[run.status] ?? run.status}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-slate-500 mt-1">
                    Enviados: {run.sent_count} · Falhas: {run.failed_count}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-5 h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Campanhas</h2>
          <button
            type="button"
            onClick={() => { setEditing(null); setWizardOpen(true); }}
            className="h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[12.5px] font-semibold"
          >
            Nova campanha
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">
            Não foi possível carregar as campanhas.
          </div>
        )}

        {loading && campaigns.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Carregando…</div>
        ) : campaigns.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Nenhuma campanha ainda.</div>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((camp) => (
              <li key={camp.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate" title={camp.name}>
                    {camp.name}
                  </p>
                  <StatusBadge status={camp.status} />
                </div>
                <p className="text-[11.5px] text-slate-400 mt-1">
                  Último disparo: {formatDate(camp.last_dispatched_at)}
                </p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  Enviados: {camp.total_sent} · Falhas: {camp.total_failed} · Disparos: {camp.runs_count}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => { setEditing(camp); setWizardOpen(true); }}
                    className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => openDetail(camp)}
                    className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                  >
                    Ver disparos
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(camp)}
                    aria-label={`Excluir ${camp.name}`}
                    className="text-rose-500 hover:text-rose-600 ml-auto"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default CampanhasManager;
