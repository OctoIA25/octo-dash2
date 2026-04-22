import { useEffect, useRef } from 'react';

interface CalendarHeatmapProps {
  data: Array<{
    date: string;
    count: number;
    level: number;
  }>;
  height?: number;
}

export const CalendarHeatmap = ({ data, height = 320 }: CalendarHeatmapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    // Carregar AnyChart dinamicamente
    const loadAnyChart = async () => {
      // Verificar se AnyChart já está carregado
      if (!(window as any).anychart) {
        // Criar scripts
        const scripts = [
          'https://cdn.anychart.com/releases/v8/js/anychart-base.min.js',
          'https://cdn.anychart.com/releases/v8/js/anychart-calendar.min.js'
        ];

        // Criar link CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.anychart.com/releases/v8/css/anychart-ui.min.css';
        document.head.appendChild(link);

        // Carregar scripts sequencialmente
        for (const src of scripts) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
      }

      // Criar gráfico
      const anychart = (window as any).anychart;
      
      // Preparar dados
      const dataset = anychart.data.set(data);
      const mapping = dataset.mapAs({
        x: 'date',
        value: 'level'
      });

      // Criar gráfico de calendário
      const chart = anychart.calendar(mapping);

      // Configurar fundo transparente
      chart.background().enabled(false);

      // Configurar meses
      chart.months()
        .stroke(false)
        .noDataStroke(false);

      // Configurar dias
      chart.days()
        .spacing(2)
        .stroke(false)
        .noDataStroke(false)
        .noDataFill('rgba(59, 130, 246, 0.1)') // Azul claro para dias sem dados
        .noDataHatchFill(false)
        .width(14)
        .height(14);

      // Desabilitar color range
      chart.colorRange(false);

      // Escala de cores em tons de azul (GitHub style)
      const customColorScale = anychart.scales.ordinalColor();
      customColorScale.ranges([
        { equal: 1, color: '#1e3a8a' },  // blue-900
        { equal: 2, color: '#1d4ed8' },  // blue-700
        { equal: 3, color: '#3b82f6' },  // blue-500
        { equal: 4, color: '#60a5fa' }   // blue-400
      ]);

      chart.colorScale(customColorScale);

      // Configurar tooltip
      chart.tooltip()
        .format('{%count} ativações');

      // Configurar título do ano
      chart.years().title().enabled(false);

      // Configurar tamanho e responsividade
      chart.width('100%');
      chart.height(height);

      // Configurar padding e margins
      chart.padding(10, 10, 10, 10);

      // Renderizar
      chart.container(containerRef.current);
      chart.draw();

      chartRef.current = chart;
    };

    loadAnyChart().catch(console.error);

    // Cleanup
    return () => {
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [data, height]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: `${height}px`,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }} 
    />
  );
};
