/**
 * Seção "eNPS de Corretores" da aba Relatórios (autocontida; via ?tab=enps).
 * Burra por design: consome useEnps e renderiza. 7 painéis; DOIS eNPS distintos;
 * painéis atrás do N-mínimo mostram "respostas insuficientes" (gate real é do servidor).
 * Gráfico: Bar + LabelList + label custom, SEM <YAxis> (Recharts 3). NUNCA usar as
 * classes de CSS global que sabotam gráficos.
 */
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { KpiHeroCard, KpiCompactCard } from '@/features/kpis/components/KpiComponents';
import type { KpiSummaryCard } from '@/features/kpis/types';
import { useEnps } from '@/features/enps/hooks/useEnps';
import { isInsufficient } from '@/features/enps/types';
import type { EnpsScoreBlock, EnpsEvolucaoPoint } from '@/features/enps/types';

const INSUFFICIENT_MSG = 'Respostas insuficientes para exibir com segurança (anonimato).';

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-6 text-center"><p className="text-[12.5px] text-slate-500 dark:text-slate-400">{children}</p></div>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 mb-3">{children}</h3>;
}

function scoreToCard(id: string, label: string, block: EnpsScoreBlock, deltaVsPrev: number | null): KpiSummaryCard {
  return {
    id, metricKey: null, source: 'crm', unit: 'count', label, displayOrder: 0, category: 'enps',
    isFeatured: true, rawValue: block.score, displayValue: String(block.score), target: null, progressPercent: null,
    trend: deltaVsPrev === null ? null : { percent: deltaVsPrev, positive: deltaVsPrev >= 0 },
  };
}

function ScoreBarLabel(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x, y, width, value } = props;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof value !== 'number') return null;
  return <text x={x + width / 2} y={y - 8} textAnchor="middle" fill="#334155" fontSize={12} fontWeight={700}>{value}</text>;
}

function EvolucaoChart({ title, serie, pick }: { title: string; serie: EnpsEvolucaoPoint[]; pick: (p: EnpsEvolucaoPoint) => number | null }) {
  const data = serie.map((p) => ({ label: p.label, value: pick(p) ?? 0 }));
  const hasData = data.some((d) => d.value !== 0);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <SectionTitle>{title}</SectionTitle>
      {hasData ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 28, right: 8, left: 8, bottom: 0 }} barCategoryGap="24%" style={{ background: 'transparent' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} fill="none" />
            <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#64748b', fontWeight: 500 }} tickLine={false} axisLine={{ stroke: '#e2e8f0', strokeWidth: 1 }} dy={6} />
            <Tooltip cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64} isAnimationActive={false} fill="#2563eb">
              <LabelList dataKey="value" position="top" content={<ScoreBarLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[220px] flex items-center justify-center"><Empty>Sem histórico suficiente para exibir a evolução.</Empty></div>
      )}
    </div>
  );
}

function ScoreBreakdown({ block }: { block: EnpsScoreBlock }) {
  return (
    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
      <span>{block.promoters} promot. · {block.passives} neutros · {block.detractors} detrat.</span>
      <span className="font-medium">{block.count} respostas</span>
    </div>
  );
}

function DistBars({ title, buckets }: { title: string; buckets: { label: string; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-2.5">
        {buckets.map((b) => (
          <li key={b.label}>
            <div className="flex items-center justify-between mb-1"><span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">{b.label}</span><span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">{b.count}</span></div>
            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(b.count / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EnpsCorretoresSection({ tenantId: _tenantId }: { tenantId?: string }) {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useEnps({ team: selectedTeam });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" /><div className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" /></div>
        <div className="h-56 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-4 text-center">
        <p className="text-[13px] text-rose-700 dark:text-rose-300">Não foi possível carregar o eNPS.</p>
        <button onClick={() => refetch()} className="mt-2 text-[12px] font-semibold text-rose-700 underline">Tentar novamente</button>
      </div>
    );
  }

  const { geral, evolucao, participacao, ranking, distribuicao, comentarios, individual } = data;
  const scope = data?.scope;
  const empresaOk = !isInsufficient(geral.empresa);
  const gestorOk = !isInsufficient(geral.gestor);
  const prev = evolucao.length >= 2 ? evolucao[evolucao.length - 2] : undefined;
  const cur = evolucao.length >= 1 ? evolucao[evolucao.length - 1] : undefined;
  const deltaEmpresa = prev?.empresa != null && cur?.empresa != null ? cur.empresa - prev.empresa : null;
  const deltaGestor = prev?.gestor != null && cur?.gestor != null ? cur.gestor - prev.gestor : null;

  const participacaoCards: KpiSummaryCard[] = [
    ['Enviadas', participacao.sent], ['Respondidas', participacao.responded], ['Pendentes', participacao.pending], ['Taxa de resposta', `${participacao.rate}%`],
  ].map(([label, val], i) => ({
    id: `part-${i}`, metricKey: null, source: 'crm', unit: 'count', label: String(label), displayOrder: i, category: 'enps',
    isFeatured: false, rawValue: 0, displayValue: String(val), target: null, progressPercent: null, trend: null,
  }));

  return (
    <div className="space-y-8">
      {scope && (
        scope.locked ? (
          scope.teamName && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Equipe</span>
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{scope.teamName}</span>
            </div>
          )
        ) : scope.teams.length > 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="enps-team" className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Equipe</label>
            <select
              id="enps-team"
              value={selectedTeam ?? ''}
              onChange={(e) => setSelectedTeam(e.target.value || null)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-[13px] text-slate-700 dark:text-slate-200"
            >
              <option value="">Todas as equipes</option>
              {scope.teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
        ) : null
      )}
      <section>
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-3">eNPS Geral</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="sr-only">eNPS Empresa</span>
            {empresaOk ? (<><KpiHeroCard card={scoreToCard('enps-empresa', 'eNPS Empresa', geral.empresa as EnpsScoreBlock, deltaEmpresa)} valueColor="text-blue-700 dark:text-blue-400" borderColor="border-l-blue-400" /><ScoreBreakdown block={geral.empresa as EnpsScoreBlock} /></>) : (<div><p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">eNPS Empresa</p><Empty>{INSUFFICIENT_MSG}</Empty></div>)}
          </div>
          <div>
            <span className="sr-only">eNPS Gestor</span>
            {gestorOk ? (<><KpiHeroCard card={scoreToCard('enps-gestor', 'eNPS Gestor', geral.gestor as EnpsScoreBlock, deltaGestor)} valueColor="text-emerald-700 dark:text-emerald-400" borderColor="border-l-emerald-400" /><ScoreBreakdown block={geral.gestor as EnpsScoreBlock} /></>) : (<div><p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">eNPS Gestor</p><Empty>{INSUFFICIENT_MSG}</Empty></div>)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EvolucaoChart title="Evolução — eNPS Empresa" serie={evolucao} pick={(p) => p.empresa} />
        <EvolucaoChart title="Evolução — eNPS Gestor" serie={evolucao} pick={(p) => p.gestor} />
      </section>

      <section>
        <SectionTitle>Participação</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{participacaoCards.map((c) => <KpiCompactCard key={c.id} card={c} />)}</div>
      </section>

      <section>
        <SectionTitle>Ranking de Gestores</SectionTitle>
        {ranking.length === 0 ? (<Empty>Nenhum gestor com respostas suficientes para ranquear neste período.</Empty>) : (
          <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800"><tr className="text-xs"><th className="text-left py-2.5 pl-3 pr-3 font-semibold text-slate-600 dark:text-slate-400">#</th><th className="text-left py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400">Gestor</th><th className="text-right py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-400">eNPS</th><th className="text-right py-2.5 pr-3 font-semibold text-slate-600 dark:text-slate-400">Respostas</th></tr></thead>
              <tbody>
                {ranking.map((row, idx) => (
                  <tr key={row.leaderUserId} className={`${idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-950'}`}>
                    <td className="py-2.5 pl-3 pr-3 text-xs"><span className="inline-flex min-w-7 justify-center rounded-full bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 font-semibold">{idx + 1}</span></td>
                    <td className="py-2.5 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100">{row.leaderName}</td>
                    <td className="py-2.5 px-3 text-right text-xs tabular-nums text-slate-800 dark:text-slate-200">{row.enps}</td>
                    <td className="py-2.5 pr-3 text-right text-xs tabular-nums text-slate-500">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {individual && (
        <section>
          <SectionTitle>Sua evolução (eNPS Individual)</SectionTitle>
          <EvolucaoChart title="Minha evolução" serie={individual.evolucao} pick={(p) => p.empresa} />
        </section>
      )}

      <section>
        <SectionTitle>Comentários</SectionTitle>
        {isInsufficient(comentarios) ? (<Empty>{INSUFFICIENT_MSG}</Empty>) : comentarios.length === 0 ? (<Empty>Nenhum comentário neste período.</Empty>) : (
          <ul className="space-y-2">{comentarios.map((c, i) => (<li key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-[13px] text-slate-700 dark:text-slate-300">“{c.text}”</li>))}</ul>
        )}
      </section>

      <section>
        <SectionTitle>Distribuição das notas</SectionTitle>
        {isInsufficient(distribuicao) ? (<Empty>{INSUFFICIENT_MSG}</Empty>) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><DistBars title="Empresa" buckets={distribuicao.empresa} /><DistBars title="Gestor" buckets={distribuicao.gestor} /></div>
        )}
      </section>
    </div>
  );
}
