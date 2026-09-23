/**
 * Notas a emitir (P4.6) — preparar e avisar, não emitir.
 *
 * Decidido pelo chefe em 22/09: a Dash monta o pedido de nota e avisa quem
 * emite. Não assina, não envia à prefeitura, não precisa de certificado.
 *
 * ESTA TELA É, ANTES DE MAIS NADA, UMA LISTA DE PENDÊNCIAS.
 * Em produção, em 22/09, havia 14 construtoras distintas e ZERO CNPJs
 * cadastrados. Uma tela honesta, nesse estado, não mostra catorze linhas em
 * branco: mostra "falta o CNPJ da Construtora X", catorze vezes, com o nome
 * de cada uma. O que parece uma tela vazia é, na verdade, a lista do que
 * alguém precisa ir buscar.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

export interface NotaAEmitir {
  venda_id: string;
  data_venda: string | null;
  empreendimento: string | null;
  tomador: string | null;
  cnpj: string | null;
  valor: number | null;
  descricao_servico: string;
  recebimento_previsto_em: string | null;
  avisado_em: string | null;
  pendencias: string[] | null;
}

const emReais = (v: number | null) =>
  (Number(v ?? 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** 11222333000181 → 11.222.333/0001-81. A máscara é da tela; o banco guarda dígitos. */
export function mascararCnpj(cnpj: string | null): string {
  // `cnpj || '—'` e nao `cnpj ?? '—'`: string VAZIA nao e nullish, e o `??`
  // deixava o campo em branco em vez de dizer que falta.
  if (!cnpj || cnpj.length !== 14) return cnpj || '—';
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

const dataBr = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '—';

/** O texto que a pessoa passa adiante. O mesmo que fica gravado no pedido. */
export function textoDoPedido(n: NotaAEmitir): string {
  return [
    'Pedido de nota fiscal',
    `Tomador: ${n.tomador ?? '—'}`,
    `CNPJ: ${mascararCnpj(n.cnpj)}`,
    `Valor: ${emReais(n.valor)}`,
    `Serviço: ${n.descricao_servico}`,
    n.recebimento_previsto_em ? `Recebimento previsto: ${dataBr(n.recebimento_previsto_em)}` : null,
  ].filter(Boolean).join('\n');
}

async function carregar(tenantId: string): Promise<NotaAEmitir[]> {
  const { data, error } = await supabase.rpc('notas_a_emitir', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data ?? []) as NotaAEmitir[];
}

export function NotasAEmitir({ tenantId }: { tenantId: string | null }) {
  const qc = useQueryClient();
  const [soPendentes, setSoPendentes] = useState(false);

  const lista = useQuery({
    queryKey: ['notas-a-emitir', tenantId],
    queryFn: () => carregar(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const avisar = useMutation({
    mutationFn: async (n: NotaAEmitir) => {
      const { data, error } = await supabase.rpc('pedido_de_nota_avisar', {
        p_venda_id: n.venda_id,
        p_conteudo: { tomador: n.tomador, cnpj: n.cnpj, valor: n.valor, servico: n.descricao_servico },
      });
      if (error) throw error;
      if (!data) throw new Error('O pedido de nota é de quem administra a conta.');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-a-emitir', tenantId] });
      toast.success('Marcado como avisado');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não deu para marcar'),
  });

  const copiar = async (n: NotaAEmitir) => {
    await navigator.clipboard.writeText(textoDoPedido(n));
    toast.success('Pedido copiado');
  };

  const todas = lista.data ?? [];
  const comPendencia = todas.filter((n) => (n.pendencias?.length ?? 0) > 0);
  const mostradas = soPendentes ? comPendencia : todas;

  // As pendências agrupadas: é a lista de compras, e ela vale mais que a
  // soma. "Falta o CNPJ de X" repetido em 9 vendas é UMA coisa a resolver.
  const porPendencia = new Map<string, number>();
  for (const n of comPendencia) {
    for (const p of n.pendencias ?? []) porPendencia.set(p, (porPendencia.get(p) ?? 0) + 1);
  }

  return (
    <section className="space-y-4">
      <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
        <strong>A Dash prepara a nota; quem emite é você.</strong> Ela monta o pedido com
        tomador, CNPJ, valor e descrição do serviço, e avisa. Não assina nem envia à
        prefeitura — para isso seria preciso certificado digital e inscrição municipal.
      </p>

      {porPendencia.size > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" /> O que falta para emitir
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {[...porPendencia.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([texto, quantas]) => (
                <li key={texto}>
                  {texto} <span className="opacity-70">— {quantas} {quantas === 1 ? 'venda' : 'vendas'}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {todas.length} {todas.length === 1 ? 'venda sem nota' : 'vendas sem nota'}
          {comPendencia.length > 0 && ` · ${comPendencia.length} com pendência`}
        </span>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
          só as que têm pendência
        </label>
      </div>

      {lista.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

      {lista.isSuccess && todas.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-600" />
          Nenhuma venda esperando nota. Toda venda registrada já tem número de nota.
        </p>
      )}

      <div className="space-y-2">
        {mostradas.map((n) => {
          const pendencias = n.pendencias ?? [];
          const pronta = pendencias.length === 0;
          return (
            <article key={n.venda_id}
              className="rounded-xl border bg-white p-4 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {n.tomador ?? 'sem tomador'}
                    {n.avisado_em && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        avisado em {new Date(n.avisado_em).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.empreendimento ?? '—'} · venda de {dataBr(n.data_venda)} ·{' '}
                    CNPJ {mascararCnpj(n.cnpj)}
                  </p>
                </div>
                <p className="text-lg font-semibold tabular-nums">{emReais(n.valor)}</p>
              </div>

              {pendencias.length > 0 && (
                <ul className="mt-3 space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
                  {pendencias.map((p) => (
                    <li key={p} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copiar(n)} disabled={!pronta}
                  title={pronta ? undefined : 'Resolva as pendências antes de passar o pedido adiante'}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar pedido
                </Button>
                <Button size="sm" variant={n.avisado_em ? 'outline' : 'secondary'}
                  disabled={!pronta || avisar.isPending}
                  onClick={() => avisar.mutate(n)}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {n.avisado_em ? 'Avisar de novo' : 'Marcar como avisado'}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
