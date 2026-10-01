/**
 * A.3 · Flags do corretor, na Gestão de Equipe (?tab=flags).
 *
 * No topo, o mix da casa — o número da reunião. Embaixo, por corretor ou por
 * equipe. A coluna que faz a flag valer a pena é "falta para subir": o
 * vermelho vira instrução. Quem não tem atuação definida aparece separado.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { mesSP } from '@/lib/dataSP';
import {
  METRICAS, ROTULO_DA_ATUACAO, ROTULO_DA_FLAG, mixDaCasa, porEquipe, textoDaFalta,
  type Atuacao, type Flag, type PessoaComFlag,
} from './flags';
import { carregarFlags, type Reguas } from './flagsService';

const COR: Record<Flag, string> = {
  verde: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  amarelo: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  vermelho: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
};
const TITULO_DA_METRICA = { vendas: 'Vendas', visitas: 'Visitas realizadas', captacoes: 'Captações' } as const;

function Selo({ flag }: { flag: Flag }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold ${COR[flag]}`}>{ROTULO_DA_FLAG[flag]}</span>;
}

export function FlagsSection({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const [mes, setMes] = useState(() => mesSP());
  const [visao, setVisao] = useState<'corretor' | 'equipe'>('corretor');
  const flags = useQuery({ queryKey: ['flags-do-mes', tenantId, mes], queryFn: () => carregarFlags(tenantId, mes) });

  const pessoas = useMemo(() => flags.data?.pessoas ?? [], [flags.data]);
  const mix = useMemo(() => mixDaCasa(pessoas), [pessoas]);
  const classificaveis = pessoas.filter((p) => p.atuacao);
  const semAtuacao = pessoas.filter((p) => !p.atuacao);
  const semRegua = semReguaPorAtuacao(flags.data?.reguas ?? {}, classificaveis);

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Flags do corretor</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">A régua é de cada atuação e muda em Configurações › Régua das Flags.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[13px] text-slate-600 dark:text-slate-300">
            Mês{' '}
            <input type="month" aria-label="Mês" value={mes} max={mesSP()} onChange={(e) => e.target.value && setMes(e.target.value)}
              className="ml-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-[13px] dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <div role="tablist" aria-label="Visão" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {(['corretor', 'equipe'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={visao === v} onClick={() => setVisao(v)}
                className={`h-8 rounded-md px-3 text-[13px] font-medium ${visao === v ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}`}>
                {v === 'corretor' ? 'Por corretor' : 'Por equipe'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {flags.isLoading && <p className="text-[13px] text-slate-500">Carregando as flags…</p>}
      {flags.isError && <p role="alert" className="text-[13px] text-rose-600">{(flags.error as Error).message}</p>}

      {flags.data && (
        <>
          {semRegua.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {semRegua.map((a) => ROTULO_DA_ATUACAO[a]).join(' e ')} ainda sem régua: quem é dessa atuação fica sem flag, não vermelho.{' '}
              <button type="button" className="font-semibold underline" onClick={() => navigate('/configuracoes?tab=flags')}>Cadastrar a régua</button>
            </div>
          )}

          <section aria-label="Mix da casa" className="flex flex-wrap gap-3">
            {(['verde', 'amarelo', 'vermelho'] as const).map((c) => (
              <div key={c} className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <Selo flag={c} />
                <p className="mt-1 text-[22px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {mix.contagem[c]} <span className="text-[14px] font-normal text-slate-500">· {mix.percentual[c]}%</span>
                </p>
              </div>
            ))}
            <p className="self-end text-[12.5px] text-slate-500 dark:text-slate-400">
              {mix.classificados} classificados
              {mix.semRegua > 0 && ` · ${mix.semRegua} sem régua`}
              {mix.semAtuacao > 0 && ` · ${mix.semAtuacao} sem atuação definida`}
            </p>
          </section>

          {visao === 'corretor' ? <TabelaPorCorretor pessoas={classificaveis} /> : <TabelaPorEquipe pessoas={pessoas} />}

          {visao === 'corretor' && semAtuacao.length > 0 && (
            <section aria-label="Sem atuação definida" className="rounded-xl border border-dashed border-slate-300 px-4 py-3 dark:border-slate-700">
              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Sem atuação definida — não classificados</p>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                Defina Lançamentos ou Prontos no cadastro do membro. Quem atende os dois lados também fica aqui: não cabe numa régua só.
              </p>
              <p className="mt-1 text-[13px] text-slate-700 dark:text-slate-300">{semAtuacao.map((p) => p.nome).join(' · ')}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function semReguaPorAtuacao(reguas: Reguas, pessoas: PessoaComFlag[]): Atuacao[] {
  return (['lancamentos', 'prontos'] as const).filter(
    (a) => !reguas[`${a}:verde`] && !reguas[`${a}:amarelo`] && pessoas.some((p) => p.atuacao === a),
  );
}

function TabelaPorCorretor({ pessoas }: { pessoas: PessoaComFlag[] }) {
  if (pessoas.length === 0) return <p className="text-[13px] text-slate-500">Ninguém com atuação definida nesta visão.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead className="bg-slate-50 text-left text-[11.5px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Corretor</th><th className="px-3 py-2">Atuação</th>
            {METRICAS.map((m) => <th key={m} className="px-3 py-2 text-right">{TITULO_DA_METRICA[m]}</th>)}
            <th className="px-3 py-2">Falta para subir</th><th className="px-3 py-2">Flag</th>
          </tr>
        </thead>
        <tbody>
          {pessoas.map((p) => (
            <tr key={p.user_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 font-medium">{p.nome}<span className="block text-[11.5px] font-normal text-slate-500">{p.equipe}</span></td>
              <td className="px-3 py-2">{p.atuacao ? ROTULO_DA_ATUACAO[p.atuacao] : '—'}</td>
              {METRICAS.map((m) => <td key={m} className="px-3 py-2 text-right tabular-nums">{p.metricas[m]}</td>)}
              <td className="px-3 py-2">{textoDaFalta(p)}</td>
              <td className="px-3 py-2">
                {p.flag ? <Selo flag={p.flag} /> : <span className="text-slate-500">sem régua</span>}
                {p.antes && p.antes !== p.flag && (
                  <span className="ml-1.5 text-[11.5px] text-slate-500">era {ROTULO_DA_FLAG[p.antes].toLowerCase()}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaPorEquipe({ pessoas }: { pessoas: PessoaComFlag[] }) {
  const linhas = porEquipe(pessoas);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead className="bg-slate-50 text-left text-[11.5px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Equipe</th><th className="px-3 py-2 text-right">Corretores</th>
            <th className="px-3 py-2 text-right">Verde</th><th className="px-3 py-2 text-right">Amarelo</th>
            <th className="px-3 py-2 text-right">Vermelho</th><th className="px-3 py-2 text-right">Não classificados</th>
            {METRICAS.map((m) => <th key={m} className="px-3 py-2 text-right">{TITULO_DA_METRICA[m]}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.equipe} className="border-t border-slate-100 tabular-nums dark:border-slate-800">
              <td className="px-3 py-2 font-medium">{l.equipe}</td>
              <td className="px-3 py-2 text-right">{l.corretores}</td>
              <td className="px-3 py-2 text-right">{l.contagem.verde}</td>
              <td className="px-3 py-2 text-right">{l.contagem.amarelo}</td>
              <td className="px-3 py-2 text-right">{l.contagem.vermelho}</td>
              <td className="px-3 py-2 text-right">{l.naoClassificados}</td>
              {METRICAS.map((m) => <td key={m} className="px-3 py-2 text-right">{l.metricas[m]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
