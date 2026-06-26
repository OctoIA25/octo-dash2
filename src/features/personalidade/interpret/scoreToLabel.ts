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
