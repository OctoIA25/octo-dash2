import { useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, TrendingUp, DollarSign, Building } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

interface ImoveisSimpleChartProps {
  leads: ProcessedLead[];
}

export const ImoveisSimpleChart = ({ leads }: ImoveisSimpleChartProps) => {

  // Calcular dados dos imóveis
  const imoveisStats = useMemo(() => {
    
    if (!leads || leads.length === 0) {
      return null;
    }

    // Filtrar leads com valor de imóvel
    const leadsComValor = leads.filter(lead => lead.valor_imovel && lead.valor_imovel > 0);
    
    if (leadsComValor.length === 0) {
      return {
        faixas: [],
        totalImoveis: 0,
        valorTotal: 0,
        valorMedio: 0
      };
    }

    // Definir faixas de valores
    const faixasConfig = [
      { min: 0, max: 300000, label: 'Até R$ 300K', cor: '#22d3ee' },
      { min: 300000, max: 500000, label: 'R$ 300K - 500K', cor: '#10b981' },
      { min: 500000, max: 800000, label: 'R$ 500K - 800K', cor: '#8b5cf6' },
      { min: 800000, max: 1200000, label: 'R$ 800K - 1,2M', cor: '#f59e0b' },
      { min: 1200000, max: Infinity, label: 'Acima de R$ 1,2M', cor: '#ef4444' }
    ];

    // Agrupar por faixas
    const faixas = faixasConfig.map(faixa => {
      const leadsNaFaixa = leadsComValor.filter(lead => 
        lead.valor_imovel >= faixa.min && lead.valor_imovel < faixa.max
      );

      const valorTotal = leadsNaFaixa.reduce((sum, lead) => sum + lead.valor_imovel, 0);
      const valorMedio = leadsNaFaixa.length > 0 ? valorTotal / leadsNaFaixa.length : 0;

      const quentes = leadsNaFaixa.filter(l => l.status_temperatura === 'Quente').length;
      const visitasAgendadas = leadsNaFaixa.filter(l => 
        (l.Data_visita && l.Data_visita.trim() !== "") ||
        l.etapa_atual === 'Visita Agendada'
      ).length;

      return {
        ...faixa,
        quantidade: leadsNaFaixa.length,
        valorTotal,
        valorMedio,
        quentes,
        visitasAgendadas,
        percentual: (leadsNaFaixa.length / leadsComValor.length) * 100
      };
    }).filter(faixa => faixa.quantidade > 0);

    if (leadsComValor.length === 0) {
      return {
        faixas: [],
        totalImoveis: 0,
        valorTotal: 0,
        valorMedio: 0,
        faixaMaisPopular: {}
      };
    }

    const valorTotalPortfolio = leadsComValor.reduce((sum, lead) => sum + lead.valor_imovel, 0);
    const valorMedioGeral = valorTotalPortfolio / leadsComValor.length;

    return {
      faixas,
      totalImoveis: leadsComValor.length,
      valorTotal: valorTotalPortfolio,
      valorMedio: valorMedioGeral,
      faixaMaisPopular: faixas.reduce((max, faixa) => 
        faixa.quantidade > max.quantidade ? faixa : max, faixas[0] || {})
    };
  }, [leads]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <StandardCardTitle icon={DollarSign}>
          Distribuição de Valores dos Imóveis
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Métricas superiores */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="text-center">
            <div className="text-lg font-bold text-cyan-400">
              {imoveisStats.totalImoveis}
            </div>
            <div className="text-xs text-text-secondary">Total Imóveis</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">
              R$ {(imoveisStats.valorMedio / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-text-secondary">Valor Médio</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-purple-400">
              R$ {(imoveisStats.valorTotal / 1000000).toFixed(1)}M
            </div>
            <div className="text-xs text-text-secondary">Portfolio Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-orange-400">
              {imoveisStats.faixaMaisPopular?.quantidade || 0}
            </div>
            <div className="text-xs text-text-secondary">Faixa Popular</div>
          </div>
        </div>

        {/* Lista de faixas */}
        <div className="flex-1 space-y-3">
          {imoveisStats.faixas.map((faixa, index) => (
            <div 
              key={faixa.label}
              className="p-4 bg-gradient-to-r from-bg-secondary/30 to-bg-secondary/10 rounded-lg border border-bg-secondary/40 hover:border-bg-secondary/60 transition-all duration-300"
              style={{ borderLeftColor: faixa.cor, borderLeftWidth: '4px' }}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: faixa.cor }}
                  ></div>
                  <div>
                    <div className="text-text-primary font-semibold">
                      {faixa.label}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {faixa.quantidade} imóveis ({faixa.percentual.toFixed(1)}%)
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold" style={{ color: faixa.cor }}>
                    R$ {(faixa.valorMedio / 1000).toFixed(0)}K
                  </div>
                  <div className="text-xs text-text-secondary">valor médio</div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                <div className="text-center">
                  <div className="text-cyan-400 font-bold">{faixa.quentes}</div>
                  <div className="text-text-secondary">Quentes</div>
                </div>
                <div className="text-center">
                  <div className="text-green-400 font-bold">{faixa.visitasAgendadas}</div>
                  <div className="text-text-secondary">Visitas</div>
                </div>
                <div className="text-center">
                  <div className="text-purple-400 font-bold">
                    R$ {(faixa.valorTotal / 1000000).toFixed(1)}M
                  </div>
                  <div className="text-text-secondary">Total</div>
                </div>
              </div>

              {/* Barra de progresso */}
              <div className="w-full bg-bg-secondary/30 rounded-full h-2">
                <div 
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${Math.min(faixa.percentual, 100)}%`,
                    backgroundColor: faixa.cor
                  }}
                ></div>
              </div>
            </div>
          ))}
        </div>

        {/* Resumo no rodapé */}
        <div className="mt-4 pt-4 border-t border-bg-secondary/40">
          <div className="text-center">
            <div className="text-sm text-text-secondary mb-2">
              Portfolio Total: <span className="text-text-primary font-bold">R$ {(imoveisStats.valorTotal / 1000000).toFixed(2)}M</span>
            </div>
            <div className="flex justify-center gap-6 text-xs">
              <div>
                <span className="text-text-secondary">Menor:</span>
                <span className="text-green-400 ml-1">R$ 100K</span>
              </div>
              <div>
                <span className="text-text-secondary">Maior:</span>
                <span className="text-red-400 ml-1">R$ 2M+</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
