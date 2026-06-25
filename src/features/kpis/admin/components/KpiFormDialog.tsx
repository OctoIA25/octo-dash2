import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createEmptyKpiDraft, kpiToDraft } from '@/features/kpis/domain/kpiFactory';
import { validateKpiDraft } from '@/features/kpis/domain/kpiModel';
import { NATIVE_METRIC_KEYS, METRIC_KEY_LABELS } from '@/features/kpis/domain/kpiTypes';
import type { DashboardKpi, DashboardKpiDraft, KpiSource, KpiUnit } from '@/features/kpis/domain/kpiTypes';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; kpi: DashboardKpi | null; isSubmitting: boolean; onSubmit: (d: DashboardKpiDraft) => Promise<void>; }

export function KpiFormDialog({ open, onOpenChange, kpi, isSubmitting, onSubmit }: Props) {
  const [draft, setDraft] = useState<DashboardKpiDraft>(() => createEmptyKpiDraft());
  useEffect(() => { if (open) setDraft(kpi ? kpiToDraft(kpi) : createEmptyKpiDraft()); }, [open, kpi]);
  const update = (patch: Partial<DashboardKpiDraft>) => setDraft((c) => ({ ...c, ...patch }));

  const changeSource = (source: KpiSource) =>
    update({ source, metricKey: source === 'crm' ? (draft.metricKey ?? NATIVE_METRIC_KEYS[0]) : null });

  const handleSubmit = async () => {
    const errors = validateKpiDraft(draft);
    if (errors.length) { toast.error(errors[0]); return; }
    await onSubmit(draft);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{kpi ? 'Editar KPI' : 'Novo KPI'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="kpi-nome">Nome</Label><Input id="kpi-nome" value={draft.name} onChange={(e) => update({ name: e.target.value })} /></div>
          <div><Label htmlFor="kpi-desc">Descrição</Label><Textarea id="kpi-desc" value={draft.description} onChange={(e) => update({ description: e.target.value })} /></div>
          <div><Label htmlFor="kpi-cat">Categoria</Label><Input id="kpi-cat" value={draft.categoryId} onChange={(e) => update({ categoryId: e.target.value })} /></div>
          <div>
            <Label>Unidade</Label>
            <Select value={draft.unit} onValueChange={(v) => update({ unit: v as KpiUnit })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="count">Quantidade</SelectItem>
                <SelectItem value="currency">Moeda</SelectItem>
                <SelectItem value="percent">Percentual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Origem dos dados</Label>
            <Select value={draft.source} onValueChange={(v) => changeSource(v as KpiSource)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="crm">CRM (calculado)</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="planilha">Planilha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.source === 'crm' && (
            <div>
              <Label>Métrica do CRM</Label>
              <Select value={draft.metricKey ?? ''} onValueChange={(v) => update({ metricKey: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a métrica" /></SelectTrigger>
                <SelectContent>{NATIVE_METRIC_KEYS.map((m) => <SelectItem key={m} value={m}>{METRIC_KEY_LABELS[m]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
