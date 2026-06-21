import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { FileSpreadsheet, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import { GenericImportService, type GenericImportRecord } from '../services/genericImportService';
import { GenericReportView } from '../components/GenericReportView';
import type { GenericReport } from '../types';

type HistoryItem = Omit<GenericImportRecord, 'rows'>;

export function GenericImportPage() {
  const { user, tenantId } = useAuthContext();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<GenericReport | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tenantReady = Boolean(tenantId && tenantId !== 'owner');

  const loadHistory = useCallback(async () => {
    if (!tenantReady) {
      setHistory([]);
      return;
    }
    const items = await GenericImportService.list(tenantId as string);
    setHistory(items);
  }, [tenantId, tenantReady]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setProcessing(true);
    try {
      const result = await GenericImportService.buildReport(selectedFile);
      setReport(result);
      if (result.table.rows.length === 0) {
        toast.warning('Nenhuma linha de dados reconhecida na planilha.');
      }
    } catch (error) {
      toast.error('Erro ao processar a planilha');
      console.error(error);
      setReport(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) processFile(selected);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const selected = event.dataTransfer.files?.[0];
    if (selected) processFile(selected);
  };

  const handleSave = async () => {
    if (!report || !file) return;
    if (!tenantReady) {
      toast.error('Selecione uma imobiliaria antes de salvar');
      return;
    }
    if (!user?.id) {
      toast.error('Usuario nao identificado');
      return;
    }

    setSaving(true);
    try {
      await GenericImportService.save(report, tenantId as string, file.name, user.id);
      toast.success('Importacao salva');
      await loadHistory();
    } catch (error) {
      toast.error('Erro ao salvar importacao');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async (id: string) => {
    if (!tenantReady) return;
    setProcessing(true);
    try {
      const record = await GenericImportService.getById(id, tenantId as string);
      if (!record) {
        toast.error('Importacao nao encontrada');
        return;
      }
      setFile(null);
      setReport({
        table: {
          sheetName: record.sheet_name ?? '',
          columns: record.columns,
          rows: record.rows,
          totalRows: record.total_rows,
          truncated: record.truncated,
        },
        metadata: record.metadata,
        insights: [],
      });
    } catch (error) {
      toast.error('Erro ao abrir importacao');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenantReady) return;
    try {
      await GenericImportService.remove(id, tenantId as string);
      toast.success('Importacao removida');
      await loadHistory();
    } catch (error) {
      toast.error('Erro ao remover');
      console.error(error);
    }
  };

  const handleClear = () => {
    setFile(null);
    setReport(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-full bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <div className="mx-auto flex min-w-0 max-w-[1600px] flex-col gap-5">
        <header className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Importacao de planilhas
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Importacao de Planilhas Excel
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Aceita planilhas de qualquer tema. As colunas e tipos sao descobertos automaticamente.
          </p>
        </header>

        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <CardContent className="space-y-4 p-4">
                {!file && !report ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(event) => event.preventDefault()}
                    className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
                      <FileSpreadsheet className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Solte o arquivo aqui</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">XLS, XLSX ou CSV</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Selecionar arquivo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <p className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {file?.name ?? 'Importacao salva'}
                      </p>
                      <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 w-7 shrink-0 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {file && (
                      <Button
                        onClick={handleSave}
                        disabled={saving || processing || !report || report.table.rows.length === 0}
                        className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Salvar importacao
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Historico</h2>
              </div>
              <CardContent className="p-2">
                {history.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    Nenhuma importacao salva ainda.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {history.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <button
                          type="button"
                          onClick={() => handleOpen(item.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                            {item.nome_arquivo ?? 'Sem nome'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {item.total_rows} linhas · {item.columns.length} colunas
                          </p>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          className="h-7 w-7 shrink-0 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 overflow-hidden">
            {processing ? (
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <CardContent className="flex min-h-[300px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Processando planilha...
                </CardContent>
              </Card>
            ) : report ? (
              <GenericReportView report={report} />
            ) : (
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <CardContent className="flex min-h-[300px] flex-col items-center justify-center text-center">
                  <FileSpreadsheet className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Nenhuma planilha carregada</p>
                  <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                    Envie um arquivo para ver as colunas, tipos e dados detectados automaticamente.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
