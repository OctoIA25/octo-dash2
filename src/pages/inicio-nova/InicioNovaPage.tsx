/**
 * InicioNovaPage - Home do CRM Octo
 * Paleta: slate neutro + accent azul do logo. Sem chroma. Lucide-only, sem emojis.
 */

import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OKRManager } from '@/components/OKRManager';
import { PDIManager } from '@/components/PDIManager';
import { TaskManager } from '@/components/TaskManager';
import { AgendaCalendar } from '@/features/agenda/components/AgendaCalendar';
import {
  Plus,
  Phone,
  MessageCircle,
  Users,
  Clock,
  TrendingUp,
  Target,
  AlertCircle,
  Flame,
  Calendar as CalendarIcon,
  MoreVertical,
  ChevronRight,
  Sparkles,
  Bot,
  Hand,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import type { ProcessedLead } from '@/data/realLeadsProcessor';

const BRL = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// =================== KPI CARD ===================
interface KpiCardProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  trend?: { value: string; positive: boolean; caption: string };
  progress?: { pct: number; caption: string; barColor: string };
  onClick?: () => void;
}

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, trend, progress, onClick }: KpiCardProps) {
  const Wrapper: React.ElementType = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={[
        'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 transition-all text-left w-full',
        onClick
          ? 'hover:border-blue-300 hover:shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200'
          : 'hover:border-slate-300 hover:shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-[18px] h-[18px] ${iconColor}`} strokeWidth={1.6} />
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-[26px] font-bold text-slate-900 dark:text-slate-100 leading-none mb-2 tracking-tight">{value}</p>
      {trend && (
        <div className="flex items-center gap-1 text-[11.5px]">
          <span className={trend.positive ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
          <span className="text-slate-400">{trend.caption}</span>
        </div>
      )}
      {progress && (
        <div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${progress.barColor}`}
              style={{ width: `${Math.min(100, progress.pct)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{progress.caption}</p>
        </div>
      )}
    </Wrapper>
  );
}

// =================== ALERT STRIP ===================
interface AlertPillProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  count: number;
  message: string;
  unit: 'leads' | 'visitas';
  bgClass: string;
  iconBg: string;
  iconColor: string;
}

function AlertPill({ icon: Icon, count, message, unit, bgClass, iconColor }: AlertPillProps) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${bgClass}`}>
      <Icon className={`w-[18px] h-[18px] ${iconColor} shrink-0`} strokeWidth={1.8} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 leading-tight">
          {count} {unit === 'visitas' ? (count === 1 ? 'visita' : 'visitas') : count === 1 ? 'lead' : 'leads'}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-400 leading-tight">{message}</p>
      </div>
    </div>
  );
}

// =================== LEAD ACTION CARD ===================
interface LeadActionCardProps {
  lead: ProcessedLead;
}

interface StatusBadge {
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  className: string;
}

function statusBadgeFor(lead: ProcessedLead): StatusBadge {
  const etapa = (lead.etapa_atual || '').toLowerCase();
  const temp = (lead.status_temperatura || '').toLowerCase();
  if (temp === 'quente') return { label: 'Quente', icon: Flame, className: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300' };
  if (etapa.includes('visita')) return { label: 'Visita agendada', className: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' };
  if (etapa.includes('proposta')) return { label: 'Proposta', className: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' };
  if (temp === 'morno') return { label: 'Pode esfriar', className: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' };
  return { label: 'Novo lead', className: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' };
}

function actionButtonFor(lead: ProcessedLead): { label: string; className: string } {
  const etapa = (lead.etapa_atual || '').toLowerCase();
  const temp = (lead.status_temperatura || '').toLowerCase();
  if (temp === 'quente') return { label: 'Responder', className: 'bg-emerald-500 hover:bg-emerald-600 text-white' };
  if (etapa.includes('visita')) return { label: 'Ver detalhes', className: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200' };
  if (temp === 'morno') return { label: 'Enviar WhatsApp', className: 'bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-700' };
  return { label: 'Qualificar', className: 'bg-white border border-blue-200 hover:bg-blue-50 text-blue-700' };
}

function contextLineFor(lead: ProcessedLead): string {
  const etapa = (lead.etapa_atual || '').toLowerCase();
  if (etapa.includes('visita')) return `Visita ${lead.Data_visita ? 'em ' + new Date(lead.Data_visita).toLocaleDateString('pt-BR') : 'agendada'} · ${lead.codigo_imovel || ''}`;
  if (lead.origem_lead) return `Via ${lead.origem_lead} · ${lead.codigo_imovel || 'Sem imóvel'}`;
  return lead.codigo_imovel || 'Lead sem imóvel associado';
}

function LeadActionCard({ lead }: LeadActionCardProps) {
  const initials = getInitials(lead.nome_lead || '');
  const status = statusBadgeFor(lead);
  const action = actionButtonFor(lead);
  const ctx = contextLineFor(lead);
  const StatusIcon = status.icon;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent">
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[12px] font-semibold">
          {initials}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 truncate">{lead.nome_lead || 'Sem nome'}</p>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${status.className}`}>
            {StatusIcon && <StatusIcon className="w-3 h-3" strokeWidth={2.4} />}
            {status.label}
          </span>
        </div>
        <p className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">{ctx}</p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {lead.valor_imovel ? <span className="font-semibold text-slate-700 dark:text-slate-300">{BRL(lead.valor_imovel)}</span> : null}
          {lead.valor_imovel ? <span>·</span> : null}
          <span>{timeAgo(lead.data_entrada)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          className={`h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors ${action.className}`}
        >
          {action.label}
        </button>
        <button type="button" className="w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center">
          <MoreVertical className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    </div>
  );
}

// =================== PIPELINE ===================
interface PipelineStage {
  label: string;
  count: number;
  pct: number;
  shade: string;
}

function PipelineCard({ stages, onViewFull }: { stages: PipelineStage[]; onViewFull: () => void }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Pipeline</h3>
        <button
          type="button"
          onClick={onViewFull}
          className="text-[11.5px] font-medium text-blue-600 hover:text-blue-700 hover:underline focus:outline-none"
        >
          Ver completo →
        </button>
      </div>
      {/* Funil visual: cada estágio é uma faixa centrada com largura proporcional */}
      <div className="flex flex-col items-center gap-1">
        {stages.map((s, idx) => {
          const widthPct = Math.max(25, (s.count / max) * 100);
          // leve redução extra para formar funil mesmo quando counts iguais
          const funnelPct = widthPct - idx * 3;
          return (
            <div key={s.label} style={{ width: `${Math.max(28, funnelPct)}%` }} className="w-full">
              <div className={`${s.shade} rounded-md px-3 py-2 flex items-center justify-between text-white shadow-sm`}>
                <span className="text-[11px] font-medium truncate">{s.label}</span>
                <span className="text-[12px] font-bold tabular-nums">
                  {s.count.toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="text-center text-[10px] text-slate-400 mt-0.5 mb-0.5">{s.pct.toFixed(1)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =================== RANKING ===================
interface RankingItem {
  name: string;
  closings: number;
  volume: number;
}

function RankingCard({ items, onViewAll }: { items: RankingItem[]; onViewAll: () => void }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Ranking da Equipe</h3>
        <button
          type="button"
          onClick={onViewAll}
          className="text-[11.5px] font-medium text-blue-600 hover:text-blue-700 hover:underline focus:outline-none"
        >
          Ver todos →
        </button>
      </div>
      <ul className="space-y-2.5">
        {items.slice(0, 3).map((it, idx) => (
          <li key={idx} className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[11px] font-semibold">
                {getInitials(it.name)}
              </div>
              <span className={`absolute -top-1 -left-1 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : 'bg-orange-400'}`}>
                {idx + 1}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-slate-900 truncate">{it.name}</p>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">{it.closings} fechamentos</p>
            </div>
            <span className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-300">{BRL(it.volume)}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-[12px] text-slate-400">Sem dados de equipe</li>}
      </ul>
    </div>
  );
}

// =================== AI SUGGESTION ===================
function AiSuggestionCard({ lead }: { lead?: ProcessedLead }) {
  return (
    <div className="relative rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-white overflow-hidden">
      <div className="flex items-center gap-1.5 mb-2 relative z-10">
        <Sparkles className="w-3.5 h-3.5 text-blue-100" strokeWidth={2} />
        <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-blue-100">Sugestão da IA</h3>
      </div>
      <p className="text-[12px] leading-relaxed text-blue-50 mb-3 relative z-10">
        {lead
          ? 'Este lead tem perfil de comprador premium. Recomendo contato nas próximas 2 horas.'
          : 'Analise seus leads e veja recomendações personalizadas.'}
      </p>
      {lead && (
        <button
          type="button"
          className="relative z-10 w-full px-2.5 py-1.5 bg-white/15 hover:bg-white/25 border border-white/20 rounded-md text-[11.5px] font-semibold text-white transition-colors backdrop-blur-sm"
        >
          Ver lead recomendado
        </button>
      )}
      <Bot className="absolute -bottom-3 -right-3 w-20 h-20 text-white/15" strokeWidth={1.3} />
    </div>
  );
}

// =================== MAIN PAGE ===================
type TabKey = 'todos' | 'nao-responderam' | 'esfriando';

export function InicioNovaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeInicioTab = searchParams.get('tab') || 'funil';
  const { user, tenantName } = useAuthContext();
  // `processedLeads` normaliza `leads` + `kenlo_leads` no formato ProcessedLead
  // (etapa_atual, status_temperatura, valor_imovel, corretor_responsavel).
  // `useLeadsMetrics` assina `leadsEventEmitter`, então o Pipeline aqui
  // re-renderiza automaticamente quando o Kanban move um card.
  const { processedLeads: leads, generalMetrics, isLoading } = useLeadsMetrics();

  const [activeTab, setActiveTab] = useState<TabKey>('todos');

  const userName = useMemo(() => {
    if (!user?.email) return 'Gabriel';
    const prefix = user.email.split('@')[0].replace(/[._-]/g, ' ');
    return prefix
      .split(' ')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
      .slice(0, 30);
  }, [user?.email]);

  const userRole = user?.systemRole === 'owner' ? 'Owner' : user?.systemRole === 'admin' ? 'Gestor' : user?.systemRole === 'team_leader' ? 'Líder' : 'Corretor';

  const leadsNoFunil = generalMetrics?.totalLeads ?? leads.length;
  const conversaoMes = generalMetrics?.taxaConversao ?? 0;

  const nowMs = Date.now();
  const aguardandoResposta = useMemo(
    () => leads.filter((l) => {
      const t = (l.status_temperatura || '').toLowerCase();
      const entrada = l.data_entrada ? new Date(l.data_entrada).getTime() : 0;
      return t === 'quente' && entrada > 0 && nowMs - entrada < 24 * 3600_000;
    }).length,
    [leads, nowMs],
  );

  const podemEsfriar = useMemo(
    () => leads.filter((l) => (l.status_temperatura || '').toLowerCase() === 'morno').length,
    [leads],
  );

  const visitasHoje = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return leads.filter((l) => l.Data_visita === today).length;
  }, [leads]);

  const proximasAcoes = useMemo(() => {
    const sorted = [...leads].sort((a, b) => {
      const tempRank: Record<string, number> = { quente: 0, morno: 1, frio: 2 };
      const ra = tempRank[(a.status_temperatura || '').toLowerCase()] ?? 3;
      const rb = tempRank[(b.status_temperatura || '').toLowerCase()] ?? 3;
      if (ra !== rb) return ra - rb;
      const da = a.data_entrada ? new Date(a.data_entrada).getTime() : 0;
      const db = b.data_entrada ? new Date(b.data_entrada).getTime() : 0;
      return db - da;
    });
    if (activeTab === 'nao-responderam') {
      return sorted.filter((l) => (l.status_temperatura || '').toLowerCase() === 'quente');
    }
    if (activeTab === 'esfriando') {
      return sorted.filter((l) => (l.status_temperatura || '').toLowerCase() === 'morno');
    }
    return sorted;
  }, [leads, activeTab]);

  const proximasAcoesCount = {
    todos: leads.length,
    naoResp: leads.filter((l) => (l.status_temperatura || '').toLowerCase() === 'quente').length,
    esfr: leads.filter((l) => (l.status_temperatura || '').toLowerCase() === 'morno').length,
  };

  const pipelineStages: PipelineStage[] = useMemo(() => {
    const stagesRaw = [
      { key: ['novo', 'novos'], label: 'Novos Leads', shade: 'bg-blue-600' },
      { key: ['atendimento', 'interação', 'interacao'], label: 'Em Atendimento', shade: 'bg-blue-500' },
      { key: ['visita'], label: 'Visita', shade: 'bg-sky-500' },
      { key: ['proposta'], label: 'Proposta', shade: 'bg-emerald-500' },
      { key: ['assinad', 'fechad'], label: 'Fechamento', shade: 'bg-emerald-600' },
    ];
    const total = leads.length || 1;
    return stagesRaw.map((st) => {
      const count = leads.filter((l) => {
        const e = (l.etapa_atual || '').toLowerCase();
        return st.key.some((k) => e.includes(k));
      }).length;
      return { label: st.label, count, pct: (count / total) * 100, shade: st.shade };
    });
  }, [leads]);

  const ranking: RankingItem[] = useMemo(() => {
    const map = new Map<string, { closings: number; volume: number }>();
    leads.forEach((l) => {
      const name = l.corretor_responsavel || 'Sem corretor';
      const entry = map.get(name) || { closings: 0, volume: 0 };
      if ((l.etapa_atual || '').toLowerCase().includes('assinad') || (l.etapa_atual || '').toLowerCase().includes('fechad')) {
        entry.closings += 1;
        entry.volume += l.valor_final_venda || l.valor_imovel || 0;
      }
      map.set(name, entry);
    });
    return Array.from(map.entries())
      .filter(([name]) => name !== 'Sem corretor')
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.volume - a.volume);
  }, [leads]);

  const aiLead = useMemo(() => {
    const hot = leads.filter((l) => (l.status_temperatura || '').toLowerCase() === 'quente');
    return [...hot].sort((a, b) => (b.valor_imovel || 0) - (a.valor_imovel || 0))[0];
  }, [leads]);

  // Switch de conteúdo baseado na aba da Início
  const ANIM = 'animate-in fade-in-0 slide-in-from-bottom-3 duration-300 ease-out';

  if (activeInicioTab === 'okrs') {
    return (
      <div key="okrs" className={ANIM}>
        <div className="px-6 py-5">
          <div className="max-w-[1400px] mx-auto"><OKRManager /></div>
        </div>
      </div>
    );
  }
  if (activeInicioTab === 'pdi') {
    return (
      <div key="pdi" className={ANIM}>
        <div className="px-6 py-5">
          <div className="max-w-[1400px] mx-auto"><PDIManager /></div>
        </div>
      </div>
    );
  }
  if (activeInicioTab === 'tarefas-semana') {
    return (
      <div key="tarefas-semana" className={ANIM}>
        <div className="px-6 py-5">
          <div className="max-w-[1400px] mx-auto"><TaskManager isWeekView /></div>
        </div>
      </div>
    );
  }
  if (activeInicioTab === 'agenda') {
    return (
      <div key="agenda" className={ANIM}>
        <div className="px-6 py-5">
          <div className="max-w-[1400px] mx-auto"><AgendaCalendar corretorEmail={user?.email || ''} /></div>
        </div>
      </div>
    );
  }
  // funil / kpis (default) → dashboard novo
  return (
    <div key={activeInicioTab} className={ANIM}>
    <div className="px-6 py-5">
          <div className="max-w-[1400px] mx-auto">
            {/* Saudação + Quick actions */}
            <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
              <div>
                <h1 className="text-[22px] font-bold text-slate-900 dark:text-slate-100 leading-tight flex items-center gap-2 tracking-tight">
                  {greetingByHour()}, {userName.split(' ')[0]}
                  <Hand className="w-5 h-5 text-amber-500" strokeWidth={2} />
                </h1>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Aqui está o que está acontecendo hoje{tenantName ? ` na ${tenantName}` : ''}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" strokeWidth={2} /> Ligar
                </button>
                <button
                  type="button"
                  className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[12.5px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" strokeWidth={2} /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/leads')}
                  className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.2} /> Novo Lead
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <KpiCard
                icon={Users}
                iconBg="bg-transparent"
                iconColor="text-slate-700 dark:text-slate-300"
                label="Leads no Funil"
                value={leadsNoFunil.toLocaleString('pt-BR')}
                trend={{ value: '8,4%', positive: true, caption: 'vs. semana passada' }}
                onClick={() => navigate('/metricas/cliente-interessado')}
              />
              <KpiCard
                icon={Clock}
                iconBg="bg-transparent"
                iconColor="text-slate-700 dark:text-slate-300"
                label="Tempo Médio Resposta"
                value="4h 32m"
                trend={{ value: '15%', positive: true, caption: 'vs. semana passada' }}
              />
              <KpiCard
                icon={TrendingUp}
                iconBg="bg-transparent"
                iconColor="text-slate-700 dark:text-slate-300"
                label="Conversão do Mês"
                value={`${conversaoMes.toFixed(1)}%`}
                trend={{ value: '3,1%', positive: false, caption: 'vs. mês anterior' }}
              />
              <KpiCard
                icon={Target}
                iconBg="bg-transparent"
                iconColor="text-slate-700 dark:text-slate-300"
                label="Meta Mensal"
                value="R$ 1.280.000"
                progress={{ pct: 68, caption: '68% da meta', barColor: 'bg-emerald-500' }}
              />
            </div>

            {/* Alert strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <AlertPill
                icon={AlertCircle}
                count={aguardandoResposta}
                message="aguardando resposta há 24h"
                unit="leads"
                bgClass="bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/50"
                iconBg="bg-rose-100"
                iconColor="text-rose-600 dark:text-rose-400"
              />
              <AlertPill
                icon={Flame}
                count={podemEsfriar}
                message="podem esfriar nas próximas 24h"
                unit="leads"
                bgClass="bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50"
                iconBg="bg-amber-100"
                iconColor="text-amber-600 dark:text-amber-400"
              />
              <AlertPill
                icon={CalendarIcon}
                count={visitasHoje}
                message="agendadas para hoje"
                unit="visitas"
                bgClass="bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50"
                iconBg="bg-blue-100"
                iconColor="text-blue-600 dark:text-blue-400"
              />
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Próximas Ações</h2>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Leads priorizados para você agir agora</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-3 mb-2">
                  {([
                    { k: 'todos' as TabKey, label: 'Todos', count: proximasAcoesCount.todos },
                    { k: 'nao-responderam' as TabKey, label: 'Não responderam', count: proximasAcoesCount.naoResp },
                    { k: 'esfriando' as TabKey, label: 'Esfriando', count: proximasAcoesCount.esfr },
                  ]).map((tab) => {
                    const active = activeTab === tab.k;
                    return (
                      <button
                        key={tab.k}
                        type="button"
                        onClick={() => setActiveTab(tab.k)}
                        className={[
                          'h-8 px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors',
                          active ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
                        ].join(' ')}
                      >
                        {tab.label}
                        <span className={active ? 'text-white/70' : 'text-slate-400'}>{tab.count}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading && proximasAcoes.length === 0 && (
                    <p className="py-6 text-center text-[12px] text-slate-400">Carregando leads...</p>
                  )}
                  {!isLoading && proximasAcoes.length === 0 && (
                    <p className="py-6 text-center text-[12px] text-slate-400">Nenhum lead nesta categoria.</p>
                  )}
                  {proximasAcoes.slice(0, 4).map((l) => (
                    <LeadActionCard key={l.id_lead} lead={l} />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/meus-leads')}
                  className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Ver todos os leads <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-4">
                <PipelineCard
                  stages={pipelineStages}
                  onViewFull={() => navigate('/metricas/cliente-interessado')}
                />
                <RankingCard items={ranking} onViewAll={() => navigate('/gestao-equipe')} />
                <AiSuggestionCard lead={aiLead} />
              </div>
            </div>

            <div className="h-4" />
          </div>
    </div>
    </div>
  );
}

export default InicioNovaPage;
