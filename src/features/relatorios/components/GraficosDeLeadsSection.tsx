/**
 * Os quatro gráficos de leads, em Relatórios › Leads (P1.10).
 *
 * Total por dia · Por equipe · Perdidos pro bolsão · Tempo de conversão.
 *
 * Os quatro vêm de UMA chamada com os mesmos filtros, porque o plano define
 * o item como pronto quando "os totais do gráfico batem com os contadores".
 *
 * CADA GRÁFICO DIZ O QUE MOSTRA E O QUE NÃO MOSTRA. Um gráfico sem legenda é
 * um convite a ler errado — e dois destes têm limitação real na base de hoje:
 * o tempo de conversão tem poucas amostras, e o tempo por etapa só enxerga
 * quem já saiu da etapa.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  buscarGraficosDeLeads, mediaMovel, type GraficosDeLeads,
} from '../services/graficosDeLeadsService';

const PERIODOS = [
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 180, rotulo: '6 meses' },
] as const;

const CORES = {
  com_corretor: '#3b82f6',
  aguardando_corretor: '#f59e0b',
  com_lia: '#8b5cf6',
  sem_ninguem: '#ef4444',
};

const diaCurto = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const Caixa = ({ titulo, legenda, children }: {
  titulo: string; legenda: string; children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-border bg-card/60 p-4">
    <h3 className="text-[14px] font-semibold">{titulo}</h3>
    <p className="mt-0.5 mb-3 text-[12px] text-text-secondary">{legenda}</p>
    {children}
  </section>
);

export function GraficosDeLeadsSection() {
  const { tenantId } = useAuth();
  const [dias, setDias] = useState<number>(90);
  const [dados, setDados] = useState<GraficosDeLeads | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') { setCarregando(false); return; }
    setCarregando(true);
    try {
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
      setDados(await buscarGraficosDeLeads(tenantId, { desde }));
      setErro(null);
    } catch (e) {
      // Erro não pode virar gráfico vazio: "nenhum lead" e "não consegui ler"
      // desenham a mesma tela em branco e significam o oposto.
      setErro((e as { message?: string })?.message ?? 'não foi possível carregar os gráficos');
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [tenantId, dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const porDia = useMemo(() => mediaMovel(dados?.por_dia ?? []).map((p) => ({
    ...p, rotulo: diaCurto(p.dia),
  })), [dados]);

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-text-secondary">Selecione uma imobiliária.</p>;
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.dias}
            type="button"
            onClick={() => setDias(p.dias)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
              dias === p.dias
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {p.rotulo}
          </button>
        ))}
        {dados && (
          <span className="ml-1 text-[12px] text-text-secondary">
            <strong className="tabular-nums">{dados.total}</strong> leads entraram no período
          </span>
        )}
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Não foi possível carregar os gráficos: {erro}
          <button type="button" onClick={carregar} className="ml-2 font-medium underline">tentar de novo</button>
        </div>
      )}

      {carregando && !dados && (
        <div className="flex items-center gap-2 py-12 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> carregando…
        </div>
      )}

      {dados && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Caixa
            titulo="Leads por dia"
            legenda="Quantos leads entraram em cada dia. A linha é a média dos últimos 7 dias — ela só começa no sétimo, porque antes disso não há sete dias para tirar média."
          >
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={porDia}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" name="leads no dia" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Line dataKey="media" name="média de 7 dias" stroke="#f59e0b" dot={false} strokeWidth={2} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Caixa>

          <Caixa
            titulo="Por equipe, e de quem é a bola"
            legenda="Cada barra é uma equipe, dividida pelo sub-status do atendimento. “Sem equipe” são os leads cujo corretor não está em equipe nenhuma."
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dados.por_equipe}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="equipe" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="com_corretor" name="com o corretor" stackId="s" fill={CORES.com_corretor} />
                <Bar dataKey="aguardando_corretor" name="aguardando corretor" stackId="s" fill={CORES.aguardando_corretor} />
                <Bar dataKey="com_lia" name="com a Lia" stackId="s" fill={CORES.com_lia} />
                <Bar dataKey="sem_ninguem" name="sem ninguém" stackId="s" fill={CORES.sem_ninguem} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Caixa>

          <Caixa
            titulo="Perdidos pro bolsão, por equipe"
            legenda="Dos leads que entraram no período, quantos chegaram a cair no bolsão — por equipe de quem os tinha."
          >
            {dados.bolsao_por_equipe.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-text-secondary">
                Nenhum lead do período foi para o bolsão.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dados.bolsao_por_equipe} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="equipe" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip />
                  <Bar dataKey="total" name="foram pro bolsão" fill="#ef4444" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Caixa>

          <Caixa
            titulo="Tempo até a venda, e por etapa"
            legenda="Mediana, e não média: com os dados de hoje a média é dominada por um único lead antigo. Quanto tempo o lead leva da entrada até assinar, e quanto fica em cada etapa."
          >
            <div className="mb-3 rounded-lg border border-border bg-background px-3 py-2">
              <p className="text-[12px] text-text-secondary">Da entrada até a assinatura</p>
              <p className="mt-0.5 text-[24px] font-semibold tabular-nums leading-none">
                {dados.conversao.amostras > 0 && dados.conversao.mediana_dias !== null
                  ? <>{dados.conversao.mediana_dias} <span className="text-[14px] font-normal">dias</span></>
                  : <span className="text-[15px] font-normal text-text-secondary">Sem dados</span>}
              </p>
              <p className="mt-1 text-[11.5px] text-text-secondary">
                {dados.conversao.amostras > 0
                  ? <>mediana sobre <strong>{dados.conversao.amostras}</strong> venda(s)
                      {dados.conversao.media_dias !== null && dados.conversao.media_dias !== dados.conversao.mediana_dias && (
                        <> · a média seria {dados.conversao.media_dias} dias</>
                      )}</>
                  : 'nenhuma venda do período tem lead vinculado'}
                {dados.conversao.vendas_sem_lead > 0 && (
                  <> · <strong>{dados.conversao.vendas_sem_lead}</strong> venda(s) sem lead vinculado ficam de fora</>
                )}
              </p>
            </div>

            {dados.por_etapa.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-text-secondary">
                Ainda não há mudança de etapa registrada para medir.
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dados.por_etapa} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="etapa" tick={{ fontSize: 10 }} width={130} />
                    <Tooltip formatter={(v: number) => [`${v} dias`, 'mediana']} />
                    <Bar dataKey="mediana_dias" name="dias na etapa" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-2 text-[11.5px] leading-snug text-amber-700 dark:text-amber-400">
                  Este número tende a ser <strong>menor que o real</strong>: só conta o lead que já saiu da etapa, e o
                  registro de mudança começou em{' '}
                  {dados.etapa_desde
                    ? new Date(dados.etapa_desde).toLocaleDateString('pt-BR')
                    : 'pouco tempo'}
                  . Quem está parado há meses numa etapa ainda não entrou na conta. Melhora a cada semana.
                </p>
              </>
            )}
          </Caixa>
        </div>
      )}
    </div>
  );
}
