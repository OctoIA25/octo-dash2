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
 *
 * FILTROS EM CIMA — 29/09. Os filtros subiram para a barra da página, a mesma
 * das duas abas; este componente virou só a tabela. Equipe e Lançamentos /
 * Prontos voltam como RECORTE, não como coluna. Saíram Área m², R$/m² e
 * Total (-3%), e o Status ganhou o selo pago / parcelado / pendente.
 */

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { reaisExatos } from './vendas';
import {
  ROTULO_DA_SITUACAO, carregarPlanilha,
  type ConferenciaDaPlanilha as DadosDaPlanilha, type SituacaoDaPlanilha, type VendaDaPlanilha,
} from './vendasPlanilhaService';
import { ondeEstaoAsVendas } from './ondeEstaoAsVendas';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

/** Dinheiro. Zero É um valor e aparece; ausente vira travessão. */
const dinheiro = (n: number | null | undefined) =>
  n == null ? '—' : reaisExatos(Number(n));

const COR_DA_SITUACAO: Record<SituacaoDaPlanilha, string> = {
  pago: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  parcelado: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

interface Props {
  dados: DadosDaPlanilha | null | undefined;
  carregando: boolean;
  erro: Error | null;
  /**
   * Nenhum filtro além do período. Só então "a planilha tem N vendas, de
   * janeiro a agosto" responde à lista vazia — com equipe ou corretor
   * escolhidos, o vazio pode ser do recorte, e a frase mentiria.
   */
  soPeriodo: boolean;
}

export function ConferenciaDaPlanilha({ dados, carregando, erro, soPeriodo }: Props) {
  const { tenantId } = useAuthContext();

  /**
   * A PLANILHA INTEIRA, sem filtro de data.
   *
   * Serve a uma coisa só: quando o recorte escolhido não devolve nada, dizer
   * ONDE as vendas estão. A tela abre no mês corrente e a planilha parou de
   * receber venda em 01/09 — então ela nascia dizendo "nenhuma venda neste
   * recorte", com 37 vendas guardadas logo atrás. Quem lê conclui que não há
   * venda nenhuma, e é o mesmo erro do "Ninguém esperando" do Plantão.
   *
   * Só roda quando a lista filtrada volta vazia: em dia normal não custa nada.
   */
  const linhas: VendaDaPlanilha[] = dados?.linhas ?? [];

  // Só quando o recorte volta vazio. Em dia normal não custa uma chamada.
  const inteira = useQuery({
    queryKey: ['conferencia-planilha-inteira', tenantId],
    enabled: Boolean(tenantId) && tenantId !== 'owner' && !carregando && soPeriodo && linhas.length === 0,
    queryFn: () => carregarPlanilha(tenantId as string, {}),
  });
  const ondeEstao = soPeriodo ? ondeEstaoAsVendas(inteira.data?.linhas ?? []) : null;

  if (carregando) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a planilha…
      </p>
    );
  }

  if (erro) {
    return (
      <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
        Não deu para ler a planilha: {erro.message}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1240px] text-xs">
          <thead>
            {/*
              AS COLUNAS DA PLANILHA DO DRIVE, na ordem dela — e só elas.

              Os rótulos são os DELA: "Total Unidade", "Comissão Total", "Team
              Leader", "Comissão Imobiliária". Renomear para o vocabulário da
              Dash faria quem confere ter de traduzir coluna por coluna, que é
              o oposto de espelho. Área M², R$ M² e Total (-3%) saíram a pedido
              do chefe em 29/09.
            */}
            <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
              <th className="px-2.5 py-2">Empreendimento</th>
              <th className="px-2.5 py-2">Qd · Un</th>
              <th className="px-2.5 py-2">Origem</th>
              <th className="px-2.5 py-2 text-right">Total unidade</th>
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
              <tr><td colSpan={14} className="px-3 py-6 text-center text-muted-foreground">
                {ondeEstao
                  ? `Nenhuma no período escolhido. A planilha tem ${ondeEstao.quantas} ${ondeEstao.quantas === 1 ? 'venda' : 'vendas'}, ${ondeEstao.periodo}.`
                  : soPeriodo
                    ? 'Nenhuma venda da planilha neste recorte.'
                    : 'Nenhuma venda da planilha com estes filtros.'}
              </td></tr>
            )}
            {linhas.map((v) => (
              <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-2.5 py-2 font-medium whitespace-nowrap">{v.empreendimento || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.unidade_codigo || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.origem || '—'}</td>
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">{dinheiro(v.total_unidade)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap font-medium">{dinheiro(v.comissao_total_venda)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.cliente_nome || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.corretor_nome || '—'}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{v.nivel_corretor || '—'}</td>
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">{dinheiro(v.repasse_corretor)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">{dinheiro(v.team_leader_valor)}</td>
                {/* O valor que a PLANILHA escreveu; a conta (comissão menos
                    corretor menos gerente) só quando a célula não é legível.
                    A conta dava −R$ 1.250 nas parcelas. */}
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap font-medium">{dinheiro(v.comissao_imobiliaria)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{dataBR(v.data_assinatura)}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{dataBR(v.data_recebimento)}</td>
                {/* O selo são as três categorias que o chefe combinou em 29/09,
                    lidas da planilha pelo banco. O texto livre fica embaixo:
                    "pagou mais 252 em 14/03" não cabe em selo nenhum. */}
                <td className="px-2.5 py-2 max-w-[200px]">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${COR_DA_SITUACAO[v.situacao]}`}>
                    {ROTULO_DA_SITUACAO[v.situacao]}
                  </span>
                  {v.status_recebimento && (
                    <span className="block truncate text-[10px] text-muted-foreground" title={v.status_recebimento}>
                      {v.status_recebimento}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {dados && linhas.length > 0 && (
            <tfoot>
              {/* Os colSpan somam 14 — o mesmo número de colunas do cabeçalho.
                  Uma conta errada aqui põe o total de um número embaixo da
                  coluna de outro, e o rodapé continua parecendo certo.
                  Somar o Total Unidade não duplica a venda parcelada: as
                  linhas de parcela vêm com ele zerado, de propósito. */}
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-2.5 py-2" colSpan={3}>{dados.total_linhas} venda(s)</td>
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">{dinheiro(dados.total_unidade)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">{dinheiro(dados.total_comissao)}</td>
                <td className="px-2.5 py-2" colSpan={5} />
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">{dinheiro(dados.total_imobiliaria)}</td>
                <td className="px-2.5 py-2" colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
