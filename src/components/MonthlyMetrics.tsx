import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  DollarSign,
  Users,
  Target,
  BarChart3
} from "lucide-react";
import { ProcessedLead } from "@/data/realLeadsProcessor";
import { 
  calculateMonthlyMetrics, 
  getMonthlyComparison, 
  getLast6MonthsData,
  formatCurrency, 
  formatPercentage 
} from "@/utils/monthlyMetrics";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar } from "recharts";

interface MonthlyMetricsProps {
  leads: ProcessedLead[];
}

export const MonthlyMetrics = ({ leads }: MonthlyMetricsProps) => {
  const monthlyMetrics = calculateMonthlyMetrics(leads);
  const comparison = getMonthlyComparison(monthlyMetrics);
  const chartData = getLast6MonthsData(leads);

  if (!comparison) {
    return (
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 card-glow p-6">
        <div className="text-center text-text-secondary">
            <Calendar className="h-8 w-8 mx-auto mb-4 opacity-50" />
          <p>Dados insuficientes para métricas mensais</p>
        </div>
      </Card>
    );
  }

  const { current, previous, growth } = comparison;

  // Preparar dados para os gráficos
  const evolutionData = chartData.labels.map((label, index) => ({
    month: label,
    leads: chartData.datasets.leads[index],
    revenue: chartData.datasets.revenue[index] / 1000, // Em milhares
    conversion: chartData.datasets.conversion[index]
  }));

  return (
    <div className="space-y-6">
      {/* Comparação Mensal */}
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 card-glow">
        <div className="p-6 border-b border-bg-secondary/40">
          <h3 className="text-text-primary text-lg font-semibold flex items-center gap-2">
            <div className="w-1.5 h-6 bg-gradient-to-b from-accent-blue to-accent-purple rounded-full"></div>
            Métricas Mensais - {current.month} {current.year}
          </h3>
          {previous && (
            <p className="text-text-secondary text-sm mt-1">
              Comparação com {previous.month} {previous.year}
            </p>
          )}
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Novos Leads */}
            <div className="bg-bg-secondary/30 rounded-xl p-4 border border-bg-secondary/20">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-accent-blue/10 rounded-lg">
                  <Users className="h-4 w-4 text-accent-blue" />
                </div>
                {growth.leads !== 0 && (
                  <Badge 
                    variant="outline" 
                    className={`${growth.leads > 0 ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}
                  >
                    {growth.leads > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {formatPercentage(growth.leads)}
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{current.totalLeads}</p>
                <p className="text-text-secondary text-sm">Novos Leads</p>
              </div>
            </div>

            {/* Receita */}
            <div className="bg-bg-secondary/30 rounded-xl p-4 border border-bg-secondary/20">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-accent-green/10 rounded-lg">
                  <DollarSign className="h-4 w-4 text-accent-green" />
                </div>
                {growth.revenue !== 0 && previous && (
                  <Badge 
                    variant="outline" 
                    className={`${growth.revenue > 0 ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}
                  >
                    {growth.revenue > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {formatPercentage(growth.revenue)}
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{formatCurrency(current.revenue)}</p>
                <p className="text-text-secondary text-sm">Receita</p>
              </div>
            </div>

            {/* Taxa de Conversão */}
            <div className="bg-bg-secondary/30 rounded-xl p-4 border border-bg-secondary/20">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-accent-purple/10 rounded-lg">
                  <Target className="h-4 w-4 text-accent-purple" />
                </div>
                {growth.conversion !== 0 && previous && (
                  <Badge 
                    variant="outline" 
                    className={`${growth.conversion > 0 ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}
                  >
                    {growth.conversion > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {formatPercentage(growth.conversion)}
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{current.conversionRate.toFixed(1)}%</p>
                <p className="text-text-secondary text-sm">Conversão</p>
              </div>
            </div>

            {/* Ticket Médio */}
            <div className="bg-bg-secondary/30 rounded-xl p-4 border border-bg-secondary/20">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-accent-gray/10 rounded-lg">
                  <BarChart3 className="h-4 w-4 text-accent-gray" />
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{formatCurrency(current.averageTicket)}</p>
                <p className="text-text-secondary text-sm">Ticket Médio</p>
              </div>
            </div>
          </div>

          {/* Detalhes Adicionais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="text-center">
              <p className="text-text-secondary text-sm">Leads Fechados</p>
              <p className="text-xl font-semibold text-text-primary">{current.closedLeads}</p>
            </div>
            <div className="text-center">
              <p className="text-text-secondary text-sm">Visitas Realizadas</p>
              <p className="text-xl font-semibold text-text-primary">{current.visitasRealizadas}</p>
            </div>
            <div className="text-center">
              <p className="text-text-secondary text-sm">Pipeline</p>
              <p className="text-xl font-semibold text-text-primary">{formatCurrency(current.pipelineValue)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Gráficos de Evolução */}
      {evolutionData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Evolução de Leads */}
          <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 card-glow">
            <div className="p-5 border-b border-bg-secondary/40">
              <h4 className="text-text-primary font-semibold">Evolução de Leads</h4>
              <p className="text-text-secondary text-sm">Últimos 6 meses</p>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={evolutionData}>
                  <XAxis 
                    dataKey="month" 
                    axisLine={false}
                    tickLine={false}
                    className="text-text-secondary text-xs"
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    className="text-text-secondary text-xs"
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #3a3a3a',
                      borderRadius: '8px',
                      color: '#ffffff'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="leads" 
                    stroke="#4F8EFE" 
                    strokeWidth={3}
                    dot={{ fill: '#4F8EFE', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Evolução de Receita */}
          <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 card-glow">
            <div className="p-5 border-b border-bg-secondary/40">
              <h4 className="text-text-primary font-semibold">Evolução de Receita</h4>
              <p className="text-text-secondary text-sm">Últimos 6 meses (em milhares)</p>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={evolutionData}>
                  <XAxis 
                    dataKey="month" 
                    axisLine={false}
                    tickLine={false}
                    className="text-text-secondary text-xs"
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    className="text-text-secondary text-xs"
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #3a3a3a',
                      borderRadius: '8px',
                      color: '#ffffff'
                    }}
                    formatter={(value) => [`R$ ${value}k`, 'Receita']}
                  />
                  <Bar 
                    dataKey="revenue" 
                    fill="url(#revenueGradient)"
                    radius={[4, 4, 0, 0]}
                  />
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" />
                      <stop offset="100%" stopColor="#16A34A" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
