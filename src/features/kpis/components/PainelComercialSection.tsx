/**
 * Início › Painel comercial (P3.1).
 *
 * Oito contadores, cada um com legenda, comparação com o mês anterior e com o
 * mesmo mês do ano anterior, e o filtro Todos · Lançamentos · Prontos/Terceiros.
 *
 * O QUE ESTA TELA SE RECUSA A FAZER: mostrar número redondo em cima de dado
 * incompleto. Das 37 vendas reais da Lotus, 8 têm comissão e nenhum VGV —
 * incluí-las no ticket médio o derruba 28% e ele continua parecendo exato. Aqui
 * elas ficam de fora do que depende de VGV, e a tela diz que ficaram.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Loader2, Minus } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { carregarPainel } from '../services/painelComercialService';
import {
  ROTULO_DO_TIPO, avisoDeClassificacao, avisoDeVgv, contraMeta, percentual,
  produtividade, reais, variacao, type PainelComercial, type Variacao,
} from '../utils/painelComercial';

type Tipo = 'todos' | 'lancamento' | 'terceiros';

export function PainelComercialSection() {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId;
  const [tipo, setTipo] = useState<Tipo>('todos');
  const [mes, setMes] = useState<string>(() => new Date().toISOString().slice(0, 7));

  const de = `${mes}-01`;
  const ate = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).toISOString().slice(0, 10);

  const { data: p, isLoading, isError, error } = useQuery({
    queryKey: ['painel-comercial', tenantId, mes, tipo],
    queryFn: () => carregarPainel(tenantId!, { de, ate, tipo }),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-4 text-sm text-muted-foreground">Escolha uma imobiliária.</p>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Painel comercial</h1>
          <p className="text-sm text-muted-foreground">
            Vendas, VGV e comissão do período — com o que ficou de fora dito em cada contador.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
          <div className="flex gap-1">
            {(['todos', 'lancamento', 'terceiros'] as Tipo[]).map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  tipo === t ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'
                }`}
              >
                {ROTULO_DO_TIPO[t]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {isError && (
        <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
          Não deu para ler o painel: {(error as Error)?.message ?? 'erro desconhecido'}
        </p>
      )}

      {p && <Contadores p={p} tipo={tipo} />}
    </div>
  );
}

function Contadores({ p, tipo }: { p: PainelComercial; tipo: Tipo }) {
  const a = p.atual;
  const avisoVgv = avisoDeVgv(a);
  const avisoClasse = avisoDeClassificacao(a, tipo);
  const prod = produtividade(a.nomes_que_venderam, a.nomes_reconhecidos, p.ativos);
  const metaVendas = contraMeta(a.vendas, p.metas?.vendas);
  const metaPropostas = contraMeta(p.propostas, p.metas?.propostas);
  const metaVgc = contraMeta(a.vgc, p.metas?.vgc);

  return (
    <>
      {(avisoVgv || avisoClasse) && (
        <div className="space-y-1.5">
          {[avisoVgv, avisoClasse].filter(Boolean).map((t) => (
            <p
              key={t}
              className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          rotulo="Vendas × meta"
          valor={String(a.vendas)}
          legenda="Vendas com data de assinatura no período, como vêm da planilha comercial."
          meta={metaVendas}
          mesAnterior={variacao(a.vendas, p.mes_anterior?.vendas)}
          anoAnterior={variacao(a.vendas, p.ano_anterior?.vendas)}
        />
        <Card
          rotulo="VGV vendido"
          valor={reais(a.vgv)}
          legenda="Soma do valor das vendas. As vendas sem VGV registrado somam zero aqui."
          mesAnterior={variacao(a.vgv, p.mes_anterior?.vgv)}
          anoAnterior={variacao(a.vgv, p.ano_anterior?.vgv)}
        />
        <Card
          rotulo="Ticket médio"
          valor={reais(a.ticket_medio)}
          legenda={`VGV dividido pelas ${a.vendas_com_vgv} vendas que têm VGV registrado — não por todas.`}
          mesAnterior={variacao(a.ticket_medio, p.mes_anterior?.ticket_medio)}
          anoAnterior={variacao(a.ticket_medio, p.ano_anterior?.ticket_medio)}
        />
        <Card
          rotulo="% comissão sobre VGV"
          valor={percentual(a.pct_comissao, 2)}
          legenda="Comissão dividida pelo VGV, contando só as vendas que têm os dois."
          mesAnterior={variacao(a.pct_comissao, p.mes_anterior?.pct_comissao)}
          anoAnterior={variacao(a.pct_comissao, p.ano_anterior?.pct_comissao)}
        />
        <Card
          rotulo="VGC × previsto"
          valor={reais(a.vgc)}
          legenda="Comissão do período. Todas as vendas somam aqui, inclusive as sem VGV."
          meta={metaVgc}
          mesAnterior={variacao(a.vgc, p.mes_anterior?.vgc)}
          anoAnterior={variacao(a.vgc, p.ano_anterior?.vgc)}
        />
        <Card
          rotulo="Produtivos"
          valor={prod.pct == null ? prod.texto : `${prod.pct}%`}
          legenda={
            prod.explicacao ??
            'Corretores que venderam no período, sobre os membros cadastrados na imobiliária.'
          }
          nota={prod.explicacao ?? prod.texto}
          mesAnterior={variacao(a.nomes_que_venderam, p.mes_anterior?.nomes_que_venderam)}
          anoAnterior={variacao(a.nomes_que_venderam, p.ano_anterior?.nomes_que_venderam)}
        />
        <Card
          rotulo="Análises × meta"
          valor={String(p.propostas)}
          legenda="Propostas criadas no período."
          meta={metaPropostas}
        />
        <Card
          rotulo="Projeção do mês"
          valor={p.projecao?.vendas == null ? '—' : `${p.projecao.vendas} vendas`}
          legenda={
            p.projecao
              ? `No ritmo dos ${p.projecao.dias_uteis_decorridos} dias úteis já corridos, aplicado aos ${p.projecao.dias_uteis_no_mes} do mês. Feriado não é descontado.`
              : 'Só faz sentido no mês corrente — em período escolhido à mão, não há mês para projetar.'
          }
          nota={p.projecao?.vgv == null ? undefined : reais(p.projecao.vgv)}
        />
      </div>

      {p.metas?.cadastradas === 0 && (
        <p className="flex items-start gap-2 rounded-md border p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Nenhuma meta cadastrada para este período. Os contadores de meta ficam vazios até alguém
          cadastrar em <strong className="mx-1">Metas</strong> — e passam a funcionar sozinhos a partir daí.
        </p>
      )}
    </>
  );
}

function Seta({ v, rotulo }: { v: Variacao; rotulo: string }) {
  const cor =
    v.direcao === 'subiu'
      ? 'text-emerald-600 dark:text-emerald-400'
      : v.direcao === 'caiu'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground';
  const Icone = v.direcao === 'subiu' ? ArrowUpRight : v.direcao === 'caiu' ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 ${cor}`}>
      <Icone className="h-3 w-3" />
      {v.texto}
      <span className="text-muted-foreground"> {rotulo}</span>
    </span>
  );
}

function Card({
  rotulo,
  valor,
  legenda,
  nota,
  meta,
  mesAnterior,
  anoAnterior,
}: {
  rotulo: string;
  valor: string;
  legenda: string;
  nota?: string;
  meta?: ReturnType<typeof contraMeta>;
  mesAnterior?: Variacao;
  anoAnterior?: Variacao;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
        {/* O (i) que o plano pede em cada contador: a legenda diz o que entra
            e o que não entra, que é onde os números costumam mentir. */}
        <span title={legenda} className="cursor-help">
          <Info className="h-3 w-3" />
        </span>
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{nota}</p>}
      {meta && (
        <p className={`mt-1 text-[11px] ${meta.semMeta ? 'text-muted-foreground' : ''}`}>
          {meta.semMeta ? (
            meta.texto
          ) : (
            <>
              <span className="inline-block h-1.5 w-full rounded-full bg-muted align-middle">
                <span
                  className="block h-1.5 rounded-full bg-primary"
                  style={{ width: `${Math.min(100, meta.pct ?? 0)}%` }}
                />
              </span>
              <span className="mt-0.5 block">{meta.texto}</span>
            </>
          )}
        </p>
      )}
      {(mesAnterior || anoAnterior) && (
        <p className="mt-1 flex flex-wrap gap-x-2 text-[11px]">
          {mesAnterior && <Seta v={mesAnterior} rotulo="vs mês anterior" />}
          {anoAnterior && <Seta v={anoAnterior} rotulo="vs ano anterior" />}
        </p>
      )}
    </div>
  );
}
