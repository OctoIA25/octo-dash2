/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

/**
 * PALETA DE CORES OFICIAL DO OCTODASH
 * Gradiente Azul Profissional
 * REGRA: Quanto MAIOR o valor/número, MAIS ESCURO o tom de azul
 * REGRA: Quanto MENOR o valor/número, MAIS CLARO o tom de azul
 */

// CORES PRIMÁRIAS - Gradiente Azul (Do mais escuro ao mais claro)
// VALORES MAIORES = TONS MAIS ESCUROS
// VALORES MENORES = TONS MAIS CLAROS
export const COLORS = {
  // AZUL - Gradiente do mais escuro ao mais claro
  blue: {
    ultimanteDark: '#14263C', // Azul Marinho Escuro (Final Funis)
    veryDark: '#1a233b',     // Azul Muito Escuro (valores MAIORES)
    dark: '#23385f',         // Azul Escuro
    mediumDark: '#2a4a8d',   // Azul Médio-Escuro
    mediumLight: '#6391c5',  // Azul Médio-Claro
    light: '#8fc2e9',        // Azul Claro
    veryLight: '#8ec8f2'     // Azul Muito Claro (valores MENORES)
  },
  
  // VERDE - Tons complementares (mantidos para compatibilidade)
  green: {
    dark: '#065F46',
    medium: '#047857',
    light: '#059669',
    vivid: '#10B981'
  },
  
  // LARANJA - Tons complementares (mantidos para compatibilidade)
  orange: {
    dark: '#C2410C',
    medium: '#EA580C',
    light: '#F97316',
    vivid: '#FB923C'
  },
  
  // VERMELHO - Tons complementares (mantidos para compatibilidade)
  red: {
    dark: '#991B1B',
    medium: '#DC2626',
    light: '#EF4444',
    vivid: '#F87171'
  },
  
  // AMARELO - Para alertas e destaques
  yellow: {
    dark: '#A16207',
    medium: '#CA8A04',
    light: '#EAB308',
    vivid: '#FACC15'
  },
  
  // ROXO - Para elementos especiais
  purple: {
    dark: '#6B21A8',
    medium: '#7C3AED',
    light: '#8B5CF6',
    vivid: '#A78BFA'
  },
  
  // CINZA - Para elementos neutros
  gray: {
    dark: '#374151',
    medium: '#6B7280',
    light: '#9CA3AF',
    vivid: '#D1D5DB'
  }
} as const;

// PALETAS PARA DIFERENTES TIPOS DE GRÁFICOS

/**
 * Paleta para FUNIL (9 etapas) - Gradiente Azul
 * REGRA: Números MAIORES = Tons MAIS ESCUROS
 * REGRA: Números MENORES = Tons MAIS CLAROS
 * Progressão: #8ec8f2 (muito claro - menores) → #1a233b (muito escuro - maiores)
 */
export const FUNNEL_COLORS = [
  '#60A5FA',     // 1. Azul Médio
  '#5294F8',     // 2. 
  '#3B82F6',     // 3. Azul Vibrante
  '#3273F0',     // 4. 
  '#2563EB',     // 5. Azul Forte
  '#1D4ED8',     // 6. Azul Muito Forte
  '#1E40AF',     // 7. Azul Escuro
  '#19316C',     // 8. 
  '#14263C'      // 9. Azul Marinho Escuro - Final
];

/**
 * Paleta para STATUS DE TEMPERATURA
 * Usando gradiente azul: Frio (claro) → Quente (escuro)
 * REGRA: Quanto mais quente, mais escuro
 */
export const TEMPERATURE_COLORS = {
  quente: COLORS.blue.veryDark,    // Azul Muito Escuro #1a233b (mais quente)
  morno: COLORS.blue.mediumDark,   // Azul Médio-Escuro #2a4a8d
  frio: COLORS.blue.veryLight      // Azul Muito Claro #8ec8f2 (mais frio)
};

/**
 * Paleta para TIPOS DE NEGÓCIO
 */
export const BUSINESS_TYPE_COLORS = {
  venda: COLORS.green.medium,        // Verde forte
  locacao: COLORS.blue.mediumDark,   // Azul Médio-Escuro
  investimento: COLORS.purple.medium, // Roxo forte
  comercial: COLORS.orange.medium    // Laranja forte
};

/**
 * Paleta para GRÁFICOS DE BARRAS/COLUNAS (10+ categorias)
 * Gradiente Azul: do mais claro ao mais escuro
 * REGRA: Quanto MAIOR o valor, MAIS ESCURO
 * REGRA: Quanto MENOR o valor, MAIS CLARO
 */
export const CHART_COLORS = [
  '#60A5FA',    // 1. Azul Médio
  '#5294F8',    // 2. 
  '#3B82F6',    // 3. Azul Vibrante
  '#3273F0',    // 4. 
  '#2563EB',    // 5. Azul Forte
  '#2158DC',    // 6. 
  '#1D4ED8',    // 7. Azul Muito Forte
  '#1E40AF',    // 8. Azul Escuro
  '#19316C',    // 9. 
  '#14263C'     // 10. Azul Marinho Escuro
];

/**
 * Paleta para RANKING (12 tons) - Gradiente Azul Universal
 * REGRA: 1º lugar (maior score) = Tom MAIS ESCURO
 * REGRA: Últimos lugares = Tom MAIS CLARO
 * Usar em: Tabelas de ranking, gráficos de barras ordenados, top 10
 */
export const RANKING_BLUE_GRADIENT = [
  '#14263C', // 0 - Azul Marinho Escuro (1º lugar)
  '#1B273D', // 1 - Azul Marinho Profundo
  '#1B3D7A', // 2 - Azul Profundo
  '#234992', // 3 - Azul Royal
  '#2A5A8A', // 4 - Azul Muito Escuro
  '#3A6FA0', // 5 - Azul Escuro
  '#4A7DB5', // 6 - Azul Médio-Escuro
  '#598DC6', // 7 - Azul Médio
  '#6EA5D2', // 8 - Azul Médio-Claro
  '#7DB4DC', // 9 - Azul Claro
  '#88C0E5', // 10 - Azul Celeste
  '#A5D4F0', // 11 - Azul Celeste Claro (últimos lugares)
];

/**
 * Função helper para obter cor de ranking baseada na posição
 * @param position - Posição no ranking (0 = 1º lugar)
 * @param totalItems - Total de itens no ranking
 * @returns Cor hexadecimal do gradiente
 */
export function getRankingColor(position: number, totalItems: number): string {
  const colorIndex = Math.min(
    Math.floor((position / Math.max(totalItems - 1, 1)) * (RANKING_BLUE_GRADIENT.length - 1)),
    RANKING_BLUE_GRADIENT.length - 1
  );
  return RANKING_BLUE_GRADIENT[colorIndex];
}

/**
 * Paleta para CORRETORES (8 tons) - Gradiente Azul
 * Do mais claro ao mais escuro
 * REGRA: Mais leads = Tom MAIS ESCURO
 * REGRA: Menos leads = Tom MAIS CLARO
 */
export const CORRETOR_COLORS_BLUE_GRADIENT = [
  '#8ec8f2',  // 1. Azul Muito Claro (menos leads)
  '#8fc2e9',  // 2. Azul Claro
  '#6ea5d2',  // 3. 
  '#6391c5',  // 4. Azul Médio-Claro
  '#4a6da5',  // 5. 
  '#2a4a8d',  // 6. Azul Médio-Escuro
  '#23385f',  // 7. Azul Escuro
  '#1a233b'   // 8. Azul Muito Escuro (mais leads)
];

/**
 * Paleta para CORRETORES (5 corretores) - Gradiente Azul
 * Do mais claro ao mais escuro
 * REGRA: Mais leads = Tom MAIS ESCURO
 */
export const CORRETOR_COLORS = [
  '#8ec8f2',    // 1. Azul Muito Claro (menos leads)
  '#6391c5',    // 2. Azul Médio-Claro
  '#2a4a8d',    // 3. Azul Médio-Escuro
  '#23385f',    // 4. Azul Escuro
  '#1a233b'     // 5. Azul Muito Escuro (mais leads)
];

/**
 * Paleta DEGRADÊ para gráficos de área/linha
 * Gradiente Azul do escuro ao claro
 */
export const GRADIENT_COLORS = {
  blue: [COLORS.blue.veryDark, COLORS.blue.mediumDark, COLORS.blue.mediumLight, COLORS.blue.veryLight],
  green: [COLORS.green.dark, COLORS.green.medium, COLORS.green.light],
  orange: [COLORS.orange.dark, COLORS.orange.medium, COLORS.orange.light],
  red: [COLORS.red.dark, COLORS.red.medium, COLORS.red.light]
};

/**
 * Função helper para obter cor por índice
 */
export function getColorByIndex(index: number, palette: string[] = CHART_COLORS): string {
  return palette[index % palette.length];
}

/**
 * Função helper para obter cor por tipo
 */
export function getColorByType(tipo: string): string {
  const tipoLower = tipo.toLowerCase();
  
  if (tipoLower.includes('venda') || tipoLower.includes('compra')) {
    return BUSINESS_TYPE_COLORS.venda;
  } else if (tipoLower.includes('locação') || tipoLower.includes('locacao') || tipoLower.includes('aluguel')) {
    return BUSINESS_TYPE_COLORS.locacao;
  } else if (tipoLower.includes('investimento')) {
    return BUSINESS_TYPE_COLORS.investimento;
  } else if (tipoLower.includes('comercial')) {
    return BUSINESS_TYPE_COLORS.comercial;
  }
  
  return COLORS.gray.medium;
}

/**
 * Função helper para obter cor por temperatura
 */
export function getColorByTemperature(temperatura: string): string {
  const tempLower = temperatura.toLowerCase();
  
  if (tempLower.includes('quente')) {
    return TEMPERATURE_COLORS.quente;
  } else if (tempLower.includes('morno')) {
    return TEMPERATURE_COLORS.morno;
  } else if (tempLower.includes('frio')) {
    return TEMPERATURE_COLORS.frio;
  }
  
  return COLORS.gray.medium;
}

/**
 * Função helper para converter hex em rgba
 */
export function hexToRgba(hex: string, alpha: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Função para atribuir cores baseadas em valores
 * REGRA: Menor valor = AZUL CLARO, Maior valor = AZUL ESCURO
 * Progressão: #8ec8f2 (menor) → #1a233b (maior)
 */
export function getColorByValue(dataPoints: Array<{y: number, label: string}>, currentLabel: string): string {
  if (dataPoints.length === 0) return CHART_COLORS[0];
  
  // Ordenar por valor (menor para maior)
  const sorted = [...dataPoints].sort((a, b) => a.y - b.y);
  
  // Encontrar o índice do item atual
  const currentIndex = sorted.findIndex(item => item.label === currentLabel);
  if (currentIndex === -1) return CHART_COLORS[0];
  
  // Calcular índice da cor baseado na posição relativa
  // IMPORTANTE: Valores MAIORES recebem índices MAIORES (cores mais escuras)
  // Array CHART_COLORS já está ordenado do claro (#8ec8f2) ao escuro (#1a233b)
  const colorIndex = Math.floor((currentIndex / (sorted.length - 1 || 1)) * (CHART_COLORS.length - 1));
  
  return CHART_COLORS[colorIndex];
}

/**
 * Função para atribuir cores a um array de dados
 * REGRA: Valores MENORES = Tons MAIS CLAROS de azul
 * REGRA: Valores MAIORES = Tons MAIS ESCUROS de azul
 */
export function assignColorsByValue<T extends {y: number, label: string}>(data: T[]): Array<T & {color: string}> {
  // Criar um mapa de cores baseado nos valores
  // Ordenar do menor para o maior
  const sorted = [...data].sort((a, b) => a.y - b.y);
  const colorMap = new Map<string, string>();
  
  sorted.forEach((item, index) => {
    // Calcular índice da cor: menor valor = índice 0 (claro), maior valor = índice max (escuro)
    const colorIndex = Math.floor((index / (sorted.length - 1 || 1)) * (CHART_COLORS.length - 1));
    colorMap.set(item.label, CHART_COLORS[colorIndex]);
  });
  
  // Retornar dados originais com cores atribuídas
  return data.map(item => ({
    ...item,
    color: colorMap.get(item.label) || CHART_COLORS[0]
  }));
}

