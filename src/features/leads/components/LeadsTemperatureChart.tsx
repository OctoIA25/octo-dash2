import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { Thermometer, Target, Flame, Snowflake, Clock } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { TEMPERATURE_COLORS, COLORS } from '@/utils/colors';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface LeadsTemperatureChartProps {
  leads: ProcessedLead[];
}

export const LeadsTemperatureChart = ({ leads }: LeadsTemperatureChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const { currentTheme } = useTheme();

  // Calcular dados de temperatura
  const temperatureData = useMemo(() => {
    const totalLeads = leads?.length || 0;
    
    // Contar por temperatura
    const quentes = leads.filter(lead => lead.status_temperatura === 'Quente').length;
    const mornos = leads.filter(lead => lead.status_temperatura === 'Morno').length;
    const frios = leads.filter(lead => lead.status_temperatura === 'Frio').length;
    const naoInformado = leads.filter(lead => !lead.status_temperatura || lead.status_temperatura.trim() === '').length;

    // Calcular percentuais
    const percentualQuente = totalLeads > 0 ? (quentes / totalLeads * 100) : 0;
    const percentualMorno = totalLeads > 0 ? (mornos / totalLeads * 100) : 0;
    const percentualFrio = totalLeads > 0 ? (frios / totalLeads * 100) : 0;
    const percentualNaoInformado = totalLeads > 0 ? (naoInformado / totalLeads * 100) : 0;

    // Dados para o gráfico de barras CanvasJS - usando paleta oficial
    const chartDataPointsRaw = [
      { 
        y: quentes, 
        label: "Quentes",
        color: TEMPERATURE_COLORS.quente, // Vermelho forte (Paleta OctoDash)
        percentual: percentualQuente,
        icon: "🔥"
      },
      { 
        y: mornos, 
        label: "Mornos",
        color: TEMPERATURE_COLORS.morno, // Laranja vibrante (Paleta OctoDash)
        percentual: percentualMorno,
        icon: "🌡️"
      },
      { 
        y: frios, 
        label: "Frios",
        color: TEMPERATURE_COLORS.frio, // Azul vibrante (Paleta OctoDash)
        percentual: percentualFrio,
        icon: "❄️"
      },
      { 
        y: naoInformado, 
        label: "Não Informado",
        color: COLORS.gray.medium, // Cinza
        percentual: percentualNaoInformado,
        icon: "❓"
      }
    ];

    const chartDataPoints = chartDataPointsRaw.filter(item => item.y > 0);
    const safeChartDataPoints = chartDataPoints.length > 0 ? chartDataPoints : [
      { y: 0, label: "Sem dados", color: COLORS.gray.medium, percentual: 0, icon: "—" }
    ];

    const metrics = {
      totalLeads,
      quentes,
      mornos,
      frios,
      naoInformado,
      percentualQuente,
      percentualMorno,
      percentualFrio,
      percentualNaoInformado,
      temperaturaPrevalente: quentes >= mornos && quentes >= frios ? 'Quente' : 
                            mornos >= frios ? 'Morno' : 'Frio',
      engajamentoAlto: quentes + mornos,
      percentualEngajamento: totalLeads > 0 ? ((quentes + mornos) / totalLeads * 100) : 0
    };

    return { chartDataPoints: safeChartDataPoints, metrics };
  }, [leads]);

  // Carregar CanvasJS e criar gráfico de barras
  useEffect(() => {
    const createChart = () => {
      if (!chartRef.current || !temperatureData?.metrics || !window.CanvasJS) {
        return;
      }

      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const chart = new window.CanvasJS.Chart(chartRef.current, {
        animationEnabled: true,
        animationDuration: 2000,
        theme: "dark2",
        backgroundColor: "transparent",
        creditHref: null,
        creditText: "",
        interactivityEnabled: true,
        title: { text: "", fontFamily: "Inter, system-ui, sans-serif" },
        axisY: {
          title: "Quantidade de Leads",
          titleFontColor: "#9CA3AF",
          titleFontSize: 16,
          titleFontWeight: "bold",
          gridColor: "#374151",
          gridThickness: 1,
          lineColor: "#4B5563",
          tickColor: "#4B5563",
          labelFontColor: "#E5E7EB",
          labelFontSize: 14,
          labelFontWeight: "600",
          titleFontFamily: "Inter, system-ui, sans-serif",
          labelFontFamily: "Inter, system-ui, sans-serif"
        },
        axisX: {
          title: "Temperatura dos Leads",
          titleFontColor: "#9CA3AF",
          titleFontSize: 16,
          titleFontWeight: "bold",
          gridColor: "#374151",
          gridThickness: 1,
          lineColor: "#4B5563",
          tickColor: "#4B5563",
          labelFontColor: "#E5E7EB",
          labelFontSize: 13,
          labelFontWeight: "600",
          titleFontFamily: "Inter, system-ui, sans-serif",
          labelFontFamily: "Inter, system-ui, sans-serif"
        },
        toolTip: {
          backgroundColor: "#1F2937",
          borderColor: "#DC2626",
          borderThickness: 2,
          cornerRadius: 8,
          fontColor: "#F9FAFB",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 14,
          fontWeight: "600",
          contentFormatter: function (e) {
            const dataPoint = e.entries[0].dataPoint;
            return "<span style='color: #DC2626; font-weight: bold; font-size: 15px;'>" +
              dataPoint.icon + " " + dataPoint.label + "</span><br/>" +
              "<span style='color: #F9FAFB; font-size: 14px; font-weight: 600;'>Quantidade: " +
              dataPoint.y + "</span><br/>" +
              "<span style='color: #10B981; font-size: 13px; font-weight: 600;'>Percentual: " +
              dataPoint.percentual.toFixed(1) + "%</span>";
          }
        },
        data: [{
          type: "column",
          cornerRadius: 8,
          mouseover: null,
          mouseout: null,
          highlightEnabled: false,
          dataPoints: temperatureData.chartDataPoints.map((point) => ({
            ...point,
            highlightEnabled: false
          }))
        }]
      });

      chart.render();
      chartInstance.current = chart;
    };

    if (!temperatureData?.metrics) return;

    if (window.CanvasJS) {
      createChart();
      return () => {
        if (chartInstance.current) {
          chartInstance.current.destroy();
        }
      };
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
    script.async = true;
    script.onload = () => {
      createChart();
    };
    document.head.appendChild(script);

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [temperatureData, currentTheme]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden">
      <CardHeader className="pb-1">
        <StandardCardTitle icon={Thermometer}>
          Temperatura dos Leads
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center p-4 metric-card-red rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Flame className="h-5 w-5 text-red-400" />
              <span className="text-sm text-red-300 font-semibold">Quentes</span>
            </div>
            <div className="text-3xl font-bold text-red-400 metric-number">
              {temperatureData.metrics.quentes}
            </div>
            <div className="text-sm text-red-400/70">
              {temperatureData.metrics.percentualQuente.toFixed(1)}% do total
            </div>
          </div>
          <div className="text-center p-4 metric-card-orange rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Target className="h-5 w-5 text-orange-400" />
              <span className="text-sm text-orange-300 font-semibold">Engajamento</span>
            </div>
            <div className="text-3xl font-bold text-orange-400 metric-number">
              {temperatureData.metrics.percentualEngajamento.toFixed(0)}%
            </div>
            <div className="text-sm text-orange-400/70">quentes + mornos</div>
          </div>
        </div>

        <div className="h-[220px] w-full mb-6 bg-transparent">
          <div ref={chartRef} className="w-full h-full" />
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto">
          <h4 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-red-400" />
            Distribuição por Temperatura
          </h4>

          {temperatureData.chartDataPoints.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between p-3 border rounded-xl hover:shadow-lg hover:brightness-110 transition-all duration-300 ease-in-out cursor-pointer"
              style={{
                backgroundColor: `${item.color}08`,
                borderColor: `${item.color}40`,
                boxShadow: `0 0 10px ${item.color}20`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 20px ${item.color}40, 0 4px 12px ${item.color}20`;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `0 0 10px ${item.color}20`;
                e.currentTarget.style.transform = 'translateY(0px)';
              }}
            >
              <div className="flex items-center gap-3">
                <div className="text-lg">{item.icon}</div>
                <div>
                  <span className="text-sm font-semibold text-text-primary">{item.label}</span>
                  <div className="text-xs mt-1" style={{ color: item.color, opacity: 0.8 }}>
                    {item.percentual.toFixed(1)}% do total
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-xl font-bold"
                  style={{
                    color: item.color,
                    textShadow: currentTheme !== 'branco' ? `0 0 4px ${item.color}60` : 'none'
                  }}
                >
                  {item.y}
                </div>
                <div className="text-xs text-text-secondary">leads</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};