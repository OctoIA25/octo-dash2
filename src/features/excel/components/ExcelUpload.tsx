import { useState } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            previewFile(selectedFile);
        }
    };

    const previewFile = async (file: File) => {
        try {
            const columns = await ExcelService.getColumnOptions(file);
            setColumnOptions(columns);

            const rows = await ExcelService.readExcelFile(file, {
                equipeColumn,
                valorVendaColumn,
            });
            setPreview(rows.slice(0, 5)); // Mostrar apenas primeiras 5 linhas
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
                anoReferencia
            );

            if (result.success) {
                toast.success(`Importado com sucesso! ${result.imported} registros`);
                setFile(null);
                setPreview([]);
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
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5" />
                    Importar Planilha Excel
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Ano de Referência</label>
                    <Input
                        type="number"
                        value={Number.isFinite(anoReferencia) ? anoReferencia : ''}
                        onChange={(e) => setAnoReferencia(e.target.value === '' ? NaN : Number(e.target.value))}
                        min={2020}
                        max={2030}
                    />
                </div>

                {!file ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
                        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                        <p className="text-sm text-gray-600 mb-4">
                            Arraste e solte o arquivo Excel ou clique para selecionar
                        </p>
                        <Input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="max-w-xs mx-auto"
                        />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <FileSpreadsheet className="w-8 h-8 text-green-600" />
                                <div>
                                    <p className="font-medium">{file.name}</p>
                                    <p className="text-sm text-gray-500">
                                        {(file.size / 1024).toFixed(2)} KB
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClear}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        {columnOptions.length > 0 && (
                            <div className="grid grid-cols-1 gap-3">
                                <label className="space-y-1 text-sm font-medium">
                                    <span>Coluna da equipe</span>
                                    <select
                                        value={equipeColumn}
                                        onChange={(event) => {
                                            const nextColumn = Number(event.target.value);
                                            setEquipeColumn(nextColumn);
                                            refreshPreview(nextColumn, valorVendaColumn);
                                        }}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        {columnOptions.map((column) => (
                                            <option key={column.index} value={column.index}>
                                                {column.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="space-y-1 text-sm font-medium">
                                    <span>Coluna do valor</span>
                                    <select
                                        value={valorVendaColumn}
                                        onChange={(event) => {
                                            const nextColumn = Number(event.target.value);
                                            setValorVendaColumn(nextColumn);
                                            refreshPreview(equipeColumn, nextColumn);
                                        }}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                                <p className="text-sm font-medium">Preview (primeiras 5 linhas):</p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b">
                                                <th className="text-left p-2">Corretor</th>
                                                <th className="text-left p-2">Nível</th>
                                                <th className="text-left p-2">Equipe</th>
                                                <th className="text-right p-2">Jan</th>
                                                <th className="text-right p-2">Fev</th>
                                                <th className="text-right p-2">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.map((row, idx) => (
                                                <tr key={idx} className="border-b">
                                                    <td className="p-2">{row.corretor}</td>
                                                    <td className="p-2">{row.nivel || '-'}</td>
                                                    <td className="p-2">{row.equipe || '-'}</td>
                                                    <td className="p-2 text-right">
                                                        {row.janeiro || 0}
                                                    </td>
                                                    <td className="p-2 text-right">
                                                        {row.fevereiro || 0}
                                                    </td>
                                                    <td className="p-2 text-right font-medium">
                                                        {row.valor_total || 0}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <Button
                            onClick={handleImport}
                            disabled={loading}
                            className="w-full"
                        >
                            {loading ? 'Importando...' : 'Importar Dados'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
