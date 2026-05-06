import { useState, useEffect } from 'react';
import { FileSpreadsheet, Trash2, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExcelUpload } from '../components/ExcelUpload';
import { ExcelImportService } from '../services/excelImportService';
import { ExcelUploadResult } from '../types';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';

interface ExcelImportData {
    id: string;
    corretor_nome: string;
    corretor_nivel?: string;
    equipe?: string;
    janeiro: number;
    fevereiro: number;
    marco: number;
    abril: number;
    maio: number;
    junho: number;
    julho: number;
    agosto: number;
    setembro: number;
    outubro: number;
    novembro: number;
    dezembro: number;
    total_mensal: number;
    valor_total: number;
    ano_referencia: number;
    nome_arquivo?: string;
}

const meses = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export function ExcelPage() {
    const { tenantId } = useAuthContext();
    const [data, setData] = useState<ExcelImportData[]>([]);
    const [anos, setAnos] = useState<number[]>([]);
    const [anoSelecionado, setAnoSelecionado] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            if (!tenantId || tenantId === 'owner') {
                setAnos([]);
                setData([]);
                setAnoSelecionado(null);
                return;
            }

            const anosDisponiveis = await ExcelImportService.getDistinctAnos(tenantId);
            setAnos(anosDisponiveis);

            const anoValido = anoSelecionado && anosDisponiveis.includes(anoSelecionado)
                ? anoSelecionado
                : anosDisponiveis[0] ?? null;

            if (anoValido !== anoSelecionado) {
                setAnoSelecionado(anoValido);
                if (!anoValido) setData([]);
                return;
            }

            if (anoValido) {
                const imports = await ExcelImportService.getExcelImports(tenantId, anoValido);
                setData(imports);
            } else {
                setData([]);
            }
        } catch (error) {
            toast.error('Erro ao carregar dados');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [anoSelecionado, tenantId]);

    const handleImportComplete = (result: ExcelUploadResult) => {
        if (result.anoReferencia && result.anoReferencia !== anoSelecionado) {
            setAnoSelecionado(result.anoReferencia);
            return;
        }

        loadData();
    };

    const handleDelete = async (id: string) => {
        if (!tenantId || tenantId === 'owner') {
            toast.error('Tenant nao selecionado');
            return;
        }

        try {
            await ExcelImportService.deleteExcelImport(id, tenantId);
            toast.success('Registro deletado');
            loadData();
        } catch (error) {
            toast.error('Erro ao deletar registro');
            console.error(error);
        }
    };

    const handleExportCSV = () => {
        if (data.length === 0) return;

        const headers = ['Corretor', 'Nível', 'Equipe', ...meses, 'Total Mensal', 'Valor Total'];
        const rows = data.map(row => [
            row.corretor_nome,
            row.corretor_nivel || '',
            row.equipe || '',
            row.janeiro,
            row.fevereiro,
            row.marco,
            row.abril,
            row.maio,
            row.junho,
            row.julho,
            row.agosto,
            row.setembro,
            row.outubro,
            row.novembro,
            row.dezembro,
            row.total_mensal,
            row.valor_total
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `excel_export_${anoSelecionado}.csv`;
        link.click();
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <FileSpreadsheet className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Importação Excel</h1>
                                <p className="text-sm text-gray-500">Importe e visualize seus dados em formato profissional</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Select
                                value={anoSelecionado?.toString() || ''}
                                onValueChange={(value) => setAnoSelecionado(Number(value))}
                                disabled={anos.length === 0}
                            >
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="Ano" />
                                </SelectTrigger>
                                <SelectContent>
                                    {anos.map((ano) => (
                                        <SelectItem key={ano} value={ano.toString()}>
                                            {ano}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                onClick={loadData}
                                disabled={loading}
                                className="hover:bg-gray-50"
                            >
                                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                                Atualizar
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleExportCSV}
                                disabled={data.length === 0}
                                className="hover:bg-gray-50"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Exportar CSV
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <ExcelUpload
                            onImportComplete={handleImportComplete}
                        />
                    </div>

                    <div className="lg:col-span-2">
                        <Card className="border-0 shadow-lg">
                            <CardContent className="p-0">
                            {loading ? (
                                <div className="text-center py-8 text-gray-500">
                                    Carregando dados...
                                </div>
                            ) : data.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    Nenhum dado importado ainda
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs border-collapse" style={{ fontFamily: 'Arial, sans-serif' }}>
                                        <thead>
                                            <tr className="bg-[#D3D3D3] text-black">
                                                <th className="border border-black p-1 font-bold text-left whitespace-nowrap bg-[#D3D3D3]">Corretor</th>
                                                <th className="border border-black p-1 font-bold text-left whitespace-nowrap bg-[#D3D3D3]">Nível</th>
                                                <th className="border border-black p-1 font-bold text-left whitespace-nowrap bg-[#D3D3D3]">Equipe</th>
                                                {meses.map(mes => (
                                                    <th key={mes} className="border border-black p-1 font-bold text-right whitespace-nowrap min-w-[70px] bg-[#D3D3D3]">
                                                        {mes}
                                                    </th>
                                                ))}
                                                <th className="border border-black p-1 font-bold text-right whitespace-nowrap min-w-[70px] bg-[#D3D3D3]">Total</th>
                                                <th className="border border-black p-1 font-bold text-right whitespace-nowrap min-w-[90px] bg-[#D3D3D3]">Valor Total</th>
                                                <th className="border border-black p-1 font-bold text-center whitespace-nowrap min-w-[50px] bg-[#D3D3D3]">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.map((row, index) => (
                                                <tr 
                                                    key={row.id} 
                                                    className="hover:bg-[#E7E6E6] cursor-pointer"
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E7E6E6'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}
                                                >
                                                    <td className="border border-black p-1 font-medium whitespace-nowrap">{row.corretor_nome}</td>
                                                    <td className="border border-black p-1 whitespace-nowrap">{row.corretor_nivel || ''}</td>
                                                    <td className="border border-black p-1 whitespace-nowrap">{row.equipe || ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.janeiro ? formatCurrency(row.janeiro) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.fevereiro ? formatCurrency(row.fevereiro) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.marco ? formatCurrency(row.marco) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.abril ? formatCurrency(row.abril) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.maio ? formatCurrency(row.maio) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.junho ? formatCurrency(row.junho) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.julho ? formatCurrency(row.julho) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.agosto ? formatCurrency(row.agosto) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.setembro ? formatCurrency(row.setembro) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.outubro ? formatCurrency(row.outubro) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.novembro ? formatCurrency(row.novembro) : ''}</td>
                                                    <td className="border border-black p-1 text-right">{row.dezembro ? formatCurrency(row.dezembro) : ''}</td>
                                                    <td className="border border-black p-1 text-right font-bold bg-[#E7E6E6]">{row.total_mensal || 0}</td>
                                                    <td className="border border-black p-1 text-right font-bold bg-[#D3D3D3]">
                                                        {formatCurrency(row.valor_total || 0)}
                                                    </td>
                                                    <td className="border border-black p-1 text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDelete(row.id)}
                                                            className="h-6 w-6 p-0 hover:bg-red-100"
                                                        >
                                                            <Trash2 className="w-3 h-3 text-red-600" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
        </div>
    );
}
