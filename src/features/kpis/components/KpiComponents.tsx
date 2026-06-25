/**
 * Componentes de apresentação da aba de KPIs.
 *
 * São "burros" por design: recebem apenas os DTOs do contrato (types.ts) e
 * renderizam. Sem acesso a dados — toda a busca fica no hook/serviço. Isso
 * mantém a UI estável quando a fonte de dados mudar (Supabase → API).
 *
 * Visual alinhado à InicioNovaPage: slate + accent azul, Lucide, rounded-xl.
 */

import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { formatarMoedaCurta } from '@/data/metricsData';
import type {
  KpiCommercialComparison,
  KpiFunnel,
  KpiGoalProgress,
  KpiPriceRange,
  KpiSourceBreakdown,
  KpiSummaryCard,
  KpiTrend,
} from '../types';

const BRL = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Formata um número conforme a unidade do KPI (mesma regra do servidor). */
function formatByUnit(value: number, unit: KpiSummaryCard['unit']): string {
  if (unit === 'currency') return BRL(value);
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  return value.toLocaleString('pt-BR');
}

// ============================ TREND BADGE ============================
// Sem comparação → não renderiza nada (em vez de repetir "sem comparação" em
// metade dos cards, o que virava ruído). O silêncio comunica a ausência.
function TrendBadge({ trend }: { trend: KpiTrend | null }) {
  if (!trend || trend.percent === null) return null;
  const up = trend.percent >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = trend.positive ? 'text-emerald-600' : 'text-rose-600';
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${color}`}>
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      {Math.abs(trend.percent).toFixed(1).replace('.', ',')}%
      <span className="text-slate-400 font-normal">vs. mês anterior</span>
    </span>
  );
}

// ============================ ORIGIN BADGE ============================
/** Selo discreto da origem do dado (nada para 'crm', que é calculado). */
function OriginBadge({ source }: { source: KpiSummaryCard['source'] }) {
  if (source === 'crm') return null;
  const label = source === 'planilha' ? 'planilha' : 'manual';
  return (
    <span className="inline-flex items-center text-[10px] font-medium text-slate-400 dark:text-slate-500">
      • {label}
    </span>
  );
}

// ============================ HERO CARD ============================
/**
 * Card grande em destaque no topo da seção da categoria. Domina a seção: número
 * 32px na cor-assinatura da categoria e uma borda esquerda discreta na mesma
 * cor — é o que cria a hierarquia hero↔compacto e dá identidade à seção.
 *
 * `valueColor`/`borderColor` (classes Tailwind) vêm da categoria; quando
 * ausentes (uso fora de uma seção colorida), o card cai no slate neutro.
 */
export function KpiHeroCard({
  card,
  valueColor,
  borderColor,
}: {
  card: KpiSummaryCard;
  valueColor?: string;
  borderColor?: string;
}) {
  const value = valueColor ?? 'text-slate-900 dark:text-slate-100';
  const border = borderColor ?? 'border-l-slate-200 dark:border-l-slate-800';
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 border-l-[3px] ${border} p-4`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
          {card.label}
        </p>
        <OriginBadge source={card.source} />
      </div>
      <p className={`text-[32px] font-bold leading-none mb-2 tracking-tight tabular-nums ${value}`}>
        {card.displayValue}
      </p>
      <TrendBadge trend={card.trend} />
      {card.target != null && (
        <div className="mt-2">
          <p className="text-[11px] text-slate-400">Meta: {formatByUnit(card.target, card.unit)}</p>
          <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, card.progressPercent ?? 0)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================ COMPACT CARD ============================
/** Card denso para a grade de KPIs secundários. */
export function KpiCompactCard({ card }: { card: KpiSummaryCard }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{card.label}</p>
        <OriginBadge source={card.source} />
      </div>
      <p className="text-[18px] font-bold text-slate-900 dark:text-slate-100 leading-none tabular-nums">
        {card.displayValue}
      </p>
      {card.trend && card.trend.percent !== null && (
        <div className="mt-1.5"><TrendBadge trend={card.trend} /></div>
      )}
    </div>
  );
}

// ============================ FUNNEL ============================
const FUNNEL_SHADES = ['bg-blue-600', 'bg-blue-500', 'bg-sky-500', 'bg-emerald-500', 'bg-emerald-600'];

export function KpiFunnelCard({ funnel }: { funnel: KpiFunnel }) {
  const max = Math.max(1, ...funnel.stages.map((s) => s.count));
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Funil de Conversão</h3>
        <span className="text-[11.5px] font-semibold text-emerald-600">
          {funnel.overallConversion.toFixed(1).replace('.', ',')}% conversão geral
        </span>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        {funnel.stages.map((s, idx) => {
          const widthPct = Math.max(28, (s.count / max) * 100 - idx * 3);
          return (
            <div key={s.label} style={{ width: `${widthPct}%` }} className="w-full">
              <div
                className={`${FUNNEL_SHADES[idx % FUNNEL_SHADES.length]} rounded-md px-3 py-2 flex items-center justify-between text-white shadow-sm`}
              >
                <span className="text-[11px] font-medium truncate">{s.label}</span>
                <span className="text-[12px] font-bold tabular-nums">{s.count.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex items-center justify-center gap-2 mt-0.5 mb-0.5">
                <span className="text-[10px] text-slate-400">{s.percentOfTotal.toFixed(1)}% do topo</span>
                {s.conversionFromPrevious !== null && (
                  <span className="text-[10px] text-slate-400">
                    · {s.conversionFromPrevious.toFixed(1)}% da etapa anterior
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================ SOURCES ============================
export function KpiSourcesCard({ sources }: { sources: KpiSourceBreakdown[] }) {
  const max = Math.max(1, ...sources.map((s) => s.valor));
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 mb-3">
        Negócios Fechados por Fonte
      </h3>
      {sources.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-slate-400">Sem vendas no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {sources.map((s) => (
            <li key={s.fonte}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300 truncate">{s.fonte}</span>
                <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                  {BRL(s.valor)} <span className="text-slate-400 font-normal">· {s.quantidade}</span>
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(s.valor / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================ PRICE RANGES ============================
export function KpiPriceRangesCard({ ranges }: { ranges: KpiPriceRange[] }) {
  const total = ranges.reduce((sum, r) => sum + r.quantidade, 0);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 mb-3">Vendas por Faixa de Preço</h3>
      {total === 0 ? (
        <p className="py-4 text-center text-[12px] text-slate-400">Sem vendas no período.</p>
      ) : (
        <ul className="space-y-2.5">
          {ranges.map((r) => {
            const pct = total > 0 ? (r.quantidade / total) * 100 : 0;
            return (
              <li key={r.faixa}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">{r.faixa}</span>
                  <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                    {r.quantidade} <span className="text-slate-400 font-normal">({pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================ GOALS ============================
export function KpiGoalsCard({ goals }: { goals: KpiGoalProgress[] }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 mb-3">Progresso das Metas</h3>
      {goals.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-slate-400">Nenhuma meta ativa.</p>
      ) : (
        <ul className="space-y-3">
          {goals.map((g) => {
            const done = g.percent >= 100;
            return (
              <li key={g.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300 truncate">{g.name}</span>
                  <span className={`text-[12px] font-semibold ${done ? 'text-emerald-600' : 'text-slate-900 dark:text-slate-100'}`}>
                    {g.percent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, g.percent)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {g.realizadoDisplay} de {g.metaDisplay}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================ COMMERCIAL (VGV / VGC) ============================
// Visual alinhado aos demais cards desta aba (KpiFunnelCard, KpiSourcesCard...):
// container slate plano com rounded-xl/border, título em px, sem sombra/hover.
// O gráfico usa a mesma paleta azul/slate dos outros indicadores.

/** Tooltip no padrão slate da aba: card branco arredondado e discreto. */
function CommercialTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; value: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-md">
      <p className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">{point.label}</p>
      <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 tabular-nums">{BRL(point.value)}</p>
    </div>
  );
}

/**
 * Rótulo do valor desenhado sobre cada barra (substitui o eixo Y de escala).
 *
 * Props vêm do <LabelList> do Recharts. `value` pode chegar indefinido em
 * passadas iniciais de layout; tratamos defensivamente. Valor zero não recebe
 * rótulo (barra de altura nula — nada a anotar).
 */
function BarValueLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
}) {
  const { x, y, width, value } = props;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof value !== 'number' ||
    value <= 0
  ) {
    return null;
  }
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      fill="#334155"
      fontSize={12}
      fontWeight={700}
    >
      {formatarMoedaCurta(value)}
    </text>
  );
}

/** Um card de comparação mensal (mês anterior vs atual) para VGV ou VGC. */
function CommercialCard({ item }: { item: KpiCommercialComparison }) {
  const gradId = `kpiCommercialGradient-${item.key}`;
  const data = [
    { label: item.previousLabel, value: item.previousValue, kind: 'prev' as const },
    { label: item.currentLabel, value: item.currentValue, kind: 'cur' as const },
  ];
  const hasData = item.previousValue > 0 || item.currentValue > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">
            {item.label} por Competência
          </h3>
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            {item.previousLabel} vs {item.currentLabel}
          </p>
        </div>
        <TrendBadge trend={item.trend} />
      </div>
      {hasData ? (
        // Comparação de dois meses: em vez de eixo Y de escala, o valor vai
        // direto sobre cada barra (mais legível para duas colunas) e o detalhe
        // completo no tooltip. O grid horizontal dá a referência visual.
        // `background: transparent` explícito no BarChart: no Windows o SVG do
        // Recharts às vezes ganha um fundo cinza default na área de plotagem;
        // forçar transparente garante o card branco por baixo em toda plataforma.
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={data}
            margin={{ top: 28, right: 8, left: 8, bottom: 0 }}
            barCategoryGap="24%"
            style={{ background: 'transparent' }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0.85} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} fill="none" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11.5, fill: '#64748b', fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0', strokeWidth: 1 }}
              dy={6}
            />
            <Tooltip cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} content={<CommercialTooltip />} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72} isAnimationActive={false}>
              {data.map((d) => (
                // Mês anterior em azul claro; mês atual com o gradiente.
                // FALLBACK p/ Windows/Edge: o ATRIBUTO `fill` é uma cor SÓLIDA
                // (#2563eb); o gradiente entra por `style.fill` (maior prioridade).
                // Se o url(#gradiente) não resolver, a barra cai no azul sólido —
                // nunca no cinza default do navegador.
                <Cell
                  key={d.kind}
                  fill={d.kind === 'cur' ? '#2563eb' : '#bfdbfe'}
                  style={d.kind === 'cur' ? { fill: `url(#${gradId})` } : undefined}
                />
              ))}
              <LabelList dataKey="value" position="top" content={<BarValueLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[240px] flex flex-col items-center justify-center text-center px-6">
          <p className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
            Aguardando vendas comerciais assinadas
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            O {item.label} aparecerá quando houver vendas assinadas em {item.previousLabel} ou {item.currentLabel}.
          </p>
        </div>
      )}
    </div>
  );
}

/** Dois gráficos de comparação mensal: VGV e VGC. */
export function KpiCommercialCharts({ commercial }: { commercial: KpiCommercialComparison[] }) {
  if (!commercial?.length) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {commercial.map((item) => (
        <CommercialCard key={item.key} item={item} />
      ))}
    </div>
  );
}
