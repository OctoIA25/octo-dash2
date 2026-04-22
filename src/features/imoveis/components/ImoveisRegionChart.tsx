import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, TrendingUp, Navigation } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface ImoveisRegionChartProps {
  leads: ProcessedLead[];
}

export const ImoveisRegionChart = ({ leads }: ImoveisRegionChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const regionData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Analisar regiões baseado em preferências e códigos de imóveis
    const regionAnalysis = leads.reduce((acc, lead) => {
      let regiao = 'Não especificado';
      
      // Tentar extrair região das preferências
      if (lead.Preferencias_lead && lead.Preferencias_lead.trim() !== '') {
        const pref = lead.Preferencias_lead.toLowerCase();
        
        // Regiões comuns em São Paulo (ajustar conforme a realidade da imobiliária)
        if (pref.includes('zona sul') || pref.includes('morumbi') || pref.includes('moema') || 
            pref.includes('vila olimpia') || pref.includes('itaim') || pref.includes('jardins')) {
          regiao = 'Zona Sul';
        } else if (pref.includes('zona norte') || pref.includes('santana') || pref.includes('tucuruvi') || 
                   pref.includes('vila guilherme') || pref.includes('imirim')) {
          regiao = 'Zona Norte';
        } else if (pref.includes('zona leste') || pref.includes('penha') || pref.includes('tatuape') || 
                   pref.includes('vila carrão') || pref.includes('analia franco')) {
          regiao = 'Zona Leste';
        } else if (pref.includes('zona oeste') || pref.includes('pinheiros') || pref.includes('butanta') || 
                   pref.includes('lapa') || pref.includes('vila madalena') || pref.includes('perdizes')) {
          regiao = 'Zona Oeste';
        } else if (pref.includes('centro') || pref.includes('republica') || pref.includes('se') || 
                   pref.includes('consolacao') || pref.includes('bela vista')) {
          regiao = 'Centro';
        } else if (pref.includes('abc') || pref.includes('santo andre') || pref.includes('sao bernardo') || 
                   pref.includes('diadema') || pref.includes('são caetano')) {
          regiao = 'ABC';
        } else if (pref.includes('guarulhos') || pref.includes('osasco') || pref.includes('barueri') || 
                   pref.includes('cotia') || pref.includes('embu')) {
          regiao = 'Grande SP';
        } else if (pref.includes('santos') || pref.includes('praia') || pref.includes('litoral') || 
                   pref.includes('guaruja') || pref.includes('sao vicente')) {
          regiao = 'Litoral';
        } else if (pref.includes('alphaville') || pref.includes('tamboré') || pref.includes('granja viana') || 
                   pref.includes('aldeia da serra')) {
          regiao = 'Condomínios';
        }
      }
      
      // Se ainda não identificou, tentar pelo código do imóvel (últimos dígitos podem indicar região)
      if (regiao === 'Não especificado' && lead.codigo_imovel) {
        const codigo = lead.codigo_imovel.trim();
        // Baseado em padrões fictícios - ajustar conforme codificação real da imobiliária
        const numeroFinal = parseInt(codigo.slice(-2)) || 0;
        if (numeroFinal >= 1 && numeroFinal <= 20) regiao = 'Zona Sul';
        else if (numeroFinal >= 21 && numeroFinal <= 40) regiao = 'Zona Oeste';
        else if (numeroFinal >= 41 && numeroFinal <= 60) regiao = 'Zona Norte';
        else if (numeroFinal >= 61 && numeroFinal <= 80) regiao = 'Zona Leste';
        else if (numeroFinal >= 81 && numeroFinal <= 90) regiao = 'Centro';
        else regiao = 'Grande SP';
      }
      
      const valor = lead.valor_imovel || 0;
      
      if (!acc[regiao]) {
        acc[regiao] = {
          quantidade: 0,
          valorTotal: 0,
          valorMedio: 0,
          valorMinimo: Infinity,
          valorMaximo: 0,
          quentes: 0,
          mornos: 0,
          frios: 0,
          visitas: 0,
          negociacoes: 0,
          fechamentos: 0,
          apartamentos: 0,
          casas: 0,
          comercial: 0
        };
      }
      
      acc[regiao].quantidade++;
      if (valor > 0) {
        acc[regiao].valorTotal += valor;
        acc[regiao].valorMinimo = Math.min(acc[regiao].valorMinimo, valor);
        acc[regiao].valorMaximo = Math.max(acc[regiao].valorMaximo, valor);
      }
      
      // Analisar temperatura
      if (lead.status_temperatura === 'Quente') acc[regiao].quentes++;
      else if (lead.status_temperatura === 'Morno') acc[regiao].mornos++;
      else if (lead.status_temperatura === 'Frio') acc[regiao].frios++;
      
      // Analisar atividades
      if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
          lead.etapa_atual === 'Visita Agendada') {
        acc[regiao].visitas++;
      }
      
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        acc[regiao].negociacoes++;
      }
      
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== "") {
        acc[regiao].fechamentos++;
      }
      
      // Analisar tipo de propriedade
      if (lead.codigo_imovel) {
        const codigo = lead.codigo_imovel.toUpperCase();
        if (codigo.includes('AP')) acc[regiao].apartamentos++;
        else if (codigo.includes('CS')) acc[regiao].casas++;
        else if (codigo.includes('CM')) acc[regiao].comercial++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Calcular métricas derivadas
    Object.keys(regionAnalysis).forEach(regiao => {
      const data = regionAnalysis[regiao];
      data.valorMedio = data.quantidade > 0 ? data.valorTotal / data.quantidade : 0;
      if (data.valorMinimo === Infinity) data.valorMinimo = 0;
      data.taxaInteresse = data.quantidade > 0 ? (data.quentes / data.quantidade) * 100 : 0;
      data.taxaVisita = data.quantidade > 0 ? (data.visitas / data.quantidade) * 100 : 0;
      data.taxaConversao = data.quantidade > 0 ? (data.fechamentos / data.quantidade) * 100 : 0;
      data.densidade = (data.quentes + data.mornos + data.frios) / data.quantidade;
    });

    // Preparar dados ordenados
    const regioes = Object.entries(regionAnalysis)
      .map(([nome, data]) => ({
        nome,
        ...data,
        percentual: (data.quantidade / leads.length) * 100
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    // Cores por região usando gradiente azul
    // REGRA: Quanto MAIOR a quantidade de leads, MAIS ESCURO o tom de azul
    const getRegionColor = (index: number, total: number) => {
      // 🎨 NOVO GRADIENTE AZUL: Valores maiores (index baixo pois está ordenado DESC) = tons escuros
      // Como o array está ordenado decrescente, index 0 = maior quantidade
      const gradiente = [
        '#1a233b',  // 1º lugar - Azul Muito Escuro (mais leads)
        '#23385f',  // 2º lugar - Azul Escuro
        '#2a4a8d',  // 3º lugar - Azul Médio-Escuro
        '#3c5fa0',  // 4º lugar
        '#4f75b3',  // 5º lugar
        '#6391c5',  // 6º lugar - Azul Médio-Claro
        '#7aabda',  // 7º lugar
        '#8fc2e9',  // 8º lugar - Azul Claro
        '#a0ccf0',  // 9º lugar
        '#8ec8f2'   // 10º lugar - Azul Muito Claro (menos leads)
      ];
      // Distribuir cores baseado na posição (ordenado por quantidade decrescente)
      const colorIndex = Math.min(index, gradiente.length - 1);
      return gradiente[colorIndex];
    };

    // Dados para gráfico de barras horizontais
    // Cores atribuídas por ranking (primeira região = mais escuro)
    const barData = regioes.slice(0, 8).map((regiao, index) => ({
      label: regiao.nome,
      y: regiao.quantidade,
      color: getRegionColor(index, regioes.length),
      valorMedio: regiao.valorMedio,
      taxaInteresse: regiao.taxaInteresse,
      taxaVisita: regiao.taxaVisita,
      percentual: regiao.percentual,
      valorMinimo: regiao.valorMinimo,
      valorMaximo: regiao.valorMaximo
    }));

    return {
      barData,
      regioes,
      stats: {
        totalRegioes: regioes.length,
        regiaoMaisPopular: regioes[0]?.nome || 'N/A',
        maiorValorMedio: Math.max(...regioes.map(r => r.valorMedio)),
        menorValorMedio: Math.min(...regioes.map(r => r.valorMedio))
      }
    };
  }, [leads]);

  useEffect(() => {
    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        initializeChart();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.onload = () => initializeChart();
      script.onerror = () => console.warn('⚠️ Falha ao carregar CanvasJS');
      document.head.appendChild(script);
    };

    const initializeChart = () => {
      if (!chartRef.current || !window.CanvasJS || !regionData) return;

      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const chart = new window.CanvasJS.Chart(chartRef.current, {
        theme: "dark2",
        backgroundColor: "transparent",
        creditText: "",
        creditHref: null,
        exportEnabled: false,
        title: {
          text: "",
          fontColor: "#ffffff"
        },
        axisY: {
          title: "",
          labelFontColor: "#e5e7eb",
          labelFontSize: 12,
          labelFontWeight: "600",
          gridColor: "#374151",
          gridThickness: 0.5
        },
        axisX: {
          title: "",
          labelFontColor: "#9ca3af",
          labelFontSize: 12,
          lineColor: "#6b7280",
          tickColor: "#6b7280",
          minimum: 0
        },
        toolTip: {
          backgroundColor: "rgba(17, 24, 39, 0.98)",
          fontColor: "#ffffff",
          borderColor: "#6b7280",
          cornerRadius: 8,
          contentFormatter: function (e: any) {
            const data = e.entries[0].dataPoint;
            
            return `
              <div style="padding: 12px; font-family: Inter, sans-serif;">
                <div style="font-weight: 700; font-size: 14px; color: ${data.color}; margin-bottom: 8px;">
                  📍 ${data.label}
                </div>
                <div style="font-size: 12px;">
                  <div><strong>Leads:</strong> ${data.y} (${data.percentual.toFixed(1)}%)</div>
                  <div><strong>Valor Médio:</strong> R$ ${(data.valorMedio / 1000).toFixed(0)}K</div>
                  <div><strong>Taxa Interesse:</strong> ${data.taxaInteresse.toFixed(1)}%</div>
                  <div><strong>Taxa Visita:</strong> ${data.taxaVisita.toFixed(1)}%</div>
                  <div><strong>Faixa Valor:</strong> R$ ${(data.valorMinimo / 1000).toFixed(0)}K - R$ ${(data.valorMaximo / 1000).toFixed(0)}K</div>
                </div>
              </div>
            `;
          }
        },
        data: [{
          type: "column",
          name: "Leads por Região",
          dataPoints: regionData.barData
        }],
        height: 280,
        animationEnabled: true,
        animationDuration: 1200
      });

      chart.render();
      chartInstance.current = chart;

      // Remover marcas d'água
      setTimeout(() => {
        const container = chartRef.current;
        if (container) {
          const creditLinks = container.querySelectorAll('a[href*="canvasjs"]');
          creditLinks.forEach(link => link.remove());
        }
      }, 100);
    };

    loadCanvasJS();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [regionData]);

  if (!regionData || !leads || leads.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <StandardCardTitle icon={MapPin}>
            Distribuição por Região
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="h-5 w-5 text-green-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Distribuição por Região</h4>
            <p className="text-sm text-text-secondary">Mapeando regiões...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full glow-accent-green"></div>
          Distribuição por Região
          <MapPin className="h-5 w-5 text-green-400 ml-2" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Stats superiores */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/30">
            <div className="text-lg font-bold text-green-400">
              {regionData.stats.totalRegioes}
            </div>
            <div className="text-xs text-text-secondary">Regiões</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg border border-cyan-500/30">
            <div className="text-lg font-bold text-cyan-400">
              {regionData.stats.regiaoMaisPopular}
            </div>
            <div className="text-xs text-text-secondary">Mais Popular</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30">
            <div className="text-lg font-bold text-purple-400">
              R$ {(regionData.stats.maiorValorMedio / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-text-secondary">Maior Valor</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/30">
            <div className="text-lg font-bold text-orange-400">
              R$ {(regionData.stats.menorValorMedio / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-text-secondary">Menor Valor</div>
          </div>
        </div>

        {/* Top regiões */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-text-primary mb-2">🌟 Top Regiões por Interesse:</div>
          <div className="space-y-2">
            {regionData.regioes
              .sort((a, b) => b.taxaInteresse - a.taxaInteresse)
              .slice(0, 3)
              .map((regiao, index) => {
                const medalhas = ['🥇', '🥈', '🥉'];
                const getRegionColorByIndex = (idx: number) => {
                  const gradiente = [
                    '#2d5f9f', '#1e4d8b', '#264474', '#2c4d7e', '#325688',
                    '#385f92', '#3e689c', '#4471a6', '#4a7ab0', '#6b7280'
                  ];
                  return gradiente[Math.min(idx, gradiente.length - 1)];
                };
                
                return (
                  <div key={regiao.nome} className="flex items-center justify-between p-2 bg-bg-secondary/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{medalhas[index]}</span>
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getRegionColorByIndex(index) }}
                      ></div>
                      <span 
                        className="text-sm font-bold"
                        style={{ color: getRegionColorByIndex(index) }}
                      >
                        {regiao.nome}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-text-primary">
                        {regiao.taxaInteresse.toFixed(1)}%
                      </div>
                      <div className="text-xs text-text-secondary">
                        {regiao.quantidade} leads
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Gráfico */}
        <div className="flex-1 flex items-center justify-center">
          <div ref={chartRef} className="w-full h-[400px]" />
        </div>

        {/* Legenda de regiões */}
        <div className="mt-4 pt-3 border-t border-bg-secondary/40">
          <div className="text-sm font-semibold text-text-primary mb-2">🗺️ Mapa de Regiões:</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {regionData.regioes.slice(0, 6).map((regiao, idx) => {
              const getColorByIdx = (i: number) => {
                const gradiente = [
                  '#2d5f9f', '#1e4d8b', '#264474', '#2c4d7e', '#325688',
                  '#385f92', '#3e689c', '#4471a6', '#4a7ab0', '#6b7280'
                ];
                return gradiente[Math.min(i, gradiente.length - 1)];
              };
              
              return (
                <div key={regiao.nome} className="flex items-center gap-1">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getColorByIdx(idx) }}
                  ></div>
                  <span className="text-text-secondary">
                    {regiao.nome}: {regiao.quantidade}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
