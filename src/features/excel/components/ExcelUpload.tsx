import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircle, CheckCircle, FileSpreadsheet, RefreshCw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ExcelColumnOption, ExcelService } from '../services/excelService';
import { ExcelImportService } from '../services/excelImportService';
import { ExcelRow, ExcelUploadResult } from '../types';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';

interface ExcelUploadProps {
  onImportComplete?: (result: ExcelUploadResult) => void;
}

export function ExcelUpload({ onImportComplete }: ExcelUploadProps) {
  const { user, tenantId } = useAuthContext();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [anoReferencia, setAnoReferencia] = useState(new Date().getFullYear());
  const [preview, setPreview] = useState<ExcelRow[]>([]);
  const [columnOptions, setColumnOptions] = useState<ExcelColumnOption[]>([]);
  const [equipeColumn, setEquipeColumn] = useState(16);
  const [valorVendaColumn, setValorVendaColumn] = useState(21);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectedFile = (selectedFile: File) => {
    setFile(selectedFile);
    previewFile(selectedFile);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      handleSelectedFile(selectedFile);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const selectedFile = event.dataTransfer.files?.[0];
    if (selectedFile) {
      handleSelectedFile(selectedFile);
    }
  };

  const previewFile = async (nextFile: File) => {
    try {
      const columns = await ExcelService.getColumnOptions(nextFile);
      setColumnOptions(columns);

      const rows = await ExcelService.readExcelFile(nextFile, {
        equipeColumn,
        valorVendaColumn,
      });
      setPreview(rows.slice(0, 5));
    } catch (error) {
      toast.error('Erro ao ler arquivo Excel');
      console.error(error);
    }
  };

  const refreshPreview = async (nextEquipeColumn = equipeColumn, nextValorVendaColumn = valorVendaColumn) => {
    if (!file) return;

    try {
      const rows = await ExcelService.readExcelFile(file, {
        equipeColumn: nextEquipeColumn,
        valorVendaColumn: nextValorVendaColumn,
      });
      setPreview(rows.slice(0, 5));
    } catch (error) {
      toast.error('Erro ao atualizar preview');
      console.error(error);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Selecione um arquivo Excel');
      return;
    }

    if (!tenantId || tenantId === 'owner') {
      toast.error('Selecione uma imobiliaria antes de importar');
      return;
    }

    if (!user?.id) {
      toast.error('Usuario nao identificado');
      return;
    }

    if (!Number.isInteger(anoReferencia) || anoReferencia < 1900 || anoReferencia > 2100) {
      toast.error('Informe um ano de referencia valido');
      return;
    }

    setLoading(true);
    try {
      const rows = await ExcelService.readExcelFile(file, {
        equipeColumn,
        valorVendaColumn,
      });
      if (rows.length === 0) {
        toast.error('Nenhum registro valido encontrado na planilha');
        return;
      }

      const result = await ExcelImportService.importExcelData(
        rows,
        tenantId,
        file.name,
        user.id,
        anoReferencia,
      );

      if (result.success) {
        toast.success(`Importado com sucesso! ${result.imported} registros`);
        setFile(null);
        setPreview([]);
        setColumnOptions([]);
        onImportComplete?.(result);
      } else {
        toast.error(result.errors[0] || `Erros na importacao: ${result.errors.length}`);
      }
    } catch (error) {
      toast.error('Erro ao importar arquivo');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreview([]);
    setColumnOptions([]);
    setEquipeColumn(16);
    setValorVendaColumn(21);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0);
  };

  return (
    <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Importar planilha</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">XLS ou XLSX com colunas mapeadas.</p>
          </div>
        </div>
      </div>

      <CardContent className="space-y-4 p-4">
        <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
          <span>Ano de referencia</span>
          <Input
            type="number"
            value={Number.isFinite(anoReferencia) ? anoReferencia : ''}
            onChange={(event) => setAnoReferencia(event.target.value === '' ? NaN : Number(event.target.value))}
            min={2020}
            max={2030}
            className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          />
        </label>

        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Solte o arquivo aqui</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">ou selecione uma planilha no seu computador</p>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Upload className="mr-2 h-4 w-4" />
              Selecionar arquivo
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/25">
              <div className="flex min-w-0 items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{file.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 w-8 shrink-0 p-0 text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:hover:bg-slate-900"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {columnOptions.length > 0 && (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <AlertCircle className="h-4 w-4" />
                  Confira o mapeamento antes de importar.
                </div>

                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <span>Coluna da equipe</span>
                  <select
                    value={equipeColumn}
                    onChange={(event) => {
                      const nextColumn = Number(event.target.value);
                      setEquipeColumn(nextColumn);
                      refreshPreview(nextColumn, valorVendaColumn);
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {columnOptions.map((column) => (
                      <option key={column.index} value={column.index}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <span>Coluna do valor</span>
                  <select
                    value={valorVendaColumn}
                    onChange={(event) => {
                      const nextColumn = Number(event.target.value);
                      setValorVendaColumn(nextColumn);
                      refreshPreview(equipeColumn, nextColumn);
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {columnOptions.map((column) => (
                      <option key={column.index} value={column.index}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {preview.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Corretor</th>
                          <th className="px-3 py-2 text-left font-semibold">Nivel</th>
                          <th className="px-3 py-2 text-left font-semibold">Equipe</th>
                          <th className="px-3 py-2 text-right font-semibold">Jan</th>
                          <th className="px-3 py-2 text-right font-semibold">Fev</th>
                          <th className="px-3 py-2 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {preview.map((row, index) => (
                          <tr key={`${row.corretor}-${index}`} className="bg-white dark:bg-slate-900">
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.corretor}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.nivel || '-'}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.equipe || '-'}</td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{formatCurrency(row.janeiro || 0)}</td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{formatCurrency(row.fevereiro || 0)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(row.valor_total || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={loading}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar dados
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
