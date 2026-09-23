/**
 * Financeiro › Conciliação por extrato (P4.6).
 *
 * A pergunta que a aba responde: o extrato do banco bate com o que a Dash diz?
 *
 * A REGRA QUE DÁ O FORMATO DA TELA: conciliar errado é dinheiro no lugar
 * errado — some de onde devia estar e aparece onde não devia, sem mudar o
 * total, então ninguém percebe até alguém conferir o extrato à mão. Por isso:
 *
 *  - Movimento com UM candidato vem marcado. Movimento com DOIS ou mais vem
 *    desmarcado e em amarelo: a tela não escolhe por quem confere.
 *  - Movimento sem candidato aparece igual, com o botão de ignorar. Esconder
 *    o que não casou faria o mês fechar por engano.
 *  - O placar conta o que FALTA, e não o que já foi feito.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Check, EyeOff, Loader2, Upload, Undo2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { contaBancariaPadrao, marcacoes, reaisExatos, resumoDaConciliacao, resumoDaImportacao } from './financeiro';
import { avisoDeDescartadas, lerArquivoOfx, resumoDoExtrato, type ExtratoLido } from './ofx';
import {
  carregarMovimentos, carregarSituacao, carregarSugestoes, conciliar, desconciliar,
  ignorarMovimento, importarExtrato,
  type ContaBancaria, type SugestaoDaConciliacao,
} from './financeiroService';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

interface Props {
  tenantId: string;
  de: string;
  ate: string;
  contas: ContaBancaria[];
  /** Leva o filtro do topo para o período do arquivo recém-importado. */
  aoImportarPeriodo: (de: string, ate: string) => void;
}

export function ConciliacaoPanel({ tenantId, de, ate, contas, aoImportarPeriodo }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const arquivoRef = useRef<HTMLInputElement>(null);

  // A conta resolvida sozinha, quando há uma resposta certa (pedido do chefe,
  // 23/09/2026: "Conta não precisa constar, vai sempre pro Inter"). Quando
  // `contaBancariaPadrao` devolve null é porque a regra não cobre o caso — e
  // aí o campo reaparece, em vez de a importação adivinhar o banco.
  const contaAutomatica = useMemo(() => contaBancariaPadrao(contas), [contas]);
  const [contaEscolhida, setContaEscolhida] = useState('');
  const contaId = contaAutomatica ?? contaEscolhida;
  const [lido, setLido] = useState<{ extrato: ExtratoLido; nome: string } | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  // Quem já passou pela lista. É o que impede um recarregamento de remarcar o
  // que a pessoa desmarcou, ou de apagar o que ela escolheu num ambíguo.
  const vistos = useRef<Set<string>>(new Set());

  const habilitado = !!tenantId && tenantId !== 'owner';
  const sugestoes = useQuery({
    queryKey: ['fin-conc-sug', tenantId, de, ate],
    queryFn: () => carregarSugestoes(tenantId, de, ate),
    enabled: habilitado,
  });
  const movimentos = useQuery({
    queryKey: ['fin-conc-mov', tenantId, de, ate],
    queryFn: () => carregarMovimentos(tenantId, de, ate),
    enabled: habilitado,
  });
  const situacao = useQuery({
    queryKey: ['fin-conc-sit', tenantId, de, ate],
    queryFn: () => carregarSituacao(tenantId, de, ate),
    enabled: habilitado,
  });

  useEffect(() => {
    if (!sugestoes.data) return;
    setEscolhas((atuais) => {
      const r = marcacoes(sugestoes.data, atuais, vistos.current);
      vistos.current = r.vistos;
      return r.escolhas;
    });
  }, [sugestoes.data]);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['fin-conc-sug'] });
    qc.invalidateQueries({ queryKey: ['fin-conc-mov'] });
    qc.invalidateQueries({ queryKey: ['fin-conc-sit'] });
    // A baixa muda a lista do "a receber" e o fluxo de caixa da fase 1.
    qc.invalidateQueries({ queryKey: ['fin-lancamentos'] });
    qc.invalidateQueries({ queryKey: ['fin-fluxo'] });
    qc.invalidateQueries({ queryKey: ['fin-dre'] });
  };

  const importar = useMutation({
    mutationFn: async () => {
      if (!lido) throw new Error('Escolha o arquivo do extrato.');
      if (!contaId) throw new Error('Escolha a conta bancária deste extrato.');
      return importarExtrato(tenantId, contaId, lido.nome, lido.extrato.periodo,
        lido.extrato.transacoes);
    },
    onMutate: () => lido?.extrato.periodo,
    onSuccess: (r, _v, periodo: { de: string | null; ate: string | null } | undefined) => {
      toast({ title: 'Extrato importado', description: resumoDaImportacao(r) });
      // O filtro do topo passa a ser o do arquivo. Sem isto, importar outubro
      // com o filtro em setembro dizia "5 importados" e mostrava uma lista
      // vazia — e a conclusão natural é que a importação não funcionou.
      if (periodo?.de && periodo?.ate) aoImportarPeriodo(periodo.de, periodo.ate);
      setLido(null);
      if (arquivoRef.current) arquivoRef.current.value = '';
      recarregar();
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Não deu para importar', description: e.message }),
  });

  const confirmar = useMutation({
    mutationFn: () => conciliar(tenantId,
      Object.entries(escolhas).map(([transacao_id, lancamento_id]) => ({ transacao_id, lancamento_id }))),
    onSuccess: (r) => {
      // O recusado aparece com o motivo. Dizer só "N conciliados" esconderia
      // que alguns não entraram — e a pessoa fecharia o mês achando que entrou.
      toast({
        variant: r.quantos_recusados > 0 ? 'destructive' : 'default',
        title: `${r.conciliados} movimento(s) conciliado(s)`,
        description: r.quantos_recusados > 0
          ? `${r.quantos_recusados} recusado(s): ${r.recusados.map((x) => x.motivo).join('; ')}`
          : undefined,
      });
      recarregar();
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Não deu para conciliar', description: e.message }),
  });

  const acao = useMutation({
    mutationFn: async (x: { tipo: 'ignorar' | 'desfazer' | 'voltar'; id: string }) => {
      if (x.tipo === 'desfazer') return desconciliar(x.id);
      return ignorarMovimento(x.id, x.tipo === 'ignorar', x.tipo === 'ignorar' ? 'não é da Dash' : '');
    },
    onSuccess: recarregar,
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Não deu certo', description: e.message }),
  });

  async function aoEscolherArquivo(f: File | undefined) {
    if (!f) return setLido(null);
    try {
      setLido({ extrato: await lerArquivoOfx(f), nome: f.name });
    } catch {
      setLido(null);
      toast({ variant: 'destructive', title: 'Arquivo ilegível',
        description: 'Não deu para ler este arquivo como extrato OFX.' });
    }
  }

  const marcados = Object.keys(escolhas).length;
  const naFila = sugestoes.data ?? [];
  const ambiguas = naFila.filter((s) => s.ambigua).length;
  const conciliados = (movimentos.data ?? []).filter((m) => m.lancamento_id);
  const ignorados = (movimentos.data ?? []).filter((m) => m.ignorada && !m.lancamento_id);

  return (
    <div className="space-y-4">
      {/* ---------- importar ---------- */}
      <section className="rounded-lg border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Arquivo do extrato (.ofx)</span>
            <input ref={arquivoRef} type="file" accept=".ofx,.OFX,text/plain"
              onChange={(e) => aoEscolherArquivo(e.target.files?.[0])}
              className="text-xs file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1 file:text-xs" />
          </label>
          {/*
            O campo só aparece quando a conta não dá para deduzir. Com uma
            conta "Inter" (ou uma conta ativa só), ele some: é o pedido do
            chefe. Ele NÃO some de vez porque é a conta que identifica o
            extrato e impede o mesmo mês de entrar duas vezes — adivinhar
            jogaria o extrato de um banco dentro de outro, e o erro só
            apareceria no fechamento.
          */}
          {!contaAutomatica && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Conta bancária</span>
              <select value={contaEscolhida} onChange={(e) => setContaEscolhida(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs">
                <option value="">Escolha…</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
          <button onClick={() => importar.mutate()} disabled={!lido || !contaId || importar.isPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50">
            {importar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Importar
          </button>
        </div>

        {contas.length === 0 && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Cadastre uma conta bancária no Fluxo de caixa antes de importar: é ela que
            identifica o extrato e impede o mesmo mês de entrar duas vezes.
          </p>
        )}
        {lido && (
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-muted-foreground">{resumoDoExtrato(lido.extrato)}</p>
            {avisoDeDescartadas(lido.extrato) && (
              <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {avisoDeDescartadas(lido.extrato)}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ---------- o placar ---------- */}
      <p className="text-xs text-muted-foreground">{resumoDaConciliacao(situacao.data)}</p>

      {/* ---------- a fila ---------- */}
      {sugestoes.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

      {!sugestoes.isLoading && naFila.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
          Nada para conciliar no período escolhido.
        </p>
      )}

      {naFila.length > 0 && (
        <section className="rounded-lg border">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div className="text-xs">
              <strong>{naFila.length} movimento(s) para conferir</strong>
              {ambiguas > 0 && (
                <span className="ml-2 text-amber-700 dark:text-amber-400">
                  {ambiguas} com mais de um lançamento possível — escolha qual.
                </span>
              )}
            </div>
            <button onClick={() => confirmar.mutate()} disabled={marcados === 0 || confirmar.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
              {confirmar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Conciliar {marcados} selecionado(s)
            </button>
          </header>

          <ul className="divide-y">
            {naFila.map((s) => (
              <LinhaDaFila key={s.transacao_id} s={s}
                escolhido={escolhas[s.transacao_id] ?? null}
                aoEscolher={(lancamentoId) => {
                  setEscolhas((prev) => {
                    const novo = { ...prev };
                    if (lancamentoId === null || novo[s.transacao_id] === lancamentoId) {
                      delete novo[s.transacao_id];
                    } else {
                      novo[s.transacao_id] = lancamentoId;
                    }
                    return novo;
                  });
                }}
                aoIgnorar={() => acao.mutate({ tipo: 'ignorar', id: s.transacao_id })} />
            ))}
          </ul>
        </section>
      )}

      {/* ---------- o que já saiu da fila ---------- */}
      {(conciliados.length > 0 || ignorados.length > 0) && (
        <section className="rounded-lg border">
          <header className="border-b px-3 py-2 text-xs font-medium">
            Já conferidos no período
          </header>
          <ul className="divide-y text-xs">
            {conciliados.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="text-muted-foreground">{dataBR(m.data)}</span>{' '}
                  {m.descricao || '—'} → <strong>{m.lancamento ?? '—'}</strong>
                </span>
                <span className="flex items-center gap-2">
                  <span className={m.tipo === 'credito' ? 'text-emerald-600' : 'text-red-600'}>
                    {m.tipo === 'credito' ? '+' : '−'} {reaisExatos(m.valor)}
                  </span>
                  <button onClick={() => acao.mutate({ tipo: 'desfazer', id: m.id })}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"
                    title="Desfazer a conciliação e reabrir o lançamento">
                    <Undo2 className="h-3 w-3" /> Desfazer
                  </button>
                </span>
              </li>
            ))}
            {ignorados.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-muted-foreground">
                <span>
                  {dataBR(m.data)} {m.descricao || '—'}
                  <span className="ml-1 italic">— ignorado{m.motivo_ignorada ? `: ${m.motivo_ignorada}` : ''}</span>
                </span>
                <button onClick={() => acao.mutate({ tipo: 'voltar', id: m.id })}
                  className="rounded-md border px-2 py-1 hover:bg-accent">
                  Voltar para a fila
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LinhaDaFila({
  s, escolhido, aoEscolher, aoIgnorar,
}: {
  s: SugestaoDaConciliacao;
  escolhido: string | null;
  aoEscolher: (lancamentoId: string | null) => void;
  aoIgnorar: () => void;
}) {
  const unico = s.quantos === 1;
  return (
    <li className={`px-3 py-2 text-xs ${s.ambigua ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="text-muted-foreground">{dataBR(s.data)}</span>{' '}
          {s.descricao || 'Sem descrição no extrato'}
        </span>
        <span className="flex items-center gap-2">
          <span className={s.tipo === 'credito' ? 'text-emerald-600' : 'text-red-600'}>
            {s.tipo === 'credito' ? '+' : '−'} {reaisExatos(s.valor)}
          </span>
          <button onClick={aoIgnorar}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"
            title="Não é da Dash: tarifa, transferência entre contas próprias…">
            <EyeOff className="h-3 w-3" /> Ignorar
          </button>
        </span>
      </div>

      {s.sem_candidato && (
        <p className="mt-1 text-muted-foreground">
          Nenhum lançamento em aberto com este valor e esta data. Lance à mão ou ignore.
        </p>
      )}

      {s.quantos > 0 && (
        <ul className="mt-1.5 space-y-1">
          {s.candidatos.map((c) => (
            <li key={c.lancamento_id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 hover:bg-accent">
                <input
                  type={unico ? 'checkbox' : 'radio'}
                  name={`sug-${s.transacao_id}`}
                  checked={escolhido === c.lancamento_id}
                  onChange={() => aoEscolher(c.lancamento_id)}
                  className="h-3.5 w-3.5" />
                <span className="flex-1">{c.descricao}</span>
                <span className="text-muted-foreground">
                  vence {dataBR(c.vencimento)}
                  {c.distancia_dias > 0 && ` · ${c.distancia_dias} dia(s) de diferença`}
                </span>
                <span>{reaisExatos(c.valor)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {s.ambigua && (
        <p className="mt-1 flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {s.quantos} lançamentos têm este valor. A tela não escolhe por você — marque o certo,
          ou deixe para depois de conferir no banco.
        </p>
      )}
    </li>
  );
}
