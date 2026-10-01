/**
 * A.3 · Flags do corretor — o que a tela faz com o que o banco devolve.
 *
 * A classificação e o "falta para subir" são do banco (flags_do_mes, em
 * 20261010_flags_do_corretor.sql): é a mesma conta que fecha o mês. Aqui só se
 * escreve em português, soma o mix e agrupa por equipe — sempre a partir da
 * mesma lista que a tabela mostra, para os números baterem por construção.
 */
export type Metrica = 'vendas' | 'visitas' | 'captacoes';
export type Flag = 'verde' | 'amarelo' | 'vermelho';
export type Atuacao = 'lancamentos' | 'prontos';

export const METRICAS: readonly Metrica[] = ['vendas', 'visitas', 'captacoes'];
const NOME: Record<Metrica, [string, string]> = {
  vendas: ['venda', 'vendas'],
  visitas: ['visita', 'visitas'],
  captacoes: ['captação', 'captações'],
};
export const ROTULO_DA_ATUACAO: Record<Atuacao, string> = { lancamentos: 'Lançamentos', prontos: 'Prontos' };
export const ROTULO_DA_FLAG: Record<Flag, string> = { verde: 'Verde', amarelo: 'Amarelo', vermelho: 'Vermelho' };

export interface PessoaComFlag {
  user_id: string;
  nome: string;
  equipe: string;
  atuacao: Atuacao | null;
  metricas: Record<Metrica, number>;
  flag: Flag | null;
  proximo: 'verde' | 'amarelo' | null;
  falta: Partial<Record<Metrica, number>> | null;
  /** A flag do mês anterior, como ficou no dia em que fechou. */
  antes: Flag | null;
}

const quantidade = (m: Metrica, n: number) => `${n} ${NOME[m][n === 1 ? 0 : 1]}`;

function lista(partes: string[]): string {
  return partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** "faltam 2 visitas para o amarelo" · "falta 1 venda e 3 visitas para o verde" · "—" */
export function textoDaFalta(p: Pick<PessoaComFlag, 'flag' | 'proximo' | 'falta'>): string {
  if (!p.flag || !p.proximo || !p.falta) return '—';
  const itens = METRICAS.filter((m) => (p.falta?.[m] ?? 0) > 0).map((m) => [m, p.falta![m]!] as const);
  if (itens.length === 0) return '—';
  const verbo = itens.length === 1 && itens[0][1] === 1 ? 'falta' : 'faltam';
  return `${verbo} ${lista(itens.map(([m, n]) => quantidade(m, n)))} para o ${p.proximo}`;
}

export interface MixDaCasa {
  contagem: Record<Flag, number>;
  /** Inteiros que somam 100 (maior resto) — ou zeros, se ninguém foi classificado. */
  percentual: Record<Flag, number>;
  classificados: number;
  semAtuacao: number;
  semRegua: number;
}

const CORES: readonly Flag[] = ['verde', 'amarelo', 'vermelho'];

export function mixDaCasa(pessoas: PessoaComFlag[]): MixDaCasa {
  const contagem: Record<Flag, number> = { verde: 0, amarelo: 0, vermelho: 0 };
  let semAtuacao = 0;
  let semRegua = 0;
  for (const p of pessoas) {
    if (!p.atuacao) semAtuacao++;
    else if (!p.flag) semRegua++;
    else contagem[p.flag]++;
  }
  const classificados = CORES.reduce((s, c) => s + contagem[c], 0);
  const percentual: Record<Flag, number> = { verde: 0, amarelo: 0, vermelho: 0 };
  if (classificados > 0) {
    // Arredondar cada um sozinho dá 99 ou 101; o maior resto garante 100.
    const exatos = CORES.map((c) => ({ c, v: (100 * contagem[c]) / classificados }));
    for (const e of exatos) percentual[e.c] = Math.floor(e.v);
    let sobra = 100 - CORES.reduce((s, c) => s + percentual[c], 0);
    for (const e of [...exatos].sort((a, b) => (b.v % 1) - (a.v % 1))) {
      if (sobra-- <= 0) break;
      percentual[e.c]++;
    }
  }
  return { contagem, percentual, classificados, semAtuacao, semRegua };
}

export interface LinhaDaEquipe {
  equipe: string;
  corretores: number;
  contagem: Record<Flag, number>;
  naoClassificados: number;
  metricas: Record<Metrica, number>;
}

export function porEquipe(pessoas: PessoaComFlag[]): LinhaDaEquipe[] {
  const mapa = new Map<string, LinhaDaEquipe>();
  for (const p of pessoas) {
    const l = mapa.get(p.equipe) ?? {
      equipe: p.equipe, corretores: 0, contagem: { verde: 0, amarelo: 0, vermelho: 0 }, naoClassificados: 0,
      metricas: { vendas: 0, visitas: 0, captacoes: 0 },
    };
    l.corretores++;
    if (p.flag) l.contagem[p.flag]++;
    else l.naoClassificados++;
    for (const m of METRICAS) l.metricas[m] += p.metricas[m] ?? 0;
    mapa.set(p.equipe, l);
  }
  return [...mapa.values()].sort((a, b) => a.equipe.localeCompare(b.equipe));
}

// ---------- a régua ----------

/** Um caminho: as métricas exigidas juntas (E). A lista de caminhos é OU. */
export type Caminho = Partial<Record<Metrica, number>>;

/** Tira campos vazios e caminhos vazios. Lista vazia = o nível fica sem régua. */
export function limparCaminhos(caminhos: Caminho[]): Caminho[] {
  return caminhos
    .map((c) => Object.fromEntries(METRICAS.filter((m) => (c[m] ?? 0) > 0).map((m) => [m, c[m]])) as Caminho)
    .filter((c) => Object.keys(c).length > 0);
}

/** A mesma regra do CHECK do banco, para avisar antes de salvar. */
export function caminhoInvalido(c: Caminho): string | null {
  for (const m of METRICAS) {
    const v = c[m];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < 1 || v > 999) return 'Use números inteiros de 1 a 999.';
  }
  return null;
}

export function descreverCaminho(c: Caminho): string {
  return lista(METRICAS.filter((m) => c[m]).map((m) => quantidade(m, c[m]!)));
}
