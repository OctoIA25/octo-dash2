/**
 * A planilha comercial dentro da Conferência de vendas — item 5, 24/09.
 *
 * Componente à parte, e não uma reforma da tela do P4.4: aquela mostra as
 * vendas que nascem das propostas assinadas, com repasse, nota fiscal e
 * divergência. São dois conjuntos diferentes, e misturá-los inventaria venda.
 *
 * O que muda em relação à tela do CRM, item por item do pedido:
 *   - a coluna Empreendimento vira "Empreendimento / Código do imóvel";
 *   - entra o Gerente, derivado da equipe do corretor;
 *   - entra o filtro todas / lançamentos / prontos;
 *   - sai Repasses e entra Pagamento (à vista ou 3 de 5 parcelas).
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { reaisExatos } from './vendas';
import {
  carregarPlanilha, gravarPagamento, rotuloDoPagamento,
  type TipoDoNegocio, type VendaDaPlanilha,
} from './vendasPlanilhaService';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

const inputCls =
  'h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring';

interface Props {
  de: string;
  ate: string;
}

export function ConferenciaDaPlanilha({ de, ate }: Props) {
  const { tenantId } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tipo, setTipo] = useState<TipoDoNegocio>('');
  const [corretor, setCorretor] = useState('');
  const [editando, setEditando] = useState<VendaDaPlanilha | null>(null);

  const chave = ['conferencia-planilha', tenantId, de, ate, tipo, corretor];
  const consulta = useQuery({
    queryKey: chave,
    enabled: Boolean(tenantId) && tenantId !== 'owner',
    queryFn: () => carregarPlanilha(tenantId as string, { de, ate, tipo, corretor: corretor || null }),
  });

  const dados = consulta.data;
  const linhas = dados?.linhas ?? [];

  // Os nomes vêm da própria lista: a planilha guarda o corretor como TEXTO, e
  // só 19 dos 37 casam com alguém cadastrado. Oferecer o cadastro no filtro
  // esconderia justamente os 18 que precisam de atenção.
  const corretoresNaLista = [...new Set(linhas.map((l) => l.corretor_nome).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), 'pt-BR'),
  ) as string[];

  const salvar = useMutation({
    mutationFn: async (args: { id: string; forma: 'a_vista' | 'parcelado' | null; total?: number | null; pagas?: number | null }) => {
      const r = await gravarPagamento(args.id, {
        forma: args.forma, parcelasTotal: args.total, parcelasPagas: args.pagas,
      });
      if (!r.success) throw new Error(r.error ?? 'não deu para gravar');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conferencia-planilha'] });
      setEditando(null);
    },
    onError: (e: Error) => toast({ title: 'Pagamento não gravado', description: e.message, variant: 'destructive' }),
  });

  if (consulta.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a planilha…
      </p>
    );
  }

  if (consulta.isError) {
    return (
      <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
        Não deu para ler a planilha: {(consulta.error as Error)?.message}
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDoNegocio)} className={inputCls}>
            <option value="">Todas</option>
            <option value="lancamento">Lançamentos</option>
            <option value="terceiros">Prontos / terceiros</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Corretor</span>
          <select value={corretor} onChange={(e) => setCorretor(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {corretoresNaLista.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/*
        O que a tela NÃO sabe, dito antes da tabela. Sem isto, três colunas
        vazias parecem defeito — e a resposta certa é "ninguém preencheu
        ainda", que é trabalho a fazer, não erro do sistema.
      */}
      {dados && (dados.sem_tipo > 0 || dados.sem_gerente > 0 || dados.sem_pagamento > 0) && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>O que ainda falta preencher:</strong>{' '}
            {[
              dados.sem_tipo > 0 && `${dados.sem_tipo} sem lançamento/pronto (o empreendimento não está no cadastro)`,
              dados.sem_gerente > 0 && `${dados.sem_gerente} sem gerente (o corretor da planilha não casa com um membro, ou o membro não tem equipe)`,
              dados.sem_pagamento > 0 && `${dados.sem_pagamento} sem forma de pagamento`,
            ].filter(Boolean).join(' · ')}
            . A planilha não traz nenhum dos três — eles são da Dash.
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[980px] text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Empreendimento / Código do imóvel</th>
              <th className="px-3 py-2">Corretor</th>
              <th className="px-3 py-2">Gerente</th>
              <th className="px-3 py-2 text-right">VGV</th>
              <th className="px-3 py-2 text-right">Comissão</th>
              <th className="px-3 py-2">Recebido</th>
              <th className="px-3 py-2">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                Nenhuma venda da planilha neste recorte.
              </td></tr>
            )}
            {linhas.map((v) => {
              const pagamento = rotuloDoPagamento(v);
              return (
                <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap">{dataBR(v.data_assinatura)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{v.empreendimento || '—'}</span>
                    {/* A planilha não tem código de imóvel: tem quadra e
                        unidade, e é isso que identifica o que foi vendido. */}
                    {v.unidade_codigo && (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{v.unidade_codigo}</span>
                    )}
                    {v.tipo_negocio && (
                      <span className="ml-1.5 rounded px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground ring-1 ring-border">
                        {v.tipo_negocio === 'lancamento' ? 'lançamento' : 'pronto'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{v.corretor_nome || '—'}</td>
                  <td className="px-3 py-2">
                    {v.gerente || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {v.valor_vgv ? reaisExatos(Number(v.valor_vgv)) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {v.comissao_total_venda ? reaisExatos(Number(v.comissao_total_venda)) : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{dataBR(v.data_recebimento)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setEditando(v)}
                      className={`rounded px-1.5 py-0.5 text-[11px] hover:bg-accent ${
                        pagamento ? '' : 'text-muted-foreground ring-1 ring-dashed ring-border'
                      }`}
                    >
                      {pagamento ?? 'preencher'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {dados && linhas.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2" colSpan={4}>{dados.total_linhas} venda(s)</td>
                <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(Number(dados.total_vgv))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(Number(dados.total_comissao))}</td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editando && (
        <EditorDePagamento
          venda={editando}
          salvando={salvar.isPending}
          onFechar={() => setEditando(null)}
          onSalvar={(forma, total, pagas) => salvar.mutate({ id: editando.id, forma, total, pagas })}
        />
      )}
    </>
  );
}

function EditorDePagamento({
  venda, salvando, onFechar, onSalvar,
}: {
  venda: VendaDaPlanilha;
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (forma: 'a_vista' | 'parcelado' | null, total: number | null, pagas: number | null) => void;
}) {
  const [forma, setForma] = useState<'a_vista' | 'parcelado' | ''>(venda.pagamento_forma ?? '');
  const [total, setTotal] = useState(String(venda.parcelas_total ?? ''));
  const [pagas, setPagas] = useState(String(venda.parcelas_pagas ?? 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="w-full max-w-sm rounded-lg border bg-background p-4 text-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 font-semibold">Pagamento</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {venda.empreendimento}{venda.unidade_codigo ? ` · ${venda.unidade_codigo}` : ''}
        </p>

        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Forma</span>
            <select value={forma} onChange={(e) => setForma(e.target.value as typeof forma)} className={inputCls}>
              {/* Vazio LIMPA, e a palavra diz isso: "ninguém preencheu" é
                  diferente de "foi pago de uma vez". */}
              <option value="">Ainda não preenchido</option>
              <option value="a_vista">À vista</option>
              <option value="parcelado">Parcelado</option>
            </select>
          </label>

          {forma === 'parcelado' && (
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Pagas</span>
                <input type="number" min={0} value={pagas} onChange={(e) => setPagas(e.target.value)} className={inputCls} />
              </label>
              <span className="pb-2 text-xs text-muted-foreground">de</span>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Parcelas</span>
                <input type="number" min={1} value={total} onChange={(e) => setTotal(e.target.value)} className={inputCls} />
              </label>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => onSalvar(
              forma === '' ? null : forma,
              forma === 'parcelado' ? Number(total) : null,
              forma === 'parcelado' ? Number(pagas) : null,
            )}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
