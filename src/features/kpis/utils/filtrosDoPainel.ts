/**
 * Filtro clicando na linha (P3.2) — o estado, e como ele vive na URL.
 *
 * Funções puras. A URL é a fonte do estado, não uma cópia dele: é o que faz
 * "mandar a visão pronta por link" funcionar sem nenhum código a mais, e o que
 * mantém os contadores, os gráficos e as oito tabelas olhando para o mesmo
 * recorte — um store só, que por acaso é a barra de endereço.
 */

export const DIMENSOES = [
  'corretor',
  'equipe',
  'empreendimento',
  'construtora',
  'cidade',
  'bairro',
  'origem',
  'cliente',
] as const;

export type Dimensao = (typeof DIMENSOES)[number];

export type Filtros = Partial<Record<Dimensao, string[]>>;

export const ROTULO_DA_DIMENSAO: Record<Dimensao, string> = {
  corretor: 'Corretor',
  equipe: 'Equipe',
  empreendimento: 'Empreendimento',
  construtora: 'Construtora',
  cidade: 'Cidade',
  bairro: 'Bairro',
  origem: 'Origem',
  cliente: 'Cliente',
};

/** Só o que tem valor entra. Chave vazia na URL é lixo que confunde ao copiar. */
export function paraQuery(filtros: Filtros, extras: Record<string, string> = {}): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(extras)) if (v) q.set(k, v);
  for (const d of DIMENSOES) {
    const vals = filtros[d];
    if (vals && vals.length > 0) q.set(d, vals.join('|'));
  }
  return q;
}

/**
 * Lê os filtros da URL.
 *
 * `|` separa os valores porque vírgula aparece em nome de cliente e de
 * empreendimento ("Silva, Maria"), e separar por vírgula partiria o nome em
 * dois filtros que não existem.
 */
export function daQuery(params: URLSearchParams | string): Filtros {
  const q = typeof params === 'string' ? new URLSearchParams(params) : params;
  const out: Filtros = {};
  for (const d of DIMENSOES) {
    const bruto = q.get(d);
    if (!bruto) continue;
    const vals = bruto.split('|').map((s) => s.trim()).filter(Boolean);
    if (vals.length > 0) out[d] = vals;
  }
  return out;
}

/**
 * Clicar numa linha.
 *
 * Sem SHIFT, o clique TROCA o filtro daquela dimensão — clicar em outro
 * corretor mostra aquele corretor, não os dois. Com SHIFT, soma. E clicar de
 * novo no que já está escolhido remove: é como a pessoa desfaz sem procurar o X.
 */
export function aoClicar(
  filtros: Filtros,
  dimensao: Dimensao,
  valor: string,
  comShift: boolean
): Filtros {
  const atuais = filtros[dimensao] ?? [];
  const jaTem = atuais.includes(valor);

  if (!comShift) {
    // Clicar no único valor já escolhido limpa a dimensão.
    if (jaTem && atuais.length === 1) return semDimensao(filtros, dimensao);
    return { ...filtros, [dimensao]: [valor] };
  }

  const proximos = jaTem ? atuais.filter((v) => v !== valor) : [...atuais, valor];
  return proximos.length === 0 ? semDimensao(filtros, dimensao) : { ...filtros, [dimensao]: proximos };
}

function semDimensao(filtros: Filtros, dimensao: Dimensao): Filtros {
  const { [dimensao]: _fora, ...resto } = filtros;
  return resto;
}

/** O X de um chip. */
export function remover(filtros: Filtros, dimensao: Dimensao, valor: string): Filtros {
  const atuais = filtros[dimensao] ?? [];
  const proximos = atuais.filter((v) => v !== valor);
  return proximos.length === 0 ? semDimensao(filtros, dimensao) : { ...filtros, [dimensao]: proximos };
}

export interface Chip {
  dimensao: Dimensao;
  valor: string;
  rotulo: string;
}

/** Os chips, na ordem das dimensões — para não dançarem a cada clique. */
export function chips(filtros: Filtros): Chip[] {
  const out: Chip[] = [];
  for (const d of DIMENSOES) {
    for (const v of filtros[d] ?? []) {
      out.push({ dimensao: d, valor: v, rotulo: `${ROTULO_DA_DIMENSAO[d]}: ${v}` });
    }
  }
  return out;
}

export function quantosFiltros(filtros: Filtros): number {
  return DIMENSOES.reduce((n, d) => n + (filtros[d]?.length ?? 0), 0);
}

export function estaSelecionado(filtros: Filtros, dimensao: Dimensao, valor: string): boolean {
  return (filtros[dimensao] ?? []).includes(valor);
}

/**
 * Um nome sugerido para a visão salva, a partir do que está filtrado.
 *
 * Existe para o gestor não ter de inventar nome toda vez — e o nome sugerido
 * descreve o recorte, que é o que ele vai procurar depois no menu.
 */
export function nomeSugerido(filtros: Filtros, tipo: string): string {
  const partes = chips(filtros).slice(0, 2).map((c) => c.valor);
  if (tipo && tipo !== 'todos') partes.push(tipo === 'lancamento' ? 'Lançamentos' : 'Prontos/Terceiros');
  return partes.length ? partes.join(' · ') : 'Visão sem filtro';
}
