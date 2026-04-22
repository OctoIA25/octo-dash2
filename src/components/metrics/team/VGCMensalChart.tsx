/**
 * Gráfico VGC Vendido por Competência (Mensal)
 * Gráfico de Barras mostrando valor vendido por mês
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { vgcMensalData, formatarMoedaCurta, chartColors } from '@/data/metricsData';
import { Skeleton } from '@/components/ui/skeleton';

interface VGCMensalChartProps {
  isLoading?: boolean;
}

export const VGCMensalChart = ({ isLoading = false }: VGCMensalChartProps) => {
  const data = useMemo(() => vgcMensalData, []);

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          VGC Vendido Competência (Mensal)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Aguardando dados de vendas fechadas
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Registre vendas com valor final para acompanhar o VGC mensal desta imobiliária.
          </p>
        </div>
        <div className="hidden">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="mes" 
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#d1d5db' }}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#d1d5db' }}
              tickFormatter={(value) => formatarMoedaCurta(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Valor']}
              labelStyle={{ color: '#374151', fontWeight: 600 }}
            />
            <Bar 
              dataKey="valor" 
              fill={chartColors.primary}
              radius={[4, 4, 0, 0]}
              maxBarSize={50}
            />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
