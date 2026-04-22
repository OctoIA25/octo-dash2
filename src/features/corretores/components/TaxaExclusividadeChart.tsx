/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { useMemo, useState, useEffect } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, TrendingUp, Calendar, Building2 } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

interface TaxaExclusividadeChartProps {
  leads: ProcessedLead[];
}

export const TaxaExclusividadeChart = ({ leads }: TaxaExclusividadeChartProps) => {
  // Estado para o mês selecionado
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Gerar lista de meses disponíveis (últimos 12 meses)
  const availableMonths = useMemo(() => {
    const hoje = new Date();
    const meses = [];
    
    for (let i = 11; i >= 0; i--) {
      const mes = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const mesFormatado = mes.toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' });
      const mesKey = `${mes.getMonth()}-${mes.getFullYear()}`;
      meses.push({ label: mesFormatado, value: mesKey });
    }
    
    return meses;
  }, []);

  // Definir mês atual como padrão ao carregar
  useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[availableMonths.length - 1].value);
    }
  }, [availableMonths, selectedMonth]);

  const estudoMercadoData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Filtrar apenas leads de proprietários/vendedores
    const leadsProprietarios = leads.filter(lead => {
      const tipoLead = lead.tipo_lead?.toLowerCase() || '';
      return tipoLead.includes('vendedor') || tipoLead.includes('proprietário') || tipoLead.includes('proprietario');
    });

    // Filtrar estudos assinados (apresentados ou em etapas avançadas)
    const estudosAssinados = leadsProprietarios.filter(lead => {
      const etapa = lead.etapa_atual?.toLowerCase() || '';
      return etapa.includes('apresent') || 
             etapa.includes('negociação') || 
             etapa.includes('negociacao') ||
             etapa.includes('proposta') ||
             etapa.includes('fechamento');
    });

    // Se houver mês selecionado, filtrar por ele
    let estudosFiltrados = estudosAssinados;
    if (selectedMonth) {
      const [mes, ano] = selectedMonth.split('-').map(Number);
      estudosFiltrados = estudosAssinados.filter(lead => {
        if (!lead.data_entrada) return false;
        const dataLead = new Date(lead.data_entrada);
        return dataLead.getMonth() === mes && dataLead.getFullYear() === ano;
      });
    }

    // Análise por tipo de negócio
    const porNegocio = {
      venda: estudosFiltrados.filter(lead => {
        const tipo = lead.tipo_negocio?.toLowerCase() || '';
        return tipo.includes('venda') || tipo.includes('compra');
      }).length,
      locacao: estudosFiltrados.filter(lead => {
        const tipo = lead.tipo_negocio?.toLowerCase() || '';
        return tipo.includes('locação') || tipo.includes('locacao') || tipo.includes('aluguel');
      }).length,
      outros: 0
    };
    porNegocio.outros = estudosFiltrados.length - porNegocio.venda - porNegocio.locacao;

    // Análise por tipo de imóvel (baseado em código, observações ou preferências)
    const identificarTipoImovel = (lead: ProcessedLead): string => {
      const textos = [
        lead.codigo_imovel?.toLowerCase() || '',
        lead.observacoes?.toLowerCase() || '',
        lead.Preferencias_lead?.toLowerCase() || ''
      ].join(' ');

      if (textos.includes('casa')) return 'casa';
      if (textos.includes('apartamento') || textos.includes('apto') || textos.includes('ap ')) return 'apartamento';
      if (textos.includes('terreno') || textos.includes('lote')) return 'terreno';
      if (textos.includes('comercial') || textos.includes('sala') || textos.includes('loja')) return 'comercial';
      return 'outros';
    };

    const porImovel = {
      casa: 0,
      apartamento: 0,
      terreno: 0,
      comercial: 0,
      outros: 0
    };

    estudosFiltrados.forEach(lead => {
      const tipo = identificarTipoImovel(lead);
      porImovel[tipo as keyof typeof porImovel]++;
    });

    // Calcular percentuais
    const total = estudosFiltrados.length;
    const percentuais = {
      negocio: {
        venda: total > 0 ? (porNegocio.venda / total) * 100 : 0,
        locacao: total > 0 ? (porNegocio.locacao / total) * 100 : 0,
        outros: total > 0 ? (porNegocio.outros / total) * 100 : 0
      },
      imovel: {
        casa: total > 0 ? (porImovel.casa / total) * 100 : 0,
        apartamento: total > 0 ? (porImovel.apartamento / total) * 100 : 0,
        terreno: total > 0 ? (porImovel.terreno / total) * 100 : 0,
        comercial: total > 0 ? (porImovel.comercial / total) * 100 : 0,
        outros: total > 0 ? (porImovel.outros / total) * 100 : 0
      }
    };

    return {
      total,
      porNegocio,
      porImovel,
      percentuais,
      estudosFiltrados
    };
  }, [leads, selectedMonth]);

  if (!estudoMercadoData) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full">
        <CardHeader className="pb-3">
          <StandardCardTitle icon={Home}>
            Análise de Estudos de Mercado
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[600px]">
          <p className="text-text-secondary">Carregando dados...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full flex flex-col">
      <CardHeader className="pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-text-primary text-xl neon-text flex items-center gap-2">
            <Home className="h-6 w-6 text-blue-400" />
            Análise de Estudos de Mercado
            <TrendingUp className="h-5 w-5 text-green-400 ml-2" />
          </CardTitle>
          
          {/* Seletor de Mês */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 bg-bg-secondary/60 border border-bg-secondary/60 rounded-lg text-text-primary font-semibold text-sm hover:bg-bg-secondary/80 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Todos os Meses</option>
              {availableMonths.map(mes => (
                <option key={mes.value} value={mes.value}>
                  {mes.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
        
        {/* Card de Total de Estudos Assinados */}
        <div className="text-center p-6 rounded-lg border bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/30">
          <div className="text-5xl font-bold mb-2 text-purple-400">
            {estudoMercadoData.total}
          </div>
          <div className="text-sm text-text-secondary uppercase tracking-wider">
            Estudos de Mercado Assinados
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {selectedMonth ? `No mês selecionado` : `Todos os períodos`}
          </div>
        </div>

        {/* Seção: Tipo de Negócio */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-5 w-5 text-cyan-400" />
            <h3 className="text-text-primary font-semibold text-sm uppercase tracking-wider">
              Por Tipo de Negócio
            </h3>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            {/* Venda */}
            <div className="p-4 rounded-lg border bg-green-500/10 border-green-500/30 transition-all hover:scale-105">
              <div className="text-center">
                <div className="text-3xl mb-1">💰</div>
                <div className="text-3xl font-bold mb-1 text-green-400">
                  {estudoMercadoData.porNegocio.venda}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  Venda
                </div>
                <div className="text-sm font-bold text-green-400">
                  {estudoMercadoData.percentuais.negocio.venda.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Locação */}
            <div className="p-4 rounded-lg border bg-blue-500/10 border-blue-500/30 transition-all hover:scale-105">
              <div className="text-center">
                <div className="text-3xl mb-1">🔑</div>
                <div className="text-3xl font-bold mb-1 text-blue-400">
                  {estudoMercadoData.porNegocio.locacao}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  Locação
                </div>
                <div className="text-sm font-bold text-blue-400">
                  {estudoMercadoData.percentuais.negocio.locacao.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Outros */}
            <div className="p-4 rounded-lg border bg-gray-500/10 border-gray-500/30 transition-all hover:scale-105">
              <div className="text-center">
                <div className="text-3xl mb-1">📋</div>
                <div className="text-3xl font-bold mb-1 text-gray-400">
                  {estudoMercadoData.porNegocio.outros}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  Outros
                </div>
                <div className="text-sm font-bold text-gray-400">
                  {estudoMercadoData.percentuais.negocio.outros.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Seção: Tipo de Imóvel */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Home className="h-5 w-5 text-orange-400" />
            <h3 className="text-text-primary font-semibold text-sm uppercase tracking-wider">
              Por Tipo de Imóvel
            </h3>
          </div>
          
          <div className="grid grid-cols-5 gap-3">
            {/* Casa */}
            <div className="p-3 rounded-lg border bg-orange-500/10 border-orange-500/30 transition-all hover:scale-105">
              <div className="text-center">
                <div className="text-2xl mb-1">🏠</div>
                <div className="text-2xl font-bold mb-1 text-orange-400">
                  {estudoMercadoData.porImovel.casa}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  Casas
                </div>
                <div className="text-xs font-bold text-orange-400">
                  {estudoMercadoData.percentuais.imovel.casa.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Apartamento */}
            <div className="p-3 rounded-lg border bg-purple-500/10 border-purple-500/30 transition-all hover:scale-105">
              <div className="text-center">
                <div className="text-2xl mb-1">🏢</div>
                <div className="text-2xl font-bold mb-1 text-purple-400">
                  {estudoMercadoData.porImovel.apartamento}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  Aptos
                </div>
                <div className="text-xs font-bold text-purple-400">
                  {estudoMercadoData.percentuais.imovel.apartamento.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Terreno */}
            <div className="p-3 rounded-lg border bg-green-500/10 border-green-500/30 transition-all hover:scale-105">
              <div className="text-center">
                <div className="text-2xl mb-1">🌳</div>
                <div className="text-2xl font-bold mb-1 text-green-400">
                  {estudoMercadoData.porImovel.terreno}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  Terrenos
                </div>
                <div className="text-xs font-bold text-green-400">
                  {estudoMercadoData.percentuais.imovel.terreno.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Comercial */}
            <div className="p-3 rounded-lg border bg-cyan-500/10 border-cyan-500/30 transition-all hover:scale-105">
              <div className="text-center">
                <div className="text-2xl mb-1">🏪</div>
                <div className="text-2xl font-bold mb-1 text-cyan-400">
                  {estudoMercadoData.porImovel.comercial}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  Comercial
                </div>
                <div className="text-xs font-bold text-cyan-400">
                  {estudoMercadoData.percentuais.imovel.comercial.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Outros */}
            <div className="p-3 rounded-lg border bg-gray-500/10 border-gray-500/30 transition-all hover:scale-105">
              <div className="text-center">
                <div className="text-2xl mb-1">📦</div>
                <div className="text-2xl font-bold mb-1 text-gray-400">
                  {estudoMercadoData.porImovel.outros}
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                  Outros
                </div>
                <div className="text-xs font-bold text-gray-400">
                  {estudoMercadoData.percentuais.imovel.outros.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
};
