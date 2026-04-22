/**
 * Gráfico VGC Melhorado - Versão com gradiente e animações
 * Gráfico de Barras com design moderno e harmônico
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
  Cell
} from 'recharts';
import { vgcMensalData, formatarMoedaCurta } from '@/data/metricsData';
import { Skeleton } from '@/components/ui/skeleton';

interface ImprovedVGCChartProps {
  isLoading?: boolean;
}

// Cores harmônicas em gradiente azul
const colors = [
  '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd',
  '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1e40af'
];

export const ImprovedVGCChart = ({ isLoading = false }: ImprovedVGCChartProps) => {
  const data = useMemo(() => vgcMensalData, []);

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"></div>
          VGC Vendido por Competência
        </CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">Evolução mensal do valor geral de comissão</p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Aguardando dados de vendas fechadas
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            O VGC aparecerá quando houver valor final de venda registrado.
          </p>
        </div>
        <div className="hidden">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
            barCategoryGap="20%"
          >
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#1e40af" stopOpacity={0.7}/>
              </linearGradient>
            </defs>
            
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#e5e7eb" 
              strokeOpacity={0.5}
              vertical={false}
            />
            
            <XAxis 
              dataKey="mes" 
              tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: '#d1d5db', strokeWidth: 1 }}
              dy={10}
            />
            
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatarMoedaCurta(value)}
              width={60}
            />
            
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                fontSize: '13px',
                fontWeight: '500'
              }}
              formatter={(value: number) => [
                `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, 
                'Valor VGC'
              ]}
              labelStyle={{ 
                color: '#374151', 
                fontWeight: 600,
                marginBottom: '4px'
              }}
              cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
            />
            
            <Bar 
              dataKey="valor" 
              radius={[6, 6, 0, 0]}
              maxBarSize={50}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={colors[index % colors.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
