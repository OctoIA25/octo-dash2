import { ProcessedLead } from "@/data/realLeadsProcessor";
import { Badge } from "@/components/ui/badge";

interface CustomDoughnutChartProps {
  leads: ProcessedLead[];
}

// 📋 Inspirado no Chart.js Doughnut Chart fornecido nos links
export const CustomDoughnutChart = ({ leads }: CustomDoughnutChartProps) => {
  // Calcular distribuição por temperatura
  const temperaturas = leads.reduce((acc, lead) => {
    const temp = lead.status_temperatura || 'Orgânico';
    acc[temp] = (acc[temp] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalLeads = leads.length;
  
  const data = Object.entries(temperaturas).map(([temp, count]) => ({
    label: temp,
    value: count,
    percentage: ((count / totalLeads) * 100).toFixed(1),
    color: temp.toLowerCase().includes('quente') ? '#234890' :
           temp.toLowerCase().includes('morno') ? '#73A6D3' :
           temp.toLowerCase().includes('frio') ? '#F4F8FA' : '#9CA3AF'
  }));

  // Calcular ângulos para o doughnut
  let cumulativeAngle = 0;
  const segments = data.map(item => {
    const angle = (item.value / totalLeads) * 360;
    const segment = {
      ...item,
      startAngle: cumulativeAngle,
      endAngle: cumulativeAngle + angle,
      angle
    };
    cumulativeAngle += angle;
    return segment;
  });

  const radius = 100;
  const innerRadius = 60;
  const centerX = 120;
  const centerY = 120;

  // Função para criar path do SVG para cada segmento
  const createArcPath = (startAngle: number, endAngle: number, outerRadius: number, innerRadius: number) => {
    const startAngleRad = (startAngle - 90) * Math.PI / 180;
    const endAngleRad = (endAngle - 90) * Math.PI / 180;

    const x1 = centerX + outerRadius * Math.cos(startAngleRad);
    const y1 = centerY + outerRadius * Math.sin(startAngleRad);
    const x2 = centerX + outerRadius * Math.cos(endAngleRad);
    const y2 = centerY + outerRadius * Math.sin(endAngleRad);

    const x3 = centerX + innerRadius * Math.cos(endAngleRad);
    const y3 = centerY + innerRadius * Math.sin(endAngleRad);
    const x4 = centerX + innerRadius * Math.cos(startAngleRad);
    const y4 = centerY + innerRadius * Math.sin(startAngleRad);

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
      "M", x1, y1, 
      "A", outerRadius, outerRadius, 0, largeArcFlag, 1, x2, y2,
      "L", x3, y3,
      "A", innerRadius, innerRadius, 0, largeArcFlag, 0, x4, y4,
      "Z"
    ].join(" ");
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Doughnut Chart SVG */}
      <div className="relative flex-1">
        <svg width="240" height="240" className="mx-auto">
          {/* Segmentos do doughnut */}
          {segments.map((segment, index) => (
            <g key={index}>
              <path
                d={createArcPath(segment.startAngle, segment.endAngle, radius, innerRadius)}
                fill={segment.color}
                className="transition-all duration-300 hover:brightness-110 cursor-pointer"
                style={{
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}
              />
            </g>
          ))}
          
          {/* Centro do doughnut */}
          <circle
            cx={centerX}
            cy={centerY}
            r={innerRadius}
            fill="rgba(42, 42, 42, 0.8)"
            className="backdrop-blur-sm"
          />
          
          {/* Texto central */}
          <text
            x={centerX}
            y={centerY - 10}
            textAnchor="middle"
            className="fill-text-primary text-2xl font-bold"
          >
            {totalLeads}
          </text>
          <text
            x={centerX}
            y={centerY + 15}
            textAnchor="middle"
            className="fill-text-secondary text-sm"
          >
            Total Leads
          </text>
        </svg>
      </div>

      {/* Legenda detalhada */}
      <div className="flex-1 space-y-3">
        <h4 className="text-text-primary font-semibold mb-4">Distribuição por Temperatura</h4>
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-bg-secondary/20 rounded-lg border border-bg-secondary/30 hover:border-opacity-50 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div 
                className="w-4 h-4 rounded-full shadow-lg" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-text-primary font-medium">{item.label}</span>
            </div>
            <div className="text-right">
              <p className="text-text-primary font-bold text-lg">{item.value}</p>
              <Badge variant="outline" className="text-xs mt-1">
                {item.percentage}%
              </Badge>
            </div>
          </div>
        ))}
        
        {/* Estatísticas adicionais */}
        <div className="mt-6 p-4 bg-gradient-to-r from-bg-secondary/20 to-bg-secondary/10 rounded-lg border border-bg-secondary/30">
          <h5 className="text-text-primary font-medium mb-3">Insights</h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Mais frequente:</span>
              <span className="text-text-primary font-medium">
                {data.length > 0 ? data.reduce((prev, current) => 
                  (prev.value > current.value) ? prev : current
                ).label : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Diversidade:</span>
              <span className="text-text-primary font-medium">
                {data.length} categorias
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
