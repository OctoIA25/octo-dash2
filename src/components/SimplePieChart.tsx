import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/hooks/useTheme';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { LucideIcon } from 'lucide-react';

interface SimplePieData {
  label: string;
  value: number;
  color: string;
  percentage: number;
}

interface SimplePieChartProps {
  title: string;
  data: SimplePieData[];
  icon?: LucideIcon;
}

export const SimplePieChart = ({ title, data, icon }: SimplePieChartProps) => {
  const { currentTheme } = useTheme();
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  // Calcular ângulos para cada segmento
  let currentAngle = 0;
  const segments = data.map(item => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const segment = {
      ...item,
      percentage,
      startAngle: currentAngle,
      endAngle: currentAngle + angle
    };
    currentAngle += angle;
    return segment;
  });

  // Criar path SVG para cada segmento
  const createArcPath = (centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    
    return [
      "M", centerX, centerY,
      "L", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      "Z"
    ].join(" ");
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <StandardCardTitle icon={icon}>
          {title}
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-6">
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <svg width="380" height="380" className="transform -rotate-90">
              {segments.map((segment, index) => (
                <path
                  key={index}
                  d={createArcPath(190, 190, 140, segment.startAngle, segment.endAngle)}
                  fill={segment.color}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                  className="transition-all duration-300 hover:opacity-80"
                  style={{
                    filter: `drop-shadow(0 0 8px ${segment.color}40)`
                  }}
                />
              ))}
              {/* Círculo interno para efeito donut */}
              <circle
                cx="190"
                cy="190"
                r="80"
                fill="transparent"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
            </svg>
            
            {/* Texto central */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-text-primary">{total}</div>
                <div className="text-xs text-text-secondary">Total</div>
              </div>
            </div>
          </div>
        </div>

        {/* Legenda */}
        <div className="space-y-3">
          {data.map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{
                    backgroundColor: item.color,
                    boxShadow: currentTheme !== 'branco' ? `0 0 6px ${item.color}60` : 'none'
                  }}
                />
                <span className="text-text-primary text-sm font-medium">
                  {item.label}
                </span>
              </div>
              <div className="text-right">
                <div className="text-text-primary font-bold">{item.value}</div>
                <div className="text-text-secondary text-xs">
                  {item.percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
