/**
 * Financeiro fase 1 (P4.5) — as contas, fora do componente.
 *
 * A regra que atravessa o arquivo: NADA É DIGITADO DUAS VEZES. A venda do P4.4
 * gera o "a receber", os repasses geram os "a pagar" e o imposto gera o dele —
 * tudo por gatilho no banco. O que sobra para a tela é mostrar, baixar e
 * exportar.
 *
 * A segunda regra é sobre o que o número quer dizer: COMPETÊNCIA não é CAIXA.
 * A venda de setembro recebida em outubro é resultado de setembro e caixa de
 * outubro. O DRE usa competência, o fluxo usa a data da baixa, e a tela diz
 * qual está olhando — foi isso que sempre confundiu quem compara o "a receber"
 * com o resultado do mês.
 */

export { reaisExatos } from '@/features/relatorios/marketing/campanhas';

export type TipoDeLancamento = 'receber' | 'pagar';
export type StatusDoLancamento = 'aberto' | 'baixado' | 'cancelado';
export type OrigemDoLancamento = 'venda' | 'repasse' | 'imposto' | 'midia' | 'manual';

export interface Lancamento {
  id: string;
  tipo: TipoDeLancamento;
  descricao: string;
  valor: number;
  competencia: string;
  vencimento: string | null;
  pago_em: string | null;
  valor_pago: number | null;
  status: StatusDoLancamento;
  origem: OrigemDoLancamento;
  origem_id: string | null;
  centro_custo: string;
  anexo: string | null;
  observacao: string;
  conta_id: string | null;
  conta_codigo: string | null;
  conta_nome: string | null;
  vencido: boolean;
  dias_de_atraso: number | null;
}

export interface TotaisDoPeriodo {
  lancamentos: number;
  a_receber: number;
  a_pagar: number;
  recebido: number;
  pago: number;
  vencidos: number;
  valor_vencido: number;
  sem_conta: number;
}

export interface ListaDeLancamentos {
  de: string;
  ate: string;
  por: 'vencimento' | 'competencia';
  linhas: Lancamento[];
  totais: TotaisDoPeriodo;
}

export interface LinhaDoDre {
  codigo: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  lancamentos: number;
  total: number;
}

export interface Dre {
  de: string;
  ate: string;
  linhas: LinhaDoDre[];
  totais: {
    receitas: number;
    despesas: number;
    resultado: number;
    lancamentos: number;
    sem_conta: number;
  };
}

export interface PontoDoFluxo {
  quando: string;
  previsto_entrada: number;
  previsto_saida: number;
  entrada: number;
  saida: number;
  previsto_liquido: number;
  realizado_liquido: number;
  saldo: number;
}

export interface FluxoDeCaixa {
  de: string;
  ate: string;
  granularidade: 'dia' | 'semana' | 'mes';
  saldo_inicial: number;
  linhas: PontoDoFluxo[];
}

export const ROTULO_DA_ORIGEM: Record<OrigemDoLancamento, string> = {
  venda: 'Venda',
  repasse: 'Repasse',
  imposto: 'Imposto',
  midia: 'Mídia',
  manual: 'Manual',
};

/**
 * O lançamento veio de outro lugar e não se edita aqui.
 *
 * Editá-lo faria o Financeiro discordar da conferência de vendas na primeira
 * conferência — e o número errado seria o daqui, porque a venda é a fonte.
 */
export const eAutomatico = (l: Pick<Lancamento, 'origem'>) => l?.origem !== 'manual';

/**
 * O DRE fecha com a soma das próprias linhas?
 *
 * É o segundo critério de pronto do plano, e a tela CONFERE em vez de
 * prometer: linhas e totais vêm da mesma consulta, então divergir aqui
 * significa que algo se perdeu no caminho. Melhor a tela dizer do que mostrar
 * dois números e deixar quem confere escolher.
 */
export function dreFecha(d: Dre | null | undefined): {
  fecha: boolean;
  campo?: 'receitas' | 'despesas' | 'resultado';
  soma?: number;
  rodape?: number;
} {
  if (!d?.totais) return { fecha: true };
  const somaDe = (tipo: 'receita' | 'despesa') =>
    (d.linhas ?? []).filter((l) => l.tipo === tipo).reduce((s, l) => s + (l.total || 0), 0);

  const receitas = somaDe('receita');
  const despesas = somaDe('despesa');
  const centavo = 0.01;

  if (Math.abs(receitas - d.totais.receitas) > centavo) {
    return { fecha: false, campo: 'receitas', soma: receitas, rodape: d.totais.receitas };
  }
  if (Math.abs(despesas - d.totais.despesas) > centavo) {
    return { fecha: false, campo: 'despesas', soma: despesas, rodape: d.totais.despesas };
  }
  if (Math.abs(receitas - despesas - d.totais.resultado) > centavo) {
    return { fecha: false, campo: 'resultado', soma: receitas - despesas, rodape: d.totais.resultado };
  }
  return { fecha: true };
}

/**
 * O aviso do lançamento sem conta do plano.
 *
 * Um lançamento sem conta some do agrupamento do DRE. Sem este aviso, o
 * resultado ficaria menor e nada na tela diria por quê.
 */
export function avisoSemConta(t: Pick<TotaisDoPeriodo, 'sem_conta' | 'lancamentos'> | null | undefined): string | null {
  if (!t || !t.sem_conta) return null;
  return `${t.sem_conta} de ${t.lancamentos} lançamentos estão sem conta do plano. ` +
    'Eles aparecem na lista, mas entram no DRE agrupados como "Sem conta no plano" — escolha a conta de cada um para o resultado ficar por categoria.';
}

/**
 * Quanto do que vence no período já passou do prazo.
 *
 * Devolve `null` quando não há nada vencido: um "0 vencidos" em vermelho
 * treina a pessoa a ignorar o vermelho.
 */
export function avisoDeVencidos(t: Pick<TotaisDoPeriodo, 'vencidos' | 'valor_vencido'> | null | undefined): string | null {
  if (!t || t.vencidos <= 0) return null;
  return `${t.vencidos} lançamento${t.vencidos === 1 ? '' : 's'} vencido${t.vencidos === 1 ? '' : 's'}, ` +
    `somando ${formatar(t.valor_vencido)}.`;
}

/** O saldo do período: o último ponto da série, ou o inicial quando não há série. */
export function saldoAoFim(f: FluxoDeCaixa | null | undefined): number | null {
  if (!f) return null;
  const ultimo = (f.linhas ?? [])[f.linhas.length - 1];
  return ultimo ? ultimo.saldo : (f.saldo_inicial ?? null);
}

/**
 * O dia em que o saldo previsto fica negativo, se ficar.
 *
 * É a pergunta que o dono faz ao abrir um fluxo de caixa, e que um gráfico
 * sozinho não responde: "em que dia eu fico sem dinheiro?".
 */
export function primeiroDiaNoVermelho(f: FluxoDeCaixa | null | undefined): string | null {
  if (!f?.linhas?.length) return null;
  let saldo = f.saldo_inicial ?? 0;
  for (const p of f.linhas) {
    saldo += (p.previsto_entrada || 0) - (p.previsto_saida || 0);
    if (saldo < 0) return p.quando;
  }
  return null;
}

// ------------------------------------------------------------
// A exportação para o contador
// ------------------------------------------------------------

export interface LinhaDaExportacao {
  competencia: string;
  tipo: string;
  conta_codigo: string;
  conta_nome: string;
  descricao: string;
  centro_custo: string;
  valor: number;
  vencimento: string | null;
  pago_em: string | null;
  valor_pago: number | null;
  status: string;
  origem: string;
  anexo: string;
  observacao: string;
}

/** As colunas do arquivo, na ordem. É o contrato com o contador. */
export const COLUNAS_DA_EXPORTACAO: Array<{ chave: keyof LinhaDaExportacao; titulo: string }> = [
  { chave: 'competencia', titulo: 'Competência' },
  { chave: 'tipo', titulo: 'Tipo' },
  { chave: 'conta_codigo', titulo: 'Conta' },
  { chave: 'conta_nome', titulo: 'Descrição da conta' },
  { chave: 'descricao', titulo: 'Histórico' },
  { chave: 'centro_custo', titulo: 'Centro de custo' },
  { chave: 'valor', titulo: 'Valor' },
  { chave: 'vencimento', titulo: 'Vencimento' },
  { chave: 'pago_em', titulo: 'Baixa' },
  { chave: 'valor_pago', titulo: 'Valor pago' },
  { chave: 'status', titulo: 'Situação' },
  { chave: 'origem', titulo: 'Origem' },
  { chave: 'anexo', titulo: 'Anexo' },
  { chave: 'observacao', titulo: 'Observação' },
];

const dataBr = (d: string | null | undefined) =>
  d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : '';

const numeroBr = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '' : n.toFixed(2).replace('.', ',');

const escapar = (v: string) =>
  /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/**
 * O CSV que o contador abre no Excel.
 *
 * Terceiro critério de pronto do plano — e ele mora nos detalhes, não na
 * consulta:
 *
 * - SEPARADOR `;`, não vírgula. O Excel em português usa a vírgula como
 *   decimal; com vírgula separando colunas, R$ 1.234,56 racha em duas células
 *   e a planilha inteira sai torta.
 * - DECIMAL com vírgula, pelo mesmo motivo — com ponto, o Excel lê 1234.56
 *   como texto e não soma a coluna.
 * - DATA em dd/mm/aaaa.
 * - BOM no começo. Sem ele o Excel abre em Latin-1 e "Comissão" vira
 *   "ComissÃ£o" em toda linha.
 */
export function csvParaContador(linhas: LinhaDaExportacao[]): string {
  const cabecalho = COLUNAS_DA_EXPORTACAO.map((c) => escapar(c.titulo)).join(';');
  const corpo = (linhas ?? []).map((l) =>
    COLUNAS_DA_EXPORTACAO.map(({ chave }) => {
      const v = l?.[chave];
      if (chave === 'valor' || chave === 'valor_pago') return numeroBr(v as number);
      if (chave === 'competencia' || chave === 'vencimento' || chave === 'pago_em') {
        return dataBr(v as string);
      }
      return escapar(String(v ?? ''));
    }).join(';')
  );
  // \r\n: é o fim de linha que o Excel espera, e o que o Bloco de Notas mostra
  // certo no Windows.
  return '﻿' + [cabecalho, ...corpo].join('\r\n') + '\r\n';
}

/** O nome do arquivo: mês e imobiliária, para não virar "export(3).csv". */
export function nomeDoArquivo(de: string, ate: string): string {
  const mesmoMes = de?.slice(0, 7) === ate?.slice(0, 7);
  return mesmoMes
    ? `financeiro-${de.slice(0, 7)}.csv`
    : `financeiro-${de}-a-${ate}.csv`;
}

const formatar = (v: number) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
    .replace(/\u00A0/g, ' ');
