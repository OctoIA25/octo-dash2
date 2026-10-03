/**
 * As parcelas da venda — cada uma é um "a receber" do Financeiro.
 *
 * Marcar uma parcela como recebida aqui é a MESMA baixa da aba A receber: a
 * linha é uma só. Por isso não há "salvar recebimento" à parte, e a venda fica
 * pendente / parcelada / paga sozinha, pelo que as parcelas dizem.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hojeSP } from '@/lib/dataSP';
import { parseNumeric } from '@/features/relatorios/import/generic/metadataDiscovery';
import { baixar } from '@/features/financeiro/financeiroService';
import { conferirParcelas, reaisExatos } from './vendas';
import { parcelarVenda, type ParcelaDaVenda } from './vendasService';

const inputCls = 'h-8 rounded-md border bg-background px-2 text-xs';
const dataBR = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : 'sem data');
const emTexto = (n: number) => String(n).replace('.', ',');

interface Rascunho { valor: string; vencimento: string }

export function ParcelasDaVenda({ vendaId, comissaoBruta, parcelas, carregando, onMudou }: {
  vendaId: string;
  comissaoBruta: number;
  parcelas: ParcelaDaVenda[];
  carregando: boolean;
  onMudou: () => void;
}) {
  const { toast } = useToast();
  const [rascunho, setRascunho] = useState<Rascunho[] | null>(null);
  const [baixando, setBaixando] = useState<{ id: string; dia: string; valor: string } | null>(null);

  const baixadas = parcelas.filter((p) => p.status === 'baixado');
  const jaBaixado = baixadas.reduce((s, p) => s + p.valor, 0);
  const novas = (rascunho ?? []).map((r) => ({ valor: parseNumeric(r.valor), vencimento: r.vencimento || null }));
  const conta = conferirParcelas(novas, jaBaixado, comissaoBruta);

  const abrirParcelamento = () => {
    const abertas = parcelas.filter((p) => p.status === 'aberto');
    setRascunho(abertas.length > 0
      ? abertas.map((p) => ({ valor: emTexto(p.valor), vencimento: p.vencimento ?? '' }))
      : [{ valor: '', vencimento: '' }]);
  };

  const parcelar = useMutation({
    mutationFn: () => parcelarVenda(vendaId, novas.map((n) => ({ valor: n.valor ?? 0, vencimento: n.vencimento }))),
    onSuccess: () => { setRascunho(null); toast({ title: 'Parcelas gravadas' }); onMudou(); },
    onError: (e: Error) => toast({ title: 'Não deu para parcelar', description: e.message, variant: 'destructive' }),
  });

  const baixa = useMutation({
    mutationFn: (b: { id: string; dia: string | null; valor: number | null }) => baixar(b.id, b.dia, b.valor),
    onSuccess: () => { setBaixando(null); onMudou(); },
    onError: (e: Error) => toast({ title: 'Não deu para registrar', description: e.message, variant: 'destructive' }),
  });

  const muda = (i: number, campo: keyof Rascunho, valor: string) =>
    setRascunho((r) => (r ?? []).map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  return (
    <section className="mb-5 rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <h3 className="text-sm font-semibold">Parcelas</h3>
        {!rascunho && parcelas.length > 0 && (
          <button onClick={abrirParcelamento} className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent">
            Parcelar
          </button>
        )}
      </div>

      {carregando && <p className="p-3 text-xs text-muted-foreground">Carregando…</p>}
      {!carregando && parcelas.length === 0 && (
        <p className="p-3 text-xs text-muted-foreground">Venda sem comissão não tem parcela: não há o que receber.</p>
      )}

      {!rascunho && parcelas.length > 0 && (
        <ul className="divide-y text-xs">
          {parcelas.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-10 text-muted-foreground">{i + 1}/{parcelas.length}</span>
              <span className="w-28 font-medium tabular-nums">{reaisExatos(p.valor)}</span>
              <span className="w-24">{dataBR(p.vencimento)}</span>
              {p.status === 'baixado' ? (
                <>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    recebida em {dataBR(p.pago_em)}
                    {p.valor_pago != null && Math.abs(p.valor_pago - p.valor) > 0.01 ? ` · ${reaisExatos(p.valor_pago)}` : ''}
                  </span>
                  <button onClick={() => baixa.mutate({ id: p.id, dia: null, valor: null })}
                    disabled={baixa.isPending} className="ml-auto text-[11px] underline">
                    desfazer
                  </button>
                </>
              ) : baixando?.id === p.id ? (
                <form className="ml-auto flex items-center gap-1"
                  onSubmit={(e) => { e.preventDefault(); baixa.mutate({ id: p.id, dia: baixando.dia, valor: parseNumeric(baixando.valor) }); }}>
                  <input type="date" max={hojeSP()} value={baixando.dia}
                    onChange={(e) => setBaixando({ ...baixando, dia: e.target.value })} className={inputCls} />
                  <input inputMode="decimal" value={baixando.valor}
                    onChange={(e) => setBaixando({ ...baixando, valor: e.target.value })} className={`${inputCls} w-24`} />
                  <button type="submit" disabled={baixa.isPending}
                    className="h-8 rounded-md bg-primary px-2 text-[11px] text-primary-foreground disabled:opacity-50">ok</button>
                  <button type="button" onClick={() => setBaixando(null)} className="h-8 px-1 text-[11px]">cancelar</button>
                </form>
              ) : (
                <button onClick={() => setBaixando({ id: p.id, dia: hojeSP(), valor: emTexto(p.valor) })}
                  className="ml-auto rounded-md border px-2 py-1 text-[11px] hover:bg-accent">
                  marcar recebida
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {rascunho && (
        <div className="space-y-2 p-3 text-xs">
          {baixadas.length > 0 && (
            <p className="text-muted-foreground">
              {baixadas.length} parcela(s) já recebida(s), somando {reaisExatos(jaBaixado)}, ficam como estão.
            </p>
          )}
          {rascunho.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-muted-foreground">{baixadas.length + i + 1}</span>
              <input inputMode="decimal" placeholder="valor" value={r.valor}
                onChange={(e) => muda(i, 'valor', e.target.value)} className={`${inputCls} w-28`} />
              <input type="date" value={r.vencimento}
                onChange={(e) => muda(i, 'vencimento', e.target.value)} className={inputCls} />
              <button type="button" aria-label="Tirar parcela" disabled={rascunho.length === 1}
                onClick={() => setRascunho(rascunho.filter((_, j) => j !== i))}
                className="rounded p-1 hover:bg-accent disabled:opacity-30">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button type="button"
            onClick={() => setRascunho([...rascunho, { valor: conta.falta > 0 ? emTexto(conta.falta) : '', vencimento: '' }])}
            className="inline-flex items-center gap-1 underline">
            <Plus className="h-3 w-3" /> parcela
          </button>
          <p className={conta.fecha ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>
            {conta.fecha
              ? `Fecha com a comissão de ${reaisExatos(comissaoBruta)}.`
              : conta.falta > 0
                ? `Faltam ${reaisExatos(conta.falta)} para a comissão de ${reaisExatos(comissaoBruta)}.`
                : `Passou ${reaisExatos(-conta.falta)} da comissão de ${reaisExatos(comissaoBruta)}.`}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRascunho(null)} className="px-2 text-muted-foreground">Cancelar</button>
            <button type="button" disabled={!conta.fecha || parcelar.isPending} onClick={() => parcelar.mutate()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-50">
              {parcelar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Gravar parcelas
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
