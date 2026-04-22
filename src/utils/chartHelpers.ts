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
 * Helpers utilitários para garantir que gráficos sempre exibam
 * mesmo com dados vazios ou valores zerados
 */

/**
 * Garante que um valor nunca seja NaN, Infinity ou undefined
 * @param value - Valor a ser validado
 * @param fallback - Valor padrão (default: 0)
 */
export function safeNumber(value: number | undefined | null, fallback: number = 0): number {
  if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
    return fallback;
  }
  return value;
}

/**
 * Garante que um array nunca seja vazio - retorna dados com valor 0 se necessário
 * @param data - Array de dados
 * @param minLength - Quantidade mínima de items
 * @param emptyItemGenerator - Função para gerar itens vazios
 */
export function ensureMinData<T>(
  data: T[],
  minLength: number = 1,
  emptyItemGenerator: (index: number) => T
): T[] {
  if (data.length >= minLength) {
    return data;
  }
  
  const emptyItems: T[] = [];
  for (let i = 0; i < minLength; i++) {
    emptyItems.push(emptyItemGenerator(i));
  }
  
  return emptyItems;
}

/**
 * Calcula porcentagem segura (sem divisão por zero)
 * @param part - Parte
 * @param total - Total
 * @param decimals - Casas decimais (default: 1)
 */
export function safePercentage(part: number, total: number, decimals: number = 1): number {
  if (total === 0 || isNaN(total) || !isFinite(total)) {
    return 0;
  }
  const percentage = (part / total) * 100;
  return Number(percentage.toFixed(decimals));
}

/**
 * Retorna o maior valor de um array, com fallback seguro
 * @param values - Array de números
 * @param fallback - Valor padrão se array vazio (default: 1)
 */
export function safeMax(values: number[], fallback: number = 1): number {
  if (!values || values.length === 0) {
    return fallback;
  }
  
  const validValues = values.filter(v => isFinite(v) && !isNaN(v));
  if (validValues.length === 0) {
    return fallback;
  }
  
  return Math.max(...validValues);
}

/**
 * Formata valor monetário de forma segura
 * @param value - Valor a formatar
 * @param prefix - Prefixo (default: 'R$ ')
 */
export function safeFormatMoney(value: number | undefined | null, prefix: string = 'R$ '): string {
  const safeValue = safeNumber(value);
  return `${prefix}${safeValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Estrutura padrão para dados vazios de gráficos
 */
export const emptyChartData = {
  barData: [],
  pieData: [],
  lineData: [],
  radarData: [],
  stats: {
    total: 0,
    average: 0,
    max: 0,
    min: 0
  }
};

