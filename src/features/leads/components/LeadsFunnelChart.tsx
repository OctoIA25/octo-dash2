import { useMemo, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { TrendingDown } from 'lucide-react';
import { DateRangeFilter } from '@/components/DateRangeFilter';

interface LeadsFunnelChartProps {
  leads?: ProcessedLead[];
}

const FUNNEL_STAGES: { key: string; colorFrom: string; colorTo: string; textColor: string }[] = [
  { key: 'Novos Leads',       colorFrom: '#BFDBFE', colorTo: '#93C5FD', textColor: '#1D4ED8' },
  { key: 'Em Atendimento',    colorFrom: '#93C5FD', colorTo: '#60A5FA', textColor: '#1D4ED8' },
  { key: 'Interação',         colorFrom: '#60A5FA', colorTo: '#3B82F6', textColor: '#ffffff' },
  { key: 'Visita Agendada',   colorFrom: '#3B82F6', colorTo: '#2563EB', textColor: '#ffffff' },
  { key: 'Visita Realizada',  colorFrom: '#2563EB', colorTo: '#1D4ED8', textColor: '#ffffff' },
  { key: 'Negociação',        colorFrom: '#1D4ED8', colorTo: '#1E40AF', textColor: '#ffffff' },
  { key: 'Proposta Criada',   colorFrom: '#1E40AF', colorTo: '#1e3a8a', textColor: '#ffffff' },
  { key: 'Proposta Enviada',  colorFrom: '#1e3a8a', colorTo: '#172554', textColor: '#ffffff' },
  { key: 'Proposta Assinada', colorFrom: '#0D9488', colorTo: '#0F766E', textColor: '#ffffff' },
];

export const LeadsFunnelChart = ({ leads: propsLeads }: LeadsFunnelChartProps) => {
  const leads = propsLeads || [];
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filtrar leads por período
  const filteredLeads = useMemo(() => {
    if (!startDate || !endDate) return leads;
    return leads.filter(lead => {
      const leadDate = lead.data_entrada || '';
      return leadDate >= startDate && leadDate <= endDate;
    });
  }, [leads, startDate, endDate]);

  // Calcular contagens reais por etapa
  const stages = useMemo(() => {
    const s = filteredLeads;
    const count = (fn: (l: ProcessedLead) => boolean) => s.filter(fn).length;

    const counts = [
      count(l => ['Novos Leads','Novo Lead','novos leads','novo lead'].includes(l.etapa_atual || '')),
      count(l => l.etapa_atual === 'Em Atendimento'),
      count(l => l.etapa_atual === 'Interação'),
      count(l => l.etapa_atual === 'Visita Agendada' || l.etapa_atual === 'Visita agendada' || !!(l.Data_visita?.trim())),
      count(l => l.etapa_atual === 'Visita Realizada'),
      count(l => ['Negociação','Em Negociação'].includes(l.etapa_atual || '')),
      count(l => l.etapa_atual === 'Proposta Criada'),
      count(l => l.etapa_atual === 'Proposta Enviada'),
      count(l => ['Proposta Assinada','Fechamento','Finalizado'].includes(l.etapa_atual || '')),
    ];

    const top = counts[0] || 1;

    return FUNNEL_STAGES.map((stage, i) => {
      const qtd = counts[i] ?? 0;
      const prev = i === 0 ? qtd : (counts[i - 1] ?? 0);
      const convRate = prev > 0 ? Math.round((qtd / prev) * 100) : 0;
      // bar width: 100% for first stage, shrinks proportionally (min 20%)
      const barPct = Math.max(20, Math.round((qtd / top) * 100));
      return { ...stage, qtd, convRate, barPct };
    });
  }, [filteredLeads]);

  const totalLeads = stages[0]?.qtd ?? 0;
  const convertidos = stages[stages.length - 1]?.qtd ?? 0;
  const taxaGeral = totalLeads > 0 ? ((convertidos / totalLeads) * 100).toFixed(1) : '0.0';

  return (
    <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 shrink-0 flex flex-row items-center justify-between">
        <StandardCardTitle icon={TrendingDown}>
          Funil Cliente Interessado
        </StandardCardTitle>
        <DateRangeFilter
          onDateRangeChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-y-auto p-4 pt-2">
        {/* Summary row */}
        <div className="flex items-center gap-4 mb-4 px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Total</span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{totalLeads}</span>
          </div>
          <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Convertidos</span>
            <span className="text-sm font-bold text-teal-600 dark:text-teal-400">{convertidos}</span>
          </div>
          <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Taxa geral</span>
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{taxaGeral}%</span>
          </div>
        </div>

        {/* Funnel rows */}
        <div className="space-y-[3px]">
          {stages.map((stage, idx) => {
            const isLast = idx === stages.length - 1;
            return (
              <div key={stage.key} className="group">
                {/* Stage row */}
                <div className="flex items-center gap-2">
                  {/* Label */}
                  <div className="w-[130px] shrink-0 text-right">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight">
                      {stage.key}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="flex-1 flex items-center gap-2">
                    <div
                      className="h-7 rounded-md flex items-center justify-center transition-all duration-500 ease-out relative overflow-hidden"
                      style={{
                        width: `${stage.barPct}%`,
                        background: `linear-gradient(135deg, ${stage.colorFrom}, ${stage.colorTo})`,
                        minWidth: '32px',
                      }}
                    >
                      {/* Subtle shine overlay */}
                      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                      <span
                        className="relative text-[11px] font-bold tabular-nums px-2"
                        style={{ color: stage.textColor }}
                      >
                        {stage.qtd}
                      </span>
                    </div>
                  </div>

                  {/* Conv rate badge */}
                  <div className="w-[48px] shrink-0 text-right">
                    {idx > 0 ? (
                      <span
                        className={`text-[10px] font-semibold tabular-nums ${
                          stage.convRate >= 70
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : stage.convRate >= 40
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-500 dark:text-rose-400'
                        }`}
                      >
                        {stage.convRate}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </div>
                </div>

                {/* Connector line between stages */}
                {!isLast && (
                  <div className="flex items-center gap-2 py-[1px]">
                    <div className="w-[130px] shrink-0" />
                    <div className="flex-1 flex items-center">
                      <div
                        className="h-[3px] rounded-sm opacity-25"
                        style={{
                          width: `${Math.max(20, Math.round(((stages[idx + 1]?.barPct ?? 20) / (stage.barPct || 1)) * stage.barPct))}%`,
                          background: `linear-gradient(90deg, ${stage.colorTo}, ${stages[idx + 1]?.colorFrom ?? stage.colorTo})`,
                        }}
                      />
                    </div>
                    <div className="w-[48px] shrink-0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">≥70% conversão</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/80" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">40–69%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/80" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400">&lt;40%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
