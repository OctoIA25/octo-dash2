/**
 * Gráfico de Pizza Melhorado - Distribuição Exclusivo vs Ficha
 * Design moderno com gradientes e animações suaves
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { distribuicaoExclusivoFichaData } from '@/data/metricsData';
import { Skeleton } from '@/components/ui/skeleton';

interface ImprovedPieChartProps {
  isLoading?: boolean;
}

// Cores harmônicas modernas
const COLORS = {
  Exclusivo: '#10b981', // Verde esmeralda
  Ficha: '#3b82f6'      // Azul moderno
};

const RADIAN = Math.PI / 180;

// Função para renderizar labels customizados
const renderCustomizedLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent
}: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text 
      x={x} 
      y={y} 
      fill="white" 
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
      fontSize={14}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
};

export const ImprovedPieChart = ({ isLoading = false }: ImprovedPieChartProps) => {
  const data = useMemo(() => 
    distribuicaoExclusivoFichaData.map(item => ({
      ...item,
      name: item.tipo,
      fill: COLORS[item.tipo as keyof typeof COLORS]
    })), []
  );

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-44" />
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
          <div className="w-3 h-3 bg-gradient-to-r from-green-500 to-blue-500 rounded-full"></div>
          Distribuição do Portfólio
        </CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">Imóveis exclusivos vs fichas ativas</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <defs>
              <linearGradient id="exclusivoGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                <stop offset="100%" stopColor="#059669" stopOpacity={0.8}/>
              </linearGradient>
              <linearGradient id="fichaGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                <stop offset="100%" stopColor="#1e40af" stopOpacity={0.8}/>
              </linearGradient>
            </defs>
            
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={90}
              innerRadius={30}
              fill="#8884d8"
              dataKey="quantidade"
              nameKey="tipo"
              strokeWidth={3}
              stroke="#ffffff"
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.tipo === 'Exclusivo' ? 'url(#exclusivoGradient)' : 'url(#fichaGradient)'}
                />
              ))}
            </Pie>
            
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                fontSize: '13px',
                fontWeight: '500'
              }}
              formatter={(value: number, name: string, props: any) => [
                `${value} imóveis (${props.payload.percentual.toFixed(1)}%)`,
                name
              ]}
              labelStyle={{ 
                color: '#374151', 
                fontWeight: 600,
                marginBottom: '4px'
              }}
            />
            
            <Legend 
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ 
                fontSize: '13px', 
                paddingTop: '20px',
                fontWeight: '500'
              }}
              formatter={(value, entry: any) => (
                <span style={{ color: entry.color, fontWeight: 600 }}>
                  {value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Estatísticas adicionais */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          {data.map((item, index) => (
            <div key={index} className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {item.quantidade}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {item.tipo}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
