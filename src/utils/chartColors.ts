/**
 * 🎨 PALETA DE CORES DOS GRÁFICOS - GRADIENTE AZUL
 * 
 * Paleta baseada em gradiente azul onde:
 * - Valores BAIXOS: Azul Médio Escuro (#4a7ab0) - um pouco mais escuro
 * - Valores MÉDIOS: Azul Escuro/Royal (#1e4d8b)
 * - Valores ALTOS: Azul Intenso (#2d5f9f) - mais claro que antes
 */

// Cores principais do gradiente azul (ordenadas do claro ao escuro)
export const BLUE_GRADIENT = {
  light: '#4a7ab0',   // Azul Médio Escuro (74, 122, 176) - valores baixos (mais escuro)
  medium: '#1e4d8b',  // Azul Escuro/Royal (30, 77, 139) - valores médios
  dark: '#2d5f9f',    // Azul Intenso (45, 95, 159) - valores altos (mais claro)
} as const;

// Paleta completa com variações para diferentes contextos
export const CHART_COLORS = {
  // Gradiente principal (5 níveis)
  gradient: [
    '#4a7ab0', // Nível 1 - Mais claro (ajustado: mais escuro)
    '#3d6a9d', // Nível 2
    '#315a8a', // Nível 3
    '#264a77', // Nível 4
    '#1e4d8b', // Nível 5 (Azul Escuro/Royal)
  ],
  
  // Gradiente estendido (10 níveis) - para gráficos com muitas categorias
  gradientExtended: [
    '#4a7ab0', // 1 - Mais claro (ajustado: mais escuro)
    '#4471a6', // 2
    '#3e689c', // 3
    '#385f92', // 4
    '#325688', // 5
    '#2c4d7e', // 6
    '#264474', // 7
    '#1e4d8b', // 8 (Azul Escuro/Royal)
    '#2856a1', // 9
    '#2d5f9f', // 10 (ajustado: mais claro)
  ],
  
  // Cores específicas
  primary: '#1e4d8b',    // Azul Escuro/Royal
  secondary: '#4a7ab0',  // Azul Médio Escuro (ajustado)
  accent: '#2d5f9f',     // Azul Intenso (ajustado)
  
  // Cores para estados
  success: '#1e4d8b',
  warning: '#5b8bc4',
  danger: '#1a2332',
  info: '#4a78b0',
  
  // Backgrounds com transparência
  backgrounds: {
    light: 'rgba(74, 122, 176, 0.1)',   // #4a7ab0 com 10% opacidade
    medium: 'rgba(30, 77, 139, 0.1)',   // #1e4d8b com 10% opacidade
    dark: 'rgba(45, 95, 159, 0.1)',     // #2d5f9f com 10% opacidade
  },
  
  // Borders
  borders: {
    light: 'rgba(74, 122, 176, 0.3)',
    medium: 'rgba(30, 77, 139, 0.3)',
    dark: 'rgba(45, 95, 159, 0.3)',
  },
} as const;

/**
 * Gera uma cor do gradiente baseado no valor
 * @param value Valor atual
 * @param max Valor máximo
 * @param reverse Se true, inverte o gradiente (alto = claro)
 * @returns Cor em formato HEX
 */
export function getColorByValue(value: number, max: number, reverse: boolean = false): string {
  const percentage = max > 0 ? value / max : 0;
  
  // Se reverse = true, valores altos ficam claros (invertido)
  const adjustedPercentage = reverse ? 1 - percentage : percentage;
  
  if (adjustedPercentage < 0.33) {
    return BLUE_GRADIENT.light;
  } else if (adjustedPercentage < 0.67) {
    return BLUE_GRADIENT.medium;
  } else {
    return BLUE_GRADIENT.dark;
  }
}

/**
 * Gera um array de cores do gradiente baseado em valores
 * @param values Array de valores
 * @param reverse Se true, inverte o gradiente
 * @returns Array de cores
 */
export function getGradientColors(values: number[], reverse: boolean = false): string[] {
  const max = Math.max(...values);
  return values.map(value => getColorByValue(value, max, reverse));
}

/**
 * Retorna uma cor específica do gradiente por índice
 * @param index Índice do item
 * @param total Total de itens
 * @returns Cor em formato HEX
 */
export function getColorByIndex(index: number, total: number): string {
  const gradient = total <= 5 ? CHART_COLORS.gradient : CHART_COLORS.gradientExtended;
  const colorIndex = Math.floor((index / total) * (gradient.length - 1));
  return gradient[Math.min(colorIndex, gradient.length - 1)];
}

/**
 * Gera cores para gráfico de pizza/donut
 * @param count Número de fatias
 * @returns Array de cores
 */
export function getPieChartColors(count: number): string[] {
  if (count <= 5) {
    return CHART_COLORS.gradient.slice(0, count);
  }
  return CHART_COLORS.gradientExtended.slice(0, Math.min(count, 10));
}

/**
 * Gera cores para gráfico de barras baseado em valores
 * @param values Array de valores
 * @param reverse Se true, valores altos ficam claros
 * @returns Array de cores
 */
export function getBarChartColors(values: number[], reverse: boolean = false): string[] {
  return getGradientColors(values, reverse);
}

/**
 * Gera cores para gráfico de linha
 * @param lineIndex Índice da linha
 * @param totalLines Total de linhas
 * @returns Cor da linha
 */
export function getLineChartColor(lineIndex: number, totalLines: number = 1): string {
  if (totalLines === 1) return CHART_COLORS.primary;
  return getColorByIndex(lineIndex, totalLines);
}

/**
 * Converte HEX para RGBA
 * @param hex Cor em HEX
 * @param alpha Opacidade (0-1)
 * @returns Cor em formato RGBA
 */
export function hexToRGBA(hex: string, alpha: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Retorna cor de background baseada em uma cor primária
 * @param color Cor primária em HEX
 * @param alpha Opacidade (padrão 0.1)
 * @returns Cor de background em RGBA
 */
export function getBackgroundColor(color: string, alpha: number = 0.1): string {
  return hexToRGBA(color, alpha);
}

/**
 * Retorna cor de borda baseada em uma cor primária
 * @param color Cor primária em HEX
 * @param alpha Opacidade (padrão 0.3)
 * @returns Cor de borda em RGBA
 */
export function getBorderColor(color: string, alpha: number = 0.3): string {
  return hexToRGBA(color, alpha);
}

// Export default para facilitar imports
export default CHART_COLORS;

