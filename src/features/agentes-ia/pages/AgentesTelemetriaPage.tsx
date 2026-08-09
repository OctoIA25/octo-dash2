/**
 * Telemetria de Agentes IA — T5.
 * Rota: /agentes-ia/telemetria (gestão/owner; corretor não vê custos da empresa)
 * Spec: docs/superpowers/specs/2026-07-24-telemetria-agentes-engenharia-reversa.md §6.6
 *
 * Consome os 4 endpoints da T4 (summary/timeseries/errors/overview) via
 * TanStack Query. Estados vazios são HONESTOS: custo/token ausente é "—" com a
 * explicação (fluxo n8n ainda não reporta uso), nunca zero fingido.
 * Seção "Ferramentas" fica fora da v1: ainda não existe emissor de tool_call.
 */
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, Bot, CircleDollarSign, Clock, Cpu, GitBranch, RefreshCw, Send, ShieldCheck, ThumbsDown, Timer, Zap,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  fetchTelemetryCosts,
  fetchTelemetryErrors,
  fetchTelemetryEscalations,
  fetchTelemetryOverview,
  fetchTelemetryQuality,
  fetchTelemetrySummary,
  fetchTelemetryTimeseries,
  fmtBrl,
  fmtMinutes,
  fmtMs,
  fmtPercent,
  fmtRate,
  fmtTokens,
  fmtUsd,
  type TelemetryFilters,
  type TelemetryWindowKey,
} from '../services/telemetryDashboardService';
import {
  TelemetryAgentBars,
  TelemetryLatencyChart,
  TelemetryTrendChart,
} from '../components/telemetria/TelemetriaCharts';

const WINDOW_OPTIONS: Array<{ key: TelemetryWindowKey; label: string }> = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'all', label: 'Total' },
];

// agent_slug é texto livre no banco; estes são os emissores conhecidos hoje.
// Agente novo aparece sozinho em "por agente" — este select é só filtro.
const AGENT_OPTIONS = [
  { value: '', label: 'Todos os agentes' },
  { value: 'lia', label: 'Lia (SDR)' },
  { value: 'elaine', label: 'Elaine (Comportamental)' },
  { value: 'caio', label: 'Caio (Marketing)' },
  { value: 'disparador', label: 'Disparador' },
  { value: 'estudo-mercado', label: 'Estudo de Mercado' },
];

// Enum FECHADO do evento (CHECK da migration) — opções fixas, nunca derivadas
// dos dados (um select derivado do resultado filtrado "comeria" as próprias opções).
const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'ok', label: 'Sucesso' },
  { value: 'error', label: 'Erro' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'empty_response', label: 'Resposta vazia' },
  { value: 'refused', label: 'Recusado' },
];

const STATUS_CHIP_STYLE: Record<string, string> = {
  ok: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
  empty_response: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  refused: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  error: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  timeout: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- primitivas

function StatCard({ label, value, sub, icon: Icon }: {
  label: string;
  value: string;
  sub?: string | null;
  icon?: typeof Activity;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="text-[22px] font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
      {sub && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChartCard({ title, sub, right, children }: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {sub && <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function SkeletonCard({ h = 96 }: { h?: number }) {
  return <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 animate-pulse" style={{ height: h }} />;
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center text-center">
      <AlertTriangle className="w-6 h-6 text-amber-500 mb-2" />
      <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Não foi possível carregar a telemetria</p>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">Verifique a conexão e tente novamente.</p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
      </button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, help }: { icon: typeof Activity; title: string; help: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center text-center">
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 max-w-md">{help}</p>
    </div>
  );
}

// -------------------------------------------------------------------- página

export const AgentesTelemetriaPage = () => {
  const { user, isGestao, isOwner } = useAuthContext();
  const tenantId = user?.tenantId ?? '';

  const [windowKey, setWindowKey] = useState<TelemetryWindowKey>('30d');
  const [agent, setAgent] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [bucket, setBucket] = useState<'hour' | 'day'>('day');
  // Opções de modelo ACUMULADAS (não derivadas do resultado filtrado — senão o
  // select "come" as próprias opções ao filtrar). Reset ao trocar de tenant.
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const canView = isGestao || isOwner;
  const hasTenant = UUID_RE.test(tenantId);

  // Teto de densidade: bucket por hora só na janela de 7d (168 pontos);
  // 90d/all por hora seriam milhares de marcas num SVG só.
  const hourAllowed = windowKey === '7d';
  useEffect(() => {
    if (!hourAllowed && bucket === 'hour') setBucket('day');
  }, [hourAllowed, bucket]);

  useEffect(() => {
    setModelOptions([]);
  }, [tenantId]);

  const filters: TelemetryFilters = {
    tenantId,
    window: windowKey,
    agent: agent || null,
    model: model || null,
    status: status || null,
  };
  const enabled = canView && hasTenant;

  const summaryQ = useQuery({
    queryKey: ['agent-telemetry', 'summary', tenantId, windowKey, agent, model, status],
    queryFn: () => fetchTelemetrySummary(filters),
    enabled,
  });
  // timeseries/errors não aceitam model/status no backend — anulados aqui e
  // fora das queryKeys de propósito (key e queryFn consistentes).
  const seriesQ = useQuery({
    queryKey: ['agent-telemetry', 'timeseries', tenantId, windowKey, agent, bucket],
    queryFn: () => fetchTelemetryTimeseries({ ...filters, model: null, status: null }, bucket),
    enabled,
  });
  const errorsQ = useQuery({
    queryKey: ['agent-telemetry', 'errors', tenantId, windowKey, agent],
    queryFn: () => fetchTelemetryErrors({ ...filters, model: null, status: null }),
    enabled,
  });
  const overviewQ = useQuery({
    queryKey: ['agent-telemetry', 'overview', tenantId],
    queryFn: () => fetchTelemetryOverview(tenantId),
    enabled,
  });
  // Escalonamento é derivado (lia_perguntas_corretor) e respeita a janela — por
  // isso entra na queryKey. Independe de eventos em agent_telemetry_events.
  const escalationsQ = useQuery({
    queryKey: ['agent-telemetry', 'escalations', tenantId, windowKey],
    queryFn: () => fetchTelemetryEscalations({ tenantId, window: windowKey }),
    enabled,
  });
  // Custos em R$ derivam do custo USD + câmbio + denominadores de negócio;
  // dependem da janela (não do filtro de agente/modelo/status).
  const costsQ = useQuery({
    queryKey: ['agent-telemetry', 'costs', tenantId, windowKey],
    queryFn: () => fetchTelemetryCosts({ tenantId, window: windowKey }),
    enabled,
  });
  // Qualidade: avaliações humanas em 3 estados; respeita janela e o filtro de agente.
  const qualityQ = useQuery({
    queryKey: ['agent-telemetry', 'quality', tenantId, windowKey, agent],
    queryFn: () => fetchTelemetryQuality({ tenantId, window: windowKey }, agent || null),
    enabled,
  });

  const summary = summaryQ.data;

  // Acumula modelos vistos nas opções do select (fonte não-filtrada por model).
  // ANTES do early return de `canView`: hook depois de return condicional muda a
  // contagem de hooks entre renders. `canView` deriva do role, que é reavaliado com
  // a página montada (reloadUser no visibilitychange, troca de "visualizar como") —
  // quando ele vira, o React derruba a tela com "Rendered more hooks than expected".
  useEffect(() => {
    if (!summary || summary.by_model.length === 0) return;
    setModelOptions((prev) => {
      const merged = new Set(prev);
      summary.by_model.forEach((m) => merged.add(m.model));
      return merged.size === prev.length ? prev : Array.from(merged).sort();
    });
  }, [summary]);

  if (!canView) return <Navigate to="/agentes-ia/agente-marketing" replace />;

  const tokens = summary?.tokens ?? null;
  const latency = summary?.latency ?? null;
  const models = summary?.by_model ?? [];
  const errorRate = summary ? fmtRate(summary.errors, summary.events) : '—';
  const windowLabel = WINDOW_OPTIONS.find((w) => w.key === windowKey)?.label ?? '';

  const chipCls = (active: boolean) =>
    `h-8 px-3 rounded-lg text-[12.5px] font-semibold border transition-colors ${
      active
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent'
        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
    }`;
  const selectCls =
    'h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12.5px] font-medium text-slate-700 dark:text-slate-200';

  return (
    <div className="min-h-full bg-background overflow-y-auto">
      <div className="px-6 py-5">
        <div className="max-w-[1400px] mx-auto">
          {/* Header + filtros */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Telemetria de Agentes
              </h1>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                Custos, desempenho e operação dos agentes IA · janela: {windowLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                {WINDOW_OPTIONS.map((w) => (
                  <button key={w.key} className={chipCls(windowKey === w.key)} onClick={() => setWindowKey(w.key)}>
                    {w.label}
                  </button>
                ))}
              </div>
              <select className={selectCls} value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Filtrar por agente">
                {AGENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select className={selectCls} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Filtrar por modelo">
                <option value="">Todos os modelos</option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {!hasTenant ? (
            <div className="mt-6">
              <EmptyState
                icon={Bot}
                title="Selecione uma imobiliária"
                help="A telemetria é por tenant. Entre em uma imobiliária (impersonation) para ver os dados."
              />
            </div>
          ) : summaryQ.isError ? (
            <div className="mt-6"><ErrorCard onRetry={() => summaryQ.refetch()} /></div>
          ) : summaryQ.isLoading ? (
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : summary && summary.events === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={Activity}
                title={`Sem eventos de telemetria ${windowKey === 'all' ? 'registrados' : `na janela de ${windowLabel}`}`}
                help="Os emissores do CRM (interpretação do Disparador, fechamento de runs e chats) gravam aqui conforme os agentes rodam. Custo/tokens dos agentes n8n (Lia, Elaine, Caio) só aparecem depois que os fluxos n8n ganharem o nó Report Telemetry (T6)."
              />
              {/* Escalonamento e operação vêm de tabelas próprias — visíveis mesmo sem eventos novos */}
              <EscalationSection escalationsQ={escalationsQ} windowLabel={windowLabel} />
              <QualitySection qualityQ={qualityQ} windowLabel={windowLabel} />
              <CostsSection costsQ={costsQ} windowLabel={windowLabel} />
              <OperationSection overviewQ={overviewQ} />
            </div>
          ) : summary ? (
            <>
              {/* Distribuição por status (reflete os filtros ativos, inclusive o de status) */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 mr-1">Status</span>
                {STATUS_OPTIONS.filter((o) => o.value).map((o) => {
                  const count = summary.by_status[o.value] ?? 0;
                  if (count === 0 && status !== o.value) return null;
                  return (
                    <span
                      key={o.value}
                      className={`inline-flex h-6 px-2 items-center gap-1 rounded-md text-[11px] font-semibold tabular-nums ${STATUS_CHIP_STYLE[o.value] ?? STATUS_CHIP_STYLE.refused}`}
                    >
                      {o.label} {count.toLocaleString('pt-BR')}
                    </span>
                  );
                })}
              </div>

              {/* Custos & Tokens */}
              <Section
                title="Custos e Tokens"
                sub="Custo derivado de tokens reais × preço de referência do modelo — sem usage reportado, o valor é “—” (nunca estimamos)."
              >
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard icon={CircleDollarSign} label={`Custo (${windowLabel})`} value={fmtUsd(summary.cost.total_usd)}
                    sub={summary.cost.unknown_models.length > 0 ? `sem preço p/ ${summary.cost.unknown_models.join(', ')}` : tokens ? `${tokens.events_with_usage.toLocaleString('pt-BR')} chamadas com usage` : 'nenhuma chamada com usage'} />
                  <StatCard icon={Cpu} label="Tokens totais" value={fmtTokens(tokens?.total ?? null)}
                    sub={tokens ? `entrada ${fmtTokens(tokens.input)} · saída ${fmtTokens(tokens.output)} · cache ${fmtTokens(tokens.cached)}` : 'fluxos n8n ainda não reportam uso'} />
                  <StatCard icon={Zap} label="Tokens por chamada" value={tokens?.p50 != null ? fmtTokens(Math.round(tokens.p50)) : '—'}
                    sub={tokens?.p95 != null ? `P95 ${fmtTokens(Math.round(tokens.p95))} · P99 ${fmtTokens(Math.round(tokens.p99 ?? 0))}` : null} />
                  <StatCard icon={Activity} label="Execuções" value={summary.events.toLocaleString('pt-BR')}
                    sub={`erros ${summary.errors.toLocaleString('pt-BR')} (${errorRate})`} />
                </div>
              </Section>

              {/* Latência */}
              <Section title="Latência" sub="Tempo de resposta dos agentes (roundtrip medido nos emissores).">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                  <StatCard icon={Clock} label="P50" value={fmtMs(latency?.p50)} />
                  <StatCard icon={Clock} label="P95" value={fmtMs(latency?.p95)} />
                  <StatCard icon={Clock} label="P99" value={fmtMs(latency?.p99)} />
                  <StatCard icon={Timer} label="Média" value={fmtMs(latency?.avg)}
                    sub={latency ? `mín ${fmtMs(latency.min)} · máx ${fmtMs(latency.max)}` : null} />
                </div>
                <ChartCard title="Latência ao longo do tempo" sub="Média e P95 por período — mesma unidade, um eixo.">
                  {seriesQ.isLoading ? <SkeletonCard h={260} /> : (seriesQ.data?.length ?? 0) === 0 ? (
                    <EmptyState icon={Clock} title="Sem medições na janela" help="Nenhum evento com duração registrada neste período." />
                  ) : (
                    <TelemetryLatencyChart points={seriesQ.data ?? []} bucket={bucket} />
                  )}
                </ChartCard>
              </Section>

              {/* Tendência */}
              <Section title="Tendência" sub="Execuções e erros por período.">
                <ChartCard
                  title="Execuções e erros"
                  right={
                    <div className="flex items-center gap-1.5">
                      <button className={chipCls(bucket === 'day')} onClick={() => setBucket('day')}>Dia</button>
                      <button
                        className={`${chipCls(bucket === 'hour')} disabled:opacity-40 disabled:cursor-not-allowed`}
                        onClick={() => setBucket('hour')}
                        disabled={!hourAllowed}
                        title={hourAllowed ? undefined : 'Por hora só na janela de 7 dias (densidade de pontos)'}
                      >
                        Hora
                      </button>
                    </div>
                  }
                >
                  {seriesQ.isLoading ? <SkeletonCard h={260} /> : (seriesQ.data?.length ?? 0) === 0 ? (
                    <EmptyState icon={Activity} title="Sem execuções na janela" help="Nada registrado neste período." />
                  ) : (
                    <TelemetryTrendChart points={seriesQ.data ?? []} bucket={bucket} />
                  )}
                </ChartCard>
              </Section>

              {/* Agentes e modelos */}
              <Section title="Agentes e Modelos">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <ChartCard title="Execuções por agente" sub="Contagem na janela; detalhes no hover.">
                    {summary.by_agent.length === 0 ? (
                      <EmptyState icon={Bot} title="Sem execuções por agente" help="Nada registrado neste período." />
                    ) : (
                      <TelemetryAgentBars rows={summary.by_agent} />
                    )}
                  </ChartCard>
                  <ChartCard title="Por modelo" sub="Tokens e custo por modelo de IA (chamadas com usage).">
                    {models.length === 0 ? (
                      <EmptyState icon={Cpu} title="Sem dados de modelo" help="Nenhuma chamada LLM com modelo reportado na janela — os fluxos n8n ainda não reportam uso (T6)." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                          <thead>
                            <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-800">
                              <th className="py-2 pr-3 font-semibold">Modelo</th>
                              <th className="py-2 pr-3 font-semibold text-right">Chamadas</th>
                              <th className="py-2 pr-3 font-semibold text-right">Tokens</th>
                              <th className="py-2 pr-3 font-semibold text-right">Latência média</th>
                              <th className="py-2 font-semibold text-right">Custo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {models.map((m) => (
                              <tr key={m.model} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">{m.model}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{m.events.toLocaleString('pt-BR')}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtTokens(m.total_tokens)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtMs(m.avg_duration_ms)}</td>
                                <td className="py-2 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{fmtUsd(m.cost_usd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </ChartCard>
                </div>
              </Section>

              {/* Erros */}
              <Section title="Erros" sub="Ranking por classe e agente na janela.">
                {errorsQ.isLoading ? <SkeletonCard h={120} /> : (errorsQ.data?.length ?? 0) === 0 ? (
                  <EmptyState icon={AlertTriangle} title="Nenhum erro na janela" help="Nenhum evento com status de erro ou timeout neste período." />
                ) : (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2 pr-3 font-semibold">Classe</th>
                          <th className="py-2 pr-3 font-semibold">Agente</th>
                          <th className="py-2 pr-3 font-semibold text-right">Ocorrências</th>
                          <th className="py-2 pr-3 font-semibold">Última</th>
                          <th className="py-2 font-semibold">Amostra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(errorsQ.data ?? []).map((e) => (
                          <tr key={`${e.error_class}-${e.agent_slug}`} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 align-top">
                            <td className="py-2 pr-3">
                              <span className="inline-flex h-6 px-2 items-center rounded-md bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-[11px] font-semibold">
                                {e.error_class}
                              </span>
                            </td>
                            <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-300">{e.agent_slug}</td>
                            <td className="py-2 pr-3 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{e.occurrences.toLocaleString('pt-BR')}</td>
                            <td className="py-2 pr-3 tabular-nums text-slate-500 dark:text-slate-400">{new Date(e.last_seen).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="py-2 text-slate-500 dark:text-slate-400 max-w-[360px] truncate">{e.sample_message ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <EscalationSection escalationsQ={escalationsQ} windowLabel={windowLabel} />
              <QualitySection qualityQ={qualityQ} windowLabel={windowLabel} />
              <CostsSection costsQ={costsQ} windowLabel={windowLabel} />
              <OperationSection overviewQ={overviewQ} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

/**
 * Operação por agente — agregados das tabelas EXISTENTES (overview da T4).
 * As taxas mostram a FÓRMULA no subtítulo (§6.5 — nada de indicador inventado).
 */
function QualitySection({ qualityQ, windowLabel }: {
  qualityQ: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchTelemetryQuality>>>>;
  windowLabel: string;
}) {
  const q = qualityQ.data;
  return (
    <Section
      title="Qualidade · avaliações"
      sub={`Avaliação humana das respostas (correta/incorreta) — não medimos alucinação automaticamente. Não-avaliado NUNCA conta como correto · janela: ${windowLabel}.`}
    >
      {qualityQ.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} h={112} />)}
        </div>
      ) : qualityQ.isError ? (
        <ErrorCard onRetry={() => qualityQ.refetch()} />
      ) : q ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={ShieldCheck} label="Corretas (confirmadas)" value={q.confirmed_correct.toLocaleString('pt-BR')} />
          <StatCard icon={ThumbsDown} label="Incorretas (confirmadas)" value={q.confirmed_wrong.toLocaleString('pt-BR')} />
          <StatCard icon={AlertTriangle} label="Não avaliadas" value={q.not_evaluated.toLocaleString('pt-BR')}
            sub="não confundir com correto" />
          <StatCard icon={Activity} label="Taxa de incorretas" value={fmtPercent(q.wrong_rate)}
            sub={q.evaluated > 0 ? `sobre ${q.evaluated.toLocaleString('pt-BR')} avaliadas` : 'sem avaliações ainda'} />
        </div>
      ) : null}
    </Section>
  );
}

function CostsSection({ costsQ, windowLabel }: {
  costsQ: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchTelemetryCosts>>>>;
  windowLabel: string;
}) {
  const c = costsQ.data;
  // Nota de câmbio: sem taxa vigente, os cards em R$ ficam "—" (nunca convertidos
  // com câmbio inventado). Com taxa, mostramos qual foi usada (auditoria).
  const rateNote = c?.total.exchange_rate != null
    ? `câmbio USD/BRL ${c.total.exchange_rate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'sem câmbio cadastrado → valores em R$ indisponíveis';
  return (
    <Section
      title="Custos em R$"
      sub={`Custo de IA (USD) convertido ao câmbio manual, dividido por denominadores de negócio · ${rateNote} · janela: ${windowLabel}.`}
    >
      {costsQ.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} h={112} />)}
        </div>
      ) : costsQ.isError ? (
        <ErrorCard onRetry={() => costsQ.refetch()} />
      ) : c ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard icon={CircleDollarSign} label="Custo total (R$)" value={fmtBrl(c.total.cost_brl)}
            sub={c.total.cost_usd != null ? `${fmtUsd(c.total.cost_usd)} × câmbio` : 'sem custo com preço conhecido'} />
          <StatCard icon={Activity} label="Custo médio / evento" value={fmtBrl(c.per_event.value_brl)}
            sub={`${c.per_event.denominator.toLocaleString('pt-BR')} chamadas com custo`} />
          <StatCard icon={Bot} label="Custo / lead atendido" value={fmtBrl(c.per_lead.value_brl)}
            sub={`${c.per_lead.denominator.toLocaleString('pt-BR')} leads atendidos`} />
          <StatCard icon={CircleDollarSign} label="Custo / venda fechada" value={fmtBrl(c.per_sale.value_brl)}
            sub={`${c.per_sale.denominator.toLocaleString('pt-BR')} vendas na janela`} />
          <StatCard icon={Activity} label="% custo IA / VGC" value={c.pct_over_vgc.value != null ? fmtPercent(c.pct_over_vgc.value / 100) : '—'}
            sub={c.pct_over_vgc.vgc_brl > 0 ? `VGC ${fmtBrl(c.pct_over_vgc.vgc_brl)}` : 'sem VGC na janela'} />
        </div>
      ) : null}
    </Section>
  );
}

function EscalationSection({ escalationsQ, windowLabel }: {
  escalationsQ: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchTelemetryEscalations>>>>;
  windowLabel: string;
}) {
  const e = escalationsQ.data;
  // rate null = sem leads escalonados (N/A honesto); 0 = fecharam zero (real).
  const closureValue = e ? fmtPercent(e.closure.rate) : '—';
  return (
    <Section
      title="Autonomia · Escalonamento IA→corretor"
      sub={`Derivado das perguntas da Lia ao corretor (lia_perguntas_corretor) — quando a IA transfere a decisão ao humano · janela: ${windowLabel}.`}
    >
      {escalationsQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} h={112} />)}
        </div>
      ) : escalationsQ.isError ? (
        <ErrorCard onRetry={() => escalationsQ.refetch()} />
      ) : e ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={GitBranch} label="Escalonamentos" value={e.total.toLocaleString('pt-BR')}
            sub={`${e.resolved.toLocaleString('pt-BR')} resolvidos · ${e.pending.toLocaleString('pt-BR')} pendentes`} />
          <StatCard icon={Clock} label="Tempo até resposta (P50)" value={fmtMinutes(e.response_time.p50_minutes)}
            sub={e.response_time.samples > 0 ? `${e.response_time.samples.toLocaleString('pt-BR')} resolvidos medidos` : 'sem resolvidos na janela'} />
          <StatCard icon={Timer} label="Tempo até resposta (P95)" value={fmtMinutes(e.response_time.p95_minutes)}
            sub="criado→respondido; cauda longa (P95, não média)" />
          <StatCard icon={Activity} label="Fechamento de escalonados" value={closureValue}
            sub={`${e.closure.closed_leads.toLocaleString('pt-BR')}/${e.closure.escalated_leads.toLocaleString('pt-BR')} leads escalonados fecharam`} />
        </div>
      ) : null}
    </Section>
  );
}

function OperationSection({ overviewQ }: { overviewQ: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchTelemetryOverview>>>> }) {
  const ov = overviewQ.data;
  return (
    <Section
      title="Operação por agente"
      sub="Derivado das tabelas de execução existentes (runs, filas, Lia) — todo o histórico, não só a janela."
    >
      {overviewQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} h={132} />)}
        </div>
      ) : overviewQ.isError ? (
        <ErrorCard onRetry={() => overviewQ.refetch()} />
      ) : ov ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard icon={Send} label="Disparador · runs concluídos" value={ov.disparador ? fmtRate(ov.disparador.runs.done, ov.disparador.runs.done + ov.disparador.runs.failed) : '—'}
            sub={ov.disparador ? `done/(done+failed) · ${ov.disparador.runs.done} ok, ${ov.disparador.runs.failed} falhas, ${ov.disparador.runs.pending + ov.disparador.runs.running} em curso` : 'indisponível'} />
          <StatCard icon={Send} label="Entrega à Lia (webhooks)" value={ov.delivery ? fmtRate(ov.delivery.delivered, ov.delivery.delivered + ov.delivery.failed + ov.delivery.pending) : '—'}
            sub={ov.delivery ? `delivered/total · ${ov.delivery.delivered} entregues, ${ov.delivery.failed} falhas, ${ov.delivery.pending} pendentes` : 'indisponível'} />
          <StatCard icon={Bot} label="Chat · conversas" value={ov.chat ? ov.chat.conversations.toLocaleString('pt-BR') : '—'}
            sub={ov.chat ? `${ov.chat.messages.toLocaleString('pt-BR')} mensagens (Caio + Elaine)` : 'indisponível'} />
          <StatCard icon={Bot} label="Lia · perguntas respondidas" value={ov.lia ? fmtRate(ov.lia.perguntas.respondidas, ov.lia.perguntas.respondidas + ov.lia.perguntas.pendentes) : '—'}
            sub={ov.lia ? `respondidas/(respondidas+pendentes) · ${ov.lia.perguntas.pendentes} pendentes = gargalo humano` : 'indisponível'} />
          <StatCard icon={Send} label="Lia · follow-ups enviados" value={ov.lia ? fmtRate(ov.lia.followups.enviados, ov.lia.followups.enviados + ov.lia.followups.pendentes + ov.lia.followups.cancelados + ov.lia.followups.expirados) : '—'}
            sub={ov.lia ? `sent/total · ${ov.lia.followups.expirados} expirados (abandono)` : 'indisponível'} />
          <StatCard icon={Activity} label="Lia · visitas confirmadas" value={ov.lia ? fmtRate(ov.lia.visitas.confirmadas, ov.lia.visitas.total) : '—'}
            sub={ov.lia ? `confirmadas/total · ${ov.lia.visitas.total.toLocaleString('pt-BR')} visitas marcadas` : 'indisponível'} />
          <StatCard icon={RefreshCw} label="Recuperação · concluídos" value={ov.recovery ? fmtRate(ov.recovery.done, ov.recovery.done + ov.recovery.failed) : '—'}
            sub={ov.recovery ? `done/(done+failed) · ${ov.recovery.pending + ov.recovery.processing} na fila, ${ov.recovery.skipped} pulados` : 'indisponível'} />
        </div>
      ) : null}
    </Section>
  );
}

export default AgentesTelemetriaPage;
