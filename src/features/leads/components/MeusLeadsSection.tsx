import { useMemo, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { 
  User, 
  TrendingUp, 
  Target, 
  DollarSign,
  Calendar,
  Phone,
  MapPin,
  Eye,
  MessageCircle,
  Award,
  Activity,
  Clock,
  CheckCircle,
  CalendarRange,
  RotateCcw,
  Filter
} from 'lucide-react';
import { LeadsTable } from './LeadsTable';
import { formatCurrency } from '@/utils/metrics';
import { EnhancedFunnelChart } from './EnhancedFunnelChart';
import { LeadsMetricsChart } from './LeadsMetricsChart';

interface MeusLeadsSectionProps {
  leads: ProcessedLead[];
}

type PeriodoFiltro = 'todos' | 'hoje' | '7dias' | '30dias' | '90dias' | 'personalizado';

export const MeusLeadsSection = ({ leads }: MeusLeadsSectionProps) => {
  const { currentCorretor } = useAuth();
  
  // Estados dos filtros
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Filtrar leads do corretor atual
  const meusLeads = useMemo(() => {
    if (!currentCorretor) return [];
    
    return leads.filter(lead => 
      lead.corretor_responsavel === currentCorretor
    );
  }, [leads, currentCorretor]);

  // Filtrar leads por período
  const leadsFiltrados = useMemo(() => {
    if (periodoFiltro === 'todos') return meusLeads;

    const agora = new Date();
    let dataLimite: Date;

    switch (periodoFiltro) {
      case 'hoje':
        dataLimite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
        return meusLeads.filter(lead => new Date(lead.data_lead) >= dataLimite);
      
      case '7dias':
        dataLimite = new Date(agora);
        dataLimite.setDate(agora.getDate() - 7);
        return meusLeads.filter(lead => new Date(lead.data_lead) >= dataLimite);
      
      case '30dias':
        dataLimite = new Date(agora);
        dataLimite.setDate(agora.getDate() - 30);
        return meusLeads.filter(lead => new Date(lead.data_lead) >= dataLimite);
      
      case '90dias':
        dataLimite = new Date(agora);
        dataLimite.setDate(agora.getDate() - 90);
        return meusLeads.filter(lead => new Date(lead.data_lead) >= dataLimite);
      
      case 'personalizado':
        if (!dataInicio && !dataFim) return meusLeads;
        
        return meusLeads.filter(lead => {
          const dataLead = new Date(lead.data_lead);
          const inicio = dataInicio ? new Date(dataInicio) : new Date(0);
          const fim = dataFim ? new Date(dataFim) : new Date();
          
          return dataLead >= inicio && dataLead <= fim;
        });
      
      default:
        return meusLeads;
    }
  }, [meusLeads, periodoFiltro, dataInicio, dataFim]);

  // Métricas detalhadas do corretor - Baseadas nos leads FILTRADOS
  const metrics = useMemo(() => {
    const total = leadsFiltrados.length;
    const quentes = leadsFiltrados.filter(lead => lead.status_temperatura === 'Quente').length;
    const mornos = leadsFiltrados.filter(lead => lead.status_temperatura === 'Morno').length;
    const frios = leadsFiltrados.filter(lead => lead.status_temperatura === 'Frio' || !lead.status_temperatura).length;
    
    const pipeline = leadsFiltrados.reduce((acc, lead) => acc + (lead.valor_imovel || 0), 0);
    const fechamentos = leadsFiltrados.filter(lead => 
      lead.etapa_atual === 'Negócio Fechado' || 
      lead.etapa_atual === 'Fechamento' || 
      lead.etapa_atual === 'Finalizado'
    ).length;
    const propostas = leadsFiltrados.filter(lead => lead.etapa_atual === 'Proposta Enviada' || lead.etapa_atual === 'Negociação').length;
    const taxaConversao = total > 0 ? (fechamentos / total * 100) : 0;
    
    // Leads por etapa
    const porEtapa = leadsFiltrados.reduce((acc, lead) => {
      const etapa = lead.etapa_atual || 'Interação';
      acc[etapa] = (acc[etapa] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Leads recentes (últimos 7 dias)
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    const leadsSemana = leadsFiltrados.filter(lead => new Date(lead.data_lead) >= seteDiasAtras).length;

    // Ticket médio
    const leadsComValor = leadsFiltrados.filter(lead => lead.valor_imovel && lead.valor_imovel > 0);
    const ticketMedio = leadsComValor.length > 0 ? 
      leadsComValor.reduce((acc, lead) => acc + (lead.valor_imovel || 0), 0) / leadsComValor.length : 0;

    return {
      total,
      quentes,
      mornos,
      frios,
      pipeline,
      fechamentos,
      propostas,
      taxaConversao,
      porEtapa,
      leadsSemana,
      ticketMedio
    };
  }, [leadsFiltrados]);

  const etapas = [
    'Interação',
    'Visita Agendada',
    'Visita Realizada',
    'Proposta Enviada',
    'Negociação',
    'Negócio Fechado',
    'Finalizado'
  ];

  if (!currentCorretor) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Card className="bg-neutral-800/40 backdrop-blur-sm border-gray-500/60">
          <CardContent className="p-6 text-center">
            <User className="h-12 w-12 text-text-secondary mx-auto mb-4" />
            <p className="text-text-secondary">Nenhum corretor selecionado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <SectionHeader
        title="Meus Leads"
        icon={User}
      />
      <div className="w-full p-6 space-y-6">

        {/* Filtros de Período */}
        <Card className="bg-neutral-800/40 backdrop-blur-sm border-gray-500/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-semibold text-text-primary">Período:</span>
              </div>
              
              {/* Seletor de Período */}
              <Select value={periodoFiltro} onValueChange={(value) => setPeriodoFiltro(value as PeriodoFiltro)}>
                <SelectTrigger className="w-[200px] h-9 bg-neutral-700/50 border-gray-600/50">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">📅 Todos os períodos</SelectItem>
                  <SelectItem value="hoje">📆 Hoje</SelectItem>
                  <SelectItem value="7dias">📊 Últimos 7 dias</SelectItem>
                  <SelectItem value="30dias">📈 Últimos 30 dias</SelectItem>
                  <SelectItem value="90dias">📉 Últimos 90 dias</SelectItem>
                  <SelectItem value="personalizado">🎯 Personalizado</SelectItem>
                </SelectContent>
              </Select>

              {/* Campos de Data Personalizada */}
              {periodoFiltro === 'personalizado' && (
                <>
                  <div className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-text-secondary">De:</span>
                    <Input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="w-[150px] h-9 bg-neutral-700/50 border-gray-600/50"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-secondary">Até:</span>
                    <Input
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="w-[150px] h-9 bg-neutral-700/50 border-gray-600/50"
                    />
                  </div>
                </>
              )}

              {/* Botão Limpar Filtros */}
              {periodoFiltro !== 'todos' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPeriodoFiltro('todos');
                    setDataInicio('');
                    setDataFim('');
                  }}
                  className="h-9 bg-neutral-700/50 border-gray-600/50 hover:bg-neutral-600/50"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Limpar
                </Button>
              )}

              {/* Contador de Leads */}
              <div className="ml-auto text-sm text-text-secondary">
                Mostrando <strong className="text-purple-400">{leadsFiltrados.length}</strong> de <strong className="text-text-primary">{meusLeads.length}</strong> leads
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Métricas principais expandidas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-neutral-800/40 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-secondary text-sm">Total de Leads</p>
                  <p className="text-2xl font-bold text-text-primary">{metrics.total}</p>
                  <p className="text-xs text-text-secondary">Últimos 7 dias: {metrics.leadsSemana}</p>
                </div>
                <Target className="h-8 w-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/40 backdrop-blur-sm border-orange-500/30 shadow-lg shadow-orange-500/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-secondary text-sm">Leads por Temperatura</p>
                  <div className="flex space-x-2 mt-1">
                    <Badge variant="outline" className="text-red-400 border-red-500/50 text-xs">
                      🔥 {metrics.quentes}
                    </Badge>
                    <Badge variant="outline" className="text-orange-400 border-orange-500/50 text-xs">
                      🟡 {metrics.mornos}
                    </Badge>
                    <Badge variant="outline" className="text-blue-400 border-blue-500/50 text-xs">
                      ❄️ {metrics.frios}
                    </Badge>
                  </div>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/40 backdrop-blur-sm border-green-500/30 shadow-lg shadow-green-500/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-secondary text-sm">Pipeline Total</p>
                  <p className="text-lg font-bold text-text-primary">
                    {formatCurrency(metrics.pipeline)}
                  </p>
                  <p className="text-xs text-text-secondary">
                    Ticket médio: {formatCurrency(metrics.ticketMedio)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/40 backdrop-blur-sm border-blue-500/30 shadow-lg shadow-blue-500/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-secondary text-sm">Performance</p>
                  <p className="text-xl font-bold text-text-primary">
                    {metrics.taxaConversao.toFixed(1)}%
                  </p>
                  <p className="text-xs text-text-secondary">
                    {metrics.fechamentos} fechamentos | {metrics.propostas} propostas
                  </p>
                </div>
                <Award className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos pessoais */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-neutral-800/40 backdrop-blur-sm border-gray-500/60">
            <CardHeader>
              <CardTitle className="text-text-primary flex items-center">
                <Activity className="h-5 w-5 mr-2 text-purple-400" />
                Seu Funil de Vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EnhancedFunnelChart leads={leadsFiltrados} />
            </CardContent>
          </Card>

          <Card className="bg-neutral-800/40 backdrop-blur-sm border-gray-500/60">
            <CardHeader>
              <CardTitle className="text-text-primary flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-blue-400" />
                Métricas de Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LeadsMetricsChart leads={leadsFiltrados} />
            </CardContent>
          </Card>
        </div>

        {/* Leads por etapa */}
        <Card className="bg-neutral-800/40 backdrop-blur-sm border-gray-500/60">
          <CardHeader>
            <CardTitle className="text-text-primary flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-purple-400" />
              Leads por Etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {etapas.map((etapa) => (
                <div key={etapa} className="text-center p-3 bg-neutral-700/30 rounded-lg border border-gray-600/30">
                  <div className="text-lg font-bold text-text-primary">
                    {metrics.porEtapa[etapa] || 0}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {etapa}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tabela de leads */}
        <Card className="bg-neutral-800/40 backdrop-blur-sm border-gray-500/60">
          <CardHeader>
            <CardTitle className="text-text-primary flex items-center">
              <User className="h-5 w-5 mr-2 text-blue-400" />
              Seus Leads ({leadsFiltrados.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LeadsTable 
              leads={leadsFiltrados}
              maxHeight="600px"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
