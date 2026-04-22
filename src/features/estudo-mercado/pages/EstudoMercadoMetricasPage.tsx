/**
 * EstudoMercadoMetricasPage
 * Dashboard de métricas dos estudos de mercado, lendo direto do Supabase.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts';
import { FileText, CheckCircle, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthContext } from '@/contexts/AuthContext';

// ============================================================================
// Types
// ============================================================================

interface EstudoRow {
  id: string;
  status: 'rascunho' | 'finalizado';
  corretor_nome: string;
  corretor_equipe: string | null;
  created_at: string;
}

// ============================================================================
// Helpers
// ============================================================================

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const PERIOD_OPTIONS = [
  { label: 'Todo período', value: 'all' },
  { label: 'Últimos 7 dias', value: '7d' },
  { label: 'Últimos 30 dias', value: '30d' },
  { label: 'Últimos 90 dias', value: '90d' },
  { label: 'Este ano', value: 'year' },
];

function filterByPeriod(estudos: EstudoRow[], period: string, ano: string, mes: string): EstudoRow[] {
  const now = new Date();
  return estudos.filter(e => {
    const d = new Date(e.created_at);

    if (period === '7d') return (now.getTime() - d.getTime()) <= 7 * 86400000;
    if (period === '30d') return (now.getTime() - d.getTime()) <= 30 * 86400000;
    if (period === '90d') return (now.getTime() - d.getTime()) <= 90 * 86400000;
    if (period === 'year') return d.getFullYear() === now.getFullYear();

    // filtros específicos
    if (ano !== 'all' && d.getFullYear() !== Number(ano)) return false;
    if (mes !== 'all' && d.getMonth() !== Number(mes)) return false;
    return true;
  });
}

// ============================================================================
// Sub-components
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  sub: string;
  color: string;
  icon: React.ReactNode;
}

const StatCard = ({ title, value, sub, color, icon }: StatCardProps) => (
  <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-5 flex flex-col gap-2 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{title}</span>
      <span className={`${color}`}>{icon}</span>
    </div>
    <span className="text-3xl font-bold text-gray-900 dark:text-slate-100">{value}</span>
    <span className={`text-xs font-semibold ${color}`}>{sub}</span>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const EstudoMercadoMetricasPage = () => {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId || '';

  const [estudos, setEstudos] = useState<EstudoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filtros
  const [period, setPeriod] = useState('all');
  const [ano, setAno] = useState('all');
  const [mes, setMes] = useState('all');
  const [corretor, setCorretor] = useState('all');
  const [equipe, setEquipe] = useState('all');

  // ---- Buscar dados ----
  const fetchEstudos = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('estudos_mercado')
      .select('id, status, corretor_nome, corretor_equipe, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setEstudos(data as EstudoRow[]);
      setLastUpdated(new Date());
    }
    setLoading(false);
  };

  useEffect(() => { fetchEstudos(); }, [tenantId]);

  // ---- Listas de opções dinâmicas ----
  const anos = useMemo(() => {
    const set = new Set(estudos.map(e => String(new Date(e.created_at).getFullYear())));
    return ['all', ...Array.from(set).sort((a, b) => Number(b) - Number(a))];
  }, [estudos]);

  const corretores = useMemo(() => {
    const set = new Set(estudos.map(e => e.corretor_nome).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [estudos]);

  const equipes = useMemo(() => {
    const set = new Set(estudos.map(e => e.corretor_equipe || '').filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [estudos]);

  // ---- Dados filtrados ----
  const filtered = useMemo(() => {
    let result = filterByPeriod(estudos, period, ano, mes);
    if (corretor !== 'all') result = result.filter(e => e.corretor_nome === corretor);
    if (equipe !== 'all') result = result.filter(e => (e.corretor_equipe || '') === equipe);
    return result;
  }, [estudos, period, ano, mes, corretor, equipe]);

  // ---- KPIs ----
  const total = filtered.length;
  const finalizados = filtered.filter(e => e.status === 'finalizado').length;
  const rascunhos = filtered.filter(e => e.status === 'rascunho').length;
  const progresso = total > 0 ? Math.round((finalizados / total) * 100) : 0;

  // ---- Desempenho por corretor ----
  const desempenhoPorCorretor = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => {
      const nome = e.corretor_nome || 'Sem nome';
      map[nome] = (map[nome] || 0) + 1;
    });
    return Object.entries(map)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtered]);

  // ---- Distribuição de status ----
  const distribuicaoStatus = useMemo(() => [
    { name: 'Rascunho', value: rascunhos, color: '#f59e0b' },
    { name: 'Finalizado', value: finalizados, color: '#10b981' },
  ].filter(d => d.value > 0), [rascunhos, finalizados]);

  // ---- Evolução ao longo do tempo ----
  const evolucaoTempo = useMemo(() => {
    const map: Record<string, { mes: string; criados: number; finalizados: number }> = {};
    filtered.forEach(e => {
      const d = new Date(e.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      const label = `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { mes: label, criados: 0, finalizados: 0 };
      map[key].criados++;
      if (e.status === 'finalizado') map[key].finalizados++;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [filtered]);

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const diff = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
    if (diff < 1) return 'atualizado agora';
    if (diff === 1) return 'atualizado há 1 min';
    return `atualizado há ${diff} min`;
  };

  // Largura real do container para gráficos responsivos
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(500);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setChartWidth(Math.floor(w / 2) - 60);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ============================================================
  // Render
  // ============================================================

  return (
    <div ref={chartContainerRef} className="min-h-screen p-6 space-y-6" style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Métricas — Estudo de Mercado</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatLastUpdated()}</p>
          )}
        </div>
        <button
          onClick={fetchEstudos}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-gray-500 dark:text-slate-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">Filtros de Análise</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Período Rápido</label>
            <select value={period} onChange={e => { setPeriod(e.target.value); setAno('all'); setMes('all'); }}
              className="w-full text-sm border border-gray-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500">
              {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Ano Específico</label>
            <select value={ano} onChange={e => { setAno(e.target.value); setPeriod('all'); }}
              className="w-full text-sm border border-gray-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500">
              <option value="all">Todos os anos</option>
              {anos.filter(a => a !== 'all').map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Mês Específico</label>
            <select value={mes} onChange={e => { setMes(e.target.value); setPeriod('all'); }}
              className="w-full text-sm border border-gray-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500">
              <option value="all">Todos os meses</option>
              {MESES.map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Corretor</label>
            <select value={corretor} onChange={e => setCorretor(e.target.value)}
              className="w-full text-sm border border-gray-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500">
              <option value="all">Todos</option>
              {corretores.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Equipe</label>
            <select value={equipe} onChange={e => setEquipe(e.target.value)}
              className="w-full text-sm border border-gray-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500">
              <option value="all">Todas</option>
              {equipes.filter(eq => eq !== 'all').map(eq => <option key={eq} value={eq}>{eq}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Criados"
          value={total}
          sub={`${total === 1 ? '1 estudo' : `${total} estudos`} no período`}
          color="text-blue-500"
          icon={<FileText className="w-5 h-5" />}
        />
        <StatCard
          title="Rascunhos"
          value={rascunhos}
          sub={total > 0 ? `${Math.round((rascunhos / total) * 100)}% do total` : '0% do total'}
          color="text-amber-500"
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          title="Finalizados"
          value={finalizados}
          sub={total > 0 ? `${Math.round((finalizados / total) * 100)}% do total` : '0% do total'}
          color="text-emerald-500"
          icon={<CheckCircle className="w-5 h-5" />}
        />
        <StatCard
          title="Progresso"
          value={`${progresso}%`}
          sub="em andamento"
          color="text-purple-500"
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Gráficos linha 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Desempenho por Corretor */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500 dark:text-slate-400" />
            Desempenho por Corretor
          </h2>
          {desempenhoPorCorretor.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 dark:text-slate-500 text-sm">Nenhum dado no período</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <BarChart width={chartWidth} height={200} data={desempenhoPorCorretor} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number) => [`${v} estudo${v !== 1 ? 's' : ''}`, 'Total']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="total" fill="#10b981" isAnimationActive={false} />
              </BarChart>
            </div>
          )}
        </div>

        {/* Distribuição de Status */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-gray-500 dark:text-slate-400" />
            Distribuição de Status
          </h2>
          {distribuicaoStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 dark:text-slate-500 text-sm">Nenhum dado no período</div>
          ) : (
            <div className="flex justify-center">
              <PieChart width={chartWidth} height={220}>
                <Pie
                  data={distribuicaoStatus}
                  cx="50%"
                  cy="45%"
                  outerRadius={80}
                  dataKey="value"
                  isAnimationActive={false}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={({ name, percent }: any) => `${name} ${(Number(percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {distribuicaoStatus.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Legend iconType="circle" iconSize={10} />
                <Tooltip
                  formatter={(v: number) => [`${v} estudo${v !== 1 ? 's' : ''}`, '']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
              </PieChart>
            </div>
          )}
        </div>
      </div>

      {/* Evolução ao longo do tempo */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-500 dark:text-slate-400" />
          Evolução ao Longo do Tempo
        </h2>
        {evolucaoTempo.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 dark:text-slate-500 text-sm">Nenhum dado no período</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <LineChart width={chartWidth * 2 + 60} height={220} data={evolucaoTempo} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconType="circle" iconSize={10} />
              <Line type="monotone" dataKey="criados" name="Criados" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="finalizados" name="Finalizados" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </LineChart>
          </div>
        )}
      </div>

    </div>
  );
};

export default EstudoMercadoMetricasPage;
