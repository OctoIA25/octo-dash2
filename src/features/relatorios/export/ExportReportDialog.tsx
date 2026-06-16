/**
 * Modal de configuração da exportação de relatórios.
 *
 * Recebe um `ReportModel` (montado a partir dos dados já calculados da página),
 * apresenta as seções agrupadas com checkboxes, deixa o usuário escolher o
 * formato e dispara o gerador correspondente. Componente "burro": não conhece
 * os dados, só o modelo.
 */

import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import type { ExportFormat, ReportModel, ExportSelection } from './types';
import { generatePdf } from './generators/pdfReportGenerator';
import { generateXlsx } from './generators/excelReportGenerator';

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ReportModel;
}

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; icon: typeof FileText }> = [
  { value: 'pdf', label: 'PDF', icon: FileText },
  { value: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
];

function buildInitialSelection(model: ReportModel): ExportSelection {
  return Object.fromEntries(model.sections.map((s) => [s.id, true]));
}

export function ExportReportDialog({ open, onOpenChange, model }: ExportReportDialogProps) {
  const [selection, setSelection] = useState<ExportSelection>(() => buildInitialSelection(model));
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [isGenerating, setIsGenerating] = useState(false);

  // Reinicia a seleção sempre que o modelo muda de identidade (ex.: troca de sub-área).
  const modelKey = useMemo(() => model.sections.map((s) => s.id).join('|'), [model]);
  const [lastKey, setLastKey] = useState(modelKey);
  if (modelKey !== lastKey) {
    setLastKey(modelKey);
    setSelection(buildInitialSelection(model));
  }

  const groupedSections = useMemo(
    () =>
      model.groups
        .map((group) => ({
          group,
          sections: model.sections.filter((s) => s.group === group.id),
        }))
        .filter((entry) => entry.sections.length > 0),
    [model],
  );

  const selectedCount = useMemo(
    () => model.sections.filter((s) => selection[s.id]).length,
    [model.sections, selection],
  );

  const setSection = (id: string, value: boolean) =>
    setSelection((prev) => ({ ...prev, [id]: value }));

  const setGroup = (groupId: string, value: boolean) =>
    setSelection((prev) => {
      const next = { ...prev };
      model.sections.filter((s) => s.group === groupId).forEach((s) => {
        next[s.id] = value;
      });
      return next;
    });

  const setAll = (value: boolean) =>
    setSelection(Object.fromEntries(model.sections.map((s) => [s.id, value])));

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      if (format === 'pdf') {
        await generatePdf(model, selection);
      } else {
        await generateXlsx(model, selection);
      }
      toast.success('Relatório exportado com sucesso.');
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao exportar relatório:', error);
      toast.error('Não foi possível gerar o relatório. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Exportar Relatório</DialogTitle>
          <DialogDescription>
            Selecione as informações e o formato. Apenas os blocos marcados serão incluídos.
          </DialogDescription>
        </DialogHeader>

        {/* Seletor de formato */}
        <div className="px-6 pt-4">
          <Label className="text-xs font-medium text-muted-foreground">Formato</Label>
          <div className="mt-2 inline-flex rounded-lg border bg-muted/40 p-1">
            {FORMAT_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormat(value)}
                aria-pressed={format === value}
                className={cn(
                  'flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                  format === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Ações globais */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <Label className="text-xs font-medium text-muted-foreground">Conteúdo</Label>
          <div className="flex items-center gap-3 text-xs">
            <button type="button" onClick={() => setAll(true)} className="font-medium text-primary hover:underline">
              Selecionar tudo
            </button>
            <span className="text-border">|</span>
            <button type="button" onClick={() => setAll(false)} className="font-medium text-primary hover:underline">
              Limpar
            </button>
          </div>
        </div>

        {/* Lista de seções agrupadas — região rolável.
            `flex-1 min-h-0` dá altura limitada ao container num flex-col (min-h-0
            permite encolher); `overflow-y-auto` faz o scroll interno de forma nativa
            e confiável (sem depender da resolução de altura do Viewport do Radix). */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-5 py-4">
            {groupedSections.map(({ group, sections }) => {
              const allChecked = sections.every((s) => selection[s.id]);
              const someChecked = sections.some((s) => selection[s.id]);
              return (
                <div key={group.id} className="rounded-lg border">
                  <label className="flex items-center gap-2.5 border-b bg-muted/30 px-3 py-2.5 cursor-pointer">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                      onCheckedChange={(value) => setGroup(group.id, value === true)}
                    />
                    <span className="text-sm font-semibold">{group.title}</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 p-3">
                    {sections.map((section) => (
                      <label
                        key={section.id}
                        htmlFor={`export-${section.id}`}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`export-${section.id}`}
                          checked={!!selection[section.id]}
                          onCheckedChange={(value) => setSection(section.id, value === true)}
                        />
                        <span className="text-sm text-foreground">{section.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-3 border-t px-6 py-4 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selectedCount} {selectedCount === 1 ? 'seção selecionada' : 'seções selecionadas'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
              Cancelar
            </Button>
            <Button onClick={handleGenerate} disabled={selectedCount === 0 || isGenerating}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar {format === 'pdf' ? 'PDF' : 'Excel'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
