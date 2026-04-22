/**
 * Gráfico de Área Melhorado - Evolução de Leads por Equipe
 * Design moderno com gradientes e animações
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { leadsPorEquipeData } from '@/data/metricsData';
import { Skeleton } from '@/components/ui/skeleton';

interface ImprovedAreaChartProps {
  isLoading?: boolean;
}

// Dados simulados para evolução temporal (normalmente viriam da API)
const evolucaoData = [
  { mes: 'Jul', 'Equipe Verde': 180, 'Equipe Amarela': 160, 'Equipe Vermelha': 120 },
  { mes: 'Ago', 'Equipe Verde': 190, 'Equipe Amarela': 170, 'Equipe Vermelha': 125 },
  { mes: 'Set', 'Equipe Verde': 200, 'Equipe Amarela': 175, 'Equipe Vermelha': 130 },
  { mes: 'Out', 'Equipe Verde': 205, 'Equipe Amarela': 180, 'Equipe Vermelha': 135 },
  { mes: 'Nov', 'Equipe Verde': 211, 'Equipe Amarela': 188, 'Equipe Vermelha': 138 }
];

export const ImprovedAreaChart = ({ isLoading = false }: ImprovedAreaChartProps) => {
  const data = useMemo(() => evolucaoData, []);

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-52" />
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
          <div className="w-3 h-3 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full"></div>
          Evolução de Leads por Equipe
        </CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">Tendência de captação nos últimos 5 meses</p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Aguardando dados históricos por equipe
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            A tendência de captação será exibida quando houver histórico suficiente.
          </p>
        </div>
        <div className="hidden">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
            <defs>
              <linearGradient id="verdeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="amarelaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#eab308" stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="vermelhaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05}/>
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
              width={50}
            />
            
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                fontSize: '13px',
                fontWeight: '500'
              }}
              labelStyle={{ 
                color: '#374151', 
                fontWeight: 600,
                marginBottom: '8px'
              }}
              cursor={{ stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            
            <Legend 
              wrapperStyle={{ 
                fontSize: '12px', 
                paddingTop: '15px',
                fontWeight: '500'
              }}
            />
            
            <Area 
              type="monotone" 
              dataKey="Equipe Verde" 
              stackId="1"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#verdeGradient)"
              dot={{ r: 4, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }}
            />
            
            <Area 
              type="monotone" 
              dataKey="Equipe Amarela" 
              stackId="1"
              stroke="#eab308"
              strokeWidth={2}
              fill="url(#amarelaGradient)"
              dot={{ r: 4, fill: '#eab308', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, fill: '#eab308', strokeWidth: 2, stroke: '#fff' }}
            />
            
            <Area 
              type="monotone" 
              dataKey="Equipe Vermelha" 
              stackId="1"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#vermelhaGradient)"
              dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>

        {/* Resumo atual */}
        <div className="mt-4 hidden grid-cols-3 gap-3">
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="text-lg font-bold text-green-700 dark:text-green-400">211</div>
            <div className="text-xs text-green-600 dark:text-green-500">Equipe Verde</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="text-lg font-bold text-yellow-700 dark:text-yellow-400">188</div>
            <div className="text-xs text-yellow-600 dark:text-yellow-500">Equipe Amarela</div>
          </div>
          <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="text-lg font-bold text-red-700 dark:text-red-400">138</div>
            <div className="text-xs text-red-600 dark:text-red-500">Equipe Vermelha</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
