import { useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  UserCheck, 
  Building, 
  TrendingUp, 
  Calendar, 
  Eye, 
  CheckCircle,
  Target,
  Activity,
  Phone,
  MapPin,
  HandHeart,
  DollarSign,
  BarChart3,
  Clock,
  Award,
  Home
} from 'lucide-react';

interface SectionMetricsProps {
  leads: ProcessedLead[];
  activeSection: 'leads' | 'proprietarios' | 'corretores' | 'imoveis';
}

export const SectionMetrics = ({ leads, activeSection }: SectionMetricsProps) => {
  
  // Métricas específicas para Leads
  const leadsMetrics = useMemo(() => {
    const totalLeads = leads.length;
    
    // Separar métricas conforme solicitado: Interações > Visitas > Lead no sistema
    const interacoes = leads.filter(lead => 
      lead.etapa_atual === 'Interação' ||
      lead.etapa_atual === 'Em Atendimento'
    ).length;
    
    const visitas = leads.filter(lead => 
      lead.Data_visita && lead.Data_visita.trim() !== "" ||
      lead.etapa_atual === 'Visita Agendada' ||
      lead.etapa_atual === 'Visita Realizada'
    ).length;
    
    const leadNoSistema = leads.filter(lead => 
      lead.etapa_atual !== 'Em Atendimento' && 
      lead.etapa_atual !== 'Interação' &&
      lead.corretor_responsavel && lead.corretor_responsavel.trim() !== ""
    ).length;

    // Métricas de temperatura
    const quentes = leads.filter(l => l.status_temperatura === 'Quente').length;
    const mornos = leads.filter(l => l.status_temperatura === 'Morno').length;
    const frios = leads.filter(l => l.status_temperatura === 'Frio').length;

    // Métricas de conversão
    const visitasRealizadas = leads.filter(l => 
      l.etapa_atual === 'Visita Realizada' ||
      l.etapa_atual === 'Visita realizada'
    ).length;
    
    const emNegociacao = leads.filter(l => 
      l.etapa_atual === 'Em Negociação' ||
      l.etapa_atual === 'Negociação' ||
      l.etapa_atual === 'Proposta Enviada'
    ).length;

    return {
      totalLeads,
      interacoes,
      visitas,
      leadNoSistema,
      quentes,
      mornos,
      frios,
      visitasRealizadas,
      emNegociacao,
      taxaConversaoInteracao: interacoes > 0 ? (visitas / interacoes * 100) : 0,
      taxaConversaoVisita: visitas > 0 ? (visitasRealizadas / visitas * 100) : 0,
      taxaNegociacao: visitasRealizadas > 0 ? (emNegociacao / visitasRealizadas * 100) : 0
    };
  }, [leads]);

  // Métricas específicas para Corretores
  const corretoresMetrics = useMemo(() => {
    const corretoresUnicos = [...new Set(leads
      .filter(lead => lead.corretor_responsavel && lead.corretor_responsavel.trim() !== "")
      .map(lead => lead.corretor_responsavel))];

    const performanceCorretores = corretoresUnicos.map(corretor => {
      const leadsCorretor = leads.filter(l => l.corretor_responsavel === corretor);
      const visitasCorretor = leadsCorretor.filter(l => 
        l.Data_visita && l.Data_visita.trim() !== ""
      ).length;
      const negociacoesCorretor = leadsCorretor.filter(l => 
        l.etapa_atual === 'Em Negociação' ||
        l.etapa_atual === 'Negociação' ||
        l.valor_final_venda && l.valor_final_venda > 0
      ).length;

      return {
        nome: corretor,
        totalLeads: leadsCorretor.length,
        visitas: visitasCorretor,
        negociacoes: negociacoesCorretor,
        taxaConversao: leadsCorretor.length > 0 ? (negociacoesCorretor / leadsCorretor.length * 100) : 0
      };
    }).sort((a, b) => b.taxaConversao - a.taxaConversao);

    const totalCorretores = corretoresUnicos.length;
    const corretoresAtivos = performanceCorretores.filter(c => c.totalLeads > 0).length;
    const melhorCorretor = performanceCorretores[0];
    const pipelineTotal = leads.reduce((acc, lead) => acc + (lead.valor_imovel || 0), 0);

    return {
      totalCorretores,
      corretoresAtivos,
      melhorCorretor,
      performanceCorretores,
      pipelineTotal
    };
  }, [leads]);

  // Métricas específicas para Imóveis
  const imoveisMetrics = useMemo(() => {
    const imoveisUnicos = [...new Set(leads
      .filter(lead => lead.codigo_imovel && lead.codigo_imovel.trim() !== "")
      .map(lead => lead.codigo_imovel))];

    const tiposNegocio = [...new Set(leads
      .filter(lead => lead.tipo_negocio && lead.tipo_negocio.trim() !== "")
      .map(lead => lead.tipo_negocio))];

    const valorMedio = leads.length > 0 ? 
      leads.reduce((acc, lead) => acc + (lead.valor_imovel || 0), 0) / leads.length : 0;

    const valorTotal = leads.reduce((acc, lead) => acc + (lead.valor_imovel || 0), 0);

    const imoveisMaisInteresse = [...new Set(leads.map(l => l.codigo_imovel))]
      .filter(codigo => codigo && codigo.trim() !== "")
      .map(codigo => ({
        codigo,
        interesse: leads.filter(l => l.codigo_imovel === codigo).length
      }))
      .sort((a, b) => b.interesse - a.interesse)
      .slice(0, 5);

    return {
      totalImoveis: imoveisUnicos.length,
      tiposNegocio,
      valorMedio,
      valorTotal,
      imoveisMaisInteresse
    };
  }, [leads]);

  const renderLeadsMetrics = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Fluxo Principal: Interações > Visitas > Lead no Sistema */}
      <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30 card-glow">
        <CardHeader className="pb-3">
          <CardTitle className="text-blue-400 text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Interações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{leadsMetrics.interacoes}</div>
          <p className="text-xs text-blue-300">Primeiro contato estabelecido</p>
          <div className="mt-3 text-xs text-blue-400">
            {leadsMetrics.totalLeads > 0 ? 
              `${((leadsMetrics.interacoes / leadsMetrics.totalLeads) * 100).toFixed(1)}% do total` : '0%'
            }
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30 card-glow">
        <CardHeader className="pb-3">
          <CardTitle className="text-green-400 text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Visitas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{leadsMetrics.visitas}</div>
          <p className="text-xs text-green-300">Visitas agendadas/realizadas</p>
          <div className="mt-3 text-xs text-green-400">
            {leadsMetrics.interacoes > 0 ? 
              `${leadsMetrics.taxaConversaoInteracao.toFixed(1)}% de conversão` : '0%'
            }
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/30 card-glow">
        <CardHeader className="pb-3">
          <CardTitle className="text-purple-400 text-sm flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Lead no Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{leadsMetrics.leadNoSistema}</div>
          <p className="text-xs text-purple-300">Passados para o CRM</p>
          <div className="mt-3 text-xs text-purple-400">
            Todos os leads processados pela Lia
          </div>
        </CardContent>
      </Card>

      {/* Métricas de Temperatura */}
      <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/30 card-glow">
        <CardHeader className="pb-3">
          <CardTitle className="text-red-400 text-sm flex items-center gap-2">
            <Target className="h-4 w-4" />
            Leads Quentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{leadsMetrics.quentes}</div>
          <p className="text-xs text-red-300">Alta probabilidade</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border-yellow-500/30 card-glow">
        <CardHeader className="pb-3">
          <CardTitle className="text-yellow-400 text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Leads Mornos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{leadsMetrics.mornos}</div>
          <p className="text-xs text-yellow-300">Necessita aquecimento</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-gray-500/10 to-slate-500/10 border-gray-500/30 card-glow">
        <CardHeader className="pb-3">
          <CardTitle className="text-gray-400 text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Taxa de Negociação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{leadsMetrics.taxaNegociacao.toFixed(1)}%</div>
          <p className="text-xs text-gray-300">Visitas → Negociação</p>
        </CardContent>
      </Card>
    </div>
  );

  const renderCorretoresMetrics = () => (
    <div className="space-y-4">
      {/* Métricas Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30 card-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-purple-400 text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total de Corretores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{corretoresMetrics.totalCorretores}</div>
            <p className="text-xs text-purple-300">Corretores cadastrados</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30 card-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-400 text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Corretores Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{corretoresMetrics.corretoresAtivos}</div>
            <p className="text-xs text-green-300">Com leads ativos</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30 card-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-400 text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Pipeline Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white mb-2 metric-value-sm">
              R$ {(corretoresMetrics.pipelineTotal / 1000000).toFixed(1)}M
            </div>
            <p className="text-xs text-blue-300">Valor em potencial</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance dos Corretores */}
      <Card className="bg-bg-card/40 border-purple-500/30 card-glow">
        <CardHeader>
          <CardTitle className="text-purple-400 text-lg flex items-center gap-2 title-card">
            <Award className="h-5 w-5" />
            Performance dos Corretores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {corretoresMetrics.performanceCorretores.slice(0, 5).map((corretor, index) => (
              <div key={corretor.nome} className="flex items-center justify-between p-3 bg-bg-secondary/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                    index === 1 ? 'bg-gray-500/20 text-gray-400' :
                    index === 2 ? 'bg-orange-500/20 text-orange-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-white font-medium">{corretor.nome}</p>
                    <p className="text-xs text-gray-400">{corretor.totalLeads} leads</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-green-400 font-bold">{corretor.taxaConversao.toFixed(1)}%</p>
                  <p className="text-xs text-gray-400">{corretor.negociacoes} negociações</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderImoveisMetrics = () => (
    <div className="space-y-4">
      {/* Métricas Gerais de Imóveis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/30 card-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-400 text-sm flex items-center gap-2">
              <Building className="h-4 w-4" />
              Total de Imóveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white mb-2 metric-value-sm">{imoveisMetrics.totalImoveis}</div>
            <p className="text-xs text-orange-300">Imóveis com interesse</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30 card-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-400 text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Valor Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white mb-2 metric-value-sm">
              R$ {(imoveisMetrics.valorMedio / 1000).toFixed(0)}K
            </div>
            <p className="text-xs text-green-300">Ticket médio</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30 card-glow">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-400 text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Valor Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white mb-2 metric-value-sm">
              R$ {(imoveisMetrics.valorTotal / 1000000).toFixed(1)}M
            </div>
            <p className="text-xs text-blue-300">Potencial total</p>
          </CardContent>
        </Card>
      </div>

      {/* Imóveis com Mais Interesse */}
      <Card className="bg-bg-card/40 border-orange-500/30 card-glow">
        <CardHeader>
          <CardTitle className="text-orange-400 text-lg flex items-center gap-2 title-card">
            <Home className="h-4 w-4" />
            Imóveis com Mais Interesse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {imoveisMetrics.imoveisMaisInteresse.map((imovel, index) => (
              <div key={imovel.codigo} className="flex items-center justify-between p-3 bg-bg-secondary/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-white font-medium">Código: {imovel.codigo}</p>
                    <p className="text-xs text-gray-400">Imóvel de interesse</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-orange-400 font-bold">{imovel.interesse}</p>
                  <p className="text-xs text-gray-400">leads interessados</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tipos de Negócio */}
      <Card className="bg-bg-card/40 border-blue-500/30 card-glow">
        <CardHeader>
          <CardTitle className="text-blue-400 text-lg flex items-center gap-2 title-card">
            <HandHeart className="h-4 w-4" />
            Tipos de Negócio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {imoveisMetrics.tiposNegocio.map((tipo) => (
              <div key={tipo} className="p-3 bg-bg-secondary/20 rounded-lg text-center">
                <p className="text-blue-400 font-medium">{tipo}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {leads.filter(l => l.tipo_negocio === tipo).length} leads
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {activeSection === 'leads' && renderLeadsMetrics()}
      {activeSection === 'proprietarios' && renderLeadsMetrics()}
      {activeSection === 'corretores' && renderCorretoresMetrics()}
      {activeSection === 'imoveis' && renderImoveisMetrics()}
    </div>
  );
};
