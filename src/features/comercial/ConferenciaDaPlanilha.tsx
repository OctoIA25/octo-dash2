/**
 * A planilha comercial dentro da Conferência de vendas — item 5, 24/09.
 *
 * Componente à parte, e não uma reforma da tela do P4.4: aquela mostra as
 * vendas que nascem das propostas assinadas, com repasse, nota fiscal e
 * divergência. São dois conjuntos diferentes, e misturá-los inventaria venda.
 *
 * ESPELHO, E SÓ ESPELHO — 25/09. O chefe pediu: "nas conferências de vendas
 * deixe apenas as informações da planilha que enviei". Saíram as três colunas
 * que eu tinha DERIVADO do que a Dash já sabia, e que a planilha não tem:
 *
 *   - Gerente (quem lidera a equipe do corretor)
 *   - o filtro Lançamentos / Prontos (do cadastro de empreendimentos)
 *   - Pagamento (o "à vista / 3 de 5 parcelas", campo da Dash)
 *
 * As três foram pedido DELE no dia anterior, e é por isso que estão nomeadas
 * aqui em vez de simplesmente sumirem: quem vier depois precisa saber que
 * existiram, e que voltar é barato. A tabela `venda_pagamento` continua no
 * banco, com o que já tiver sido preenchido.
 *
 * O filtro por CORRETOR fica: corretor é coluna da planilha, e filtrar por uma
 * coluna que existe não acrescenta informação nenhuma à tela.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { reaisExatos } from './vendas';
import { carregarPlanilha, type VendaDaPlanilha } from './vendasPlanilhaService';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

/** Número simples, com vírgula decimal. Vazio vira travessão, nunca zero. */
const numero = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Dinheiro. Zero É um valor e aparece; ausente vira travessão. */
const dinheiro = (n: number | null | undefined) =>
  n == null ? '—' : reaisExatos(Number(n));

const inputCls =
  'h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring';

interface Props {
  de: string;
  ate: string;
}

export function ConferenciaDaPlanilha({ de, ate }: Props) {
  const { tenantId } = useAuthContext();
  const [corretor, setCorretor] = useState('');

  const consulta = useQuery({
    queryKey: ['conferencia-planilha', tenantId, de, ate, corretor],
    enabled: Boolean(tenantId) && tenantId !== 'owner',
    queryFn: () => carregarPlanilha(tenantId as string, { de, ate, corretor: corretor || null }),
  });

  const dados = consulta.data;
  const linhas: VendaDaPlanilha[] = dados?.linhas ?? [];

  // Os nomes vêm da própria lista: a planilha guarda o corretor como TEXTO, e
  // só 9 dos 37 casam com alguém cadastrado. Oferecer o cadastro no filtro
  // esconderia justamente os 28 que precisam de atenção.
  const corretoresNaLista = [...new Set(linhas.map((l) => l.corretor_nome).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), 'pt-BR'),
  ) as string[];

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
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Corretor</span>
          <select value={corretor} onChange={(e) => setCorretor(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {corretoresNaLista.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1480px] text-xs">
          <thead>
            {/*
              AS COLUNAS DA PLANILHA DO DRIVE, na ordem dela — e só elas.

              Os rótulos são os DELA: "Total Unidade", "Total (-3%)", "Comissão
              Total", "Team Leader", "Comissão Imobiliária". Renomear para o
              vocabulário da Dash faria quem confere ter de traduzir coluna por
              coluna, que é o oposto de espelho.
            */}
            <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
              <th className="px-2.5 py-2">Empreendimento</th>
              <th className="px-2.5 py-2">Qd · Un</th>
              <th className="px-2.5 py-2">Origem</th>
              <th className="px-2.5 py-2 text-right">Área m²</th>
              <th className="px-2.5 py-2 text-right">R$/m²</th>
              <th className="px-2.5 py-2 text-right">Total unidade</th>
              <th className="px-2.5 py-2 text-right">Total (-3%)</th>
              <th className="px-2.5 py-2 text-right">Comissão total</th>
              <th className="px-2.5 py-2">Cliente</th>
              <th className="px-2.5 py-2">Corretor</th>
              <th className="px-2.5 py-2">Tipo</th>
              <th className="px-2.5 py-2 text-right">Corretor R$</th>
              <th className="px-2.5 py-2 text-right">Team leader</th>
              <th className="px-2.5 py-2 text-right">Comissão imobiliária</th>
              <th className="px-2.5 py-2">Assinatura</th>
              <th className="px-2.5 py-2">Recebimento</th>
              <th className="px-2.5 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={17} className="px-3 py-6 text-center text-muted-foreground">
                Nenhuma venda da planilha neste recorte.
              </td></tr>
            )}
            {linhas.map((v) => (
              <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-2.5 py-2 font-medium whitespace-nowrap">{v.empreendimento || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.unidade_codigo || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.origem || '—'}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{numero(v.area_m2)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{dinheiro(v.valor_m2)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{dinheiro(v.total_unidade)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{dinheiro(v.valor_vgv)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums font-medium">{dinheiro(v.comissao_total_venda)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.cliente_nome || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.corretor_nome || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.nivel_corretor || '—'}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{dinheiro(v.repasse_corretor)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{dinheiro(v.team_leader_valor)}</td>
                {/* É a "Líquida" que o chefe definiu: comissão menos corretor
                    menos gerente. A planilha chama assim, e o rótulo é dela. */}
                <td className="px-2.5 py-2 text-right tabular-nums font-medium">{dinheiro(v.comissao_imobiliaria)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{dataBR(v.data_assinatura)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{dataBR(v.data_recebimento)}</td>
                {/* Texto livre na planilha — mostrado como está, sem virar
                    selo: transformá-lo em estado obrigaria a inventar
                    categorias que ninguém combinou. */}
                <td className="px-2.5 py-2 max-w-[180px] truncate" title={v.status_recebimento ?? ''}>
                  {v.status_recebimento || '—'}
                </td>
              </tr>
            ))}
          </tbody>
          {dados && linhas.length > 0 && (
            <tfoot>
              {/* Os colSpan somam 17 — o mesmo número de colunas do cabeçalho.
                  Uma conta errada aqui põe o total de um número embaixo da
                  coluna de outro, e o rodapé continua parecendo certo. */}
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-2.5 py-2" colSpan={6}>{dados.total_linhas} venda(s)</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{dinheiro(dados.total_vgv)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{dinheiro(dados.total_comissao)}</td>
                <td className="px-2.5 py-2" colSpan={5} />
                <td className="px-2.5 py-2 text-right tabular-nums">{dinheiro(dados.total_imobiliaria)}</td>
                <td className="px-2.5 py-2" colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
