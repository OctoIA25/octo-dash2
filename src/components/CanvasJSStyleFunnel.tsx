import { useState, useEffect } from "react";
import { ProcessedLead } from "@/data/realLeadsProcessor";

interface CanvasJSStyleFunnelProps {
  leads: ProcessedLead[];
}

// 📋 Replicando exatamente o estilo CanvasJS Funnel Chart fornecido
export const CanvasJSStyleFunnel = ({ leads }: CanvasJSStyleFunnelProps) => {
  const [animatedValues, setAnimatedValues] = useState<number[]>([]);

  // Calcular etapas do CRM baseadas nos dados reais
  const etapasCount = leads.reduce((acc, lead) => {
    const etapa = lead.etapa_atual || 'Em Atendimento';
    acc[etapa] = (acc[etapa] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Mapear para as etapas do funil CRM
  const totalLeads = leads.length || 1; // Evitar divisão por zero
  
  const funnelSteps = [
    {
      label: "Leads Recebidos",
      value: totalLeads,
      percentage: 100,
      color: "#7B68EE" // Roxo do topo (como na imagem)
    },
    {
      label: "Em Atendimento", 
      value: etapasCount['Em Atendimento'] || 0,
      percentage: totalLeads > 0 ? ((etapasCount['Em Atendimento'] || 0) / totalLeads * 100) : 0,
      color: "#6FD36F" // Verde
    },
    {
      label: "Interação",
      value: etapasCount['Interação'] || 0, 
      percentage: totalLeads > 0 ? ((etapasCount['Interação'] || 0) / totalLeads * 100) : 0,
      color: "#6b7280" // Cinza
    },
    {
      label: "Visita Agendada",
      value: etapasCount['Visita Agendada'] || 0,
      percentage: totalLeads > 0 ? ((etapasCount['Visita Agendada'] || 0) / totalLeads * 100) : 0,
      color: "#20B2AA" // Turquesa
    },
    {
      label: "Negociação",
      value: etapasCount['Negociação'] || 0,
      percentage: totalLeads > 0 ? ((etapasCount['Negociação'] || 0) / totalLeads * 100) : 0,
      color: "#4682B4" // Azul aço
    }
  ];

  // Animação progressiva dos valores
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedValues(funnelSteps.map(step => step.value));
    }, 300);

    return () => clearTimeout(timer);
  }, [leads.length]);

  // Função para criar o path SVG do funil (replicando CanvasJS)
  const createFunnelPath = (index: number, percentage: number) => {
    const maxWidth = 400;
    const height = 80;
    const y = index * (height + 10);
    
    // Calcular largura baseada na porcentagem (mínimo 20% para visibilidade)
    const width = Math.max((percentage / 100) * maxWidth, maxWidth * 0.2);
    const offset = (maxWidth - width) / 2;
    
    // Criar path trapezóide para efeito funil
    const nextWidth = index < funnelSteps.length - 1 
      ? Math.max((funnelSteps[index + 1].percentage / 100) * maxWidth, maxWidth * 0.2)
      : width * 0.8;
    const nextOffset = (maxWidth - nextWidth) / 2;
    
    return `M ${offset} ${y} 
            L ${offset + width} ${y} 
            L ${nextOffset + nextWidth} ${y + height} 
            L ${nextOffset} ${y + height} Z`;
  };

  return (
    <div className="w-full bg-gradient-to-br from-bg-card/60 to-bg-card/40 backdrop-blur-sm border border-bg-secondary/40 rounded-xl p-8 card-glow">
      {/* Título estilo CanvasJS */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Processo de Conversão CRM
        </h2>
        <p className="text-text-secondary">
          Funil de vendas imobiliário - {totalLeads} leads ativos
        </p>
      </div>

      {/* Container SVG do funil */}
      <div className="flex justify-center mb-8">
        <svg width="500" height="450" className="overflow-visible">
          {/* Definir gradientes */}
          <defs>
            {funnelSteps.map((step, index) => (
              <linearGradient key={index} id={`gradient-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={step.color} stopOpacity="0.9" />
                <stop offset="100%" stopColor={step.color} stopOpacity="0.7" />
              </linearGradient>
            ))}
          </defs>

          {/* Segmentos do funil */}
          {funnelSteps.map((step, index) => (
            <g key={index}>
              {/* Forma do funil */}
              <path
                d={createFunnelPath(index, step.percentage)}
                fill={`url(#gradient-${index})`}
                stroke="#ffffff"
                strokeWidth="2"
                className="transition-all duration-500 hover:brightness-110 cursor-pointer"
                style={{
                  filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
                  animationDelay: `${index * 200}ms`
                }}
              />

              {/* Label e porcentagem (estilo CanvasJS) */}
              <text
                x="250"
                y={index * 90 + 35}
                textAnchor="middle"
                className="fill-white font-bold text-sm"
                style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}
              >
                {step.label}
              </text>
              
              <text
                x="250"
                y={index * 90 + 55}
                textAnchor="middle"
                className="fill-white font-bold text-lg"
                style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}
              >
                [{step.percentage.toFixed(0)}%]
              </text>

              {/* Valor absoluto */}
              <text
                x="250"
                y={index * 90 + 70}
                textAnchor="middle"
                className="fill-white font-medium text-xs opacity-90"
                style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}
              >
                {animatedValues[index] || step.value} leads
              </text>

              {/* Linhas de conexão entre segmentos */}
              {index < funnelSteps.length - 1 && (
                <line
                  x1="250"
                  y1={index * 90 + 80}
                  x2="250"
                  y2={(index + 1) * 90}
                  stroke="#e0e0e0"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                  opacity="0.5"
                />
              )}
            </g>
          ))}

          {/* Tooltip hover areas */}
          {funnelSteps.map((step, index) => (
            <rect
              key={`hover-${index}`}
              x="50"
              y={index * 90}
              width="400"
              height="80"
              fill="transparent"
              className="cursor-pointer"
            >
              <title>
                {step.label}: {step.value} leads ({step.percentage.toFixed(1)}%)
              </title>
            </rect>
          ))}
        </svg>
      </div>

      {/* Estatísticas detalhadas (estilo CanvasJS data table) */}
      <div className="bg-bg-secondary/20 rounded-lg p-6 border border-bg-secondary/30">
        <h3 className="text-text-primary font-semibold mb-4 text-center">
          Detalhamento do Funil
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bg-secondary/30">
                <th className="text-left text-text-secondary py-2 px-3">Etapa</th>
                <th className="text-center text-text-secondary py-2 px-3">Leads</th>
                <th className="text-center text-text-secondary py-2 px-3">Percentual</th>
                <th className="text-center text-text-secondary py-2 px-3">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {funnelSteps.map((step, index) => {
                const conversionRate = index > 0 
                  ? (step.value / funnelSteps[index - 1].value * 100).toFixed(1)
                  : '100.0';
                
                return (
                  <tr key={index} className="border-b border-bg-secondary/20 hover:bg-bg-secondary/10">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: step.color }}
                        />
                        <span className="text-text-primary font-medium">{step.label}</span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-3 text-text-primary font-bold">
                      {step.value}
                    </td>
                    <td className="text-center py-3 px-3 text-accent-blue font-medium">
                      {step.percentage.toFixed(1)}%
                    </td>
                    <td className="text-center py-3 px-3">
                      <span className={`font-medium ${
                        parseFloat(conversionRate) >= 50 ? 'text-accent-green' : 
                        parseFloat(conversionRate) >= 25 ? 'text-accent-gray' : 'text-red-400'
                      }`}>
                        {conversionRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumo final (estilo CanvasJS summary) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <div className="text-center p-3 bg-gradient-to-br from-accent-blue/20 to-accent-blue/10 rounded-lg border border-accent-blue/30">
          <p className="text-2xl font-bold text-accent-blue">{totalLeads}</p>
          <p className="text-text-secondary text-xs">Total Entrada</p>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-accent-green/20 to-accent-green/10 rounded-lg border border-accent-green/30">
          <p className="text-2xl font-bold text-accent-green">
            {funnelSteps[funnelSteps.length - 1].value}
          </p>
          <p className="text-text-secondary text-xs">Último Estágio</p>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-accent-gray/20 to-accent-gray/10 rounded-lg border border-accent-gray/30">
          <p className="text-2xl font-bold text-accent-gray">
            {((funnelSteps[funnelSteps.length - 1].value / totalLeads) * 100).toFixed(1)}%
          </p>
          <p className="text-text-secondary text-xs">Taxa Final</p>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-accent-purple/20 to-accent-purple/10 rounded-lg border border-accent-purple/30">
          <p className="text-2xl font-bold text-accent-purple">{funnelSteps.length}</p>
          <p className="text-text-secondary text-xs">Etapas</p>
        </div>
      </div>
    </div>
  );
};
