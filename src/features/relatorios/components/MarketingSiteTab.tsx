/**
 * Aba "Site" do Marketing — integração com o Google Analytics 4.
 *
 * Estados:
 * - Sem `serviceAccountEmail` (integração não configurada no servidor): aviso.
 * - Desconectado + `canManage`: card de setup (passo a passo + input do
 *   Property ID) que chama `saveGaConfig` e invalida a query de status.
 * - Desconectado + `!canManage`: aviso para falar com o administrador.
 * - Conectado: seletor de período + KPIs + gráficos (busca `fetchGaReport`).
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { Check, Copy, Users, Eye, Activity, Percent, type LucideIcon } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  fetchGaStatus,
  saveGaConfig,
  fetchGaReport,
  type GaRange,
  type GaReport,
} from '@/features/relatorios/services/gaService';

// Registro idempotente dos elementos de Line/Doughnut do Chart.js.
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend);

const RANGES: Array<{ value: GaRange; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '28d', label: '28 dias' },
  { value: '90d', label: '90 dias' },
];

// Paleta categórica validada (skill dataviz — ordem fixa, nunca ciclada por rank).
const SERIES_SESSIONS = '#2a78d6'; // slot 1 — azul
const SERIES_USERS = '#eb6834'; // slot 2 — laranja
const DEVICE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7'];

const CARD = 'bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-transparent p-4';

const SAVE_ERROR_FALLBACK = 'Não foi possível salvar a configuração do Google Analytics';

function friendlyError(err: unknown, fallback = 'Não foi possível carregar os dados do Google Analytics'): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'ga_access_denied') {
    return 'Acesso não concedido — confira se o e-mail foi adicionado como Leitor na propriedade';
  }
  return fallback;
}

export function MarketingSiteTab(): JSX.Element {
  const { tenantId } = useAuthContext();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<GaRange>('28d');

  const statusQuery = useQuery({
    queryKey: ['ga-status', tenantId],
    queryFn: () => fetchGaStatus(tenantId),
  });

  if (statusQuery.isLoading) {
    return <div className="p-8 text-center text-sm text-gray-400 dark:text-slate-500">Carregando…</div>;
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <div className={`${CARD} text-sm text-gray-500 dark:text-slate-400`}>
        Não foi possível carregar o status da integração com o Google Analytics.
      </div>
    );
  }

  const status = statusQuery.data;

  if (!status.connected) {
    if (!status.serviceAccountEmail) {
      return (
        <div className={`${CARD} text-sm text-gray-500 dark:text-slate-400`}>
          A integração com o Google Analytics não está configurada no servidor.
        </div>
      );
    }
    if (!status.canManage) {
      return (
        <div className={`${CARD} text-sm text-gray-500 dark:text-slate-400`}>
          A integração com o Google Analytics ainda não foi configurada. Peça ao administrador da imobiliária.
        </div>
      );
    }
    return (
      <GaSetupCard
        serviceAccountEmail={status.serviceAccountEmail}
        tenantId={tenantId}
        onConnected={() => queryClient.invalidateQueries({ queryKey: ['ga-status'] })}
      />
    );
  }

  return <ConnectedView tenantId={tenantId} range={range} onRangeChange={setRange} />;
}

// ─────────────────────────────────────────────────────────────
// Setup (desconectado + canManage)
// ─────────────────────────────────────────────────────────────
function GaSetupCard({
  serviceAccountEmail,
  tenantId,
  onConnected,
}: {
  serviceAccountEmail: string;
  tenantId?: string;
  onConnected: () => void;
}) {
  const { toast } = useToast();
  const [propertyId, setPropertyId] = useState('');
  const [copied, setCopied] = useState(false);

  const salvar = useMutation({
    mutationFn: () => saveGaConfig(propertyId, tenantId),
    onSuccess: () => {
      toast({ title: 'Google Analytics conectado!', description: 'Os dados do site já começam a aparecer.', duration: 3000 });
      onConnected();
    },
    onError: (err: unknown) => {
      toast({ title: 'Não foi possível conectar', description: friendlyError(err, SAVE_ERROR_FALLBACK), variant: 'destructive', duration: 4000 });
    },
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serviceAccountEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bloqueado (contexto inseguro / permissão): mostra para copiar na mão.
      toast({ title: 'Não foi possível copiar', description: serviceAccountEmail, variant: 'destructive' });
    }
  };

  const errorText = salvar.isError ? friendlyError(salvar.error, SAVE_ERROR_FALLBACK) : null;

  return (
    <div className={CARD}>
      <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Conectar o Google Analytics</h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
        Siga os passos abaixo para trazer as métricas do site para dentro do OctoDash.
      </p>

      <ol className="mt-5 space-y-4">
        <li className="flex gap-3">
          <StepNumber n={1} />
          <p className="text-sm text-gray-700 dark:text-slate-300 pt-0.5">
            Abra o <strong>Administrador</strong> do GA4 → <strong>Gestão de acesso da propriedade</strong>.
          </p>
        </li>
        <li className="flex gap-3">
          <StepNumber n={2} />
          <div className="flex-1 text-sm text-gray-700 dark:text-slate-300 pt-0.5">
            <p>
              Adicione o e-mail abaixo como <strong>Leitor</strong>:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="px-2.5 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs font-mono text-gray-800 dark:text-slate-200 break-all">
                {serviceAccountEmail}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="flex-shrink-0">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <StepNumber n={3} />
          <div className="flex-1 text-sm text-gray-700 dark:text-slate-300 pt-0.5">
            <p>
              Cole o <strong>ID da propriedade</strong> (número em Administrador → Configurações da propriedade) e clique em{' '}
              <strong>Testar e salvar</strong>.
            </p>
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (propertyId && !salvar.isPending) salvar.mutate();
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value.replace(/\D/g, ''))}
                placeholder="123456789"
                className="w-40 px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button type="submit" disabled={!propertyId || salvar.isPending}>
                {salvar.isPending ? 'Testando…' : 'Testar e salvar'}
              </Button>
            </form>
            {errorText && <p className="mt-2 text-xs text-red-500">{errorText}</p>}
          </div>
        </li>
      </ol>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-xs font-bold flex items-center justify-center">
      {n}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Conectado
// ─────────────────────────────────────────────────────────────
function ConnectedView({
  tenantId,
  range,
  onRangeChange,
}: {
  tenantId?: string;
  range: GaRange;
  onRangeChange: (r: GaRange) => void;
}) {
  const reportQuery = useQuery({
    queryKey: ['ga-report', tenantId, range],
    queryFn: () => fetchGaReport(range, tenantId),
  });

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 p-0.5 bg-gray-50 dark:bg-slate-800">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onRangeChange(r.value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              range === r.value
                ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {reportQuery.isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400 dark:text-slate-500">Carregando dados do site…</div>
      ) : reportQuery.isError || !reportQuery.data ? (
        <div className={`${CARD} text-sm text-gray-500 dark:text-slate-400`}>{friendlyError(reportQuery.error)}</div>
      ) : (
        <GaReportBlocks report={reportQuery.data} />
      )}
    </div>
  );
}

function GaReportBlocks({ report }: { report: GaReport }) {
  const totals = useMemo(() => {
    const sessions = report.timeseries.reduce((sum, d) => sum + d.sessions, 0);
    const users = report.timeseries.reduce((sum, d) => sum + d.users, 0);
    const pageviews = report.timeseries.reduce((sum, d) => sum + d.pageviews, 0);
    // Taxa de engajamento média ponderada por sessões (dias sem sessão não pesam).
    const weightedEngagement = report.timeseries.reduce((sum, d) => sum + d.engagementRate * d.sessions, 0);
    const engagementRate = sessions > 0 ? weightedEngagement / sessions : 0;
    return { sessions, users, pageviews, engagementRate };
  }, [report.timeseries]);

  const lineData = useMemo(
    () => ({
      labels: report.timeseries.map((d) => formatDateBR(d.date)),
      datasets: [
        {
          label: 'Sessões',
          data: report.timeseries.map((d) => d.sessions),
          borderColor: SERIES_SESSIONS,
          backgroundColor: SERIES_SESSIONS,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: 'Usuários',
          data: report.timeseries.map((d) => d.users),
          borderColor: SERIES_USERS,
          backgroundColor: SERIES_USERS,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    }),
    [report.timeseries]
  );

  const lineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: { color: '#6b7280', font: { size: 11 }, boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(75, 85, 99, 0.3)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10 } } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(107, 114, 128, 0.1)' },
          ticks: { color: '#6b7280', font: { size: 10 }, precision: 0 },
        },
      },
    }),
    []
  );

  const topSources = useMemo(() => [...report.sources].sort((a, b) => b.sessions - a.sessions).slice(0, 10), [report.sources]);
  const maxSourceSessions = Math.max(1, ...topSources.map((s) => s.sessions));

  const topPages = useMemo(() => [...report.pages].sort((a, b) => b.views - a.views).slice(0, 10), [report.pages]);
  const maxPageViews = Math.max(1, ...topPages.map((p) => p.views));

  const topCities = useMemo(() => [...report.cities].sort((a, b) => b.sessions - a.sessions).slice(0, 10), [report.cities]);
  const maxCitySessions = Math.max(1, ...topCities.map((c) => c.sessions));

  const doughnutData = useMemo(
    () => ({
      labels: report.devices.map((d) => d.device),
      datasets: [
        {
          data: report.devices.map((d) => d.sessions),
          backgroundColor: report.devices.map((_, i) => DEVICE_COLORS[i % DEVICE_COLORS.length]),
          borderWidth: 0,
        },
      ],
    }),
    [report.devices]
  );

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right' as const,
          labels: { color: '#6b7280', font: { size: 11 }, boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 8,
        },
      },
    }),
    []
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Activity} label="Sessões" value={totals.sessions.toLocaleString('pt-BR')} />
        <KpiCard icon={Users} label="Usuários" value={totals.users.toLocaleString('pt-BR')} />
        <KpiCard icon={Eye} label="Pageviews" value={totals.pageviews.toLocaleString('pt-BR')} />
        <KpiCard icon={Percent} label="Taxa de engajamento" value={`${(totals.engagementRate * 100).toFixed(1)}%`} />
      </div>

      {/* Sessões e usuários por dia */}
      <div className={CARD}>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3">Sessões e usuários por dia</h3>
        <div className="h-[280px]">
          <Line data={lineData} options={lineOptions} />
        </div>
      </div>

      {/* Origens + Páginas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3">Origens de tráfego</h3>
          {topSources.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">Nenhum dado no período.</p>
          ) : (
            <ul className="space-y-2.5">
              {topSources.map((s) => (
                <li key={`${s.source}/${s.medium}`}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-slate-300 truncate">
                      {s.source} / {s.medium}
                    </span>
                    <span className="text-gray-500 dark:text-slate-400 flex-shrink-0 ml-2">
                      {s.sessions.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(s.sessions / maxSourceSessions) * 100}%`, backgroundColor: SERIES_SESSIONS }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3">Páginas mais vistas</h3>
          {topPages.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">Nenhum dado no período.</p>
          ) : (
            <ul className="space-y-2.5">
              {topPages.map((p) => (
                <li key={p.path}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-slate-300 truncate">{p.path}</span>
                    <span className="text-gray-500 dark:text-slate-400 flex-shrink-0 ml-2">
                      {p.views.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(p.views / maxPageViews) * 100}%`, backgroundColor: SERIES_USERS }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Dispositivos + Cidades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3">Dispositivos</h3>
          {report.devices.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">Nenhum dado no período.</p>
          ) : (
            <div className="h-[220px]">
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          )}
        </div>

        <div className={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3">Cidades</h3>
          {topCities.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">Nenhum dado no período.</p>
          ) : (
            <ul className="space-y-2.5">
              {topCities.map((c) => (
                <li key={c.city}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-slate-300 truncate">{c.city}</span>
                    <span className="text-gray-500 dark:text-slate-400 flex-shrink-0 ml-2">
                      {c.sessions.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(c.sessions / maxCitySessions) * 100}%`, backgroundColor: '#1baf7a' }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className={`${CARD} hover:shadow-md transition-shadow`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium truncate">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  );
}

/** `2026-08-01` → `01/08` (dd/MM). Evita depender de fuso: parse manual do formato ISO curto. */
function formatDateBR(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return day && month ? `${day}/${month}` : isoDate;
}
