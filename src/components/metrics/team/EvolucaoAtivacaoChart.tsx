/**
 * Gráfico Evolução de Ativações de Imóveis (últimos 12 meses)
 * Fonte: kenlo_leads.lead_timestamp, filtrado por tenant no useKenloMetrics.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { chartColors } from '@/data/metricsData';
import { Skeleton } from '@/components/ui/skeleton';
import { useKenloMetrics } from '@/hooks/useKenloMetrics';

interface EvolucaoAtivacaoChartProps {
  isLoading?: boolean;
}

export const EvolucaoAtivacaoChart = ({ isLoading: externalLoading = false }: EvolucaoAtivacaoChartProps) => {
  const { evolucaoMensal, isLoading, tenantReady } = useKenloMetrics();
  const showSkeleton = externalLoading || isLoading;
  const hasData = evolucaoMensal.some((p) => p.quantidade > 0);

  if (showSkeleton) {
    return (
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-52" />
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
          Evolução Mensal de Leads (12m)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!tenantReady || !hasData ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">
            {tenantReady ? 'Sem dados de leads para exibir' : 'Selecione uma imobiliária para visualizar'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={evolucaoMensal} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAtivacao" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.purple} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={chartColors.purple} stopOpacity={0.05} />
                </linearGradient>
              </defs>
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
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                formatter={(value: number) => [value, 'Leads']}
                labelStyle={{ color: '#374151', fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="quantidade"
                stroke={chartColors.purple}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorAtivacao)"
                dot={{ r: 4, fill: chartColors.purple, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, fill: chartColors.purple, strokeWidth: 2, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
