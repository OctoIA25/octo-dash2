/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { useMemo, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Home } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '@/utils/metrics';
import { getRankingColor } from '@/utils/colors';
import { OptimizedPropertyInterestChart } from './OptimizedPropertyInterestChart';
import { ModernRegionChart } from '@/features/leads/components/ModernRegionChart';

interface ImoveisInterestTableProps {
  leads: ProcessedLead[];
}

type TipoNegocioFilter = 'todos' | 'Venda' | 'Locação';

export const ImoveisInterestTable = ({ leads }: ImoveisInterestTableProps) => {
  const [tipoNegocioFilter, setTipoNegocioFilter] = useState<TipoNegocioFilter>('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const itemsPerPage = 10;

  const codigoData = useMemo(() => {
    if (!leads || leads.length === 0) return [];

    // Filtrar leads com código de imóvel válido E por tipo de negócio
    const leadsComCodigo = leads.filter(lead => {
      const temCodigo = lead.codigo_imovel && lead.codigo_imovel.trim() !== '';
      const tipoNegocio = lead.tipo_negocio || 'Venda';
      const matchTipo = tipoNegocioFilter === 'todos' || tipoNegocio === tipoNegocioFilter;
      return temCodigo && matchTipo;
    });

    if (leadsComCodigo.length === 0) return [];

    // Agrupar por código de imóvel e calcular interesse
    const codigoStats = leadsComCodigo.reduce((acc, lead) => {
      const codigo = lead.codigo_imovel.trim().toUpperCase();
      
      if (!acc[codigo]) {
        acc[codigo] = {
          codigo,
          totalLeads: 0,
          quentes: 0,
          mornos: 0,
          frios: 0,
          visitas: 0,
          negociacoes: 0,
          fechados: 0,
          valorImovel: lead.valor_imovel || 0,
          tipo: codigo.startsWith('AP') ? 'Apartamento' : 
                codigo.startsWith('CA') ? 'Casa' : 
                codigo.startsWith('CS') ? 'Casa' :
                codigo.startsWith('TR') ? 'Terreno' : 'Outro',
          tipoNegocio: lead.tipo_negocio || 'Venda',
          corretores: new Set()
        };
      }
      
      acc[codigo].totalLeads++;
      
      // Adicionar corretor
      if (lead.corretor_responsavel && lead.corretor_responsavel !== 'Não atribuído') {
        acc[codigo].corretores.add(lead.corretor_responsavel);
      }
      
      // Contar por temperatura
      switch (lead.status_temperatura) {
        case 'Quente':
          acc[codigo].quentes++;
          break;
        case 'Morno':
          acc[codigo].mornos++;
          break;
        case 'Frio':
          acc[codigo].frios++;
          break;
      }
      
      // Contar visitas e negociações
      if ((lead.Data_visita && lead.Data_visita.trim() !== '') || 
          lead.etapa_atual === 'Visita Agendada') {
        acc[codigo].visitas++;
      }
      
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        acc[codigo].negociacoes++;
      }
      
      if (lead.etapa_atual === 'Vendido' || lead.etapa_atual === 'Fechado') {
        acc[codigo].fechados++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Calcular score de interesse e ordenar
    const codigosArray = Object.values(codigoStats).map((item: any) => {
      // Score baseado em: leads quentes (3 pts) + visitas (2 pts) + negociações (4 pts) + fechados (5 pts) + total leads (1 pt)
      const scoreInteresse = (item.quentes * 3) + (item.visitas * 2) + (item.negociacoes * 4) + (item.fechados * 5) + item.totalLeads;
      const percentualQuentes = item.totalLeads > 0 ? (item.quentes / item.totalLeads) * 100 : 0;
      const taxaConversaoVisita = item.totalLeads > 0 ? (item.visitas / item.totalLeads) * 100 : 0;
      const taxaConversaoNegociacao = item.totalLeads > 0 ? (item.negociacoes / item.totalLeads) * 100 : 0;
      
      return {
        ...item,
        scoreInteresse,
        percentualQuentes,
        taxaConversaoVisita,
        taxaConversaoNegociacao,
        numCorretores: item.corretores.size
      };
    });

    // Ordenar por score de interesse
    return codigosArray.sort((a, b) => b.scoreInteresse - a.scoreInteresse);
  }, [leads, tipoNegocioFilter]);

  // Calcular totais por categoria para os mini cards
  const categoriasCards = useMemo(() => {
    if (!leads || leads.length === 0) return { casas: 0, apartamentos: 0, terrenos: 0, outros: 0 };

    // Filtrar leads por tipo de negócio (igual ao filtro atual)
    const leadsFiltered = leads.filter(lead => {
      const tipoNegocio = lead.tipo_negocio || 'Venda';
      return tipoNegocioFilter === 'todos' || tipoNegocio === tipoNegocioFilter;
    });

    const categorias = { casas: 0, apartamentos: 0, terrenos: 0, outros: 0 };

    leadsFiltered.forEach(lead => {
      const codigoImovel = lead.codigo_imovel?.toLowerCase() || '';
      const preferencias = lead.Preferencias_lead?.toLowerCase() || '';
      const observacoes = lead.observacoes?.toLowerCase() || '';
      
      // Detectar tipo de imóvel
      const isTerreno = 
        codigoImovel.includes('terreno') || 
        codigoImovel.includes('lote') ||
        preferencias.includes('terreno') ||
        observacoes.includes('terreno');
      
      const isCasa = 
        codigoImovel.includes('casa') || 
        codigoImovel.includes('cs') ||
        preferencias.includes('casa');
      
      const isApartamento = 
        codigoImovel.includes('apartamento') || 
        codigoImovel.includes('ap') ||
        preferencias.includes('apartamento');
      
      if (isTerreno) {
        categorias.terrenos++;
      } else if (isCasa) {
        categorias.casas++;
      } else if (isApartamento) {
        categorias.apartamentos++;
      } else {
        categorias.outros++;
      }
    });

    return categorias;
  }, [leads, tipoNegocioFilter]);

  // Paginação
  const totalPages = Math.ceil(codigoData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = codigoData.slice(startIndex, endIndex);

  const totalLeadsFiltered = codigoData.reduce((sum, item) => sum + item.totalLeads, 0);

  // Filtrar leads para cada gráfico baseado no filtro de tipo de negócio
  const leadsForCharts = useMemo(() => {
    if (tipoNegocioFilter === 'todos') return leads;
    return leads.filter(lead => lead.tipo_negocio === tipoNegocioFilter);
  }, [leads, tipoNegocioFilter]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 mt-6">
      <CardContent className="p-0">
        <>
          {/* Layout de 2 Colunas Harmonizadas com Mesma Altura */}
          <div className="grid grid-cols-2 gap-6 p-6 border-b border-bg-secondary/40">
            {/* COLUNA ESQUERDA: Imóveis de Maior Interesse (com mini cards dentro) */}
            <OptimizedPropertyInterestChart 
              leads={leadsForCharts} 
              categoriasCards={categoriasCards}
              tipoNegocioFilter={tipoNegocioFilter}
              onFilterChange={(tipo) => {
                setTipoNegocioFilter(tipo);
                setCurrentPage(1);
              }}
            />

            {/* COLUNA DIREITA: Regiões de Maior Interesse */}
            <ModernRegionChart 
              leads={leadsForCharts}
              tipoNegocioFilter={tipoNegocioFilter}
              onFilterChange={(tipo) => {
                setTipoNegocioFilter(tipo);
                setCurrentPage(1);
              }}
            />
          </div>

            {/* Tabela de Imóveis - Colapsível */}
            <div 
              className="px-6 py-5 border-b border-bg-secondary/40 cursor-pointer hover:bg-bg-secondary/20 transition-colors duration-200"
              onClick={() => setIsTableExpanded(!isTableExpanded)}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold flex items-center gap-3">
                  <span className="bg-gradient-to-r from-[#14263C] via-[#3A6FA0] to-[#88C0E5] bg-clip-text text-transparent font-bold tracking-wide">
                    Ranking de Imóveis
                  </span>
                  <Badge className="bg-[#3A6FA0]/20 text-[#60A5FA] border-[#3A6FA0]/40 text-sm">
                    {codigoData.length} imóveis
                  </Badge>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#60A5FA] hover:bg-[#3A6FA0]/20"
                >
                  {isTableExpanded ? (
                    <ChevronUp className="h-6 w-6" />
                  ) : (
                    <ChevronDown className="h-6 w-6" />
                  )}
                </Button>
              </div>
            </div>
            
            {/* Conteúdo da Tabela - Colapsível */}
            <div 
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isTableExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#3A6FA0]/30 bg-gradient-to-r from-[#14263C]/10 to-[#88C0E5]/10">
                    <th className="text-left p-4 text-sm font-semibold text-[#3A6FA0]">Colocação</th>
                    <th className="text-left p-4 text-sm font-semibold text-[#3A6FA0]">Código</th>
                    <th className="text-left p-4 text-sm font-semibold text-[#3A6FA0]">Tipo</th>
                    <th className="text-center p-4 text-sm font-semibold text-[#3A6FA0]">Total</th>
                    <th className="text-center p-4 text-sm font-semibold text-[#3A6FA0]">Quentes</th>
                    <th className="text-center p-4 text-sm font-semibold text-[#3A6FA0]">Visitas</th>
                    <th className="text-center p-4 text-sm font-semibold text-[#3A6FA0]">Negoc.</th>
                    <th className="text-center p-4 text-sm font-semibold text-[#3A6FA0]">Valor</th>
                    <th className="text-center p-4 text-sm font-semibold text-[#3A6FA0]">Conversão Visita</th>
                    <th className="text-center p-4 text-sm font-semibold text-[#3A6FA0]">Conversão Negociação</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData.map((item, index) => {
                    const globalIndex = startIndex + index;
                    
                    // Paleta de 12 tons de azul - TODOS com texto branco
                    const BLUE_GRADIENT_ROWS = [
                      { bg: '#0F1E2E', text: '#ffffff', badge: '#60A5FA', badgeText: '#0F1E2E' }, // 1º - Azul Marinho Profundo
                      { bg: '#1A2F4A', text: '#ffffff', badge: '#60A5FA', badgeText: '#1A2F4A' }, // 2º - Azul Marinho
                      { bg: '#234567', text: '#ffffff', badge: '#7DB4DC', badgeText: '#1A2F4A' }, // 3º - Azul Escuro Forte
                      { bg: '#2D5A87', text: '#ffffff', badge: '#88C0E5', badgeText: '#1A2F4A' }, // 4º - Azul Escuro
                      { bg: '#3A6FA0', text: '#ffffff', badge: '#A5D4F0', badgeText: '#1A2F4A' }, // 5º - Azul Médio-Escuro
                      { bg: '#4A7DB5', text: '#ffffff', badge: '#B8E0F5', badgeText: '#1A2F4A' }, // 6º - Azul Médio
                      { bg: '#5A8BC6', text: '#ffffff', badge: '#D0EAFB', badgeText: '#1A2F4A' }, // 7º - Azul Médio-Claro
                      { bg: '#6A99D2', text: '#ffffff', badge: '#E0F2FD', badgeText: '#1A2F4A' }, // 8º - Azul Claro
                      { bg: '#7AA7DD', text: '#ffffff', badge: '#E8F5FE', badgeText: '#1A2F4A' }, // 9º - Azul Celeste
                      { bg: '#8AB5E8', text: '#ffffff', badge: '#F0F9FF', badgeText: '#1A2F4A' }, // 10º - Azul Celeste Claro
                      { bg: '#9AC3F0', text: '#ffffff', badge: '#F5FBFF', badgeText: '#1A2F4A' }, // 11º - Azul Muito Claro
                      { bg: '#AAD1F5', text: '#ffffff', badge: '#FAFEFF', badgeText: '#1A2F4A' }, // 12º - Azul Claríssimo
                    ];
                    
                    // Calcular índice proporcional
                    const colorIndex = Math.min(
                      Math.floor((globalIndex / Math.max(codigoData.length - 1, 1)) * (BLUE_GRADIENT_ROWS.length - 1)),
                      BLUE_GRADIENT_ROWS.length - 1
                    );
                    const rowStyle = BLUE_GRADIENT_ROWS[colorIndex];
                    
                    const getRankBadge = (pos: number) => {
                      if (pos === 0) return '1º';
                      if (pos === 1) return '2º';
                      if (pos === 2) return '3º';
                      return `${pos + 1}º`;
                    };

                    return (
                      <tr 
                        key={item.codigo} 
                        className="ranking-row transition-all duration-200"
                        style={{
                          backgroundColor: rowStyle.bg,
                          ['--row-bg' as any]: rowStyle.bg,
                        }}
                      >
                        <td className="p-4">
                          <div 
                            className="ranking-badge flex items-center justify-center w-10 h-10 rounded-full font-bold text-base shadow-lg transition-all duration-200"
                            style={{
                              backgroundColor: rowStyle.badge,
                              color: rowStyle.badgeText,
                              border: `2px solid ${rowStyle.badgeText}40`
                            }}
                          >
                            {getRankBadge(globalIndex)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-base" style={{ color: rowStyle.text }}>{item.codigo}</div>
                          <div className="text-xs font-medium" style={{ color: rowStyle.text }}>
                            {item.numCorretores > 0 && `${item.numCorretores} corretor${item.numCorretores > 1 ? 'es' : ''}`}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium" style={{ color: rowStyle.text }}>{item.tipo}</span>
                            <span className="text-xs font-medium" style={{ color: rowStyle.text }}>
                              {item.tipoNegocio}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-lg font-bold" style={{ color: rowStyle.text }}>{item.totalLeads}</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-lg font-bold" style={{ color: rowStyle.text }}>{item.quentes}</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-lg font-bold" style={{ color: rowStyle.text }}>{item.visitas}</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-lg font-bold" style={{ color: rowStyle.text }}>{item.negociacoes}</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-sm font-bold" style={{ color: rowStyle.text }}>
                            {item.valorImovel > 0 ? formatCurrency(item.valorImovel) : '-'}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-sm font-bold" style={{ color: rowStyle.text }}>
                            {item.visitas}/{item.totalLeads} ({item.taxaConversaoVisita.toFixed(0)}%)
                          </div>
                          <div className="text-xs mt-1 font-medium" style={{ color: rowStyle.text }}>
                            Lead → Visita
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-sm font-bold" style={{ color: rowStyle.text }}>
                            {item.negociacoes}/{item.totalLeads} ({item.taxaConversaoNegociacao.toFixed(0)}%)
                          </div>
                          <div className="text-xs mt-1 font-medium" style={{ color: rowStyle.text }}>
                            Lead → Negoc.
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center p-4 border-t border-bg-secondary/40">
                <div className="text-sm text-text-secondary">
                  Mostrando {startIndex + 1} a {Math.min(endIndex, codigoData.length)} de {codigoData.length} imóveis
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentPage(prev => Math.max(1, prev - 1));
                    }}
                    disabled={currentPage === 1}
                    className="border-bg-secondary/40 text-text-secondary hover:bg-bg-secondary/20"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex items-center px-3 text-sm text-text-primary">
                    {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentPage(prev => Math.min(totalPages, prev + 1));
                    }}
                    disabled={currentPage === totalPages}
                    className="border-bg-secondary/40 text-text-secondary hover:bg-bg-secondary/20"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </div>
        </>
      </CardContent>
    </Card>
  );
};
