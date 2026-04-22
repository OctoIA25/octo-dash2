/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Modern Category Chart - Lista de Imóveis de Maior Interesse por Código
 * Design harmonizado com o tema dark/neon da dashboard
 */

import { useEffect, useRef } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ModernCategoryChartProps {
  leads: ProcessedLead[];
}

export const ModernCategoryChart = ({ leads }: ModernCategoryChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<am5.Root | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const root = am5.Root.new(chartRef.current);
    rootRef.current = root;

    // IMPORTANTE: Set themes ANTES de criar o chart
    root.setThemes([am5themes_Animated.new(root)]);

    // Processar dados - contar leads por código de imóvel
    const imoveisPorCodigo = leads.reduce((acc, lead) => {
      const codigo = lead.codigo_imovel?.toUpperCase() || '';
      
      if (codigo && codigo !== 'SEM CÓDIGO' && codigo !== '') {
        if (!acc[codigo]) {
          acc[codigo] = { total: 0, quentes: 0, visitas: 0 };
        }
        
        acc[codigo].total++;
        if (lead.status_temperatura === 'Quente') acc[codigo].quentes++;
        if (lead.Data_visita || lead.etapa_atual?.includes('Visita')) acc[codigo].visitas++;
      }
      
      return acc;
    }, {} as Record<string, { total: number; quentes: number; visitas: number }>);

    // Pegar apenas os top 10 imóveis por interesse
    const data = Object.entries(imoveisPorCodigo)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([codigo, info]) => ({
        codigo,
        value: info.total,
        quentes: info.quentes,
        visitas: info.visitas
      }));

    // Criar chart de barras horizontais
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false,
        panY: false,
        wheelX: 'none',
        wheelY: 'none',
        layout: root.verticalLayout
      })
    );

    // Criar eixos
    const yAxis = chart.yAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: 'codigo',
        renderer: am5xy.AxisRendererY.new(root, {
          minGridDistance: 20,
          cellStartLocation: 0.1,
          cellEndLocation: 0.9
        })
      })
    );

    yAxis.data.setAll(data);

    yAxis.get('renderer').labels.template.setAll({
      fontSize: 13,
      fontWeight: '700',
      fill: am5.color(0xFFFFFF)
    });

    const xAxis = chart.xAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0,
        renderer: am5xy.AxisRendererX.new(root, {})
      })
    );

    xAxis.get('renderer').labels.template.setAll({
      fontSize: 12,
      fill: am5.color(0xA0A0A0)
    });

    // Criar série de barras
    const series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        xAxis: xAxis,
        yAxis: yAxis,
        valueXField: 'value',
        categoryYField: 'codigo',
        tooltip: am5.Tooltip.new(root, {
          labelText: '[bold fontSize:15px]{codigo}[/]\n━━━━━━━━━━━━\n📊 Total: [bold]{value}[/] leads\n🔥 Quentes: [bold]{quentes}[/]\n👁️ Visitas: [bold]{visitas}[/]'
        })
      })
    );

    // Estilo das barras
    series.columns.template.setAll({
      cornerRadiusTR: 6,
      cornerRadiusBR: 6,
      strokeOpacity: 0,
      fillGradient: am5.LinearGradient.new(root, {
        stops: [
          { color: am5.color(0x8B5CF6) },
          { color: am5.color(0x3B82F6) }
        ]
      })
    });

    // Efeito hover
    series.columns.template.states.create('hover', {
      fillGradient: am5.LinearGradient.new(root, {
        stops: [
          { color: am5.color(0xA855F7) },
          { color: am5.color(0x60A5FA) }
        ]
      }),
      shadowBlur: 15,
      shadowOpacity: 0.6,
      shadowColor: am5.color(0x8B5CF6)
    });

    // Labels nas barras
    series.bullets.push(() => {
      return am5.Bullet.new(root, {
        locationX: 1,
        sprite: am5.Label.new(root, {
          text: '{value}',
          fill: am5.color(0xFFFFFF),
          fontSize: 12,
          fontWeight: '700',
          centerY: am5.p50,
          centerX: am5.p100,
          paddingRight: 10,
          shadowBlur: 4,
          shadowColor: am5.color(0x000000),
          shadowOpacity: 0.5
        })
      });
    });

    // Tooltip customizado
    const tooltip = series.get('tooltip');
    if (tooltip) {
    tooltip.get('background')?.setAll({
      fill: am5.color(0x1A1A1A),
      fillOpacity: 0.95,
      stroke: am5.color(0x8B5CF6),
      strokeOpacity: 0.5,
      strokeWidth: 2,
      shadowBlur: 15,
      shadowColor: am5.color(0x8B5CF6),
      shadowOpacity: 0.3
    });

    tooltip.label.setAll({
      fill: am5.color(0xFFFFFF),
      fontSize: 13
    });
    }

    // Set data
    series.data.setAll(data);

    // Animação
    series.appear(1000);
    chart.appear(1000, 100);

    return () => {
      root.dispose();
    };
  }, [leads]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-text-primary text-lg font-semibold flex items-center gap-2">
          <div className="w-2 h-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse"></div>
          Imóveis de Maior Interesse
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div ref={chartRef} className="w-full h-[450px]" />
      </CardContent>
    </Card>
  );
};

