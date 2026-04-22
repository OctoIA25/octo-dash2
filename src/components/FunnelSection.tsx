import { Card } from "@/components/ui/card";
import { FunnelData, ConversaoData } from "@/utils/metrics";
import { useTheme } from "@/hooks/useTheme";

// 📋 Consulte context.md para: etapas do funil, taxa de conversão, paleta de cores
interface FunnelSectionProps {
  funnelData: FunnelData[];
  conversaoData: ConversaoData[];
}

export const FunnelSection = ({ funnelData, conversaoData }: FunnelSectionProps) => {
  const { currentTheme } = useTheme();
  const maxQuantidade = Math.max(...funnelData.map(item => item.quantidade));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Funil de Leads */}
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
        <h3 className="text-text-primary text-base font-semibold mb-5 flex items-center gap-2">
          <div className="w-1 h-4 bg-accent-blue rounded-full glow-accent-blue"></div>
          Funil
        </h3>
        <div className="flex flex-col items-center space-y-3">
          {funnelData.map((item, index) => {
            // Design minimalista em cascata
            const percentage = (item.quantidade / maxQuantidade) * 100;
            const width = Math.max(percentage, 30); // Mínimo 30%
            
            return (
              <div key={item.etapa} className="w-full flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-2">
                  <span className="text-text-primary text-sm font-medium">
                    {item.etapa}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-semibold text-sm">{item.quantidade}</span>
                    <span className="text-text-secondary text-xs bg-bg-secondary/60 px-2 py-1 rounded-full">
                      {item.percentual.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-bg-secondary/40 rounded-full h-3 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ 
                      width: `${width}%`,
                      background: `linear-gradient(90deg, ${item.color}dd, ${item.color})`,
                      boxShadow: currentTheme !== 'branco' ? `inset 0 1px 2px rgba(0,0,0,0.1), 0 0 8px ${item.color}30` : 'inset 0 1px 2px rgba(0,0,0,0.1)'
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Conversões Entre Etapas */}
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
        <h3 className="text-text-primary text-base font-semibold mb-5 flex items-center gap-2">
          <div className="w-1 h-4 bg-accent-green rounded-full glow-accent-green"></div>
          Conversão
        </h3>
        <div className="space-y-4">
          {conversaoData.map((conv) => (
            <div key={`${conv.de}-${conv.para}`} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-text-primary text-sm font-medium">
                  {conv.de} para {conv.para}
                </span>
                <span className="text-text-primary font-semibold text-sm bg-bg-secondary/60 px-2 py-1 rounded-full">
                  {conv.taxa.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-bg-secondary/40 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ 
                    width: `${conv.taxa}%`, 
                    background: `linear-gradient(90deg, ${conv.color}dd, ${conv.color})`,
                    boxShadow: currentTheme !== 'branco' ? `inset 0 1px 2px rgba(0,0,0,0.1), 0 0 6px ${conv.color}30` : 'inset 0 1px 2px rgba(0,0,0,0.1)'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};