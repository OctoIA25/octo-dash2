import { useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, TrendingUp, DollarSign, Building, MapPin, Key } from 'lucide-react';

interface ImoveisTabOptimizedProps {
  leads: ProcessedLead[];
}

export const ImoveisTabOptimized = ({ leads }: ImoveisTabOptimizedProps) => {
  
  // Analisar dados dos imóveis
  const imoveisAnalysis = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Filtrar leads com valor de imóvel
    const leadsComValor = leads.filter(lead => lead.valor_imovel && lead.valor_imovel > 0);
    
    if (leadsComValor.length === 0) return null;

    // Análise de faixas de valores
    const faixasValor = [
      { min: 0, max: 300000, label: 'Até R$ 300K', color: '#22c55e', icon: '🏠' },
      { min: 300000, max: 500000, label: 'R$ 300K - 500K', color: '#3b82f6', icon: '🏢' },
      { min: 500000, max: 800000, label: 'R$ 500K - 800K', color: '#8b5cf6', icon: '🏘️' },
      { min: 800000, max: 1200000, label: 'R$ 800K - 1,2M', color: '#f59e0b', icon: '🏰' },
      { min: 1200000, max: Infinity, label: 'Acima de R$ 1,2M', color: '#ef4444', icon: '🏛️' }
    ];

    const faixasStats = faixasValor.map(faixa => {
      const leadsNaFaixa = leadsComValor.filter(lead => 
        lead.valor_imovel >= faixa.min && lead.valor_imovel < faixa.max
      );

      const valorTotal = leadsNaFaixa.reduce((sum, lead) => sum + lead.valor_imovel, 0);
      const quentes = leadsNaFaixa.filter(l => l.status_temperatura === 'Quente').length;
      const visitas = leadsNaFaixa.filter(l => 
        (l.Data_visita && l.Data_visita.trim() !== "") ||
        l.etapa_atual === 'Visita Agendada'
      ).length;

      return {
        ...faixa,
        quantidade: leadsNaFaixa.length,
        valorTotal,
        valorMedio: leadsNaFaixa.length > 0 ? valorTotal / leadsNaFaixa.length : 0,
        percentual: (leadsNaFaixa.length / leadsComValor.length) * 100,
        quentes,
        visitas
      };
    }).filter(faixa => faixa.quantidade > 0);

    // Análise de tipos de negócio
    const tiposNegocio = leads.reduce((acc, lead) => {
      const tipo = lead.tipo_negocio?.trim() || 'Não informado';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Análise de tipos de propriedade
    const tiposPropriedade = leads.reduce((acc, lead) => {
      let tipo = 'Não especificado';
      
      if (lead.codigo_imovel) {
        const codigo = lead.codigo_imovel.toUpperCase();
        if (codigo.includes('AP') || codigo.includes('APTO')) {
          tipo = 'Apartamento';
        } else if (codigo.includes('CS') || codigo.includes('CASA')) {
          tipo = 'Casa';
        } else if (codigo.includes('CB') || codigo.includes('COB')) {
          tipo = 'Cobertura';
        }
      }
      
      if (lead.Preferencias_lead && tipo === 'Não especificado') {
        const pref = lead.Preferencias_lead.toLowerCase();
        if (pref.includes('casa')) tipo = 'Casa';
        else if (pref.includes('apartamento') || pref.includes('apto')) tipo = 'Apartamento';
        else if (pref.includes('cobertura')) tipo = 'Cobertura';
      }
      
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const valorTotalPortfolio = leadsComValor.reduce((sum, lead) => sum + lead.valor_imovel, 0);
    const valorMedioGeral = valorTotalPortfolio / leadsComValor.length;

    return {
      faixasValor: faixasStats,
      tiposNegocio,
      tiposPropriedade,
      totalImoveis: leadsComValor.length,
      valorTotalPortfolio,
      valorMedioGeral,
      faixaMaisPopular: faixasStats.reduce((max, faixa) => 
        faixa.quantidade > max.quantidade ? faixa : max, faixasStats[0]),
      tipoNegocioMaisComum: Object.entries(tiposNegocio)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A'
    };
  }, [leads]);

  if (!imoveisAnalysis) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Home className="h-16 w-16 notion-text-secondary mx-auto mb-4" />
          <p className="notion-text-secondary">Carregando dados dos imóveis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {/* Métricas gerais do portfolio */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold notion-text-primary mb-2">
            {imoveisAnalysis.totalImoveis}
          </div>
          <div className="text-sm notion-text-secondary">Imóveis no Portfolio</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold text-green-400 mb-2">
            R$ {(imoveisAnalysis.valorMedioGeral / 1000).toFixed(0)}K
          </div>
          <div className="text-sm notion-text-secondary">Valor Médio</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold text-blue-400 mb-2">
            R$ {(imoveisAnalysis.valorTotalPortfolio / 1000000).toFixed(1)}M
          </div>
          <div className="text-sm notion-text-secondary">Portfolio Total</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold text-yellow-400 mb-2">
            {imoveisAnalysis.faixaMaisPopular?.quantidade || 0}
          </div>
          <div className="text-sm notion-text-secondary">Faixa Mais Popular</div>
        </div>
      </div>

      {/* Distribuição por faixas de valor */}
      <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="h-6 w-6 text-green-400" />
          <h3 className="text-xl font-bold notion-text-primary">Distribuição por Faixas de Valor</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {imoveisAnalysis.faixasValor.map((faixa, index) => (
            <div 
              key={faixa.label}
              className="p-6 bg-gradient-to-br from-notion-bg-secondary to-notion-bg-tertiary rounded-xl border border-notion-border hover:border-notion-text-secondary transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-3xl">{faixa.icon}</div>
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: faixa.color }}
                ></div>
              </div>
              
              <h4 className="font-semibold notion-text-primary mb-2">{faixa.label}</h4>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm notion-text-secondary">Quantidade:</span>
                  <span className="font-bold notion-text-primary">{faixa.quantidade}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm notion-text-secondary">Participação:</span>
                  <span className="font-bold" style={{ color: faixa.color }}>
                    {faixa.percentual.toFixed(1)}%
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm notion-text-secondary">Valor Médio:</span>
                  <span className="font-bold notion-text-primary">
                    R$ {(faixa.valorMedio / 1000).toFixed(0)}K
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-orange-400">{faixa.quentes}</div>
                    <div className="text-xs notion-text-secondary">Quentes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-400">{faixa.visitas}</div>
                    <div className="text-xs notion-text-secondary">Visitas</div>
                  </div>
                </div>
              </div>
              
              {/* Barra de progresso */}
              <div className="mt-4 w-full bg-notion-bg-secondary rounded-full h-2">
                <div 
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ 
                    width: `${Math.min(faixa.percentual, 100)}%`,
                    backgroundColor: faixa.color
                  }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Análise de tipos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tipos de Negócio */}
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-6">
            <Key className="h-6 w-6 text-blue-400" />
            <h3 className="text-xl font-bold notion-text-primary">Tipos de Negócio</h3>
          </div>
          
          <div className="space-y-4">
            {Object.entries(imoveisAnalysis.tiposNegocio)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 6)
              .map(([tipo, quantidade], index) => {
                const cores = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];
                const cor = cores[index % cores.length];
                const percentual = (quantidade / leads.length) * 100;
                
                return (
                  <div key={tipo} className="flex items-center justify-between p-4 bg-gradient-to-r from-notion-bg-secondary to-notion-bg-tertiary rounded-lg">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: cor }}
                      ></div>
                      <span className="font-medium notion-text-primary">{tipo}</span>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-bold notion-text-primary">{quantidade}</div>
                      <div className="text-xs notion-text-secondary">
                        {percentual.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Tipos de Propriedade */}
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-6">
            <Building className="h-6 w-6 text-purple-400" />
            <h3 className="text-xl font-bold notion-text-primary">Tipos de Propriedade</h3>
          </div>
          
          <div className="space-y-4">
            {Object.entries(imoveisAnalysis.tiposPropriedade)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 6)
              .map(([tipo, quantidade], index) => {
                const icons = ['🏠', '🏢', '🏘️', '🏰', '🏛️', '🏗️'];
                const cores = ['#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#06b6d4'];
                const icon = icons[index % icons.length];
                const cor = cores[index % cores.length];
                const percentual = (quantidade / leads.length) * 100;
                
                return (
                  <div key={tipo} className="flex items-center justify-between p-4 bg-gradient-to-r from-notion-bg-secondary to-notion-bg-tertiary rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{icon}</span>
                      <span className="font-medium notion-text-primary">{tipo}</span>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-bold" style={{ color: cor }}>{quantidade}</div>
                      <div className="text-xs notion-text-secondary">
                        {percentual.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Insights do portfolio */}
      <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="h-6 w-6 text-green-400" />
          <h3 className="text-xl font-bold notion-text-primary">Insights do Portfolio</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-gradient-to-br from-green-500/10 to-green-600/10 rounded-lg border border-green-500/20">
            <div className="text-3xl mb-2">💎</div>
            <div className="text-lg font-bold text-green-400 mb-1">
              {imoveisAnalysis.faixaMaisPopular?.label || 'N/A'}
            </div>
            <div className="text-sm notion-text-secondary">Faixa Mais Demandada</div>
          </div>
          
          <div className="text-center p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-lg border border-blue-500/20">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-lg font-bold text-blue-400 mb-1">
              {imoveisAnalysis.tipoNegocioMaisComum}
            </div>
            <div className="text-sm notion-text-secondary">Tipo de Negócio Mais Comum</div>
          </div>
          
          <div className="text-center p-4 bg-gradient-to-br from-yellow-500/10 to-yellow-600/10 rounded-lg border border-yellow-500/20">
            <div className="text-3xl mb-2">🎯</div>
            <div className="text-lg font-bold text-yellow-400 mb-1">
              {((imoveisAnalysis.totalImoveis / leads.length) * 100).toFixed(1)}%
            </div>
            <div className="text-sm notion-text-secondary">Leads com Valor Definido</div>
          </div>
        </div>
      </div>
    </div>
  );
};
