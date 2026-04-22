import { ProcessedLead } from '@/data/realLeadsProcessor';
import { EnhancedFunnelChart } from './EnhancedFunnelChart';
import { LeadsPerformanceChart } from './LeadsPerformanceChart';
import { LeadsOriginChart } from './LeadsOriginChart';
import { LeadsTemperatureChart } from './LeadsTemperatureChart';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

interface LeadsTabOptimizedProps {
  leads: ProcessedLead[];
}

export const LeadsTabOptimized = ({ leads }: LeadsTabOptimizedProps) => {
  return (
    <div className="w-full space-y-8">
      {/* Header com métricas rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="notion-card notion-card-hover notion-transition p-4 rounded-xl text-center">
          <div className="text-2xl font-bold notion-text-primary mb-1">
            {leads?.length || 0}
          </div>
          <div className="text-sm notion-text-secondary">Total de Leads</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-4 rounded-xl text-center">
          <div className="text-2xl font-bold text-green-400 mb-1">
            {leads?.filter(l => l.status_temperatura === 'Quente').length || 0}
          </div>
          <div className="text-sm notion-text-secondary">Leads Quentes</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-4 rounded-xl text-center">
          <div className="text-2xl font-bold text-blue-400 mb-1">
            {leads?.filter(l => l.Data_visita && l.Data_visita.trim() !== "").length || 0}
          </div>
          <div className="text-sm notion-text-secondary">Visitas Agendadas</div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-4 rounded-xl text-center">
          <div className="text-2xl font-bold text-yellow-400 mb-1">
            {leads?.filter(l => l.data_finalizacao && l.data_finalizacao.trim() !== "").length || 0}
          </div>
          <div className="text-sm notion-text-secondary">Conversões</div>
        </div>
      </div>

      {/* Gráficos principais em grid 2x2 otimizado */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Funil de Conversão - Destaque principal */}
        <div className="xl:col-span-1">
          <div className="h-[600px] notion-card notion-card-hover notion-transition rounded-xl p-6">
            <ErrorBoundary fallbackTitle="Funil de Conversão">
              <EnhancedFunnelChart leads={leads} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Performance de Conversão */}
        <div className="xl:col-span-1">
          <div className="h-[600px] notion-card notion-card-hover notion-transition rounded-xl p-6">
            <ErrorBoundary fallbackTitle="Performance de Conversão">
              <LeadsPerformanceChart leads={leads} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Origem dos Leads */}
        <div className="xl:col-span-1">
          <div className="h-[600px] notion-card notion-card-hover notion-transition rounded-xl p-6">
            <ErrorBoundary fallbackTitle="Origem dos Leads">
              <LeadsOriginChart leads={leads} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Temperatura dos Leads */}
        <div className="xl:col-span-1">
          <div className="h-[600px] notion-card notion-card-hover notion-transition rounded-xl p-6">
            <ErrorBoundary fallbackTitle="Temperatura dos Leads">
              <LeadsTemperatureChart leads={leads} />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Insights rápidos no rodapé */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 bg-green-400 rounded-full notion-glow-green"></div>
            <h4 className="font-semibold notion-text-primary">Conversão Atual</h4>
          </div>
          <div className="text-2xl font-bold text-green-400 mb-1">
            {leads?.length > 0 ? 
              ((leads.filter(l => l.data_finalizacao && l.data_finalizacao.trim() !== "").length / leads.length) * 100).toFixed(1) 
              : 0}%
          </div>
          <div className="text-sm notion-text-secondary">Taxa de conversão geral</div>
        </div>

        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 bg-blue-400 rounded-full notion-glow-blue"></div>
            <h4 className="font-semibold notion-text-primary">Pipeline Ativo</h4>
          </div>
          <div className="text-2xl font-bold text-blue-400 mb-1">
            R$ {leads?.reduce((sum, l) => sum + (l.valor_imovel || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) || '0'}
          </div>
          <div className="text-sm notion-text-secondary">Valor total em oportunidades</div>
        </div>

        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 bg-yellow-400 rounded-full notion-glow-yellow"></div>
            <h4 className="font-semibold notion-text-primary">Ticket Médio</h4>
          </div>
          <div className="text-2xl font-bold text-yellow-400 mb-1">
            R$ {leads?.length > 0 ? 
              (leads.reduce((sum, l) => sum + (l.valor_imovel || 0), 0) / leads.length).toLocaleString('pt-BR', { minimumFractionDigits: 0 })
              : '0'}
          </div>
          <div className="text-sm notion-text-secondary">Valor médio por lead</div>
        </div>
      </div>
    </div>
  );
};
