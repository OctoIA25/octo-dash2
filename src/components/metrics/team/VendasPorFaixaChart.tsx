/**
 * Gráfico Vendas por Faixa de Preço
 * Gráfico de Barras Empilhadas mostrando vendas por faixa de preço por mês
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
  ResponsiveContainer,
  Legend
} from 'recharts';
import { vendasPorFaixaData, chartColors } from '@/data/metricsData';
import { Skeleton } from '@/components/ui/skeleton';

interface VendasPorFaixaChartProps {
  isLoading?: boolean;
}

export const VendasPorFaixaChart = ({ isLoading = false }: VendasPorFaixaChartProps) => {
  const data = useMemo(() => vendasPorFaixaData, []);

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
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
          Vendas por Faixa de Preço
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="mes" 
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#d1d5db' }}
            />
            <YAxis 
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#d1d5db' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              labelStyle={{ color: '#374151', fontWeight: 600 }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
              formatter={(value) => {
                if (value === 'ate_500k') return 'Até 500K';
                if (value === 'de_500k_999k') return '500K a 999K';
                if (value === 'acima_1m') return 'Acima de 1M';
                return value;
              }}
            />
            <Bar 
              dataKey="ate_500k" 
              stackId="a" 
              fill={chartColors.faixas.ate_500k}
              radius={[0, 0, 0, 0]}
              name="ate_500k"
            />
            <Bar 
              dataKey="de_500k_999k" 
              stackId="a" 
              fill={chartColors.faixas.de_500k_999k}
              name="de_500k_999k"
            />
            <Bar 
              dataKey="acima_1m" 
              stackId="a" 
              fill={chartColors.faixas.acima_1m}
              radius={[4, 4, 0, 0]}
              name="acima_1m"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
