/**
 * Gráfico Distribuição Exclusivo vs Ficha
 * Fonte: kenlo_leads.is_exclusive, filtrado por tenant no useKenloMetrics.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { chartColors } from '@/data/metricsData';
import { Skeleton } from '@/components/ui/skeleton';
import { useKenloMetrics } from '@/hooks/useKenloMetrics';

interface DistribuicaoExclusivoFichaChartProps {
  isLoading?: boolean;
}

const COLORS = [chartColors.exclusivoFicha.exclusivo, chartColors.exclusivoFicha.ficha];

export const DistribuicaoExclusivoFichaChart = ({
  isLoading: externalLoading = false,
}: DistribuicaoExclusivoFichaChartProps) => {
  const { exclusivoVsFicha, isLoading, tenantReady } = useKenloMetrics();
  const showSkeleton = externalLoading || isLoading;

  if (showSkeleton) {
    return (
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const data = exclusivoVsFicha.map((item) => ({ ...item, name: item.tipo }));
  const hasData = data.length > 0;

  return (
    <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Distribuição Exclusivo vs Ficha
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!tenantReady || !hasData ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">
            {tenantReady ? 'Sem dados de leads para exibir' : 'Selecione uma imobiliária para visualizar'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                labelLine={false}
                label={({ percent }) =>
                  typeof percent === 'number' ? `${(percent * 100).toFixed(1)}%` : ''
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="quantidade"
                nameKey="tipo"
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                formatter={(value: number, name: string, props: { payload?: { percentual?: number } }) => [
                  `${value} (${(props.payload?.percentual ?? 0).toFixed(1)}%)`,
                  name,
                ]}
                labelStyle={{ color: '#374151', fontWeight: 600 }}
              />
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ fontSize: '12px', paddingTop: '15px' }}
                formatter={(value) => (
                  <span className="text-gray-600 dark:text-gray-400">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
