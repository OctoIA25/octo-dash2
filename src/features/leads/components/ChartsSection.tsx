import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LineChart, Line, Tooltip } from "recharts";
import { ProcessedLead } from "@/data/realLeadsProcessor";
import { getOrigemData } from "@/utils/metrics";

// 📋 Consulte context.md para: distribuição de leads, gráficos de performance, responsividade
interface ChartsSectionProps {
  leads: ProcessedLead[];
}

export const ChartsSection = ({ leads }: ChartsSectionProps) => {
  // Usar TODOS os leads, ignorando campo Exists
  const activeLeads = leads;
  
  // Dados para gráfico de origem
  const origemData = getOrigemData(leads);
  
  // Dados para distribuição do funil (etapas alinhadas com o Kanban)
  const funnelStages = [
    { name: 'Novos Leads', fill: '#06b6d4' },
    { name: 'Interação', fill: '#3b82f6' },
    { name: 'Visita Agendada', fill: '#22c55e' },
    { name: 'Visita Realizada', fill: '#16a34a' },
    { name: 'Negociação', fill: '#f97316' },
    { name: 'Proposta Criada', fill: '#ea580c' },
    { name: 'Proposta Enviada', fill: '#ef4444' },
    { name: 'Proposta Assinada', fill: '#dc2626' },
  ];
  const funnelDistribution = funnelStages.map(stage => ({
    name: stage.name,
    value: activeLeads.filter(lead =>
      lead.etapa_atual?.toLowerCase().trim() === stage.name.toLowerCase().trim()
    ).length,
    fill: stage.fill
  })).filter(item => item.value > 0);

  // Dados reais de leads criados nos últimos 7 dias
  const atividadesData = (() => {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const hoje = new Date();
    const resultado: { day: string; atividades: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const dia = new Date(hoje);
      dia.setDate(hoje.getDate() - i);
      const diaSemana = dias[dia.getDay()];
      const diaStr = dia.toISOString().split('T')[0];

      const count = activeLeads.filter(lead => {
        const entrada = lead.data_entrada?.split('T')[0];
        return entrada === diaStr;
      }).length;

      resultado.push({ day: diaSemana, atividades: count });
    }

    return resultado;
  })();

  // Dados de tempo de ciclo por origem
  const tempoCicloData = origemData.map(item => {
    const leadsOrigem = activeLeads.filter(lead => 
      lead.origem_lead === item.name && lead.data_finalizacao
    );
    
    const tempoMedio = leadsOrigem.length > 0 ? 
      leadsOrigem.reduce((sum, lead) => {
        const entrada = new Date(lead.data_entrada);
        const finalizacao = new Date(lead.data_finalizacao!);
        const diffTime = Math.abs(finalizacao.getTime() - entrada.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return sum + diffDays;
      }, 0) / leadsOrigem.length : 0;

    return {
      name: item.name,
      tempo: Math.round(tempoMedio),
      fill: item.fill
    };
  }).filter(item => item.tempo > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Origem dos Leads */}
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
        <h3 className="text-text-primary text-base font-semibold mb-4 flex items-center gap-2">
          <div className="w-1 h-4 bg-accent-purple rounded-full glow-accent-purple"></div>
          Origem dos Leads
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={origemData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                dataKey="value"
              >
                {origemData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [value, 'Leads']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--bg-card))',
                  border: '1px solid hsl(var(--bg-secondary))',
                  borderRadius: '8px',
                  color: 'hsl(var(--text-primary))'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {origemData.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.fill }}
              />
              <span className="text-text-secondary text-sm">{item.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Distribuição do Funil */}
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
        <h3 className="text-text-primary text-base font-semibold mb-4 flex items-center gap-2">
          <div className="w-1 h-4 bg-accent-blue rounded-full glow-accent-blue"></div>
          Distribuição do Funil
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelDistribution}>
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--text-primary))', fontSize: 11, fontWeight: 500 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--text-primary))', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip
                formatter={(value) => [value, 'Leads']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--bg-card))',
                  border: '1px solid hsl(var(--bg-secondary))',
                  borderRadius: '8px',
                  color: 'hsl(var(--text-primary))'
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Atividades e Interações */}
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
        <h3 className="text-text-primary text-base font-semibold mb-4 flex items-center gap-2">
          <div className="w-1 h-4 bg-accent-green rounded-full glow-accent-green"></div>
          Atividades e Interações
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={atividadesData}>
              <XAxis 
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--text-primary))', fontSize: 11, fontWeight: 500 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--text-primary))', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip
                formatter={(value) => [value, 'Atividades']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--bg-card))',
                  border: '1px solid hsl(var(--bg-secondary))',
                  borderRadius: '8px',
                  color: 'hsl(var(--text-primary))'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="atividades" 
                stroke="hsl(var(--accent-blue))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--accent-blue))', r: 4 }}
                activeDot={{ r: 6, fill: 'hsl(var(--accent-blue))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tempo de Ciclo por Origem */}
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
        <h3 className="text-text-primary text-base font-semibold mb-4 flex items-center gap-2">
          <div className="w-1 h-4 bg-accent-gray rounded-full glow-accent-gray"></div>
          Tempo de Ciclo por Origem
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tempoCicloData}>
              <XAxis 
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--text-primary))', fontSize: 11, fontWeight: 500 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--text-primary))', fontSize: 11, fontWeight: 500 }}
              />
              <Tooltip
                formatter={(value) => [value, 'Dias']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--bg-card))',
                  border: '1px solid hsl(var(--bg-secondary))',
                  borderRadius: '8px',
                  color: 'hsl(var(--text-primary))'
                }}
              />
              <Bar dataKey="tempo" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};