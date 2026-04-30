/**
 * Serviço especializado em cálculos percentuais para métricas
 * Lógica centralizada e consistente para todos os cálculos de porcentagem
 */

// Interface para variações percentuais
export interface VariacoesPercentuais {
  vendasCriadas: number;
  vendasAssinadas: number;
  imoveisAtivos: number;
  totalLeadsMes: number;
  valorTotalVendasMes: number;
  tempoMedioRespostaGeral: number;
}

// Interface para distribuições percentuais
export interface DistribuicaoPercentual {
  tipo: string;
  quantidade: number;
  percentual: number;
}

// Interface para métricas de conversão
export interface MetricasConversao {
  taxaConversaoGeral: number;
  taxaAtendimento: number;
  taxaConversaoPorEtapa: Array<{
    etapa: string;
    taxa: number;
    quantidade: number;
  }>;
}

/**
 * Calcula percentual de forma segura e consistente
 * @param valor Valor atual
 * @param total Valor total
 * @param casasDecimais Número de casas decimais (padrão: 1)
 * @returns Percentual calculado
 */
export function calcularPercentual(valor: number, total: number, casasDecimais: number = 1): number {
  if (total === 0 || valor === 0) return 0;
  
  const percentual = (valor / total) * 100;
  return Math.round(percentual * Math.pow(10, casasDecimais)) / Math.pow(10, casasDecimais);
}

/**
 * Calcula variação percentual entre dois períodos
 * @param atual Valor atual
 * @param anterior Valor anterior (baseline)
 * @param casasDecimais Número de casas decimais (padrão: 1)
 * @returns Variação percentual
 */
export function calcularVariacaoPercentual(atual: number, anterior: number, casasDecimais: number = 1): number {
  if (anterior === 0) {
    // Se baseline é 0, tratar casos especiais
    if (atual === 0) return 0; // Sem dados em nenhum período = 0%
    return 100; // Primeiro período com dados = 100% de crescimento
  }
  
  if (atual === 0) return -100; // Perda total
  
  const variacao = ((atual - anterior) / anterior) * 100;
  return Math.round(variacao * Math.pow(10, casasDecimais)) / Math.pow(10, casasDecimais);
}

/**
 * Calcula taxa de conversão
 * @param convertidos Número de conversões
 * @param total Número total de oportunidades
 * @param casasDecimais Número de casas decimais (padrão: 1)
 * @returns Taxa de conversão em percentual
 */
export function calcularTaxaConversao(convertidos: number, total: number, casasDecimais: number = 1): number {
  return calcularPercentual(convertidos, total, casasDecimais);
}

/**
 * Calcula taxa de atendimento (leads respondidos)
 * @param atendidos Número de leads atendidos
 * @param total Número total de leads
 * @param casasDecimais Número de casas decimais (padrão: 1)
 * @returns Taxa de atendimento em percentual
 */
export function calcularTaxaAtendimento(atendidos: number, total: number, casasDecimais: number = 1): number {
  return calcularPercentual(atendidos, total, casasDecimais);
}

/**
 * Calcula percentual de progresso para barras visuais
 * @param valorAtual Valor atual
 * @param valorMeta Valor meta ou máximo
 * @param inverso Se true, valores menores são melhores (ex: tempo de resposta)
 * @returns Percentual de progresso (0-100)
 */
export function calcularProgressoVisual(
  valorAtual: number, 
  valorMeta: number, 
  inverso: boolean = false
): number {
  if (valorMeta === 0) return 0;
  
  let progresso = (valorAtual / valorMeta) * 100;
  
  if (inverso) {
    // Para métricas onde menor é melhor (ex: tempo de resposta)
    progresso = Math.max(0, 100 - progresso);
  }
  
  return Math.min(100, Math.max(0, progresso));
}

/**
 * Formata variação percentual para exibição
 * @param variacao Valor da variação percentual
 * @returns Objeto com texto, cor e ícone
 */
export function formatarVariacaoPercentual(variacao: number) {
  const isPositive = variacao > 0;
  const isNegative = variacao < 0;
  const isZero = variacao === 0;
  
  return {
    texto: isPositive ? `+${variacao}%` : isNegative ? `${variacao}%` : '0%',
    cor: isPositive ? 'text-green-600 dark:text-green-400' : 
         isNegative ? 'text-red-600 dark:text-red-400' : 
         'text-gray-600 dark:text-gray-400',
    icone: isPositive ? 'ArrowUpRight' : isNegative ? 'ArrowDownRight' : 'Minus',
    valor: variacao
  };
}

/**
 * Calcula distribuição percentual para categorias
 * @param dados Array de objetos com { tipo, quantidade }
 * @param casasDecimais Número de casas decimais (padrão: 1)
 * @returns Array com distribuição percentual
 */
export function calcularDistribuicaoPercentual(
  dados: Array<{ tipo: string; quantidade: number }>,
  casasDecimais: number = 1
): DistribuicaoPercentual[] {
  const total = dados.reduce((sum, item) => sum + item.quantidade, 0);
  
  if (total === 0) {
    return dados.map(item => ({
      tipo: item.tipo,
      quantidade: item.quantidade,
      percentual: 0
    }));
  }
  
  return dados.map(item => ({
    tipo: item.tipo,
    quantidade: item.quantidade,
    percentual: calcularPercentual(item.quantidade, total, casasDecimais)
  }));
}

/**
 * Calcula variações percentuais para KPIs
 * @param kpisAtuais KPIs do período atual
 * @param kpisAnteriores KPIs do período anterior
 * @returns Variações percentuais
 */
export function calcularVariacoesKPIs(
  kpisAtuais: any,
  kpisAnteriores: any
): VariacoesPercentuais {
  return {
    vendasCriadas: calcularVariacaoPercentual(
      kpisAtuais.vendasCriadas || 0,
      kpisAnteriores.vendasCriadas || 0
    ),
    vendasAssinadas: calcularVariacaoPercentual(
      kpisAtuais.vendasAssinadas || 0,
      kpisAnteriores.vendasAssinadas || 0
    ),
    imoveisAtivos: calcularVariacaoPercentual(
      kpisAtuais.imoveisAtivos || 0,
      kpisAnteriores.imoveisAtivos || 0
    ),
    totalLeadsMes: calcularVariacaoPercentual(
      kpisAtuais.totalLeadsMes || 0,
      kpisAnteriores.totalLeadsMes || 0
    ),
    valorTotalVendasMes: calcularVariacaoPercentual(
      kpisAtuais.valorTotalVendasMes || 0,
      kpisAnteriores.valorTotalVendasMes || 0
    ),
    tempoMedioRespostaGeral: calcularVariacaoPercentual(
      kpisAtuais.tempoMedioRespostaGeral || 0,
      kpisAnteriores.tempoMedioRespostaGeral || 0
    )
  };
}

/**
 * Calcula métricas de conversão para funil de vendas
 * @param dadosFunil Array com quantidade por etapa
 * @returns Métricas de conversão
 */
export function calcularMetricasConversaoFunil(
  dadosFunil: Array<{ etapa: string; quantidade: number }>
): MetricasConversao {
  const totalLeads = dadosFunil[0]?.quantidade || 0;
  const convertidos = dadosFunil[dadosFunil.length - 1]?.quantidade || 0;
  
  // Taxa de conversão geral
  const taxaConversaoGeral = calcularTaxaConversao(convertidos, totalLeads);
  
  // Taxa de conversão por etapa
  const taxaConversaoPorEtapa = dadosFunil.map((etapa, index) => {
    const anterior = dadosFunil[index - 1]?.quantidade || etapa.quantidade;
    const taxa = calcularTaxaConversao(etapa.quantidade, anterior);
    
    return {
      etapa: etapa.etapa,
      taxa,
      quantidade: etapa.quantidade
    };
  });
  
  return {
    taxaConversaoGeral,
    taxaAtendimento: taxaConversaoGeral, // Simplificado - pode ser calculado separadamente
    taxaConversaoPorEtapa
  };
}

/**
 * Valida e corrige percentuais para garantir que somem 100%
 * @param distribuicao Array de distribuição percentual
 * @returns Distribuição corrigida
 */
export function validarDistribuicaoPercentual(
  distribuicao: DistribuicaoPercentual[]
): DistribuicaoPercentual[] {
  const totalPercentual = distribuicao.reduce((sum, item) => sum + item.percentual, 0);
  
  if (Math.abs(totalPercentual - 100) < 0.1) {
    // Já está correto
    return distribuicao;
  }
  
  // Corrigir proporcionalmente
  const fatorCorrecao = 100 / totalPercentual;
  
  return distribuicao.map(item => ({
    ...item,
    percentual: Math.round(item.percentual * fatorCorrecao * 10) / 10
  }));
}
