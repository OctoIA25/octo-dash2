/**
 * Financeiro › fase 1 (P4.5).
 *
 * Quatro visões: a receber, a pagar, fluxo de caixa e DRE gerencial — mais a
 * exportação para o contador. O balancete fica com o contador, como o plano diz.
 *
 * O que dá o tom da tela: quase nada aqui é digitado. A venda do P4.4 gera o
 * "a receber", os repasses geram os "a pagar" e o imposto gera o dele. O que
 * se digita são as contas da casa — aluguel, sistemas, pessoal.
 *
 * E a distinção que a tela repete em letra, porque é a que mais confunde:
 * COMPETÊNCIA é o mês do resultado, CAIXA é o dia do dinheiro. A venda de
 * setembro recebida em outubro é resultado de setembro e caixa de outubro.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Check, Download, Info, Loader2, Lock, Plus, Undo2, X,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { useToast } from '@/hooks/use-toast';
import {
  ROTULO_DA_ORIGEM, avisoDeVencidos, avisoSemConta, csvParaContador, dreFecha,
  eAutomatico, nomeDoArquivo, primeiroDiaNoVermelho, reaisExatos, saldoAoFim,
  type Dre, type FluxoDeCaixa, type Lancamento, type LinhaDoDre,
  type ListaDeLancamentos, type TipoDeLancamento,
} from './financeiro';
import {
  baixar, baixarArquivo, cancelar, carregarContasBancarias, carregarDre,
  carregarExportacao, carregarFluxo, carregarLancamentos, carregarPlanoDeContas,
  lancar, salvarContaBancaria,
} from './financeiroService';

type Aba = 'receber' | 'pagar' | 'fluxo' | 'dre';

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDoMes = () => `${new Date().toISOString().slice(0, 7)}-01`;
const ultimoDoMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};
const dataBR = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

const inputCls = 'h-8 rounded-md border bg-background px-2 text-xs';

export function FinanceiroPage() {
  const { tenantId } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [aba, setAba] = useState<Aba>('receber');
  const [de, setDe] = useState(primeiroDoMes);
  const [ate, setAte] = useState(ultimoDoMes);
  const [gran, setGran] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [centroCusto, setCentroCusto] = useState('');
  const [novo, setNovo] = useState<TipoDeLancamento | null>(null);

  const ehLista = aba === 'receber' || aba === 'pagar';

  const lista = useQuery({
    queryKey: ['fin-lancamentos', tenantId, de, ate, aba, centroCusto],
    queryFn: () => carregarLancamentos(tenantId!, {
      de, ate, tipo: aba === 'receber' ? 'receber' : 'pagar', centroCusto,
    }),
    enabled: !!tenantId && tenantId !== 'owner' && ehLista,
  });

  const dre = useQuery({
    queryKey: ['fin-dre', tenantId, de, ate, centroCusto],
    queryFn: () => carregarDre(tenantId!, de, ate, centroCusto),
    enabled: !!tenantId && tenantId !== 'owner' && aba === 'dre',
  });

  const fluxo = useQuery({
    queryKey: ['fin-fluxo', tenantId, de, ate, gran],
    queryFn: () => carregarFluxo(tenantId!, de, ate, gran),
    enabled: !!tenantId && tenantId !== 'owner' && aba === 'fluxo',
  });

  const plano = useQuery({
    queryKey: ['fin-plano', tenantId],
    queryFn: () => carregarPlanoDeContas(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const contas = useQuery({
    queryKey: ['fin-bancos', tenantId],
    queryFn: () => carregarContasBancarias(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner' && aba === 'fluxo',
  });

  const exportar = useMutation({
    mutationFn: async () => {
      const r = await carregarExportacao(tenantId!, de, ate);
      baixarArquivo(csvParaContador(r.linhas), nomeDoArquivo(r.de, r.ate));
      return r.linhas.length;
    },
    onSuccess: (n) => toast({
      title: `${n} lançamento(s) exportados`,
      description: 'O arquivo abre no Excel com todas as colunas.',
    }),
    onError: (e: Error) => toast({ title: 'Não deu para exportar', description: e.message, variant: 'destructive' }),
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['fin-lancamentos'] });
    qc.invalidateQueries({ queryKey: ['fin-dre'] });
    qc.invalidateQueries({ queryKey: ['fin-fluxo'] });
  };

  const acao = useMutation({
    mutationFn: async (a: { tipo: 'baixar' | 'desfazer' | 'cancelar'; l: Lancamento }) => {
      if (a.tipo === 'baixar') return baixar(a.l.id, hoje(), a.l.valor);
      if (a.tipo === 'desfazer') return baixar(a.l.id, null, null);
      return cancelar(a.l.id);
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast({ title: 'Não deu para concluir', description: e.message, variant: 'destructive' }),
  });

  const centros = useMemo(() => {
    const s = new Set<string>();
    (lista.data?.linhas ?? []).forEach((l) => { if (l.centro_custo) s.add(l.centro_custo); });
    return [...s].sort();
  }, [lista.data]);

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária para abrir o Financeiro.</p>;
  }

  const recusado = (q: { isSuccess: boolean; data: unknown }) => q.isSuccess && q.data === null;
  const semAcesso = recusado(lista) || recusado(dre) || recusado(fluxo);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Financeiro</h1>
          <p className="text-xs text-muted-foreground">
            A venda gera o “a receber”, os repasses geram os “a pagar”. Aqui se lança o que é da casa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ehLista && (
            <button onClick={() => setNovo(aba === 'receber' ? 'receber' : 'pagar')}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
              <Plus className="h-3.5 w-3.5" /> Novo lançamento
            </button>
          )}
          <button onClick={() => exportar.mutate()} disabled={exportar.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            {exportar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar para o contador
          </button>
        </div>
      </header>

      <nav className="mb-4 flex flex-wrap gap-1 border-b">
        {([
          ['receber', 'A receber'],
          ['pagar', 'A pagar'],
          ['fluxo', 'Fluxo de caixa'],
          ['dre', 'DRE gerencial'],
        ] as Array<[Aba, string]>).map(([id, rotulo]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              aba === id ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {rotulo}
          </button>
        ))}
      </nav>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Campo rotulo="De">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputCls} />
        </Campo>
        {aba === 'fluxo' && (
          <Campo rotulo="Agrupar por">
            <select value={gran} onChange={(e) => setGran(e.target.value as typeof gran)} className={inputCls}>
              <option value="dia">Dia</option>
              <option value="semana">Semana</option>
              <option value="mes">Mês</option>
            </select>
          </Campo>
        )}
        {aba !== 'fluxo' && (
          <Campo rotulo="Centro de custo">
            <select value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {centros.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
        )}
      </div>

      {semAcesso && (
        <Aviso tom="amber">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>O Financeiro é de quem cuida do dinheiro.</strong> A sua conta não é administradora
            desta imobiliária, então o banco recusa a leitura — e a tela prefere dizer isso a mostrar
            um financeiro vazio.
          </span>
        </Aviso>
      )}

      {ehLista && <Lista q={lista} aba={aba} acao={acao} />}
      {aba === 'dre' && <PainelDre q={dre} />}
      {aba === 'fluxo' && <PainelFluxo q={fluxo} temConta={(contas.data ?? []).length > 0}
        aoCriarConta={async (nome, saldo) => {
          await salvarContaBancaria(tenantId, { nome, banco: '', saldoInicial: saldo });
          qc.invalidateQueries({ queryKey: ['fin-bancos'] });
          qc.invalidateQueries({ queryKey: ['fin-fluxo'] });
        }} />}

      {novo && (
        <NovoLancamentoModal
          tipo={novo}
          contas={(plano.data ?? []).filter((c) => !c.e_grupo)}
          de={de}
          onFechar={() => setNovo(null)}
          onSalvar={async (dados) => {
            const r = await lancar(tenantId, dados);
            toast({ title: r.criados > 1 ? `${r.criados} lançamentos criados` : 'Lançamento criado' });
            setNovo(null);
            invalidar();
          }}
        />
      )}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

function Aviso({ tom, children }: { tom: 'rose' | 'amber' | 'neutro'; children: React.ReactNode }) {
  const cls = tom === 'rose'
    ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
    : tom === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
      : 'text-muted-foreground';
  return <p className={`mb-3 flex items-start gap-2 rounded-md border p-2.5 text-xs ${cls}`}>{children}</p>;
}

function Total({ rotulo, valor, nota, forte }: { rotulo: string; valor: string; nota?: string; forte?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={`tabular-nums ${forte ? 'text-sm font-semibold' : 'text-sm'}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[10px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Carregando() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
    </p>
  );
}

// ------------------------------------------------------------
// A receber / A pagar
// ------------------------------------------------------------
function Lista({
  q, aba, acao,
}: {
  q: { isLoading: boolean; isError: boolean; error: unknown; data: ListaDeLancamentos | null | undefined };
  aba: 'receber' | 'pagar';
  acao: { mutate: (a: { tipo: 'baixar' | 'desfazer' | 'cancelar'; l: Lancamento }) => void; isPending: boolean };
}) {
  if (q.isLoading) return <Carregando />;
  if (q.isError) {
    return <Aviso tom="rose"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>Não deu para ler os lançamentos: {(q.error as Error)?.message}</span></Aviso>;
  }
  const dados = q.data;
  if (!dados) return null;

  const t = dados.totais;
  const vencidos = avisoDeVencidos(t);
  const semConta = avisoSemConta(t);
  const ehReceber = aba === 'receber';

  return (
    <>
      {vencidos && (
        <Aviso tom="rose"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{vencidos}</span></Aviso>
      )}
      {semConta && (
        <Aviso tom="amber"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{semConta}</span></Aviso>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[820px] text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Vencimento</th>
              <th className="px-3 py-2">Histórico</th>
              <th className="px-3 py-2">Conta</th>
              <th className="px-3 py-2">Origem</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dados.linhas.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                Nada {ehReceber ? 'a receber' : 'a pagar'} no período.
                {ehReceber && ' O “a receber” aparece sozinho quando uma proposta é assinada.'}
              </td></tr>
            )}
            {dados.linhas.map((l) => (
              <tr key={l.id} className={l.vencido ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {dataBR(l.vencimento)}
                  {l.dias_de_atraso != null && (
                    <span className="ml-1 text-[10px] text-rose-700 dark:text-rose-300">
                      {l.dias_de_atraso}d
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {l.descricao || '—'}
                  {l.centro_custo && <span className="ml-1 text-muted-foreground">· {l.centro_custo}</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {l.conta_codigo ? `${l.conta_codigo} ${l.conta_nome}` : 'sem conta'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {ROTULO_DA_ORIGEM[l.origem]}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{reaisExatos(l.valor)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {l.status === 'baixado' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <Check className="h-3 w-3" /> {dataBR(l.pago_em)}
                    </span>
                  ) : (
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      l.vencido
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {l.vencido ? 'Vencido' : 'Em aberto'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {l.status === 'baixado' ? (
                    <button onClick={() => acao.mutate({ tipo: 'desfazer', l })} disabled={acao.isPending}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50">
                      <Undo2 className="h-3 w-3" /> desfazer
                    </button>
                  ) : (
                    <button onClick={() => acao.mutate({ tipo: 'baixar', l })} disabled={acao.isPending}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-50">
                      {ehReceber ? 'receber' : 'pagar'}
                    </button>
                  )}
                  {!eAutomatico(l) && l.status !== 'baixado' && (
                    <button onClick={() => acao.mutate({ tipo: 'cancelar', l })} disabled={acao.isPending}
                      className="ml-1 rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent disabled:opacity-50">
                      cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Total rotulo={ehReceber ? 'A receber' : 'A pagar'}
          valor={reaisExatos(ehReceber ? t.a_receber : t.a_pagar)} forte />
        <Total rotulo={ehReceber ? 'Recebido' : 'Pago'}
          valor={reaisExatos(ehReceber ? t.recebido : t.pago)} />
        <Total rotulo="Vencido" valor={reaisExatos(t.valor_vencido)}
          nota={t.vencidos > 0 ? `${t.vencidos} lançamento(s)` : undefined} />
        <Total rotulo="Lançamentos" valor={String(t.lancamentos)} />
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        A lista é por <strong>vencimento</strong>, que é o que a cobrança olha. O DRE é por
        competência — a venda de setembro recebida em outubro é resultado de setembro.
      </p>
    </>
  );
}

// ------------------------------------------------------------
// DRE
// ------------------------------------------------------------
function PainelDre({ q }: { q: { isLoading: boolean; isError: boolean; error: unknown; data: unknown } }) {
  if (q.isLoading) return <Carregando />;
  if (q.isError) {
    return <Aviso tom="rose"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>Não deu para ler o DRE: {(q.error as Error)?.message}</span></Aviso>;
  }
  const d = q.data as Dre | null;
  if (!d) return null;

  const fecha = dreFecha(d);
  const semConta = avisoSemConta({ sem_conta: d.totais.sem_conta, lancamentos: d.totais.lancamentos });
  const receitas = d.linhas.filter((l) => l.tipo === 'receita');
  const despesas = d.linhas.filter((l) => l.tipo === 'despesa');

  return (
    <>
      {!fecha.fecha && (
        <Aviso tom="rose"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>O DRE não fecha em {fecha.campo}:</strong> a soma das linhas dá{' '}
            {reaisExatos(fecha.soma)} e o total mostra {reaisExatos(fecha.rodape)}. Não use este
            resultado até isto ser resolvido.
          </span></Aviso>
      )}
      {semConta && (
        <Aviso tom="amber"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{semConta}</span></Aviso>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[520px] text-xs">
          <tbody className="divide-y">
            <Grupo titulo="Receitas" linhas={receitas} total={d.totais.receitas} />
            <Grupo titulo="Despesas" linhas={despesas} total={d.totais.despesas} negativo />
            <tr className="border-t-2 bg-muted/40 font-semibold">
              <td className="px-3 py-2.5">Resultado do período</td>
              <td className="px-3 py-2.5 text-right tabular-nums"></td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${
                d.totais.resultado < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
              }`}>
                {reaisExatos(d.totais.resultado)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Por <strong>competência</strong>: cada lançamento conta no mês a que pertence, tenha ou não
        sido pago. É o resultado do período, não o caixa dele — para o caixa, veja Fluxo de caixa.
      </p>
    </>
  );
}

function Grupo({
  titulo, linhas, total, negativo,
}: {
  titulo: string;
  linhas: LinhaDoDre[];
  total: number;
  negativo?: boolean;
}) {
  return (
    <>
      <tr className="bg-muted/30">
        <td className="px-3 py-2 font-semibold" colSpan={2}>{titulo}</td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums">
          {negativo ? `(${reaisExatos(total)})` : reaisExatos(total)}
        </td>
      </tr>
      {linhas.length === 0 && (
        <tr><td className="px-3 py-2 pl-6 text-muted-foreground" colSpan={3}>Nada no período.</td></tr>
      )}
      {linhas.map((l) => (
        <tr key={l.codigo}>
          <td className="px-3 py-1.5 pl-6">
            <span className="text-muted-foreground">{l.codigo}</span> {l.nome}
          </td>
          <td className="px-3 py-1.5 text-right text-muted-foreground">{l.lancamentos}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{reaisExatos(l.total)}</td>
        </tr>
      ))}
    </>
  );
}

// ------------------------------------------------------------
// Fluxo de caixa
// ------------------------------------------------------------
function PainelFluxo({
  q, temConta, aoCriarConta,
}: {
  q: { isLoading: boolean; isError: boolean; error: unknown; data: unknown };
  temConta: boolean;
  aoCriarConta: (nome: string, saldo: number) => Promise<void>;
}) {
  const [nome, setNome] = useState('Conta corrente');
  const [saldo, setSaldo] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (q.isLoading) return <Carregando />;
  if (q.isError) {
    return <Aviso tom="rose"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>Não deu para ler o fluxo: {(q.error as Error)?.message}</span></Aviso>;
  }
  const f = q.data as FluxoDeCaixa | null;
  if (!f) return null;

  const vermelho = primeiroDiaNoVermelho(f);
  const fim = saldoAoFim(f);

  return (
    <>
      {!temConta && (
        <Aviso tom="amber">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex flex-wrap items-center gap-2">
            <span>
              <strong>Não há conta bancária cadastrada</strong>, então o saldo abaixo conta só o que
              passou pela Dash — não o dinheiro que está no banco. Visto na tela em 21/09: sem a
              conta, o saldo inicial aparecia negativo porque só havia repasse pago no histórico.
            </span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da conta"
              className={inputCls} aria-label="Nome da conta" />
            <input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)}
              placeholder="Saldo hoje" className={inputCls} aria-label="Saldo inicial" />
            <button
              disabled={salvando || !nome.trim()}
              onClick={async () => {
                setSalvando(true);
                try { await aoCriarConta(nome.trim(), Number(saldo.replace(',', '.')) || 0); }
                finally { setSalvando(false); }
              }}
              className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Cadastrar'}
            </button>
          </span>
        </Aviso>
      )}

      {vermelho && (
        <Aviso tom="rose"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Pelo previsto, o saldo fica negativo em {dataBR(vermelho)}.</strong> É o que está
            marcado para vencer, não o que já saiu — dá tempo de negociar prazo.
          </span></Aviso>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Total rotulo="Saldo no início" valor={reaisExatos(f.saldo_inicial)}
          nota="contas bancárias + o que já foi baixado antes do período" />
        <Total rotulo="Saldo no fim" valor={reaisExatos(fim ?? 0)} forte
          nota="só o que foi realmente baixado" />
        <Total rotulo="Agrupado por" valor={f.granularidade === 'dia' ? 'Dia' : f.granularidade === 'semana' ? 'Semana' : 'Mês'} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2 text-right">Previsto entra</th>
              <th className="px-3 py-2 text-right">Previsto sai</th>
              <th className="px-3 py-2 text-right">Entrou</th>
              <th className="px-3 py-2 text-right">Saiu</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {f.linhas.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                Sem movimento no período.
              </td></tr>
            )}
            {f.linhas
              .filter((p) => p.previsto_entrada || p.previsto_saida || p.entrada || p.saida)
              .map((p) => (
                <tr key={p.quando}>
                  <td className="px-3 py-2 whitespace-nowrap">{dataBR(p.quando)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {p.previsto_entrada ? reaisExatos(p.previsto_entrada) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {p.previsto_saida ? reaisExatos(p.previsto_saida) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.entrada ? reaisExatos(p.entrada) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.saida ? reaisExatos(p.saida) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                    p.saldo < 0 ? 'text-rose-700 dark:text-rose-300' : ''
                  }`}>
                    {reaisExatos(p.saldo)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        <strong>Previsto</strong> é pelo vencimento; <strong>entrou/saiu</strong> e o saldo, pela data
        da baixa. Os dias sem movimento nenhum ficam fora da lista.
      </p>
    </>
  );
}

// ------------------------------------------------------------
// Novo lançamento manual
// ------------------------------------------------------------
function NovoLancamentoModal({
  tipo, contas, de, onFechar, onSalvar,
}: {
  tipo: TipoDeLancamento;
  contas: Array<{ id: string; codigo: string; nome: string; tipo: 'receita' | 'despesa' }>;
  de: string;
  onFechar: () => void;
  onSalvar: (d: import('./financeiroService').NovoLancamento) => Promise<void>;
}) {
  useEscapeFecha(onFechar);
  const { toast } = useToast();

  const doTipo = contas.filter((c) => c.tipo === (tipo === 'receber' ? 'receita' : 'despesa'));
  const [contaId, setContaId] = useState(doTipo[0]?.id ?? '');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [competencia, setCompetencia] = useState(`${de.slice(0, 7)}-01`);
  const [vencimento, setVencimento] = useState('');
  const [centroCusto, setCentroCusto] = useState('');
  const [repetir, setRepetir] = useState(0);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const n = Number(valor.replace(/\./g, '').replace(',', '.'));
    if (!(n > 0)) {
      toast({ title: 'Informe um valor maior que zero', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    try {
      await onSalvar({
        tipo, contaId: contaId || null, descricao, valor: n,
        competencia, vencimento: vencimento || null,
        centroCusto, observacao: '', repetirMeses: repetir,
      });
    } catch (e) {
      toast({ title: 'Não deu para lançar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onFechar} role="presentation">
      <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog"
        aria-label={tipo === 'receber' ? 'Novo a receber' : 'Novo a pagar'}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {tipo === 'receber' ? 'Novo a receber' : 'Novo a pagar'}
          </h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-[11px] text-muted-foreground">
          A comissão da venda, o repasse e o imposto entram sozinhos. Aqui se lança o que é da casa —
          aluguel, sistemas, pessoal.
        </p>

        <div className="grid gap-2.5">
          <Campo rotulo="Conta do plano">
            <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={inputCls}>
              <option value="">Sem conta</option>
              {doTipo.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Histórico">
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls}
              placeholder="Ex.: aluguel da sala" />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Valor">
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)}
                className={inputCls} placeholder="0,00" />
            </Campo>
            <Campo rotulo="Centro de custo">
              <input value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)}
                className={inputCls} placeholder="opcional" />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Competência (mês)">
              <input type="date" value={competencia} onChange={(e) => setCompetencia(e.target.value)}
                className={inputCls} />
            </Campo>
            <Campo rotulo="Vencimento">
              <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)}
                className={inputCls} />
            </Campo>
          </div>
          <Campo rotulo="Repetir nos próximos meses">
            <select value={repetir} onChange={(e) => setRepetir(Number(e.target.value))} className={inputCls}>
              <option value={0}>Não repetir</option>
              <option value={2}>3 meses</option>
              <option value={5}>6 meses</option>
              <option value={11}>12 meses</option>
            </select>
          </Campo>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Lançar
          </button>
        </div>
      </div>
    </div>
  );
}
