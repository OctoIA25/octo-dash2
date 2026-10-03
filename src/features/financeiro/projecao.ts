/**
 * Projeção de caixa em 90 dias — as contas da tela, fora do componente.
 *
 * O banco devolve, por coluna (as semanas que restam do mês, depois os dois
 * meses seguintes), quanto vence em cada linha da planilha do chefe. Aqui fica
 * o que é aritmética de tela: entradas, saídas, o saldo que passa de uma coluna
 * para a outra e o alerta.
 *
 * A coluna "Atrasado / sem data" NÃO entra no saldo (decidido em 03/10): somar
 * ao mês o que já devia ter entrado daria uma folga que talvez não exista.
 */
import { parseNumeric } from '@/features/relatorios/import/generic/metadataDiscovery';

export type LinhaDaProjecao =
  | 'comissoes' | 'parceiros' | 'outras_entradas'
  | 'custos_fixos' | 'repasses' | 'repasses_estimados' | 'marketing' | 'provisoes' | 'impostos';

export type ValoresDaColuna = Partial<Record<LinhaDaProjecao, number>>;

export interface ColunaDoBanco extends ValoresDaColuna {
  id: string;
  tipo: 'semana' | 'mes';
  de: string;
  ate: string;
}

export interface ProjecaoDoBanco {
  hoje: string;
  saldo_inicial: number;
  saldo_em: string | null;
  tem_conta: boolean;
  alerta: number | null;
  colunas: ColunaDoBanco[];
  atrasado: ValoresDaColuna & { lancamentos: number; sem_data?: number };
  regras: { repasse_estimado_pct: number; provisao_pct: number };
}

export interface ColunaCalculada extends ColunaDoBanco {
  rotulo: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldoFinal: number;
  abaixoDoAlerta: boolean;
}

export const ENTRADAS: LinhaDaProjecao[] = ['comissoes', 'parceiros', 'outras_entradas'];
export const SAIDAS: LinhaDaProjecao[] = [
  'custos_fixos', 'repasses', 'repasses_estimados', 'marketing', 'provisoes', 'impostos',
];

export const ROTULO_DA_LINHA: Record<LinhaDaProjecao, string> = {
  comissoes: 'Comissões de vendas',
  parceiros: 'Repasses de parceiros',
  outras_entradas: 'Outras entradas',
  custos_fixos: 'Custos fixos',
  repasses: 'Comissões a pagar aos corretores',
  repasses_estimados: 'Comissões a pagar (estimado)',
  marketing: 'Marketing pago',
  provisoes: 'Provisões 13º + férias (estimado)',
  impostos: 'Impostos',
};

/** Só aparecem quando têm valor: uma linha de zeros em todas as colunas é ruído. */
const SO_COM_VALOR: LinhaDaProjecao[] = ['outras_entradas', 'impostos'];

const centavos = (n: number) => Math.round(n * 100) / 100;

export const somaDe = (c: ValoresDaColuna, linhas: LinhaDaProjecao[]) =>
  centavos(linhas.reduce((s, l) => s + (Number(c[l]) || 0), 0));

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function rotuloDaColuna(c: Pick<ColunaDoBanco, 'tipo' | 'de' | 'ate'>): string {
  const [ano, mes, dia] = c.de.split('-');
  if (c.tipo === 'mes') return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
  const [, mesAte, diaAte] = c.ate.split('-');
  return `${dia}–${diaAte}/${mesAte}`;
}

export function montarProjecao(
  p: Pick<ProjecaoDoBanco, 'saldo_inicial' | 'alerta' | 'colunas'>,
): ColunaCalculada[] {
  let saldo = Number(p.saldo_inicial) || 0;
  return (p.colunas ?? []).map((c) => {
    const entradas = somaDe(c, ENTRADAS);
    const saidas = somaDe(c, SAIDAS);
    const saldoInicial = saldo;
    saldo = centavos(saldo + entradas - saidas);
    return {
      ...c,
      rotulo: rotuloDaColuna(c),
      saldoInicial,
      entradas,
      saidas,
      saldoFinal: saldo,
      abaixoDoAlerta: p.alerta != null && saldo < p.alerta,
    };
  });
}

export const linhaVisivel = (linha: LinhaDaProjecao, colunas: ValoresDaColuna[]) =>
  !SO_COM_VALOR.includes(linha) || colunas.some((c) => (Number(c[linha]) || 0) !== 0);

/** "R$ 150.000,00", "4.000,50", "100000" → número; vazio → null (tira o alerta). */
export function lerValor(texto: string): number | null {
  if (!texto.trim()) return null;
  return parseNumeric(texto);
}

/**
 * O dia anterior, em 'YYYY-MM-DD'. É o padrão do "saldo do extrato": o saldo
 * vale no FIM do dia escolhido, e com "hoje" o que fosse baixado hoje depois
 * de digitar o saldo sumiria das colunas sem entrar nele.
 */
export function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * O que o formulário do saldo mostra ao abrir: o saldo e a data gravados NA
 * CONTA. O saldo da projeção soma todas as contas e o que entrou depois da data
 * informada; gravá-lo de volta numa conta só contaria isso em dobro.
 */
export function saldoParaEditar(
  conta: { saldo_inicial: number; saldo_em: string | null } | undefined,
  hoje: string,
): { texto: string; dia: string } {
  if (conta?.saldo_em) return { texto: String(conta.saldo_inicial).replace('.', ','), dia: conta.saldo_em };
  return { texto: '', dia: diaAnterior(hoje) };
}
