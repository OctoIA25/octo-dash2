/**
 * 📊 Componente de Métricas de Imóveis
 * Exibe cards com estatísticas dos imóveis do Kenlo
 * 🎨 Cores: Gradiente Azul (#5b8bc4 → #1e4d8b → #1a2332)
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, Building2, LandPlot, Store, TreePine, Tag, Key, TrendingUp } from 'lucide-react';
import { ImoveisMetrics as IMetrics } from '@/features/imoveis/hooks/useImoveisData';
import { CHART_COLORS } from '@/utils/chartColors';

interface ImoveisMetricsProps {
  metrics: IMetrics;
  isLoading?: boolean;
}

export const ImoveisMetrics = ({ metrics, isLoading }: ImoveisMetricsProps) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value);
  };

  // 🎨 Aplicar gradiente azul baseado nos valores
  const allValues = [
    metrics.total,
    metrics.casas,
    metrics.apartamentos,
    metrics.terrenos,
    metrics.comerciais,
    metrics.rurais,
    metrics.venda,
    metrics.locacao,
    metrics.valorTotalVenda / 100000 // Normalizar para comparação
  ];
  const maxValue = Math.max(...allValues);
  
  const getColorForValue = (value: number) => {
    const percentage = maxValue > 0 ? value / maxValue : 0;
    if (percentage > 0.67) return { color: '#1a2332', bg: 'rgba(26, 35, 50, 0.1)' }; // Alto - Azul Marinho Escuro
    if (percentage > 0.33) return { color: '#1e4d8b', bg: 'rgba(30, 77, 139, 0.1)' }; // Médio - Azul Escuro/Royal
    return { color: '#5b8bc4', bg: 'rgba(91, 139, 196, 0.1)' }; // Baixo - Azul Médio
  };

  const metricsData = [
    {
      title: 'Total de Imóveis',
      value: formatNumber(metrics.total),
      icon: Home,
      ...getColorForValue(metrics.total)
    },
    {
      title: 'Casas',
      value: formatNumber(metrics.casas),
      icon: Home,
      ...getColorForValue(metrics.casas)
    },
    {
      title: 'Apartamentos',
      value: formatNumber(metrics.apartamentos),
      icon: Building2,
      ...getColorForValue(metrics.apartamentos)
    },
    {
      title: 'Terrenos',
      value: formatNumber(metrics.terrenos),
      icon: LandPlot,
      ...getColorForValue(metrics.terrenos)
    },
    {
      title: 'Comerciais',
      value: formatNumber(metrics.comerciais),
      icon: Store,
      ...getColorForValue(metrics.comerciais)
    },
    {
      title: 'Rurais',
      value: formatNumber(metrics.rurais),
      icon: TreePine,
      ...getColorForValue(metrics.rurais)
    },
    {
      title: 'À Venda',
      value: formatNumber(metrics.venda),
      icon: Tag,
      ...getColorForValue(metrics.venda)
    },
    {
      title: 'Para Locação',
      value: formatNumber(metrics.locacao),
      icon: Key,
      ...getColorForValue(metrics.locacao)
    },
    {
      title: 'Valor Total (Venda)',
      value: formatCurrency(metrics.valorTotalVenda),
      icon: TrendingUp,
      ...getColorForValue(metrics.valorTotalVenda / 100000)
    }
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-gray-300 rounded w-24"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-300 rounded w-16"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
      {metricsData.map((metric, index) => {
        const Icon = metric.icon;
        
        return (
          <Card 
            key={index}
            className="hover:shadow-lg transition-shadow duration-200"
            style={{ 
              backgroundColor: 'var(--card-bg)',
              borderColor: metric.color,
              borderWidth: '1px'
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-text-secondary">
                {metric.title}
              </CardTitle>
              <div 
                className="p-2 rounded-lg" 
                style={{ backgroundColor: metric.bg }}
              >
                <Icon 
                  className="h-4 w-4" 
                  style={{ color: metric.color }}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div 
                className="text-2xl font-bold" 
                style={{ color: metric.color }}
              >
                {metric.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

