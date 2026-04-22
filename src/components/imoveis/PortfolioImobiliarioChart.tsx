/**
 * 📊 Gráfico de Portfólio Imobiliário
 * Visualização com filtros de Venda/Locação e breakdown por tipo
 * 🎨 Cores: Gradiente Azul (#5b8bc4 → #1e4d8b → #1a2332)
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImoveisMetrics } from '@/features/imoveis/hooks/useImoveisData';
import { Imovel } from '@/features/imoveis/services/kenloService';
import { Building2 } from 'lucide-react';
import { getBarChartColors } from '@/utils/chartColors';

interface PortfolioImobiliarioChartProps {
  metrics: ImoveisMetrics;
  imoveis: Imovel[];
  isLoading?: boolean;
}

type FiltroTipo = 'todos' | 'venda' | 'locacao';

export const PortfolioImobiliarioChart = ({ 
  metrics, 
  imoveis,
  isLoading 
}: PortfolioImobiliarioChartProps) => {
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroTipo>('todos');

  // Calcular métricas filtradas
  const metricasFiltradas = useMemo(() => {
    let imoveisFiltrados = imoveis;

    if (filtroAtivo === 'venda') {
      imoveisFiltrados = imoveis.filter(i => 
        i.finalidade === 'venda' || i.finalidade === 'venda_locacao'
      );
    } else if (filtroAtivo === 'locacao') {
      imoveisFiltrados = imoveis.filter(i => 
        i.finalidade === 'locacao' || i.finalidade === 'venda_locacao'
      );
    }

    return {
      total: imoveisFiltrados.length,
      casas: imoveisFiltrados.filter(i => i.tipoSimplificado === 'casa').length,
      apartamentos: imoveisFiltrados.filter(i => i.tipoSimplificado === 'apartamento').length,
      terrenos: imoveisFiltrados.filter(i => i.tipoSimplificado === 'terreno').length,
      outros: imoveisFiltrados.filter(i => 
        i.tipoSimplificado !== 'casa' && 
        i.tipoSimplificado !== 'apartamento' && 
        i.tipoSimplificado !== 'terreno'
      ).length,
      venda: imoveisFiltrados.filter(i => 
        i.finalidade === 'venda' || i.finalidade === 'venda_locacao'
      ).length,
      locacao: imoveisFiltrados.filter(i => 
        i.finalidade === 'locacao' || i.finalidade === 'venda_locacao'
      ).length,
    };
  }, [imoveis, filtroAtivo]);

  // Dados para o gráfico de barras com gradiente azul
  const valores = [
    metricasFiltradas.casas,
    metricasFiltradas.apartamentos,
    metricasFiltradas.terrenos,
    metricasFiltradas.outros
  ];
  
  const cores = getBarChartColors(valores);
  
  const dadosGrafico = [
    { label: 'Casas', valor: metricasFiltradas.casas, cor: cores[0] },
    { label: 'Apartamentos', valor: metricasFiltradas.apartamentos, cor: cores[1] },
    { label: 'Terrenos', valor: metricasFiltradas.terrenos, cor: cores[2] },
    { label: 'Outros', valor: metricasFiltradas.outros, cor: cores[3] }
  ];

  const valorMaximo = Math.max(...dadosGrafico.map(d => d.valor), 1);

  if (isLoading) {
    return (
      <Card className="animate-pulse" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
        <CardHeader>
          <div className="h-6 bg-gray-300 rounded w-48"></div>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-gray-200 rounded"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)' }}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(30, 77, 139, 0.1)' }}>
              <Building2 className="h-5 w-5" style={{ color: '#1e4d8b' }} />
            </div>
            <CardTitle className="text-xl font-bold text-text-primary">
              Portfólio Imobiliário
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Cards de Totais com Filtro */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Geral */}
          <div 
            className={`rounded-xl p-4 border-2 transition-all duration-200 cursor-pointer ${
              filtroAtivo === 'todos' 
                ? '' 
                : 'bg-neutral-800/30 border-neutral-700/30 hover:border-neutral-600/30'
            }`}
            style={filtroAtivo === 'todos' ? {
              backgroundColor: 'rgba(30, 77, 139, 0.1)',
              borderColor: 'rgba(30, 77, 139, 0.3)'
            } : {}}
            onClick={() => setFiltroAtivo('todos')}
          >
            <div className="text-center">
              <div className={`text-4xl font-bold mb-1 ${
                filtroAtivo === 'todos' ? '' : 'text-text-primary'
              }`}
              style={filtroAtivo === 'todos' ? { color: '#1e4d8b' } : {}}>
                {metrics.total}
              </div>
              <div className="text-xs text-text-secondary font-medium uppercase tracking-wide">
                Total Imóveis
              </div>
              <div className={`text-xs mt-1 ${
                filtroAtivo === 'todos' ? '' : 'text-text-secondary'
              }`}
              style={filtroAtivo === 'todos' ? { color: '#1e4d8b' } : {}}>
                Geral
              </div>
            </div>
          </div>

          {/* Total Venda */}
          <div 
            className={`rounded-xl p-4 border-2 transition-all duration-200 cursor-pointer ${
              filtroAtivo === 'venda' 
                ? '' 
                : 'bg-neutral-800/30 border-neutral-700/30 hover:border-neutral-600/30'
            }`}
            style={filtroAtivo === 'venda' ? {
              backgroundColor: 'rgba(91, 139, 196, 0.1)',
              borderColor: 'rgba(91, 139, 196, 0.3)'
            } : {}}
            onClick={() => setFiltroAtivo('venda')}
          >
            <div className="text-center">
              <div className={`text-4xl font-bold mb-1 ${
                filtroAtivo === 'venda' ? '' : 'text-text-primary'
              }`}
              style={filtroAtivo === 'venda' ? { color: '#5b8bc4' } : {}}>
                {metrics.venda}
              </div>
              <div className="text-xs text-text-secondary font-medium uppercase tracking-wide">
                Total Imóveis
              </div>
              <div className={`text-xs mt-1 ${
                filtroAtivo === 'venda' ? '' : 'text-text-secondary'
              }`}
              style={filtroAtivo === 'venda' ? { color: '#5b8bc4' } : {}}>
                Venda
              </div>
            </div>
          </div>

          {/* Total Locação */}
          <div 
            className={`rounded-xl p-4 border-2 transition-all duration-200 cursor-pointer ${
              filtroAtivo === 'locacao' 
                ? '' 
                : 'bg-neutral-800/30 border-neutral-700/30 hover:border-neutral-600/30'
            }`}
            style={filtroAtivo === 'locacao' ? {
              backgroundColor: 'rgba(26, 35, 50, 0.1)',
              borderColor: 'rgba(26, 35, 50, 0.3)'
            } : {}}
            onClick={() => setFiltroAtivo('locacao')}
          >
            <div className="text-center">
              <div className={`text-4xl font-bold mb-1 ${
                filtroAtivo === 'locacao' ? '' : 'text-text-primary'
              }`}
              style={filtroAtivo === 'locacao' ? { color: '#1a2332' } : {}}>
                {metrics.locacao}
              </div>
              <div className="text-xs text-text-secondary font-medium uppercase tracking-wide">
                Total Imóveis
              </div>
              <div className={`text-xs mt-1 ${
                filtroAtivo === 'locacao' ? '' : 'text-text-secondary'
              }`}
              style={filtroAtivo === 'locacao' ? { color: '#1a2332' } : {}}>
                Locação
              </div>
            </div>
          </div>
        </div>

        {/* Botões de Filtro */}
        <div className="flex gap-2 justify-center">
          <Button
            variant={filtroAtivo === 'todos' ? 'default' : 'outline'}
            onClick={() => setFiltroAtivo('todos')}
            className={`rounded-lg font-semibold transition-all ${
              filtroAtivo === 'todos' 
                ? 'text-white' 
                : 'border-neutral-700 text-text-secondary hover:bg-neutral-800'
            }`}
            style={filtroAtivo === 'todos' ? { backgroundColor: '#1e4d8b' } : {}}
          >
            Todos
          </Button>
          <Button
            variant={filtroAtivo === 'venda' ? 'default' : 'outline'}
            onClick={() => setFiltroAtivo('venda')}
            className={`rounded-lg font-semibold transition-all ${
              filtroAtivo === 'venda' 
                ? 'text-white' 
                : 'border-neutral-700 text-text-secondary hover:bg-neutral-800'
            }`}
            style={filtroAtivo === 'venda' ? { backgroundColor: '#5b8bc4' } : {}}
          >
            Venda
          </Button>
          <Button
            variant={filtroAtivo === 'locacao' ? 'default' : 'outline'}
            onClick={() => setFiltroAtivo('locacao')}
            className={`rounded-lg font-semibold transition-all ${
              filtroAtivo === 'locacao' 
                ? 'text-white' 
                : 'border-neutral-700 text-text-secondary hover:bg-neutral-800'
            }`}
            style={filtroAtivo === 'locacao' ? { backgroundColor: '#1a2332' } : {}}
          >
            Locação
          </Button>
        </div>

        {/* Gráfico de Barras */}
        <div className="space-y-4 pt-4">
          <div className="text-sm text-text-secondary font-medium mb-4">
            Distribuição por Tipo ({filtroAtivo === 'todos' ? 'Geral' : filtroAtivo === 'venda' ? 'Venda' : 'Locação'})
          </div>

          {/* Eixo Y e Barras */}
          <div className="flex gap-4">
            {/* Eixo Y */}
            <div className="flex flex-col justify-between text-xs text-text-secondary w-8 text-right pr-2">
              <span>{valorMaximo}</span>
              <span>{Math.floor(valorMaximo * 0.75)}</span>
              <span>{Math.floor(valorMaximo * 0.5)}</span>
              <span>{Math.floor(valorMaximo * 0.25)}</span>
              <span>0</span>
            </div>

            {/* Container de Barras */}
            <div className="flex-1 flex items-end justify-around gap-4 h-64 border-l border-b border-neutral-700 pl-4 pb-4">
              {dadosGrafico.map((dado, index) => {
                const altura = valorMaximo > 0 ? (dado.valor / valorMaximo) * 100 : 0;
                
                return (
                  <div key={index} className="flex flex-col items-center flex-1 max-w-[120px]">
                    {/* Barra */}
                    <div className="relative w-full flex items-end justify-center h-full">
                      <div 
                        className="w-full rounded-t-lg transition-all duration-500 ease-out relative group hover:opacity-80"
                        style={{ 
                          height: `${altura}%`,
                          backgroundColor: dado.cor,
                          minHeight: dado.valor > 0 ? '4px' : '0'
                        }}
                      >
                        {/* Valor no topo da barra */}
                        <div 
                          className="absolute -top-7 left-1/2 transform -translate-x-1/2 text-white font-bold text-base whitespace-nowrap"
                        >
                          {dado.valor}
                        </div>
                      </div>
                    </div>
                    
                    {/* Label */}
                    <div className="text-xs text-text-secondary font-medium mt-3 text-center">
                      {dado.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legenda CanvasJS style */}
        <div className="flex justify-center items-center pt-2">
          <div className="text-[10px] text-gray-500">
            CanvasJS Trial
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

