import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

// 📋 Consulte context.md para: KPIs dinâmicos, cálculos de métricas, cores de status
interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  color: string;
}

export const MetricCard = ({ title, value, subtitle, icon: Icon, color }: MetricCardProps) => {
  const { currentTheme } = useTheme();
  return (
    <Card className="bg-bg-card/60 backdrop-blur-sm card-neon hover:bg-bg-card/70 transition-all duration-300 p-5 group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider neon-text-subtle">{title}</p>
          <p className="text-text-primary text-2xl font-bold mt-2 transition-colors duration-200 neon-text-subtle">{value}</p>
          {subtitle && (
            <p className="text-text-secondary text-sm mt-1.5 neon-text-subtle">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-opacity-10 group-hover:scale-105 transition-all duration-300`} style={{ 
          backgroundColor: `${color}15`,
          boxShadow: currentTheme !== 'branco' ? `0 0 12px ${color}30` : 'none'
        }}>
          <Icon className="h-5 w-5 transition-all duration-300" style={{ 
            color,
            filter: currentTheme !== 'branco' ? `drop-shadow(0 0 4px ${color}50)` : 'none'
          }} />
        </div>
      </div>
    </Card>
  );
};