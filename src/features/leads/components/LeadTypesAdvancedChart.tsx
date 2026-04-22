import { useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { 
  TrendingUp, 
  Users, 
  DollarSign,
  Target,
  Home,
  Building
} from 'lucide-react';

interface LeadTypesAdvancedChartProps {
  leads: ProcessedLead[];
}

export const LeadTypesAdvancedChart = ({ leads }: LeadTypesAdvancedChartProps) => {
  // Dados para gráfico de pizza - Tipos de Negócio
  const tiposData = useMemo(() => {
    if (!leads || leads.length === 0) return [];

    const tiposCount = leads.reduce((acc, lead) => {
      const tipo = lead.tipo_negocio || 'Não especificado';
      if (!acc[tipo]) {
        acc[tipo] = { count: 0, valor: 0, quentes: 0 };
      }
      acc[tipo].count++;
      acc[tipo].valor += lead.valor_imovel || 0;
      if (lead.status_temperatura === 'Quente') {
        acc[tipo].quentes++;
      }
      return acc;
    }, {} as Record<string, { count: number; valor: number; quentes: number }>);

    return Object.entries(tiposCount).map(([tipo, data]) => ({
      name: tipo,
      value: data.count,
      percentage: ((data.count / leads.length) * 100).toFixed(1),
      valorMedio: data.count > 0 ? Math.round(data.valor / data.count) : 0,
      quentes: data.quentes,
      fill: getTipoColor(tipo)
    })).sort((a, b) => b.value - a.value);
  }, [leads]);

  // Dados para gráfico de barras - Análise por Origem + Tipo
  const origemTipoData = useMemo(() => {
    if (!leads || leads.length === 0) return [];

    const origemTipoCount = leads.reduce((acc, lead) => {
      const origem = lead.origem_lead || 'Não especificado';
      const tipo = lead.tipo_negocio || 'Não especificado';
      const key = `${origem}-${tipo}`;
      
      if (!acc[key]) {
        acc[key] = {
          origem,
          tipo,
          count: 0,
          valorTotal: 0
        };
      }
      acc[key].count++;
      acc[key].valorTotal += lead.valor_imovel || 0;
      return acc;
    }, {} as Record<string, { origem: string; tipo: string; count: number; valorTotal: number }>);

    // Agrupar por origem
    const origemData = Object.values(origemTipoCount).reduce((acc, item) => {
      if (!acc[item.origem]) {
        acc[item.origem] = {
          origem: item.origem,
          Venda: 0,
          Locação: 0,
          Compra: 0,
          'Não especificado': 0
        };
      }
      acc[item.origem][item.tipo as keyof typeof acc[string]] = item.count;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(origemData);
  }, [leads]);

  // Dados para análise de preferências
  const preferenciasData = useMemo(() => {
    if (!leads || leads.length === 0) return [];

    const preferenciasCount = leads.reduce((acc, lead) => {
      if (lead.Preferencias_lead && lead.Preferencias_lead.trim()) {
        const prefs = lead.Preferencias_lead.split(',').map(p => p.trim().toLowerCase());
        
        prefs.forEach(pref => {
          if (pref && pref !== '' && !pref.match(/^\d+$/)) { // Ignorar números puros
            if (!acc[pref]) {
              acc[pref] = 0;
            }
            acc[pref]++;
          }
        });
      }
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(preferenciasCount)
      .map(([pref, count]) => ({
        name: pref.charAt(0).toUpperCase() + pref.slice(1),
        value: count,
        percentage: ((count / leads.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10
  }, [leads]);

  const COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#DC2626', '#8B5A2B', '#6366F1', '#EC4899'];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Gráfico de Pizza - Tipos de Negócio */}
      <Card className="bg-bg-card/40 backdrop-blur-md border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-text-primary">
            <TrendingUp className="h-5 w-5 text-purple-400" />
            Distribuição por Tipo de Negócio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tiposData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tiposData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(30, 30, 30, 0.95)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: any, name: string, props: any) => [
                    `${value} leads (${props.payload.percentage}%)`,
                    'Quantidade'
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {/* Métricas resumidas */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            {tiposData.slice(0, 4).map((tipo, index) => (
              <div
                key={tipo.name}
                className="p-3 rounded-lg bg-bg-secondary/20 border border-purple-500/20"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm font-medium text-text-primary">
                    {tipo.name}
                  </span>
                </div>
                <div className="text-xs text-text-secondary">
                  {tipo.value} leads • {tipo.quentes} quentes
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de Barras - Origem x Tipo */}
      <Card className="bg-bg-card/40 backdrop-blur-md border-blue-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-text-primary">
            <Users className="h-5 w-5 text-blue-400" />
            Tipos por Origem
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={origemTipoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="origem" 
                  stroke="#9CA3AF"
                  fontSize={12}
                />
                <YAxis stroke="#9CA3AF" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(30, 30, 30, 0.95)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Legend />
                <Bar dataKey="Venda" fill="#10B981" name="Venda" />
                <Bar dataKey="Locação" fill="#3B82F6" name="Locação" />
                <Bar dataKey="Compra" fill="#8B5CF6" name="Compra" />
                <Bar dataKey="Não especificado" fill="#6B7280" name="Não especificado" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top Preferências */}
      <Card className="bg-bg-card/40 backdrop-blur-md border-green-500/30 xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-text-primary">
            <Home className="h-5 w-5 text-green-400" />
            Top 10 Preferências dos Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={preferenciasData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" stroke="#9CA3AF" fontSize={12} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  stroke="#9CA3AF" 
                  fontSize={12}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(30, 30, 30, 0.95)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: any, name: string, props: any) => [
                    `${value} leads (${props.payload.percentage}%)`,
                    'Quantidade'
                  ]}
                />
                <Bar dataKey="value" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Função helper para cores dos tipos - Paleta Oficial OctoDash (mais forte e saturado)
// REGRA: Quanto maior o valor/importância, mais escuro
function getTipoColor(tipo: string): string {
  const tipoLower = tipo.toLowerCase();
  // Usar gradiente azul - categorias mais comuns/importantes = mais escuro
  if (tipoLower.includes('venda') || tipoLower.includes('compra')) {
    return '#2d5f9f'; // Azul Intenso (mais importante/valores altos)
  } else if (tipoLower.includes('locação') || tipoLower.includes('aluguel')) {
    return '#1e4d8b'; // Azul Escuro/Royal (médio)
  } else if (tipoLower.includes('investimento')) {
    return '#4a7ab0'; // Azul Médio Escuro (menor)
  } else if (tipoLower.includes('comercial')) {
    return '#385f92'; // Azul médio
  }
  return '#6B7280'; // Cinza (não especificado)
}
