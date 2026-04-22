import { useMemo, useRef, useEffect } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Target, 
  Activity,
  Download,
  BarChart3,
  PieChart,
  LineChart
} from 'lucide-react';

interface MonthlyReportProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const MonthlyReport = ({ leads }: MonthlyReportProps) => {
  const monthlyChartRef = useRef<HTMLDivElement>(null);
  const conversionChartRef = useRef<HTMLDivElement>(null);
  const sourceChartRef = useRef<HTMLDivElement>(null);
  const performanceChartRef = useRef<HTMLDivElement>(null);
  
  const monthlyChartInstance = useRef<any>(null);
  const conversionChartInstance = useRef<any>(null);
  const sourceChartInstance = useRef<any>(null);
  const performanceChartInstance = useRef<any>(null);

  // Processar dados mensais
  const monthlyData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Agrupar leads por mês
    const leadsByMonth = leads.reduce((acc, lead) => {
      const date = new Date(lead.data_entrada);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: monthKey,
          totalLeads: 0,
          visitasAgendadas: 0,
          visitasRealizadas: 0,
          negociacoes: 0,
          fechamentos: 0,
          valorTotal: 0,
          quentes: 0,
          mornos: 0,
          frios: 0,
          origens: {} as Record<string, number>
        };
      }

      acc[monthKey].totalLeads++;
      acc[monthKey].valorTotal += lead.valor_imovel || 0;

      // Contar por temperatura
      if (lead.status_temperatura === 'Quente') acc[monthKey].quentes++;
      else if (lead.status_temperatura === 'Morno') acc[monthKey].mornos++;
      else if (lead.status_temperatura === 'Frio') acc[monthKey].frios++;

      // Contar visitas
      if (lead.Data_visita && lead.Data_visita.trim() !== "") {
        acc[monthKey].visitasAgendadas++;
      }

      if (lead.etapa_atual === 'Visita Realizada') {
        acc[monthKey].visitasRealizadas++;
      }

      if (lead.etapa_atual === 'Em Negociação' || lead.etapa_atual === 'Negociação') {
        acc[monthKey].negociacoes++;
      }

      if (lead.valor_final_venda && lead.valor_final_venda > 0) {
        acc[monthKey].fechamentos++;
      }

      // Contar por origem
      const origem = lead.origem_lead || 'Orgânico';
      acc[monthKey].origens[origem] = (acc[monthKey].origens[origem] || 0) + 1;

      return acc;
    }, {} as Record<string, any>);

    // Converter para array e ordenar por mês
    const monthlyArray = Object.values(leadsByMonth).sort((a: any, b: any) => 
      a.month.localeCompare(b.month)
    );

    // Calcular métricas do mês atual
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentMonthData = leadsByMonth[currentMonth];
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthKey = lastMonth.toISOString().slice(0, 7);
    const lastMonthData = leadsByMonth[lastMonthKey];

    return {
      monthlyArray,
      currentMonthData: currentMonthData || {
        totalLeads: 0, visitasAgendadas: 0, visitasRealizadas: 0, 
        negociacoes: 0, fechamentos: 0, valorTotal: 0,
        quentes: 0, mornos: 0, frios: 0
      },
      lastMonthData: lastMonthData || {
        totalLeads: 0, visitasAgendadas: 0, visitasRealizadas: 0,
        negociacoes: 0, fechamentos: 0, valorTotal: 0
      },
      leadsByMonth
    };
  }, [leads]);

  // Função para exportar planilha mensal
  const exportMonthlyData = () => {
    if (!monthlyData) return;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentLeads = leads.filter(lead => {
      const leadMonth = new Date(lead.data_entrada).toISOString().slice(0, 7);
      return leadMonth === currentMonth;
    });

    // Criar dados da planilha mensal
    const worksheetData = currentLeads.map(lead => ({
      'Nome': lead.nome_lead,
      'Telefone': lead.telefone || '',
      'Origem': lead.origem_lead,
      'Data Entrada': new Date(lead.data_entrada).toLocaleDateString('pt-BR'),
      'Status': lead.status_temperatura,
      'Etapa Atual': lead.etapa_atual,
      'Corretor': lead.corretor_responsavel || '',
      'Valor Imóvel': lead.valor_imovel ? `R$ ${lead.valor_imovel.toLocaleString('pt-BR')}` : '',
      'Data Visita': lead.Data_visita || '',
      'Tipo Negócio': lead.tipo_negocio || '',
      'Observações': lead.observacoes || ''
    }));

    // Simular download (aqui você integraria com a biblioteca de exportação)
    alert(`Exportando ${worksheetData.length} leads do mês atual`);
  };

  // Inicializar gráficos
  useEffect(() => {
    if (!monthlyData || !window.CanvasJS) return;

    const initializeCharts = () => {
      // Gráfico de Evolução Mensal
      if (monthlyChartRef.current) {
        if (monthlyChartInstance.current) {
          monthlyChartInstance.current.destroy();
        }

        const monthlyChart = new window.CanvasJS.Chart(monthlyChartRef.current, {
          theme: "dark2",
          backgroundColor: "transparent",
          creditText: "",
          creditHref: null,
          title: { text: "" },
          axisX: {
            title: "Período",
            titleFontColor: "#8b5cf6",
            titleFontSize: 14,
            labelFontColor: "#e5e7eb",
            labelFontSize: 12,
            gridColor: "#374151",
            tickColor: "#6b7280",
            labelAngle: -30
          },
          axisY: {
            title: "Número de Leads",
            titleFontColor: "#8b5cf6",
            titleFontSize: 14,
            labelFontColor: "#e5e7eb",
            labelFontSize: 12,
            gridColor: "#374151",
            tickColor: "#6b7280",
            minimum: 0
          },
          data: [{
            type: "splineArea",
            name: "Leads por Mês",
            markerSize: 10,
            markerType: "circle",
            color: "#8b5cf6",
            fillOpacity: 0.2,
            lineThickness: 3,
            dataPoints: monthlyData.monthlyArray.map((item: any) => ({
              label: new Date(item.month + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
              y: item.totalLeads,
              toolTipContent: `
                <div style="background: rgba(17, 24, 39, 0.96); color: white; padding: 12px; border-radius: 8px; border: 1px solid #8b5cf6;">
                  <strong style="color: #8b5cf6; font-size: 14px;">${new Date(item.month + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong><br/>
                  <span style="color: #10b981;">📊 Leads: <strong>{y}</strong></span><br/>
                  <span style="color: #f59e0b;">📅 Visitas: <strong>${item.visitasAgendadas}</strong></span><br/>
                  <span style="color: #ef4444;">🤝 Negociações: <strong>${item.negociacoes}</strong></span><br/>
                  <span style="color: #22d3ee;">💰 Valor: <strong>R$ ${(item.value / 1000).toFixed(0)}k</strong></span>
                </div>
              `
            }))
          }],
          height: 240,
          animationEnabled: true,
          animationDuration: 1000
        });

        monthlyChart.render();
        monthlyChartInstance.current = monthlyChart;
      }

      // Gráfico de Conversão
      if (conversionChartRef.current) {
        if (conversionChartInstance.current) {
          conversionChartInstance.current.destroy();
        }

        const currentData = monthlyData.currentMonthData;
        const conversionChart = new window.CanvasJS.Chart(conversionChartRef.current, {
          theme: "dark2",
          backgroundColor: "transparent",
          creditText: "",
          creditHref: null,
          title: { text: "" },
          data: [{
            type: "doughnut",
            innerRadius: "50%",
            indexLabel: "{label}",
            indexLabelFontColor: "#ffffff",
            indexLabelFontSize: 12,
            indexLabelFontWeight: "600",
            showInLegend: true,
            legendFontColor: "#e5e7eb",
            legendFontSize: 12,
            toolTipContent: `
              <div style="background: rgba(17, 24, 39, 0.96); color: white; padding: 12px; border-radius: 8px;">
                <strong style="color: {color}; font-size: 14px;">{label}</strong><br/>
                <span style="color: #e5e7eb;">Quantidade: <strong>{y}</strong></span><br/>
                <span style="color: #9ca3af;">Percentual: <strong>{percentage}%</strong></span>
              </div>
            `,
            dataPoints: [
              { label: "Total de Leads", y: currentData.totalLeads, color: "#22d3ee" },
              { label: "Visitas Agendadas", y: currentData.visitasAgendadas, color: "#10b981" },
              { label: "Em Negociação", y: currentData.negociacoes, color: "#f59e0b" },
              { label: "Fechamentos", y: currentData.fechamentos, color: "#ef4444" }
            ].filter(item => item.y > 0) // Só mostrar itens com valores > 0
          }],
          height: 240,
          animationEnabled: true,
          animationDuration: 1000
        });

        conversionChart.render();
        conversionChartInstance.current = conversionChart;
      }

      // Gráfico de Origens (Mês Atual)
      if (sourceChartRef.current && monthlyData.currentMonthData.origens) {
        if (sourceChartInstance.current) {
          sourceChartInstance.current.destroy();
        }

        const origens = Object.entries(monthlyData.currentMonthData.origens || {})
          .map(([origem, count]) => ({ label: origem, y: count }))
          .sort((a, b) => b.y - a.y)
          .slice(0, 8);

        if (origens.length > 0) {
          const sourceChart = new window.CanvasJS.Chart(sourceChartRef.current, {
            theme: "dark2",
            backgroundColor: "transparent",
            creditText: "",
            creditHref: null,
            title: { text: "" },
            data: [{
              type: "pie",
              indexLabel: "{label}: {y}",
              indexLabelFontColor: "#ffffff",
              dataPoints: origens.map((item, index) => ({
                ...item,
                color: [
                  "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", 
                  "#22d3ee", "#ec4899", "#84cc16", "#f97316"
                ][index % 8]
              }))
            }],
            height: 240,
            animationEnabled: true
          });

          sourceChart.render();
          sourceChartInstance.current = sourceChart;
        }
      }

      // Gráfico de Performance por Temperatura
      if (performanceChartRef.current) {
        if (performanceChartInstance.current) {
          performanceChartInstance.current.destroy();
        }

        const temperatureData = monthlyData.monthlyArray.slice(-6); // Últimos 6 meses
        
        const performanceChart = new window.CanvasJS.Chart(performanceChartRef.current, {
          theme: "dark2",
          backgroundColor: "transparent",
          creditText: "",
          creditHref: null,
          title: { text: "" },
          axisX: {
            title: "Mês",
            titleFontColor: "#8b5cf6",
            labelFontColor: "#e5e7eb",
            gridColor: "#374151"
          },
          axisY: {
            title: "Quantidade",
            titleFontColor: "#8b5cf6",
            labelFontColor: "#e5e7eb",
            gridColor: "#374151"
          },
          data: [{
            type: "stackedColumn",
            name: "Quentes",
            color: "#ef4444",
            dataPoints: temperatureData.map((item: any) => ({
              label: new Date(item.month + '-01').toLocaleDateString('pt-BR', { month: 'short' }),
              y: item.quentes
            }))
          }, {
            type: "stackedColumn",
            name: "Mornos",
            color: "#f59e0b",
            dataPoints: temperatureData.map((item: any) => ({
              label: new Date(item.month + '-01').toLocaleDateString('pt-BR', { month: 'short' }),
              y: item.mornos
            }))
          }, {
            type: "stackedColumn",
            name: "Frios",
            color: "#6b7280",
            dataPoints: temperatureData.map((item: any) => ({
              label: new Date(item.month + '-01').toLocaleDateString('pt-BR', { month: 'short' }),
              y: item.frios
            }))
          }],
          height: 240,
          animationEnabled: true
        });

        performanceChart.render();
        performanceChartInstance.current = performanceChart;
      }
    };

    // Carregar CanvasJS se necessário
    if (window.CanvasJS) {
      initializeCharts();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.onload = initializeCharts;
      document.head.appendChild(script);
    }

    return () => {
      if (monthlyChartInstance.current) monthlyChartInstance.current.destroy();
      if (conversionChartInstance.current) conversionChartInstance.current.destroy();
      if (sourceChartInstance.current) sourceChartInstance.current.destroy();
      if (performanceChartInstance.current) performanceChartInstance.current.destroy();
    };
  }, [monthlyData]);

  if (!monthlyData) {
    return (
      <div className="flex items-center justify-center h-[400px] text-text-secondary">
        <div className="text-center">
          <Calendar className="h-12 w-12 text-purple-400 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-text-primary mb-2">Relatório Mensal</h4>
          <p className="text-sm">Carregando dados mensais...</p>
        </div>
      </div>
    );
  }

  const currentData = monthlyData.currentMonthData;
  const lastData = monthlyData.lastMonthData;

  // Calcular variações percentuais
  const calculateGrowth = (current: number, last: number) => {
    if (last === 0) return current > 0 ? 100 : 0;
    return ((current - last) / last) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Header com Exportação */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Relatório Mensal</h2>
          <p className="text-text-secondary">Análise detalhada dos dados mensais</p>
        </div>
        <Button 
          onClick={exportMonthlyData}
          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar Mês Atual
        </Button>
      </div>

      {/* Métricas Rápidas do Mês */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30 card-glow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-400 text-sm font-medium">Leads do Mês</p>
                <p className="text-2xl font-bold text-white">{currentData.totalLeads}</p>
                <p className={`text-xs ${
                  calculateGrowth(currentData.totalLeads, lastData.totalLeads) >= 0 
                    ? 'text-green-400' : 'text-red-400'
                }`}>
                  {calculateGrowth(currentData.totalLeads, lastData.totalLeads).toFixed(1)}% vs mês anterior
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30 card-glow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-400 text-sm font-medium">Visitas</p>
                <p className="text-2xl font-bold text-white">{currentData.visitasAgendadas}</p>
                <p className={`text-xs ${
                  calculateGrowth(currentData.visitasAgendadas, lastData.visitasAgendadas) >= 0 
                    ? 'text-green-400' : 'text-red-400'
                }`}>
                  {calculateGrowth(currentData.visitasAgendadas, lastData.visitasAgendadas).toFixed(1)}% vs mês anterior
                </p>
              </div>
              <Target className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border-orange-500/30 card-glow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-400 text-sm font-medium">Negociações</p>
                <p className="text-2xl font-bold text-white">{currentData.negociacoes}</p>
                <p className={`text-xs ${
                  calculateGrowth(currentData.negociacoes, lastData.negociacoes) >= 0 
                    ? 'text-green-400' : 'text-red-400'
                }`}>
                  {calculateGrowth(currentData.negociacoes, lastData.negociacoes).toFixed(1)}% vs mês anterior
                </p>
              </div>
              <Activity className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30 card-glow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-400 text-sm font-medium">Valor Total</p>
                <p className="text-2xl font-bold text-white">
                  R$ {(currentData.valorTotal / 1000000).toFixed(1)}M
                </p>
                <p className={`text-xs ${
                  calculateGrowth(currentData.valorTotal, lastData.valorTotal) >= 0 
                    ? 'text-green-400' : 'text-red-400'
                }`}>
                  {calculateGrowth(currentData.valorTotal, lastData.valorTotal).toFixed(1)}% vs mês anterior
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolução Mensal */}
        <Card className="bg-bg-card/40 border-purple-500/30 card-glow">
          <CardHeader>
            <CardTitle className="text-purple-400 flex items-center gap-2">
              <LineChart className="h-5 w-5" />
              Evolução Mensal de Leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={monthlyChartRef} className="w-full h-[300px]"></div>
          </CardContent>
        </Card>

        {/* Funil de Conversão do Mês */}
        <Card className="bg-bg-card/40 border-green-500/30 card-glow">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Conversão do Mês Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={conversionChartRef} className="w-full h-[300px]"></div>
          </CardContent>
        </Card>

        {/* Origens dos Leads */}
        <Card className="bg-bg-card/40 border-blue-500/30 card-glow">
          <CardHeader>
            <CardTitle className="text-blue-400 flex items-center gap-2">
              <Target className="h-5 w-5" />
              Origens dos Leads (Mês Atual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={sourceChartRef} className="w-full h-[300px]"></div>
          </CardContent>
        </Card>

        {/* Performance por Temperatura */}
        <Card className="bg-bg-card/40 border-orange-500/30 card-glow">
          <CardHeader>
            <CardTitle className="text-orange-400 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Leads por Temperatura (Últimos 6 Meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={performanceChartRef} className="w-full h-[300px]"></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
