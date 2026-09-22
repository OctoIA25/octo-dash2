/**
 * Equipe › Reuniões (P4.8).
 *
 * A tela tem um passo que não dá para pular, e ele é o item inteiro: entre a
 * ata lida e as tarefas na agenda de alguém existe uma pessoa apontando quem é
 * cada "a Ana" que a transcrição citou. O botão de criar fica desligado
 * enquanto faltar um, e diz quais faltam — um botão cinza calado é a forma
 * mais comum de alguém concluir que o sistema quebrou.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Calendar, Check, ListTodo, Loader2, Plus, Sparkles, Upload, X,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { useToast } from '@/hooks/use-toast';
import {
  comoFoiLida, mapaEmLista, podeCriarTarefas, porQueNaoPodeCriar, resumoDaAta,
  ROTULO_DO_STATUS, semResponsavel, tarefasVivas,
} from './atas';
import {
  abrirAta, carregarAtas, carregarResponsaveis, criarAta, criarTarefas,
  lerArquivoDeTranscricao, revisarTarefa,
  type Ata, type Responsavel, type TarefaDaAta,
} from './atasService';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

const inputCls = 'h-8 w-full rounded-md border bg-background px-2 text-xs';

export function ReunioesPage() {
  const { tenantId } = useAuthContext();
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const qc = useQueryClient();

  const lista = useQuery({
    queryKey: ['atas', tenantId],
    queryFn: () => carregarAtas(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária para ver as reuniões.</p>;
  }

  // A função devolve nulo quando recusa. Sem este aviso a tela mostraria uma
  // lista vazia a quem simplesmente não tem acesso a ela.
  if (lista.isSuccess && lista.data === null) {
    return (
      <div className="p-6">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>A ata é de quem gere.</strong> Ela guarda a conversa inteira da reunião, então
          quem vê é quem administra a imobiliária ou lidera equipe. O que foi combinado para
          você chega como tarefa na sua agenda.
        </p>
      </div>
    );
  }

  if (aberta) {
    return <DetalheDaAta ataId={aberta} tenantId={tenantId} onVoltar={() => {
      setAberta(null);
      qc.invalidateQueries({ queryKey: ['atas'] });
    }} />;
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reuniões</h1>
          <p className="text-xs text-muted-foreground">
            A transcrição vira ata. As tarefas combinadas só vão para a agenda depois que
            alguém apontar cada responsável.
          </p>
        </div>
        <button onClick={() => setNova(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
          <Plus className="h-3.5 w-3.5" /> Nova ata
        </button>
      </header>

      {lista.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {lista.isSuccess && (lista.data ?? []).length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma ata ainda. Suba a transcrição de uma reunião para começar.
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        {(lista.data ?? []).map((a) => (
          <li key={a.id}>
            <button onClick={() => setAberta(a.id)}
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{a.titulo}</span>
                <span className="text-xs text-muted-foreground">
                  {dataBR(a.data_reuniao)}{a.equipe ? ` · ${a.equipe}` : ''} — {resumoDaAta(a)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {a.sem_responsavel > 0 && !a.tarefas_criadas && (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                )}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  a.status === 'revisada'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : a.status === 'lida'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  {ROTULO_DO_STATUS[a.status]}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {nova && (
        <NovaAtaModal tenantId={tenantId} onFechar={() => setNova(false)}
          onCriada={(id) => { setNova(false); qc.invalidateQueries({ queryKey: ['atas'] }); setAberta(id); }} />
      )}
    </div>
  );
}

function NovaAtaModal({
  tenantId, onFechar, onCriada,
}: { tenantId: string; onFechar: () => void; onCriada: (id: string) => void }) {
  const { toast } = useToast();
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [equipe, setEquipe] = useState('');
  const [transcricao, setTranscricao] = useState('');
  useEscapeFecha(onFechar);

  const salvar = useMutation({
    mutationFn: () => criarAta(tenantId, { titulo, data, transcricao, equipe }),
    onSuccess: onCriada,
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Não deu para criar a ata', description: e.message }),
  });

  async function aoEscolher(f: File | undefined) {
    if (!f) return;
    try {
      setTranscricao(await lerArquivoDeTranscricao(f));
      if (!titulo) setTitulo(f.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      toast({ variant: 'destructive', title: 'Arquivo não lido', description: (e as Error).message });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar} role="presentation">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Nova ata">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Nova ata</h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1.5 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium">Título</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                placeholder="Reunião de segunda" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-xs font-medium">Data</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)}
                className={`mt-1 ${inputCls}`} />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium">Equipe <span className="text-muted-foreground">(opcional)</span></span>
            <input value={equipe} onChange={(e) => setEquipe(e.target.value)} className={`mt-1 ${inputCls}`} />
          </label>

          <div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent">
              <Upload className="h-3.5 w-3.5" /> Subir transcrição (.txt, .vtt)
              <input type="file" className="hidden" accept=".txt,.vtt,text/plain"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; aoEscolher(f); }} />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Ou cole o texto abaixo. As marcas de tempo do .vtt são removidas na leitura.
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-medium">Transcrição</span>
            <textarea value={transcricao} onChange={(e) => setTranscricao(e.target.value)}
              rows={10} className="mt-1 w-full rounded-md border bg-background p-2 text-xs"
              placeholder="Cole aqui o que foi dito na reunião…" />
            <span className="text-[11px] text-muted-foreground">
              {transcricao.trim().length} caractere(s). A LIA lê e propõe resumo, decisões e tarefas —
              e a ata funciona igual se ela não ler: dá para escrever à mão.
            </span>
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t px-4 py-3">
          <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Cancelar
          </button>
          <button onClick={() => salvar.mutate()}
            disabled={salvar.isPending || transcricao.trim().length < 40}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Criar ata
          </button>
        </footer>
      </div>
    </div>
  );
}

function DetalheDaAta({
  ataId, tenantId, onVoltar,
}: { ataId: string; tenantId: string; onVoltar: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const ata = useQuery({ queryKey: ['ata', ataId], queryFn: () => abrirAta(ataId) });
  const pessoas = useQuery({
    queryKey: ['ata-responsaveis', tenantId],
    queryFn: () => carregarResponsaveis(tenantId),
  });

  const revisar = useMutation({
    mutationFn: (x: { id: string; email?: string | null; prazo?: string | null; descartada?: boolean }) =>
      revisarTarefa(x.id, { responsavelEmail: x.email, prazo: x.prazo, descartada: x.descartada }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ata', ataId] }),
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Não deu para revisar', description: e.message }),
  });

  const criar = useMutation({
    mutationFn: () => criarTarefas(ataId),
    onSuccess: (r) => {
      if (r.sem_responsavel?.length) {
        toast({
          variant: 'destructive',
          title: 'Ainda falta apontar responsável',
          description: r.sem_responsavel.map((t) => t.responsavel_texto || t.descricao).join('; '),
        });
      } else {
        toast({
          title: `${r.criadas} tarefa(s) na agenda`,
          description: 'Cada uma apareceu na agenda de quem ficou com ela.',
        });
      }
      qc.invalidateQueries({ queryKey: ['ata', ataId] });
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Não deu para criar', description: e.message }),
  });

  const a = ata.data;
  const motivo = porQueNaoPodeCriar(a);
  const aviso = comoFoiLida(a);
  const faltam = semResponsavel(a?.tarefas);

  return (
    <div className="p-4 sm:p-6">
      <button onClick={onVoltar}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Todas as reuniões
      </button>

      {ata.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!a && ata.isSuccess && <p className="text-sm text-muted-foreground">Ata não encontrada.</p>}

      {a && (
        <>
          <header className="mb-3">
            <h1 className="text-xl font-semibold">{a.titulo}</h1>
            <p className="text-xs text-muted-foreground">
              <Calendar className="mr-1 inline h-3 w-3" />{dataBR(a.data_reuniao)}
              {a.equipe ? ` · ${a.equipe}` : ''}
              {a.participantes.length > 0 ? ` · ${a.participantes.join(', ')}` : ''}
            </p>
            {aviso && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0" /> {aviso}
              </p>
            )}
          </header>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <section className="rounded-lg border">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-medium">
                    <ListTodo className="h-4 w-4" /> Tarefas combinadas
                    {faltam.length > 0 && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        {faltam.length} sem responsável
                      </span>
                    )}
                  </h2>
                  <button onClick={() => criar.mutate()}
                    disabled={!podeCriarTarefas(a) || criar.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {criar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Criar tarefas
                  </button>
                </header>

                {/* Por que o botão está desligado. Sem isto, cinza e calado. */}
                {motivo && <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">{motivo}</p>}

                <ul className="divide-y">
                  {tarefasVivas(a.tarefas).map((t) => (
                    <LinhaDaTarefa key={t.id} t={t} pessoas={pessoas.data ?? []}
                      travada={!!a.tarefas_criadas_em || t.na_agenda}
                      aoMudar={(m) => revisar.mutate({ id: t.id, ...m })} />
                  ))}
                  {tarefasVivas(a.tarefas).length === 0 && (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Nenhuma tarefa nesta ata.
                    </li>
                  )}
                </ul>
              </section>

              {a.resumo && (
                <section className="rounded-lg border p-3">
                  <h2 className="mb-1 text-sm font-medium">Resumo</h2>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.resumo}</p>
                </section>
              )}
            </div>

            <div className="space-y-4">
              <ListaSimples titulo="Decisões" itens={a.decisoes} />
              <ListaSimples titulo="Riscos e pendências" itens={a.riscos} />

              {mapaEmLista(a.mapa).length > 0 && (
                <section className="rounded-lg border p-3">
                  <h2 className="mb-1.5 text-sm font-medium">Mapa da conversa</h2>
                  <ul className="space-y-0.5 text-xs">
                    {mapaEmLista(a.mapa).map((m, i) => (
                      <li key={`${i}-${m.texto}`} style={{ paddingLeft: `${(m.nivel - 1) * 14}px` }}
                        className={m.nivel === 1 ? 'font-medium' : 'text-muted-foreground'}>
                        {m.nivel > 1 && <span className="mr-1 text-muted-foreground">└</span>}{m.texto}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ListaSimples({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens?.length) return null;
  return (
    <section className="rounded-lg border p-3">
      <h2 className="mb-1.5 text-sm font-medium">{titulo}</h2>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {itens.map((x, i) => <li key={`${i}-${x}`}>· {x}</li>)}
      </ul>
    </section>
  );
}

function LinhaDaTarefa({
  t, pessoas, travada, aoMudar,
}: {
  t: TarefaDaAta;
  pessoas: Responsavel[];
  travada: boolean;
  aoMudar: (m: { email?: string | null; prazo?: string | null; descartada?: boolean }) => void;
}) {
  const [email, setEmail] = useState(t.responsavel_email ?? '');
  const [prazo, setPrazo] = useState(t.prazo ?? '');
  useEffect(() => { setEmail(t.responsavel_email ?? ''); setPrazo(t.prazo ?? ''); },
    [t.responsavel_email, t.prazo]);

  const semDono = !t.responsavel_email && !t.na_agenda;

  return (
    <li className={`px-3 py-2.5 text-xs ${semDono ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
      <p className="font-medium">{t.descricao}</p>

      {/* O que a transcrição chamou de responsável fica visível SEMPRE. É por
          ele que a pessoa sabe quem procurar — e ele não é ninguém sozinho. */}
      {t.responsavel_texto && (
        <p className="mt-0.5 text-muted-foreground">
          Na reunião ficou com <strong>{t.responsavel_texto}</strong>
          {semDono && ' — aponte quem é.'}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <select value={email} disabled={travada}
          onChange={(e) => { setEmail(e.target.value); aoMudar({ email: e.target.value || null }); }}
          className="h-7 rounded-md border bg-background px-1.5 text-xs disabled:opacity-60">
          <option value="">Quem é…</option>
          {pessoas.map((p) => (
            <option key={p.email} value={p.email}>{p.nome} ({p.email})</option>
          ))}
        </select>

        <input type="date" value={prazo} disabled={travada}
          onChange={(e) => { setPrazo(e.target.value); aoMudar({ prazo: e.target.value || null }); }}
          className="h-7 rounded-md border bg-background px-1.5 text-xs disabled:opacity-60" />

        {!travada && (
          <button onClick={() => aoMudar({ descartada: true })}
            className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent">
            Descartar
          </button>
        )}

        {t.na_agenda && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Na agenda
          </span>
        )}
      </div>
    </li>
  );
}
