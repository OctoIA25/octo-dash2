/**
 * Financeiro › Projeção 90 dias — a "Planilha Rolling 90d" do chefe (03/10/2026).
 *
 * Nada aqui é digitado de novo: as parcelas vêm das vendas, as contas fixas são
 * as recorrentes já lançadas, os repasses vêm da folha. A tela agrupa pelas
 * semanas que restam do mês e pelos dois meses seguintes, e leva o saldo de uma
 * coluna para a outra. O que é ESTIMADO diz que é, com a regra embaixo.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hojeSP } from '@/lib/dataSP';
import { reaisExatos } from './financeiro';
import {
  ENTRADAS, ROTULO_DA_LINHA, SAIDAS, lerValor, linhaVisivel, montarProjecao,
  type ColunaCalculada, type LinhaDaProjecao, type ValoresDaColuna,
} from './projecao';
import {
  carregarContasBancarias, carregarProjecao, definirAlerta, salvarContaBancaria,
} from './financeiroService';

const inputCls = 'h-8 rounded-md border bg-background px-2 text-xs';
const celula = 'px-3 py-1.5 text-right tabular-nums whitespace-nowrap';
const dataBR = (d: string | null | undefined) =>
  d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
const ESTIMADAS: LinhaDaProjecao[] = ['repasses_estimados', 'provisoes'];

export function ProjecaoPanel({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const projecao = useQuery({
    queryKey: ['fin-projecao', tenantId],
    queryFn: () => carregarProjecao(tenantId),
  });
  const contas = useQuery({
    queryKey: ['fin-bancos', tenantId],
    queryFn: () => carregarContasBancarias(tenantId),
  });

  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [contaId, setContaId] = useState('');
  const [saldoTexto, setSaldoTexto] = useState('');
  const [saldoEm, setSaldoEm] = useState(hojeSP);
  const [alertaTexto, setAlertaTexto] = useState<string | null>(null);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['fin-projecao'] });
    qc.invalidateQueries({ queryKey: ['fin-bancos'] });
    qc.invalidateQueries({ queryKey: ['fin-fluxo'] });
  };

  const salvarSaldo = useMutation({
    mutationFn: async () => {
      const valor = lerValor(saldoTexto);
      if (valor == null) throw new Error('Informe o saldo da conta.');
      const lista = contas.data ?? [];
      const conta = lista.find((c) => c.id === contaId) ?? lista[0];
      // Sem conta cadastrada, nasce a "Inter": é a conta da casa (pedido de 23/09).
      return salvarContaBancaria(tenantId, {
        id: conta?.id, nome: conta?.nome ?? 'Inter', banco: conta?.banco ?? 'Inter',
        saldoInicial: valor, saldoEm,
      });
    },
    onSuccess: () => { setEditandoSaldo(false); recarregar(); },
    onError: (e: Error) => toast({ title: 'Não deu para salvar o saldo', description: e.message, variant: 'destructive' }),
  });

  const salvarAlerta = useMutation({
    mutationFn: (texto: string) => definirAlerta(tenantId, lerValor(texto)),
    onSuccess: () => { setAlertaTexto(null); recarregar(); },
    onError: (e: Error) => toast({ title: 'Não deu para salvar o alerta', description: e.message, variant: 'destructive' }),
  });

  if (projecao.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando a projeção…
      </p>
    );
  }
  if (projecao.isError) {
    return (
      <p className="text-sm text-rose-700 dark:text-rose-300">
        Não deu para calcular a projeção: {(projecao.error as Error).message}
      </p>
    );
  }
  const p = projecao.data;
  if (!p) {
    return <p className="text-sm text-muted-foreground">A projeção é de quem cuida do dinheiro desta imobiliária.</p>;
  }

  const colunas = montarProjecao(p);
  const atrasado: ValoresDaColuna = p.atrasado ?? {};
  const qtdAtrasados = p.atrasado?.lancamentos ?? 0;
  const entradas = ENTRADAS.filter((l) => linhaVisivel(l, [...colunas, atrasado]));
  const saidas = SAIDAS.filter((l) => linhaVisivel(l, [...colunas, atrasado]));
  const ncol = colunas.length + 2;

  const abrirSaldo = () => {
    setSaldoTexto(p.tem_conta ? String(p.saldo_inicial).replace('.', ',') : '');
    setContaId((contas.data ?? [])[0]?.id ?? '');
    setSaldoEm(hojeSP());
    setEditandoSaldo(true);
  };

  return (
    <div className="space-y-3">
      {!p.tem_conta && !editandoSaldo && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Nenhuma conta bancária cadastrada: a projeção parte de R$ 0.
          <button onClick={abrirSaldo} className="font-medium underline">Informar o saldo de hoje</button>
        </p>
      )}

      {editandoSaldo && (
        <form
          onSubmit={(e) => { e.preventDefault(); salvarSaldo.mutate(); }}
          className="flex flex-wrap items-end gap-2 rounded-lg border p-3 text-xs"
        >
          {(contas.data ?? []).length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Conta</span>
              <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={inputCls}>
                {(contas.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo do extrato</span>
            <input autoFocus inputMode="decimal" value={saldoTexto} placeholder="150.000,00"
              onChange={(e) => setSaldoTexto(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">No fim do dia</span>
            <input type="date" max={hojeSP()} value={saldoEm} onChange={(e) => setSaldoEm(e.target.value)} className={inputCls} />
          </label>
          <button type="submit" disabled={salvarSaldo.isPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50">
            {salvarSaldo.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar saldo
          </button>
          <button type="button" onClick={() => setEditandoSaldo(false)} className="h-8 px-2 text-muted-foreground">Cancelar</button>
          <span className="basis-full text-[11px] text-muted-foreground">
            O que for baixado depois desse dia entra por cima do saldo; o que foi baixado até ele já está dentro.
          </span>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2">Linha</th>
              {colunas.map((c) => (
                <th key={c.id} className="px-3 py-2 text-right whitespace-nowrap">
                  {c.tipo === 'semana' ? `Semana ${c.rotulo}` : c.rotulo}
                </th>
              ))}
              <th className="px-3 py-2 text-right whitespace-nowrap text-amber-700 dark:text-amber-300"
                title="Vencido ou sem data. Fica fora do saldo.">
                Atrasado / sem data
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5">
                Saldo inicial (conta corrente)
                <button onClick={abrirSaldo} className="ml-2 text-[10px] underline">atualizar</button>
                {p.saldo_em && (
                  <span className="block text-[10px] text-muted-foreground">informado no fim de {dataBR(p.saldo_em)}</span>
                )}
              </td>
              {colunas.map((c) => <td key={c.id} className={celula}>{reaisExatos(c.saldoInicial)}</td>)}
              <td className={celula}>—</td>
            </tr>

            <Grupo titulo="(+) Entradas previstas" ncol={ncol} />
            {entradas.map((l) => <Linha key={l} linha={l} colunas={colunas} atrasado={atrasado} />)}

            <Grupo titulo="(−) Saídas previstas" ncol={ncol} />
            {saidas.map((l) => <Linha key={l} linha={l} colunas={colunas} atrasado={atrasado} />)}

            <tr className="font-semibold">
              <td className="px-3 py-1.5">Saldo final projetado</td>
              {colunas.map((c) => (
                <td key={c.id} className={`${celula} ${c.abaixoDoAlerta
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : ''}`}>
                  {reaisExatos(c.saldoFinal)}
                </td>
              ))}
              <td className={celula}>—</td>
            </tr>

            <tr>
              <td className="px-3 py-1.5">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
                Alerta se abaixo de
              </td>
              <td colSpan={colunas.length + 1} className="px-3 py-1.5">
                {alertaTexto == null ? (
                  <button onClick={() => setAlertaTexto(p.alerta == null ? '' : String(p.alerta).replace('.', ','))}
                    className="underline">
                    {p.alerta == null ? 'definir' : reaisExatos(p.alerta)}
                  </button>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); salvarAlerta.mutate(alertaTexto); }}
                    className="inline-flex items-center gap-1">
                    <input autoFocus inputMode="decimal" value={alertaTexto} placeholder="100.000,00"
                      onChange={(e) => setAlertaTexto(e.target.value)} className={inputCls} />
                    <button type="submit" disabled={salvarAlerta.isPending}
                      className="h-8 rounded-md bg-primary px-2 text-primary-foreground disabled:opacity-50">Salvar</button>
                    <button type="button" onClick={() => setAlertaTexto(null)} className="h-8 px-2 text-muted-foreground">Cancelar</button>
                  </form>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Estimado: comissão a pagar = {p.regras.repasse_estimado_pct}% da parcela de venda que ainda não tem a folha de
        repasse calculada; provisões = {String(p.regras.provisao_pct).replace('.', ',')}% da folha (1/12 de 13º + 1/12
        de férias com 1/3).
        {qtdAtrasados > 0 && (
          <> A coluna “Atrasado / sem data” tem {qtdAtrasados} lançamento(s)
            {p.atrasado.sem_data ? `, ${p.atrasado.sem_data} sem data` : ''} e não entra no saldo: dê a data na
            Conferência de vendas ou em A receber / A pagar.</>
        )}
      </p>
    </div>
  );
}

function Grupo({ titulo, ncol }: { titulo: string; ncol: number }) {
  return (
    <tr className="bg-muted/20">
      <td colSpan={ncol} className="px-3 py-1 text-[11px] font-semibold">{titulo}</td>
    </tr>
  );
}

function Linha({ linha, colunas, atrasado }: {
  linha: LinhaDaProjecao;
  colunas: ColunaCalculada[];
  atrasado: ValoresDaColuna;
}) {
  return (
    <tr className={ESTIMADAS.includes(linha) ? 'text-muted-foreground' : ''}>
      <td className="px-3 py-1.5 pl-6">{ROTULO_DA_LINHA[linha]}</td>
      {colunas.map((c) => <td key={c.id} className={celula}>{reaisExatos(Number(c[linha]) || 0)}</td>)}
      <td className={`${celula} text-amber-700 dark:text-amber-300`}>{reaisExatos(Number(atrasado[linha]) || 0)}</td>
    </tr>
  );
}
