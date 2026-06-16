/**
 * Glossário central de siglas e termos financeiros usados no dashboard.
 * Fonte única de verdade para o componente <TermoFinanceiro />.
 */
export interface TermoFinanceiroDef {
  /** Nome completo do termo, exibido em destaque no tooltip. */
  nome: string;
  /** Explicação curta, em linguagem acessível para corretores. */
  descricao: string;
  /** Fórmula de cálculo, quando aplicável. */
  formula?: string;
}

export const GLOSSARIO_FINANCEIRO = {
  CPL: {
    nome: 'Custo por Lead',
    descricao: 'Quanto custou, em média, gerar cada lead desta origem no período.',
    formula: 'CPL = investimento ÷ leads',
  },
  CAC: {
    nome: 'Custo de Aquisição de Cliente',
    descricao: 'Quanto custou, em média, cada cliente convertido (venda fechada).',
    formula: 'CAC = investimento ÷ convertidos',
  },
  ROI: {
    nome: 'Retorno sobre Investimento',
    descricao: 'Quanto a receita retornou em relação ao valor investido. Acima de 0% significa lucro.',
    formula: 'ROI = (receita − investimento) ÷ investimento',
  },
  VGV: {
    nome: 'Valor Geral de Vendas',
    descricao: 'Soma do valor de todos os imóveis vendidos no período.',
  },
} as const satisfies Record<string, TermoFinanceiroDef>;

export type SiglaFinanceira = keyof typeof GLOSSARIO_FINANCEIRO;
