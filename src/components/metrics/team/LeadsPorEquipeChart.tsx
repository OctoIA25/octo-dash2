/**
 * Gráfico Leads por Equipe
 * Fonte: kenlo_leads.attended_by_name ↔ Corretores.equipe (JOIN por nome/email),
 * filtrado por tenant no useKenloMetrics.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useKenloMetrics } from '@/hooks/useKenloMetrics';

interface LeadsPorEquipeChartProps {
  isLoading?: boolean;
}

export const LeadsPorEquipeChart = ({ isLoading: externalLoading = false }: LeadsPorEquipeChartProps) => {
  const { leadsPorEquipe, isLoading, tenantReady } = useKenloMetrics();
  const showSkeleton = externalLoading || isLoading;
  const hasData = leadsPorEquipe.length > 0;

  if (showSkeleton) {
    return (
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-36" />
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
          Leads por Equipe
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!tenantReady || !hasData ? (
          <div className="h-[280px] flex items-center justify-center text-center text-sm text-gray-400 px-6">
            {tenantReady
              ? 'Nenhum lead atribuído a corretores com equipe cadastrada'
              : 'Selecione uma imobiliária para visualizar'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={leadsPorEquipe}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal vertical={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={{ stroke: '#d1d5db' }}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="equipe"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={{ stroke: '#d1d5db' }}
                width={100}
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
              <Bar dataKey="quantidade" radius={[0, 4, 4, 0]} maxBarSize={40}>
                {leadsPorEquipe.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
