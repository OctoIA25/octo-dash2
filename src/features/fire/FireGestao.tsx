/**
 * A.6 · O Fire da gestão, na página de Metas (?aba=fire): edições, pontuação
 * por atuação, desafios, classificação (individual e por equipe), recordes e o
 * extrato de cada um — com estorno, para a diretoria.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { hojeSP } from '@/lib/dataSP';
import {
  EVENTOS, ROTULO_DA_ATUACAO, ROTULO_DO_EVENTO, ROTULO_DO_STATUS, comPosicao, pontuacaoPadrao, porEquipe, textoDoRecorde,
  type Atuacao, type EventoFire, type Pontuacao,
} from './fire';
import {
  ativarEdicao, carregarPainel, encerrarEdicao, excluirEdicao, removerDesafio, salvarDesafio, salvarEdicao,
  type Edicao,
} from './fireService';
import { ExtratoFire } from './ExtratoFire';

const dataBR = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

export function FireGestao({ tenantId }: { tenantId: string }) {
  const [edicaoId, setEdicaoId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const painel = useQuery({ queryKey: ['fire-painel', tenantId, edicaoId], queryFn: () => carregarPainel(tenantId, edicaoId) });

  if (painel.isLoading) return <p className="text-[13px] text-slate-500">Carregando o Fire…</p>;
  if (painel.isError || !painel.data) return <p role="alert" className="text-[13px] text-rose-600">{(painel.error as Error)?.message}</p>;
  const p = painel.data;
  const e = p.edicao;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {p.edicoes.length > 0 && (
          <select aria-label="Edição" value={e?.id ?? ''} onChange={(ev) => { setCriando(false); setEdicaoId(ev.target.value); }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[13px] dark:border-slate-700 dark:bg-slate-900">
            {p.edicoes.map((x) => <option key={x.id} value={x.id}>{x.nome} · {ROTULO_DO_STATUS[x.status]}</option>)}
          </select>
        )}
        {p.pode_gerir && !criando && <Button size="sm" variant="outline" onClick={() => setCriando(true)}>Nova edição</Button>}
      </div>

      {criando && <FormEdicao tenantId={tenantId} onPronto={(id) => { setCriando(false); setEdicaoId(id); }} onCancelar={() => setCriando(false)} />}
      {!criando && !e && (
        <p className="text-[13px] text-slate-500">Nenhuma edição ainda.{p.pode_gerir ? ' Crie a primeira: ela nasce como rascunho e só pontua depois de ativada.' : ''}</p>
      )}
      {!criando && e && <DetalheDaEdicao tenantId={tenantId} edicao={e} podeGerir={p.pode_gerir} onExcluida={() => setEdicaoId(null)} />}

      {p.recordes.length > 0 && (
        <section aria-label="Recordes" className="space-y-2">
          <h3 className="text-[14px] font-semibold">Recordes da casa</h3>
          <div className="flex flex-wrap gap-3">
            {p.recordes.map((r) => {
              const t = textoDoRecorde(r);
              return (
                <div key={r.tipo} className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{t.titulo}</p>
                  <p className="text-[18px] font-semibold tabular-nums">{t.valor}</p>
                  <p className="text-[12.5px] text-slate-600 dark:text-slate-300">{r.nome ?? '—'} · {t.quando}{r.edicao ? ` · ${r.edicao}` : ''}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function FormEdicao({ tenantId, edicao, onPronto, onCancelar }: {
  tenantId: string; edicao?: Edicao; onPronto: (id: string) => void; onCancelar: () => void;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(edicao?.nome ?? '');
  const [inicio, setInicio] = useState(edicao?.inicio ?? hojeSP());
  const [fim, setFim] = useState(edicao?.fim ?? '');
  const [pontuacao, setPontuacao] = useState<Pontuacao>(edicao?.pontuacao ?? pontuacaoPadrao());
  const salvar = useMutation({
    mutationFn: () => salvarEdicao(tenantId, { id: edicao?.id, nome, inicio, fim, pontuacao }),
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ['fire-painel', tenantId] }); onPronto(id); },
  });
  const muda = (a: Atuacao, ev: EventoFire, v: string) =>
    setPontuacao((pt) => ({ ...pt, [a]: { ...pt[a], [ev]: v === '' ? 0 : Number(v) } }));

  return (
    <section aria-label="Edição" className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap gap-3">
        <label className="text-[12.5px]">Nome<Input aria-label="Nome da edição" className="mt-0.5 h-9 w-64" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <label className="text-[12.5px]">Início<Input aria-label="Início" type="date" className="mt-0.5 h-9" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
        <label className="text-[12.5px]">Fim<Input aria-label="Fim" type="date" className="mt-0.5 h-9" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
      </div>
      <table className="text-[13px]">
        <caption className="mb-1 text-left text-[12.5px] text-slate-500">Pontos por evento — o ciclo de Lançamentos e de Prontos é diferente</caption>
        <thead><tr><th />{EVENTOS.map((ev) => <th key={ev} className="px-2 text-left font-medium">{ROTULO_DO_EVENTO[ev]}</th>)}</tr></thead>
        <tbody>
          {(['lancamentos', 'prontos'] as const).map((a) => (
            <tr key={a}>
              <th className="pr-3 text-left font-medium">{ROTULO_DA_ATUACAO[a]}</th>
              {EVENTOS.map((ev) => (
                <td key={ev} className="px-2 py-1">
                  <Input aria-label={`${ROTULO_DA_ATUACAO[a]} · ${ROTULO_DO_EVENTO[ev]}`} type="number" min={0} max={1000} className="h-8 w-20"
                    value={pontuacao[a][ev]} onChange={(e) => muda(a, ev, e.target.value)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!nome.trim() || !inicio || !fim || salvar.isPending} onClick={() => salvar.mutate()}>Salvar rascunho</Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        {salvar.isError && <span role="alert" className="text-[12px] text-rose-600">{(salvar.error as Error).message}</span>}
      </div>
    </section>
  );
}

function DetalheDaEdicao({ tenantId, edicao: e, podeGerir, onExcluida }: {
  tenantId: string; edicao: Edicao; podeGerir: boolean; onExcluida: () => void;
}) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false);
  const [visao, setVisao] = useState<'todos' | Atuacao | 'equipes'>('todos');
  const [aberto, setAberto] = useState<string | null>(null);
  useEffect(() => { setEditando(false); setAberto(null); setConfirmarEncerrar(false); }, [e.id]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ['fire-painel', tenantId] });
  const acao = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => { setConfirmarEncerrar(false); recarregar(); },
  });
  const ranking = useMemo(() => comPosicao(e.classificacao.filter((c) => visao === 'todos' || visao === 'equipes' || c.atuacao === visao)), [e.classificacao, visao]);
  const equipes = useMemo(() => porEquipe(e.classificacao), [e.classificacao]);

  if (editando) return <FormEdicao tenantId={tenantId} edicao={e} onPronto={() => setEditando(false)} onCancelar={() => setEditando(false)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-semibold">{e.nome}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-medium dark:bg-slate-800">{ROTULO_DO_STATUS[e.status]}</span>
        <span className="text-[12.5px] text-slate-500">{dataBR(e.inicio)} a {dataBR(e.fim)}</span>
        {e.status === 'ativa' && e.processado_em && (
          <span className="text-[12px] text-slate-500">· pontos atualizados às {new Date(e.processado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (a cada 10 min)</span>
        )}
        {e.status === 'encerrada' && <span className="text-[12px] text-slate-500">· classificação congelada no fechamento</span>}
      </div>

      {podeGerir && (
        <div className="flex flex-wrap items-center gap-2">
          {e.status === 'rascunho' && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>Editar rascunho</Button>
              <Button size="sm" onClick={() => acao.mutate(() => ativarEdicao(e.id))} disabled={acao.isPending}>Ativar</Button>
              <Button size="sm" variant="ghost" onClick={() => acao.mutate(async () => { await excluirEdicao(e.id); onExcluida(); })}>Excluir rascunho</Button>
            </>
          )}
          {e.status === 'ativa' && (confirmarEncerrar ? (
            <>
              <span className="text-[12.5px]">Encerrar congela a classificação. Evento que chegar depois não entra.</span>
              <Button size="sm" variant="destructive" onClick={() => acao.mutate(() => encerrarEdicao(e.id))} disabled={acao.isPending}>Encerrar agora</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmarEncerrar(false)}>Cancelar</Button>
            </>
          ) : <Button size="sm" variant="outline" onClick={() => setConfirmarEncerrar(true)}>Encerrar edição</Button>)}
          {acao.isError && <span role="alert" className="text-[12px] text-rose-600">{(acao.error as Error).message}</span>}
        </div>
      )}

      {e.pontuacao && (
        <p className="text-[12.5px] text-slate-600 dark:text-slate-300">
          {(['lancamentos', 'prontos'] as const).map((a) => (
            <span key={a} className="mr-4"><b>{ROTULO_DA_ATUACAO[a]}:</b> {EVENTOS.map((ev) => `${ROTULO_DO_EVENTO[ev].toLowerCase()} ${e.pontuacao![a][ev]}`).join(' · ')}</span>
          ))}
        </p>
      )}

      <Desafios edicao={e} podeGerir={podeGerir} onMudou={recarregar} />

      <section aria-label="Classificação" className="space-y-2">
        <div role="tablist" aria-label="Classificação" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {(['todos', 'lancamentos', 'prontos', 'equipes'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={visao === v} onClick={() => setVisao(v)}
              className={`h-8 rounded-md px-3 text-[13px] font-medium ${visao === v ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}`}>
              {v === 'todos' ? 'Todos' : v === 'equipes' ? 'Por equipe' : ROTULO_DA_ATUACAO[v]}
            </button>
          ))}
        </div>
        {visao === 'equipes' ? (
          <table className="w-full max-w-xl text-[13px]">
            <thead><tr className="text-left text-slate-500"><th>Equipe</th><th className="text-right">Corretores</th><th className="text-right">Pontos</th></tr></thead>
            <tbody>{equipes.map((l) => <tr key={l.equipe}><td>{l.equipe}</td><td className="text-right tabular-nums">{l.corretores}</td><td className="text-right tabular-nums font-semibold">{l.pontos}</td></tr>)}</tbody>
          </table>
        ) : (
          <ol className="max-w-2xl divide-y divide-slate-100 text-[13px] dark:divide-slate-800">
            {ranking.map((c) => (
              <li key={c.user_id} className="py-1.5">
                <button type="button" className="flex w-full items-baseline gap-2 text-left" onClick={() => setAberto(aberto === c.user_id ? null : c.user_id)}>
                  <span className="w-7 tabular-nums text-slate-500">{c.posicao}º</span>
                  <span className="min-w-0 flex-1">{c.nome} <span className="text-[12px] text-slate-500">· {c.equipe}</span></span>
                  <span className="tabular-nums font-semibold">{c.pontos}</span>
                </button>
                {aberto === c.user_id && (
                  <div className="ml-9 mt-1"><ExtratoFire tenantId={tenantId} edicaoId={e.id} userId={c.user_id} podeEstornar={podeGerir && e.status === 'ativa'} /></div>
                )}
              </li>
            ))}
          </ol>
        )}
        {e.sem_atuacao.length > 0 && (
          <p className="text-[12.5px] text-slate-500">Sem atuação definida — não pontuam: {e.sem_atuacao.join(' · ')}. A pontuação é por atuação: defina no cadastro do membro.</p>
        )}
      </section>
    </div>
  );
}

function Desafios({ edicao: e, podeGerir, onMudou }: { edicao: Edicao; podeGerir: boolean; onMudou: () => void }) {
  const [novo, setNovo] = useState({ descricao: '', evento: 'visita' as EventoFire, quantidade: 3, desde: e.inicio, prazo: e.fim, pontos: 30 });
  const criar = useMutation({ mutationFn: () => salvarDesafio(e.id, novo), onSuccess: () => { setNovo((n) => ({ ...n, descricao: '' })); onMudou(); } });
  const remover = useMutation({ mutationFn: (id: string) => removerDesafio(id), onSuccess: onMudou });
  const podeMexer = podeGerir && e.status !== 'encerrada';

  return (
    <section aria-label="Desafios" className="space-y-1">
      <h3 className="text-[14px] font-semibold">Desafios</h3>
      {e.desafios.length === 0 && <p className="text-[12.5px] text-slate-500">Nenhum desafio nesta edição.</p>}
      <ul className="text-[13px]">
        {e.desafios.map((d) => (
          <li key={d.id}>
            <b>{d.descricao}</b> <span className="text-slate-500">· {d.quantidade} {ROTULO_DO_EVENTO[d.evento].toLowerCase()} de {dataBR(d.desde)} a {dataBR(d.prazo)} · +{d.pontos} · {d.cumpriram} cumpriram</span>
            {podeMexer && d.cumpriram === 0 && (
              <button type="button" className="ml-2 text-[12px] text-slate-500 hover:underline" onClick={() => remover.mutate(d.id)}>tirar</button>
            )}
          </li>
        ))}
      </ul>
      {podeMexer && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="text-[12px]">Desafio<Input aria-label="Descrição do desafio" className="mt-0.5 h-8 w-56" value={novo.descricao} placeholder="3 visitas até sexta"
            onChange={(ev) => setNovo({ ...novo, descricao: ev.target.value })} /></label>
          <label className="text-[12px]">Quantos<Input aria-label="Quantidade" type="number" min={1} max={99} className="mt-0.5 h-8 w-16" value={novo.quantidade}
            onChange={(ev) => setNovo({ ...novo, quantidade: Number(ev.target.value) })} /></label>
          <label className="text-[12px]">De quê
            <select aria-label="Evento do desafio" className="mt-0.5 block h-8 rounded-md border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-900"
              value={novo.evento} onChange={(ev) => setNovo({ ...novo, evento: ev.target.value as EventoFire })}>
              {EVENTOS.map((ev) => <option key={ev} value={ev}>{ROTULO_DO_EVENTO[ev]}</option>)}
            </select>
          </label>
          <label className="text-[12px]">De<Input aria-label="Desde" type="date" className="mt-0.5 h-8" value={novo.desde} onChange={(ev) => setNovo({ ...novo, desde: ev.target.value })} /></label>
          <label className="text-[12px]">Até<Input aria-label="Prazo" type="date" className="mt-0.5 h-8" value={novo.prazo} onChange={(ev) => setNovo({ ...novo, prazo: ev.target.value })} /></label>
          <label className="text-[12px]">Pontos<Input aria-label="Pontos do desafio" type="number" min={1} max={1000} className="mt-0.5 h-8 w-20" value={novo.pontos}
            onChange={(ev) => setNovo({ ...novo, pontos: Number(ev.target.value) })} /></label>
          <Button size="sm" disabled={!novo.descricao.trim() || criar.isPending} onClick={() => criar.mutate()}>Criar desafio</Button>
          {(criar.isError || remover.isError) && <span role="alert" className="text-[12px] text-rose-600">{((criar.error ?? remover.error) as Error).message}</span>}
        </div>
      )}
    </section>
  );
}
