import { useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCheck, Trophy, TrendingUp, Target, Award, Crown } from 'lucide-react';

interface CorretoresTabOptimizedProps {
  leads: ProcessedLead[];
}

export const CorretoresTabOptimized = ({ leads }: CorretoresTabOptimizedProps) => {
  
  // Calcular estatísticas dos corretores
  const corretoresStats = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    const stats = leads.reduce((acc, lead) => {
      const corretor = lead.corretor_responsavel?.trim() || 'Não atribuído';
      
      if (!acc[corretor]) {
        acc[corretor] = {
          totalLeads: 0,
          visitasAgendadas: 0,
          negociacoes: 0,
          vendas: 0,
          valorTotal: 0,
          leadsQuentes: 0,
          score: 0
        };
      }
      
      const corretorData = acc[corretor];
      corretorData.totalLeads++;
      
      // Sistema de pontuação
      let pontos = 1; // 1 ponto por lead
      
      if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
          lead.etapa_atual === 'Visita Agendada') {
        corretorData.visitasAgendadas++;
        pontos += 3;
      }
      
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        corretorData.negociacoes++;
        pontos += 5;
      }
      
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== "") {
        corretorData.vendas++;
        pontos += 10;
      }
      
      if (lead.status_temperatura === 'Quente') {
        corretorData.leadsQuentes++;
        pontos += 2;
      }
      
      if (lead.valor_imovel && lead.valor_imovel > 0) {
        corretorData.valorTotal += lead.valor_imovel;
        if (lead.valor_imovel > 500000) pontos += 2;
        if (lead.valor_imovel > 1000000) pontos += 3;
      }
      
      corretorData.score += pontos;
      return acc;
    }, {} as Record<string, any>);

    // Converter para array e calcular métricas
    const corretoresArray = Object.entries(stats)
      .map(([nome, data]) => ({
        nome,
        ...data,
        taxaConversao: data.totalLeads > 0 ? (data.visitasAgendadas / data.totalLeads * 100) : 0,
        eficiencia: data.totalLeads > 0 ? (data.vendas / data.totalLeads * 100) : 0,
        ticketMedio: data.vendas > 0 ? (data.valorTotal / data.vendas) : 0
      }))
      .sort((a, b) => b.score - a.score);

    return {
      ranking: corretoresArray,
      totalCorretores: corretoresArray.length,
      melhorPerformance: corretoresArray[0] || null,
      totalVendas: corretoresArray.reduce((sum, c) => sum + c.vendas, 0),
      pipelineTotal: corretoresArray.reduce((sum, c) => sum + c.valorTotal, 0)
    };
  }, [leads]);

  if (!corretoresStats) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <UserCheck className="h-16 w-16 notion-text-secondary mx-auto mb-4" />
          <p className="notion-text-secondary">Carregando dados dos corretores...</p>
        </div>
      </div>
    );
  }

  const getMedalha = (posicao: number) => {
    switch (posicao) {
      case 1: return { emoji: '🥇', color: '#FFD700' };
      case 2: return { emoji: '🥈', color: '#C0C0C0' };
      case 3: return { emoji: '🥉', color: '#CD7F32' };
      case 4: return { emoji: '🏆', color: '#3b82f6' };
      case 5: return { emoji: '⭐', color: '#22c55e' };
      default: return { emoji: '🎯', color: '#8b5cf6' };
    }
  };

  return (
    <div className="w-full space-y-8">
      {/* Métricas gerais dos corretores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold notion-text-primary mb-2">
            {corretoresStats.totalCorretores}
          </div>
          <div className="text-sm notion-text-secondary">Corretores Ativos</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold text-green-400 mb-2">
            {corretoresStats.totalVendas}
          </div>
          <div className="text-sm notion-text-secondary">Total de Vendas</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold text-blue-400 mb-2">
            R$ {(corretoresStats.pipelineTotal / 1000000).toFixed(1)}M
          </div>
          <div className="text-sm notion-text-secondary">Pipeline Total</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold text-yellow-400 mb-2">
            {corretoresStats.melhorPerformance?.score || 0}
          </div>
          <div className="text-sm notion-text-secondary">Melhor Score</div>
        </div>
      </div>

      {/* Pódium dos Top 3 */}
      {corretoresStats.ranking.length >= 3 && (
        <div className="notion-card notion-card-hover notion-transition p-8 rounded-xl">
          <div className="flex items-center gap-3 mb-6">
            <Crown className="h-6 w-6 text-yellow-400" />
            <h3 className="text-xl font-bold notion-text-primary">Pódium dos Campeões</h3>
          </div>
          
          <div className="flex justify-center items-end gap-8">
            {/* 2º Lugar */}
            <div className="text-center">
              <div className="text-4xl mb-3">🥈</div>
              <div 
                className="w-20 h-16 bg-gray-400 rounded-t-lg flex items-end justify-center text-white font-bold pb-2"
              >
                2º
              </div>
              <div className="mt-3">
                <div className="font-semibold notion-text-primary text-sm">
                  {corretoresStats.ranking[1]?.nome.substring(0, 12)}
                </div>
                <div className="text-gray-300 font-bold text-lg">
                  {corretoresStats.ranking[1]?.score}
                </div>
                <div className="text-xs notion-text-secondary">
                  {corretoresStats.ranking[1]?.totalLeads} leads
                </div>
              </div>
            </div>

            {/* 1º Lugar */}
            <div className="text-center">
              <div className="text-5xl mb-3">🥇</div>
              <div 
                className="w-24 h-20 bg-yellow-500 rounded-t-lg flex items-end justify-center text-white font-bold pb-2"
              >
                1º
              </div>
              <div className="mt-3">
                <div className="font-bold notion-text-primary">
                  {corretoresStats.ranking[0]?.nome.substring(0, 12)}
                </div>
                <div className="text-yellow-400 font-bold text-xl">
                  {corretoresStats.ranking[0]?.score}
                </div>
                <div className="text-sm notion-text-secondary">
                  {corretoresStats.ranking[0]?.totalLeads} leads • {corretoresStats.ranking[0]?.vendas} vendas
                </div>
              </div>
            </div>

            {/* 3º Lugar */}
            <div className="text-center">
              <div className="text-4xl mb-3">🥉</div>
              <div 
                className="w-20 h-12 bg-orange-600 rounded-t-lg flex items-end justify-center text-white font-bold pb-2"
              >
                3º
              </div>
              <div className="mt-3">
                <div className="font-semibold notion-text-primary text-sm">
                  {corretoresStats.ranking[2]?.nome.substring(0, 12)}
                </div>
                <div className="text-orange-400 font-bold text-lg">
                  {corretoresStats.ranking[2]?.score}
                </div>
                <div className="text-xs notion-text-secondary">
                  {corretoresStats.ranking[2]?.totalLeads} leads
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista completa de performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-6">
            <Trophy className="h-6 w-6 text-yellow-400" />
            <h3 className="text-xl font-bold notion-text-primary">Ranking Completo</h3>
          </div>
          
          <div className="space-y-4">
            {corretoresStats.ranking.slice(0, 8).map((corretor, index) => {
              const medalha = getMedalha(index + 1);
              return (
                <div 
                  key={corretor.nome}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-notion-bg-secondary to-notion-bg-tertiary rounded-lg border border-notion-border hover:border-notion-text-secondary transition-all duration-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">{medalha.emoji}</div>
                    <div>
                      <div className="font-semibold notion-text-primary">
                        {index + 1}º {corretor.nome.length > 20 ? corretor.nome.substring(0, 20) + '...' : corretor.nome}
                      </div>
                      <div className="text-sm notion-text-secondary">
                        {corretor.totalLeads} leads • {corretor.visitasAgendadas} visitas • {corretor.vendas} vendas
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-xl font-bold" style={{ color: medalha.color }}>
                      {corretor.score}
                    </div>
                    <div className="text-xs notion-text-secondary">pontos</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Análise de performance */}
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="h-6 w-6 text-blue-400" />
            <h3 className="text-xl font-bold notion-text-primary">Análise de Performance</h3>
          </div>
          
          <div className="space-y-6">
            {corretoresStats.ranking.slice(0, 5).map((corretor, index) => (
              <div key={corretor.nome} className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium notion-text-primary">
                    {corretor.nome.length > 15 ? corretor.nome.substring(0, 15) + '...' : corretor.nome}
                  </span>
                  <span className="text-sm notion-text-secondary">
                    {corretor.taxaConversao.toFixed(1)}% conversão
                  </span>
                </div>
                
                {/* Barra de progresso da taxa de conversão */}
                <div className="w-full bg-notion-bg-secondary rounded-full h-3">
                  <div 
                    className="h-3 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.min(corretor.taxaConversao, 100)}%`,
                      background: `linear-gradient(90deg, ${index < 3 ? '#22c55e' : '#3b82f6'} 0%, ${index < 3 ? '#16a34a' : '#2563eb'} 100%)`
                    }}
                  ></div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-bold text-green-400">{corretor.leadsQuentes}</div>
                    <div className="notion-text-secondary">Quentes</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-blue-400">{corretor.negociacoes}</div>
                    <div className="notion-text-secondary">Negociações</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-yellow-400">
                      R$ {(corretor.ticketMedio / 1000).toFixed(0)}K
                    </div>
                    <div className="notion-text-secondary">Ticket Médio</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
