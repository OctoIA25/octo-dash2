import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const monthFields = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

export function ExcelPage() {
  const { tenantId } = useAuthContext();
  const [data, setData] = useState<ExcelImportData[]>([]);
  const [anos, setAnos] = useState<number[]>([]);
  const [anoSelecionado, setAnoSelecionado] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
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
  }, [anoSelecionado, tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const valorTotal = data.reduce((sum, row) => sum + Number(row.valor_total || 0), 0);
    const totalVendas = data.reduce((sum, row) => sum + Number(row.total_mensal || 0), 0);
    const equipes = new Set(data.map((row) => row.equipe).filter(Boolean)).size;

    return {
      corretores: data.length,
      equipes,
      totalVendas,
      valorTotal,
    };
  }, [data]);

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

    const headers = ['Corretor', 'Nivel', 'Equipe', ...meses, 'Total Mensal', 'Valor Total'];
    const rows = data.map((row) => [
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
      row.valor_total,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
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
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="min-h-full bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Gestao de planilhas
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              Importacao Excel
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Importe metas e vendas por corretor, acompanhe totais por ano e exporte a base tratada.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={anoSelecionado?.toString() || ''}
              onValueChange={(value) => setAnoSelecionado(Number(value))}
              disabled={anos.length === 0}
            >
              <SelectTrigger className="w-full border-slate-200 bg-white sm:w-[128px] dark:border-slate-800 dark:bg-slate-900">
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
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={data.length === 0}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} label="Corretores" value={metrics.corretores.toLocaleString('pt-BR')} />
          <MetricCard icon={BarChart3} label="Equipes" value={metrics.equipes.toLocaleString('pt-BR')} />
          <MetricCard icon={TrendingUp} label="Total mensal" value={metrics.totalVendas.toLocaleString('pt-BR')} />
          <MetricCard icon={CalendarDays} label="Valor total" value={formatCurrency(metrics.valorTotal)} />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <ExcelUpload onImportComplete={handleImportComplete} />

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Dados importados</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {anoSelecionado ? `Registros de ${anoSelecionado}` : 'Selecione ou importe um ano para visualizar'}
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {data.length} registro{data.length === 1 ? '' : 's'}
              </span>
            </div>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  Carregando dados...
                </div>
              ) : data.length === 0 ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <FileSpreadsheet className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Nenhum dado importado ainda</p>
                  <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                    Envie uma planilha pelo painel ao lado para preencher esta tabela.
                  </p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-300px)] overflow-auto">
                  <table className="w-full min-w-[1400px] border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <th className="sticky left-0 top-0 z-20 border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold dark:border-slate-700 dark:bg-slate-800">Corretor</th>
                        <th className="sticky top-0 z-10 border-b border-r border-slate-200 px-3 py-2 text-left font-semibold dark:border-slate-700">Nivel</th>
                        <th className="sticky top-0 z-10 border-b border-r border-slate-200 px-3 py-2 text-left font-semibold dark:border-slate-700">Equipe</th>
                        {meses.map((mes) => (
                          <th key={mes} className="sticky top-0 z-10 min-w-[86px] border-b border-r border-slate-200 px-3 py-2 text-right font-semibold dark:border-slate-700">
                            {mes}
                          </th>
                        ))}
                        <th className="sticky top-0 z-10 min-w-[88px] border-b border-r border-slate-200 px-3 py-2 text-right font-semibold dark:border-slate-700">Total</th>
                        <th className="sticky top-0 z-10 min-w-[118px] border-b border-r border-slate-200 px-3 py-2 text-right font-semibold dark:border-slate-700">Valor total</th>
                        <th className="sticky right-0 top-0 z-20 min-w-[70px] border-b border-slate-200 bg-slate-100 px-3 py-2 text-center font-semibold dark:border-slate-700 dark:bg-slate-800">Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row) => (
                        <tr
                          key={row.id}
                          className="group bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                        >
                          <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-slate-100 bg-white px-3 py-2 font-medium text-slate-900 group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:group-hover:bg-slate-800">{row.corretor_nome}</td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-600 dark:border-slate-800 dark:text-slate-300">{row.corretor_nivel || '-'}</td>
                          <td className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-slate-600 dark:border-slate-800 dark:text-slate-300">{row.equipe || '-'}</td>
                          {monthFields.map((field) => (
                            <td key={field} className="border-b border-r border-slate-100 px-3 py-2 text-right text-slate-600 dark:border-slate-800 dark:text-slate-300">
                              {row[field] ? formatCurrency(row[field]) : '-'}
                            </td>
                          ))}
                          <td className="border-b border-r border-slate-100 bg-slate-50 px-3 py-2 text-right font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">{row.total_mensal || 0}</td>
                          <td className="border-b border-r border-slate-100 bg-emerald-50 px-3 py-2 text-right font-semibold text-emerald-700 dark:border-slate-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                            {formatCurrency(row.valor_total || 0)}
                          </td>
                          <td className="sticky right-0 border-b border-slate-100 bg-white px-3 py-2 text-center group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(row.id)}
                              className="h-7 w-7 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
  );
}

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

const MetricCard = ({ icon: Icon, label, value }: MetricCardProps) => (
  <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <CardContent className="flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold text-slate-950 dark:text-slate-50">{value}</p>
      </div>
    </CardContent>
  </Card>
);
