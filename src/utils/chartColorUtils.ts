/**
 * Utilitários para cores de gráficos com gradiente azul inteligente
 * Quanto maior o valor, mais escuro o azul
 */

// Paleta de azul gradiente (do mais escuro ao mais claro)
export const BLUE_GRADIENT_PALETTE = {
  veryDark: '#1a233b',    // Azul Muito Escuro - Para valores MAIORES
  dark: '#23385f',        // Azul Escuro
  mediumDark: '#2a4a8d',  // Azul Médio-Escuro
  mediumLight: '#6391c5', // Azul Médio-Claro
  light: '#8fc2e9',       // Azul Claro
  veryLight: '#8ec8f2'    // Azul Muito Claro - Para valores MENORES
} as const;

export const BLUE_GRADIENT_ARRAY = [
  BLUE_GRADIENT_PALETTE.veryDark,
  BLUE_GRADIENT_PALETTE.dark,
  BLUE_GRADIENT_PALETTE.mediumDark,
  BLUE_GRADIENT_PALETTE.mediumLight,
  BLUE_GRADIENT_PALETTE.light,
  BLUE_GRADIENT_PALETTE.veryLight
];

/**
 * Gera cores de gradiente azul baseado nos valores
 * Valores MAIORES recebem tons MAIS ESCUROS
 * Valores MENORES recebem tons MAIS CLAROS
 * 
 * @param values Array de valores numéricos
 * @returns Array de cores correspondentes em gradiente azul
 */
export function getBlueGradientColors(values: number[]): string[] {
  if (values.length === 0) return [];
  
  // Se todos os valores forem 0 ou iguais, retornar cor média para todos
  const uniqueValues = new Set(values);
  if (uniqueValues.size === 1 || values.every(v => v === 0)) {
    return values.map(() => BLUE_GRADIENT_PALETTE.mediumDark);
  }
  
  // Encontrar min e max
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  
  // Se range for 0 (todos iguais), retornar cor média
  if (range === 0) {
    return values.map(() => BLUE_GRADIENT_PALETTE.mediumDark);
  }
  
  // Mapear cada valor para uma cor do gradiente
  return values.map(value => {
    // Normalizar valor entre 0 e 1
    const normalized = (value - min) / range;
    
    // Quanto MAIOR o valor normalizado, MAIS ESCURO o azul
    // 1.0 = veryDark, 0.0 = veryLight
    const colorIndex = Math.floor((1 - normalized) * (BLUE_GRADIENT_ARRAY.length - 1));
    
    // Inverter: valores altos = índice baixo (cores escuras)
    // valores baixos = índice alto (cores claras)
    return BLUE_GRADIENT_ARRAY[colorIndex];
  });
}

/**
 * Gera uma única cor baseada em um valor relativo
 * @param value Valor atual
 * @param min Valor mínimo do conjunto
 * @param max Valor máximo do conjunto
 * @returns Cor do gradiente azul
 */
export function getSingleBlueGradientColor(value: number, min: number, max: number): string {
  const range = max - min;
  
  if (range === 0) {
    return BLUE_GRADIENT_PALETTE.mediumDark;
  }
  
  const normalized = (value - min) / range;
  const colorIndex = Math.floor((1 - normalized) * (BLUE_GRADIENT_ARRAY.length - 1));
  
  return BLUE_GRADIENT_ARRAY[colorIndex];
}

/**
 * Ordena dados e retorna cores correspondentes aos valores ordenados
 * Útil para gráficos de ranking
 * 
 * @param data Array de objetos com propriedade 'value'
 * @returns Array de cores ordenadas por valor (maior = mais escuro)
 */
export function getBlueGradientColorsForRanking<T extends { value: number }>(data: T[]): string[] {
  const values = data.map(d => d.value);
  return getBlueGradientColors(values);
}

/**
 * Retorna cores para gráfico de barras com valores
 * @param values Array de valores
 * @returns Array de cores em gradiente azul
 */
export function getBarChartBlueGradient(values: number[]): string[] {
  return getBlueGradientColors(values);
}

/**
 * Retorna cores para gráfico de pizza/donut com valores
 * @param values Array de valores
 * @returns Array de cores em gradiente azul
 */
export function getPieChartBlueGradient(values: number[]): string[] {
  return getBlueGradientColors(values);
}

/**
 * Retorna cores para gráfico de linha (timeline)
 * Para linhas, geralmente usamos uma cor consistente
 * Mas se houver múltiplas séries, usa gradiente
 * @param seriesCount Número de séries
 * @returns Array de cores
 */
export function getLineChartBlueGradient(seriesCount: number): string[] {
  if (seriesCount === 1) {
    return [BLUE_GRADIENT_PALETTE.mediumDark];
  }
  
  // Para múltiplas séries, distribuir uniformemente no gradiente
  const colors: string[] = [];
  for (let i = 0; i < seriesCount; i++) {
    const index = Math.floor((i / (seriesCount - 1)) * (BLUE_GRADIENT_ARRAY.length - 1));
    colors.push(BLUE_GRADIENT_ARRAY[index]);
  }
  
  return colors;
}

