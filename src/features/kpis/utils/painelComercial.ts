/**
 * Painel comercial (P3.1) — como cada contador se lê.
 *
 * Funções puras. Duas regras atravessam tudo:
 *
 *  1. **Ausência nunca vira zero.** Meta não cadastrada é "—", não 0% — zero
 *     pintaria uma barra vermelha contra uma meta que ninguém combinou.
 *  2. **Todo contador diz o que ficou de fora.** Oito das 37 vendas reais têm
 *     comissão e nenhum VGV; sem dizer isso, o ticket médio sai 28% menor e
 *     parece certo.
 */

export interface PeriodoComercial {
  vendas: number;
  vgv: number;
  vgc: number;
  vendas_com_vgv: number;
  vendas_sem_vgv: number;
  ticket_medio: number | null;
  pct_comissao: number | null;
  /** NOMES distintos que venderam — não pessoas. Ver `produtividade`. */
  nomes_que_venderam: number;
  /** Quantos desses nomes a Dash reconhece como membro cadastrado. */
  nomes_reconhecidos: number;
  sem_classificacao: number;
}

export interface PainelComercial {
  de: string;
  ate: string;
  tipo: 'todos' | 'lancamento' | 'terceiros';
  atual: PeriodoComercial;
  mes_anterior: PeriodoComercial;
  ano_anterior: PeriodoComercial;
  propostas: number;
  ativos: number;
  metas: { vendas: number | null; propostas: number | null; vgc: number | null; cadastradas: number };
  projecao: {
    dias_uteis_decorridos: number;
    dias_uteis_no_mes: number;
    vendas: number | null;
    vgv: number | null;
  } | null;
}

export const ROTULO_DO_TIPO = {
  todos: 'Todos',
  lancamento: 'Lançamentos',
  terceiros: 'Prontos / Terceiros',
} as const;

/** "R$ 14,5 M", "R$ 737 mil", "R$ 1.234". Painel não é extrato. */
export function reais(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1_000_000) return `R$ ${(Math.round(n / 100_000) / 10).toFixed(1).replace('.', ',')} M`;
  if (Math.abs(n) >= 10_000) return `R$ ${Math.round(n / 1000)} mil`;
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
}

export function percentual(v: number | null | undefined, casas = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Number(v).toFixed(casas).replace('.', ',')}%`;
}

export interface Variacao {
  /** Variação percentual. Null quando não dá para comparar. */
  pct: number | null;
  texto: string;
  direcao: 'subiu' | 'caiu' | 'igual' | 'sem_base';
}

/**
 * A seta de comparação.
 *
 * Base zero NÃO vira "+∞" nem "+100%": sair de zero para qualquer coisa é uma
 * novidade, não um crescimento percentual. O texto diz isso.
 */
export function variacao(atual: number | null, base: number | null): Variacao {
  const a = Number(atual);
  const b = Number(base);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { pct: null, texto: 'sem comparação', direcao: 'sem_base' };
  }
  if (b === 0) {
    return {
      pct: null,
      texto: a === 0 ? 'igual (zero nos dois)' : 'não havia base',
      direcao: a === 0 ? 'igual' : 'sem_base',
    };
  }
  const pct = ((a - b) / Math.abs(b)) * 100;
  const arred = Math.round(pct * 10) / 10;
  if (arred === 0) return { pct: 0, texto: 'igual', direcao: 'igual' };
  return {
    pct: arred,
    texto: `${arred > 0 ? '+' : ''}${arred.toFixed(1).replace('.', ',')}%`,
    direcao: arred > 0 ? 'subiu' : 'caiu',
  };
}

export interface ContraMeta {
  pct: number | null;
  texto: string;
  /** true quando não há meta cadastrada — a tela convida a cadastrar. */
  semMeta: boolean;
}

/**
 * O quanto da meta já foi feito.
 *
 * Medido em 21/09/2026: a tabela de metas está VAZIA na plataforma inteira.
 * Por isso "sem meta" é um estado de primeira classe, e não um zero disfarçado.
 */
export function contraMeta(realizado: number | null, meta: number | null | undefined): ContraMeta {
  if (meta == null || !Number.isFinite(meta) || meta <= 0) {
    return { pct: null, texto: 'meta não cadastrada', semMeta: true };
  }
  const r = Number(realizado) || 0;
  const pct = Math.round((r / meta) * 100);
  return { pct, texto: `${pct}% de ${meta.toLocaleString('pt-BR')}`, semMeta: false };
}

/**
 * Produtivos: quem vendeu, sobre quem podia vender.
 *
 * O plano pede a porcentagem. Medido em 21/09/2026, ela NÃO É CALCULÁVEL: as 37
 * vendas trazem 14 nomes distintos, mas são primeiro nome, apelido e até dois
 * numa célula só ("Flávia e Humberto") — "Humberto" e "Humberto Martinez" são
 * quase certamente a mesma pessoa. Só 3 dos 14 casam com um membro cadastrado.
 *
 * Dividir 14 por 19 daria 74%: um número redondo sobre nomes que se repetem.
 * Decidido pelo chefe: mostrar o que se sabe e dizer o que falta.
 *
 * A porcentagem só aparece quando TODOS os nomes forem reconhecidos — aí ela é
 * verdade, e não antes.
 */
export function produtividade(
  nomesQueVenderam: number,
  nomesReconhecidos: number,
  ativos: number
): { pct: number | null; texto: string; explicacao: string | null } {
  if (!ativos) {
    return {
      pct: null,
      texto: `${nomesQueVenderam} venderam`,
      explicacao: 'Nenhum membro cadastrado nesta imobiliária — não há base para a porcentagem.',
    };
  }
  if (nomesReconhecidos < nomesQueVenderam) {
    const naoReconhecidos = nomesQueVenderam - nomesReconhecidos;
    return {
      pct: null,
      texto: `${nomesQueVenderam} nomes venderam`,
      explicacao:
        `${naoReconhecidos} desses nomes não batem com nenhum membro cadastrado ` +
        `(a planilha traz apelido, primeiro nome, às vezes dois numa célula). ` +
        `Enquanto não forem conciliados, a % sobre os ${ativos} ativos seria um número redondo em cima de nome repetido.`,
    };
  }
  const pct = Math.round((nomesReconhecidos / ativos) * 100);
  return { pct, texto: `${nomesReconhecidos} de ${ativos} (${pct}%)`, explicacao: null };
}

/**
 * O rodapé de cada contador que depende de VGV.
 *
 * É a frase que impede o ticket médio de mentir: 8 das 37 vendas reais têm
 * comissão e nenhum valor de venda, e sem este aviso o número sai 28% menor
 * parecendo exato.
 */
export function avisoDeVgv(p: PeriodoComercial | null): string | null {
  if (!p || !p.vendas_sem_vgv) return null;
  const s = p.vendas_sem_vgv > 1 ? 's' : '';
  return `${p.vendas_sem_vgv} venda${s} sem VGV registrado ficaram de fora deste cálculo (a comissão delas continua somando).`;
}

/** Vendas cujo empreendimento ninguém classificou — somem ao filtrar. */
export function avisoDeClassificacao(p: PeriodoComercial | null, tipo: string): string | null {
  if (!p || !p.sem_classificacao) return null;
  if (tipo !== 'todos') return null;
  const s = p.sem_classificacao > 1 ? 's' : '';
  return `${p.sem_classificacao} venda${s} de empreendimento sem classificação: não aparecem ao filtrar por Lançamentos nem por Prontos/Terceiros.`;
}
