/** Página de gestão de KPIs. Composição: lista + form + wizard de import. */
import { useMemo, useState } from 'react';
import { Plus, Upload, BarChart3, Eye, ArrowDownUp } from 'lucide-react';
import { toast } from 'sonner';
import { useKpiAdmin } from '../hooks/useKpiAdmin';
import { KpiList } from '../components/KpiList';
import { KpiFormDialog } from '../components/KpiFormDialog';
import { KpiImportWizard } from '../components/KpiImportWizard';
import type { DashboardKpi, DashboardKpiDraft } from '@/features/kpis/domain/kpiTypes';

/** Métrica curta do cabeçalho — orientação de relance. */
function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[18px] font-bold leading-none tabular-nums text-slate-900 dark:text-slate-100">{value}</span>
      <span className="mt-1 text-[10.5px] font-medium uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

export function KpiAdminPage() {
  const { kpis, isLoading, canManage, create, update, remove, reorder, setVisibility, setStatus, refresh } = useKpiAdmin();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardKpi | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const summary = useMemo(() => ({
    total: kpis.length,
    visiveis: kpis.filter((k) => k.isVisible && k.status === 'active').length,
    importados: kpis.filter((k) => k.source === 'planilha').length,
  }), [kpis]);

  if (!canManage) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Acesso restrito</p>
        <p className="mt-1 text-[12px] text-slate-400">Só gestores podem configurar os KPIs do dashboard.</p>
      </div>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleSubmit = async (draft: DashboardKpiDraft) => {
    try {
      if (editing) await update.mutateAsync({ id: editing.id, draft });
      else await create.mutateAsync(draft);
      toast.success(editing ? 'KPI atualizado' : 'KPI criado');
      setFormOpen(false);
      setEditing(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar'); }
  };

  const handleDelete = async (kpi: DashboardKpi) => {
    try {
      await remove.mutateAsync(kpi.id);
      toast.success('KPI excluído');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir');
    }
  };

  return (
    <div className="mx-auto max-w-[1040px] px-6 py-6">
      {/* Cabeçalho */}
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <BarChart3 className="h-3.5 w-3.5" /> Dashboard
            </div>
            <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-slate-100">Gerenciar KPIs</h1>
            <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
              Configure quais indicadores aparecem e em que ordem. A sequência aqui é a do dashboard.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" /> Importar planilha
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <Plus className="h-4 w-4" /> Novo KPI
            </button>
          </div>
        </div>

        {/* Resumo: orientação de relance */}
        {!isLoading && kpis.length > 0 && (
          <div className="mt-4 flex items-center gap-7 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <Stat value={summary.total} label="KPIs" />
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-500" />
              <Stat value={summary.visiveis} label="no dashboard" />
            </div>
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-slate-400" />
              <Stat value={summary.importados} label="de planilha" />
            </div>
            <div className="ml-auto hidden items-center gap-1.5 text-[11.5px] text-slate-400 sm:flex">
              <ArrowDownUp className="h-3.5 w-3.5" /> arraste para reordenar
            </div>
          </div>
        )}
      </header>

      <KpiList
        kpis={kpis}
        isLoading={isLoading}
        onEdit={(k) => { setEditing(k); setFormOpen(true); }}
        onDelete={handleDelete}
        onReorder={(ids) => reorder.mutate(ids)}
        onToggleVisible={(k) => setVisibility.mutate({ id: k.id, isVisible: !k.isVisible })}
        onToggleStatus={(k) => setStatus.mutate({ id: k.id, status: k.status === 'active' ? 'inactive' : 'active' })}
      />

      <KpiFormDialog open={formOpen} onOpenChange={setFormOpen} kpi={editing} isSubmitting={create.isPending || update.isPending} onSubmit={handleSubmit} />
      <KpiImportWizard open={wizardOpen} onOpenChange={setWizardOpen} existingKpis={kpis} onImported={refresh} />
    </div>
  );
}
export default KpiAdminPage;
