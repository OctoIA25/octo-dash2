/**
 * Interpreta um score numérico (0–100) em um rótulo qualitativo + intensidade.
 *
 * Apresentação pura: não calcula nem classifica perfil — apenas traduz um número
 * que JÁ existe (ex.: 87 → "Muito elevado") para reduzir carga cognitiva do leigo.
 * Briefing: "Ao invés de 87%, mostrar 'Muito elevado'".
 */

export type Intensidade = 'muito-baixa' | 'baixa' | 'moderada' | 'alta' | 'muito-alta';

export interface ScoreLabel {
  label: string;        // texto exibível, ex.: "Muito elevado"
  intensidade: Intensidade;
  /** 1–5, útil para preencher pontos/escala visual sem reinterpretar faixas */
  nivel: number;
}

const FAIXAS: ReadonlyArray<{ max: number; label: string; intensidade: Intensidade; nivel: number }> = [
  { max: 20,  label: 'Muito baixo',  intensidade: 'muito-baixa', nivel: 1 },
  { max: 40,  label: 'Baixo',        intensidade: 'baixa',       nivel: 2 },
  { max: 60,  label: 'Moderado',     intensidade: 'moderada',    nivel: 3 },
  { max: 80,  label: 'Elevado',      intensidade: 'alta',        nivel: 4 },
  { max: 100, label: 'Muito elevado', intensidade: 'muito-alta', nivel: 5 },
];

/**
 * @param score valor 0–100. Valores fora da faixa são clampados (entrada não confiável).
 */
export function scoreToLabel(score: number): ScoreLabel {
  const s = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
  const faixa = FAIXAS.find((f) => s <= f.max) ?? FAIXAS[FAIXAS.length - 1];
  return { label: faixa.label, intensidade: faixa.intensidade, nivel: faixa.nivel };
}

/**
 * Interpretação RELATIVA para o DISC: as 4 dimensões competem e somam ~100%, então
 * a média de cada uma é ~25% (não 50%). Aqui as faixas são ancoradas nessa média:
 * ~25% é "Equilibrado", e a dimensão dominante (tipicamente 35–50%) lê como "Forte"
 * ou "Predominante" — fiel ao modelo, ao contrário da faixa genérica 0–100.
 */
const FAIXAS_DISC: ReadonlyArray<{ max: number; label: string; intensidade: Intensidade; nivel: number }> = [
  { max: 12,  label: 'Pouco presente', intensidade: 'muito-baixa', nivel: 1 },
  { max: 22,  label: 'Secundário',     intensidade: 'baixa',       nivel: 2 },
  { max: 32,  label: 'Equilibrado',    intensidade: 'moderada',    nivel: 3 },
  { max: 42,  label: 'Forte',          intensidade: 'alta',        nivel: 4 },
  { max: 100, label: 'Predominante',   intensidade: 'muito-alta',  nivel: 5 },
];

export function discScoreToLabel(score: number): ScoreLabel {
  const s = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
  const faixa = FAIXAS_DISC.find((f) => s <= f.max) ?? FAIXAS_DISC[FAIXAS_DISC.length - 1];
  return { label: faixa.label, intensidade: faixa.intensidade, nivel: faixa.nivel };
}

/** Normaliza um percentual em decimal (0–1, como o DISC vem do banco) para 0–100. */
export function decimalToPercent(decimal: number): number {
  const d = Number.isFinite(decimal) ? decimal : 0;
  // ponytail: DISC vem 0–1; valores já em 0–100 (>1) passam direto, sem dobrar a escala.
  return d <= 1 ? Math.round(d * 100) : Math.round(d);
}

export type LetraDisc = 'D' | 'I' | 'S' | 'C';

/**
 * Percentuais DISC prontos para exibir: inteiros que somam exatamente 100.
 *
 * Duas coisas que as telas faziam de formas diferentes e agora fazem igual:
 *
 * 1. NORMALIZAR. As 4 dimensões competem entre si e devem somar 1,0. O cálculo
 *    atual garante isso, mas linhas antigas do banco não — e uma tela normalizava
 *    (dashboard admin) enquanto a outra só multiplicava por 100 (Meu Perfil),
 *    então a mesma pessoa aparecia com números diferentes em cada lugar.
 *
 * 2. ARREDONDAR EM CONJUNTO. Arredondar cada uma por si fazia as 4 barras somarem
 *    99% ou 101%. Aqui o resto maior recebe o ponto que sobra (maior-resto), então
 *    o total exibido é sempre 100.
 */
export function percentuaisDiscExibicao(
  brutos: Record<LetraDisc, number>,
): Record<LetraDisc, number> {
  const letras: LetraDisc[] = ['D', 'I', 'S', 'C'];
  const valores = letras.map((l) => (Number.isFinite(brutos[l]) ? Math.max(0, brutos[l]) : 0));
  const soma = valores.reduce((a, b) => a + b, 0);

  if (soma <= 0) return { D: 0, I: 0, S: 0, C: 0 };

  const exatos = valores.map((v) => (v / soma) * 100);
  const chao = exatos.map(Math.floor);
  let sobra = 100 - chao.reduce((a, b) => a + b, 0);

  // distribui a sobra para quem tem a maior parte fracionária
  const ordem = exatos
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto);

  const saida = [...chao];
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    saida[i]++;
    sobra--;
  }

  return Object.fromEntries(letras.map((l, i) => [l, saida[i]])) as Record<LetraDisc, number>;
}
