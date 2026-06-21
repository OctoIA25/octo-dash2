/**
 * Wizard de importação de metas — passos em state local (sem framework novo),
 * padrão de Importar16PersonalitiesPage. Motor de leitura/análise = pipeline
 * genérico existente. 14b: upload→preview. 14c: mapeamento→dry-run→persistir.
 */
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import {
  FileSpreadsheet, UploadCloud, Loader2, Table2, CalendarRange, KeyRound,
  Target, TrendingUp, Check, Plus, AlertTriangle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';
import { GenericImportService } from '@/features/relatorios/import/generic/services/genericImportService';
import { discoverMetadata } from '@/features/relatorios/import/generic/metadataDiscovery';
import type { GenericTable, ColumnMetadata } from '@/features/relatorios/import/generic/types';
import { suggestMapping, buildImportPlan, buildPreview, type ImportMapping, type ImportPlan, type ImportPreview } from '@/features/kpis/admin/import/targetMapping';
import { persistImport, type ResolvedPlan } from '@/features/kpis/admin/services/kpiImportService';
import { WIZARD_STEPS, prevStep, type WizardStep } from '@/features/kpis/admin/import/wizardSteps';
import { periodRangeLabel } from './importMessages';
import type { DashboardKpi } from '@/features/kpis/domain/kpiTypes';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingKpis: DashboardKpi[];
  /** Chamado após uma importação CONFIRMADA — a página revalida a lista/overview. */
  onImported?: () => void;
}

/** Rótulos dos passos para o indicador de progresso (mesma ordem de WIZARD_STEPS). */
const STEP_LABELS: Record<WizardStep, string> = {
  upload: 'Arquivo',
  preview: 'Conferir',
  mapeamento: 'Mapear',
  importacao: 'Importar',
};


/** Trilha de passos: numerada, casando com o motivo da lista (a ordem é informação). */
function StepRail({ current }: { current: WizardStep }) {
  const currentIndex = WIZARD_STEPS.indexOf(current);
  return (
    <ol className="flex items-center gap-2">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold tabular-nums transition-colors
                ${active ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : done ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`text-[11.5px] font-medium ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>
              {STEP_LABELS[s]}
            </span>
            {i < WIZARD_STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-slate-200 dark:bg-slate-700" />}
          </li>
        );
      })}
    </ol>
  );
}

export function KpiImportWizard({ open, onOpenChange, existingKpis, onImported }: Props) {
  const { tenantId, user } = useAuthContext() as { tenantId?: string; user?: { id: string; email?: string; name?: string } };
  const [step, setStep] = useState<WizardStep>('upload');
  const [table, setTable] = useState<GenericTable | null>(null);
  const [metadata, setMetadata] = useState<ColumnMetadata[]>([]);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [dryRun, setDryRun] = useState<ResolvedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload'); setTable(null); setMetadata([]); setMapping(null);
    setPlan(null); setPreview(null); setDryRun(null); setFileName(''); setDragOver(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const t = await GenericImportService.readGenericTable(file);
      if (t.rows.length === 0) {
        toast.error('Nenhuma linha de dados reconhecida na planilha. Confira se há um cabeçalho e linhas abaixo dele.');
        return;
      }
      const meta = discoverMetadata(t);
      // Ano corrente p/ reconhecer colunas de mês SEM ano ("Janeiro", "Jan").
      const m = suggestMapping(t, meta, new Date().getFullYear());
      setTable(t); setMetadata(meta); setMapping(m); setFileName(file.name); setStep('preview');
    } catch (e) {
      // Mostra a causa real (antes era engolida por um catch vazio) para o gestor
      // conseguir agir (arquivo corrompido, formato não suportado, etc.).
      console.error('[KpiImportWizard] falha ao ler a planilha:', e);
      toast.error(e instanceof Error ? `Erro ao ler a planilha: ${e.message}` : 'Erro ao ler a planilha.');
    } finally { setBusy(false); }
  };

  const actor = { id: user?.id || '', name: user?.name || user?.email || 'Gestor' };

  // [Task 14c] mapeamento → dry-run (congela o Preview p/ auditoria) → importação.
  const runDryRun = async () => {
    if (!table || !mapping) return;
    if (!tenantId || tenantId === 'owner') { toast.error('Selecione uma imobiliária para importar.'); return; }
    const p = buildImportPlan(table, mapping);
    const pv = buildPreview(table, metadata, mapping, p); // interpretação auditável
    setPlan(p); setPreview(pv);
    setBusy(true);
    try {
      // dry-run puro (sem banco): só calcula o plano que SERIA gravado.
      const resolved = await persistImport({ plan: p, mapping: { target: mapping.target }, preview: pv, tenantId, actor, fileName, sheetName: table.sheetName, dryRun: true, existingKpis });
      setDryRun(resolved);
      setStep('importacao'); // só avança quando a prévia está pronta
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao pré-visualizar a importação.');
    } finally { setBusy(false); }
  };

  const confirmImport = async () => {
    if (!table || !mapping || !plan || !preview) return;
    if (!tenantId || tenantId === 'owner') { toast.error('Selecione uma imobiliária para importar.'); return; }
    setBusy(true);
    try {
      // Persiste a interpretação do Preview junto (kpi_import_batches.preview).
      await persistImport({ plan, mapping: { target: mapping.target }, preview, tenantId, actor, fileName, sheetName: table.sheetName, dryRun: false, existingKpis });
      // Diz QUAIS meses foram importados — o dashboard abre no mês atual, então
      // valores de meses passados só aparecem ao navegar até aquele mês.
      const range = periodRangeLabel(plan.rows.map((r) => r.periodStart));
      const tipo = mapping.target === 'value' ? 'Valores' : 'Metas';
      toast.success(
        range ? `${tipo} importados (${range}). Navegue até o mês no dashboard para vê-los.`
              : 'Importação concluída.',
      );
      onImported?.();        // revalida a lista de KPIs (sem F5)
      reset(); onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao importar'); } finally { setBusy(false); }
  };

  const periods = mapping?.periodColumns ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-3 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" /> Importar metas de planilha
          </DialogTitle>
          <StepRail current={step} />
        </DialogHeader>

        <div className="px-6 py-5">
          {/* ---------- Passo 1: upload (dropzone) ---------- */}
          {step === 'upload' && (
            <div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors
                  ${dragOver
                    ? 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-600 dark:bg-emerald-950/30'
                    : 'border-slate-300 bg-slate-50/60 hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-900/40'}`}
              >
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400">
                  {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
                </div>
                <p className="text-[13.5px] font-semibold text-slate-700 dark:text-slate-200">
                  {busy ? 'Lendo a planilha…' : 'Arraste a planilha aqui'}
                </p>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  ou <span className="font-medium text-emerald-600 dark:text-emerald-400">clique para escolher</span> · XLSX, XLS ou CSV
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                />
              </div>
              <p className="mt-3 text-center text-[11.5px] text-slate-400">
                A planilha pode ter colunas em qualquer ordem — os cabeçalhos são reconhecidos automaticamente.
              </p>
            </div>
          )}

          {/* ---------- Passo 2: conferir (preview) ---------- */}
          {step === 'preview' && table && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="truncate text-[12.5px] font-medium text-slate-700 dark:text-slate-200">{fileName || table.sheetName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Stat icon={<Table2 className="h-4 w-4" />} value={table.totalRows} label="linhas" />
                <Stat icon={<Table2 className="h-4 w-4" />} value={table.columns.length} label="colunas" />
                <Stat icon={<CalendarRange className="h-4 w-4" />} value={periods.length} label="períodos" />
              </div>
              <DetailRow icon={<KeyRound className="h-3.5 w-3.5" />} label="Coluna de KPI">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11.5px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {mapping?.kpiNameColumn || '—'}
                </span>
              </DetailRow>
              <DetailRow icon={<CalendarRange className="h-3.5 w-3.5" />} label="Períodos detectados">
                {periods.length === 0
                  ? <span className="text-[11.5px] text-amber-600 dark:text-amber-400">nenhum reconhecido</span>
                  : <div className="flex flex-wrap gap-1">
                      {periods.map((p) => (
                        <span key={p.column} className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
                          {p.column}
                        </span>
                      ))}
                    </div>}
              </DetailRow>
            </div>
          )}

          {/* ---------- Passo 3: mapear (Metas vs. Realizado) ---------- */}
          {step === 'mapeamento' && mapping && (
            <div>
              <p className="mb-3 text-[12.5px] text-slate-600 dark:text-slate-300">O que estes números representam?</p>
              <div className="grid grid-cols-2 gap-2.5">
                <ChoiceCard
                  active={mapping.target === 'target'}
                  onClick={() => setMapping({ ...mapping, target: 'target' })}
                  icon={<Target className="h-4 w-4" />}
                  title="Metas"
                  desc="O alvo a atingir em cada período."
                />
                <ChoiceCard
                  active={mapping.target === 'value'}
                  onClick={() => setMapping({ ...mapping, target: 'value' })}
                  icon={<TrendingUp className="h-4 w-4" />}
                  title="Realizado"
                  desc="O valor efetivamente alcançado."
                />
              </div>
            </div>
          )}

          {/* ---------- Passo 4: importar (resumo do dry-run) ---------- */}
          {step === 'importacao' && (
            <div className="space-y-3">
              {!dryRun ? (
                <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculando prévia…
                </div>
              ) : (
                <>
                  <p className="text-[12.5px] text-slate-600 dark:text-slate-300">Confira antes de gravar. Nada é salvo até confirmar.</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    <Stat icon={<Plus className="h-4 w-4" />} value={dryRun.creates.length} label="KPIs novos" accent="emerald" />
                    <Stat icon={<Check className="h-4 w-4" />} value={dryRun.updates.length} label={mapping?.target === 'value' ? 'realizados' : 'metas'} accent="sky" />
                    <Stat icon={<Table2 className="h-4 w-4" />} value={dryRun.ignored.length} label="ignoradas" />
                  </div>
                  {plan && plan.warnings.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                      {plan.warnings.slice(0, 5).map((w, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-[11.5px] text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {w}
                        </p>
                      ))}
                      {plan.warnings.length > 5 && (
                        <p className="pl-5 text-[11px] text-amber-600 dark:text-amber-400">… e mais {plan.warnings.length - 5} aviso(s).</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-3 dark:border-slate-800">
          {step !== 'upload' && step !== 'importacao' && (
            <Button variant="outline" onClick={() => setStep(prevStep(step))}>Voltar</Button>
          )}
          {step === 'preview' && <Button onClick={() => setStep('mapeamento')}>Avançar</Button>}
          {step === 'mapeamento' && (
            <Button onClick={runDryRun} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Pré-visualizar importação
            </Button>
          )}
          {step === 'importacao' && (
            <Button onClick={confirmImport} disabled={busy || !dryRun} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Confirmar importação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Tile de métrica (linhas/colunas/períodos, ou resumo do dry-run). */
function Stat({ icon, value, label, accent = 'slate' }: {
  icon: React.ReactNode; value: number | string; label: string; accent?: 'slate' | 'emerald' | 'sky';
}) {
  const tone =
    accent === 'emerald' ? 'text-emerald-500'
    : accent === 'sky' ? 'text-sky-500'
    : 'text-slate-400';
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className={`mb-1 ${tone}`}>{icon}</div>
      <div className="text-[18px] font-bold leading-none tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
      <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

/** Linha rótulo→conteúdo do preview. */
function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex w-36 shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-slate-400">{icon} {label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Cartão de escolha (Metas vs. Realizado). */
function ChoiceCard({ active, onClick, icon, title, desc }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors
        ${active
          ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900 dark:border-slate-100 dark:bg-slate-800/60 dark:ring-slate-100'
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'}`}
    >
      <div className="flex items-center gap-2">
        <span className={active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}>{icon}</span>
        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        {active && <Check className="ml-auto h-4 w-4 text-emerald-500" />}
      </div>
      <p className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">{desc}</p>
    </button>
  );
}
