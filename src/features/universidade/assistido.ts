/**
 * A.7 · Quanto o player de fato TOCOU — não onde a barra está.
 *
 * A cada leitura (uma por segundo, com o vídeo tocando), soma só o avanço
 * natural: até 2,5 s desde a leitura anterior (cobre o vídeo em 2×). Pulo
 * para frente ou para trás não soma nada — arrastar até o fim não assiste.
 * O banco ainda limita o que aceita pelo relógio (registrar_progresso_aula).
 *
 * ponytail: rever o mesmo trecho conta de novo; o "já visto" exato pediria
 * guardar os intervalos por aula. Se virar problema, é aqui.
 */
export interface Assistido { total: number; ultimaPosicao: number | null }

export const AVANCO_NATURAL_MAX = 2.5;

export function comecar(totalJaVisto: number): Assistido {
  return { total: totalJaVisto, ultimaPosicao: null };
}

/** Nova leitura do player tocando, na posição `posicao` (segundos). */
export function lerPosicao(a: Assistido, posicao: number): Assistido {
  if (a.ultimaPosicao === null) return { ...a, ultimaPosicao: posicao };
  const avanco = posicao - a.ultimaPosicao;
  const natural = avanco > 0 && avanco <= AVANCO_NATURAL_MAX;
  return { total: natural ? a.total + avanco : a.total, ultimaPosicao: posicao };
}

/** Pausou ou parou: a próxima leitura recomeça a contar dali, sem somar o salto. */
export function pausar(a: Assistido): Assistido {
  return { ...a, ultimaPosicao: null };
}

export const percentual = (vistos: number, duracao: number) =>
  duracao > 0 ? Math.min(100, Math.floor((100 * vistos) / duracao)) : 0;

/** "4:05" ou "1:02:03". */
export function duracaoBR(seg: number): string {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = Math.floor(seg % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** "4:05" → 245; "1:02:03" → 3723; número puro = segundos. null se inválido. */
export function lerDuracao(texto: string): number | null {
  const t = texto.trim();
  if (/^\d+$/.test(t)) return Number(t) || null;
  const partes = t.split(':').map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (partes.length < 2 || partes.length > 3 || partes.some(Number.isNaN)) return null;
  const [s, m, h = 0] = [...partes].reverse();
  if (s >= 60 || m >= 60) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}
