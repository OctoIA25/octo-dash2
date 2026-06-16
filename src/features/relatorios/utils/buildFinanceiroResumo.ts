/**
 * Cálculo do resumo financeiro por origem (investimento × resultado).
 *
 * Extraído de `FinanceiroTab` para ser uma função PURA e reutilizável: tanto a
 * aba Financeiro quanto a exportação de relatórios consomem este mesmo cálculo,
 * evitando duplicação de lógica.
 */

import { ProcessedLead } from '@/data/realLeadsProcessor';

export type FinanceiroPeriodo = 'mensal' | 'anual';

export interface FinanceiroOrigemRow {
  key: string;
  origem: string;
  leads: number;
  convertidos: number;
  receita: number;
  investimento: number;
  cpl: number | null;
  cac: number | null;
  roi: number | null;
}

export interface FinanceiroTotais {
  investimento: number;
  leadsTotal: number;
  convertidos: number;
  receita: number;
  cplMedio: number | null;
  cacMedio: number | null;
  roi: number | null;
}

export interface FinanceiroResumo {
  rows: FinanceiroOrigemRow[];
  totais: FinanceiroTotais;
}

const DEFAULT_ORIGEM_LABEL = 'Não informado';

export function isConvertido(l: ProcessedLead): boolean {
  const etapa = (l.etapa_atual || '').toLowerCase();
  return etapa.includes('assinada') || etapa.includes('fechamento') || etapa.includes('contrato');
}

export function receitaDoLead(l: ProcessedLead): number {
  return Number(l.valor_final_venda) || Number(l.valor_imovel) || 0;
}

/** Rótulo de exibição: origem sem espaços nas bordas, ou o padrão se vazia. */
export function origemLabel(raw: string | undefined): string {
  return (raw || '').trim() || DEFAULT_ORIGEM_LABEL;
}

/** Chave de deduplicação: case-insensitive (e sem espaços nas bordas). */
export function origemKey(raw: string | undefined): string {
  return origemLabel(raw).toLowerCase();
}

/** Origens distintas, deduplicadas por chave, com a variante de exibição mais frequente. */
export function origensDistintas(leads: ProcessedLead[]): Array<{ key: string; origem: string }> {
  const variantesPorChave = new Map<string, Map<string, number>>();
  leads.forEach((l) => {
    const label = origemLabel(l.origem_lead);
    const key = label.toLowerCase();
    if (!variantesPorChave.has(key)) variantesPorChave.set(key, new Map());
    const variantes = variantesPorChave.get(key)!;
    variantes.set(label, (variantes.get(label) || 0) + 1);
  });

  return Array.from(variantesPorChave.entries())
    .map(([key, variantes]) => {
      let origem = '';
      let melhor = -1;
      variantes.forEach((count, variante) => {
        if (count > melhor || (count === melhor && variante.localeCompare(origem, 'pt-BR') < 0)) {
          melhor = count;
          origem = variante;
        }
      });
      return { key, origem };
    })
    .sort((a, b) => a.origem.localeCompare(b.origem, 'pt-BR'));
}

/** Prefixo de data (janela do período) usado para filtrar `data_entrada`. */
export function periodoPrefixo(periodo: FinanceiroPeriodo, reference = new Date()): string {
  return periodo === 'mensal'
    ? `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, '0')}`
    : `${reference.getFullYear()}`;
}

interface BuildFinanceiroResumoArgs {
  leads: ProcessedLead[];
  /** Custos indexados pela chave normalizada de origem (mensais). */
  costsByKey: Record<string, number>;
  periodo: FinanceiroPeriodo;
  reference?: Date;
}

export function buildFinanceiroResumo({
  leads,
  costsByKey,
  periodo,
  reference = new Date(),
}: BuildFinanceiroResumoArgs): FinanceiroResumo {
  const prefixo = periodoPrefixo(periodo, reference);
  const multiplicador = periodo === 'mensal' ? 1 : 12;
  const leadsJanela = leads.filter((l) => (l.data_entrada || '').startsWith(prefixo));

  const rows: FinanceiroOrigemRow[] = origensDistintas(leads)
    .map(({ key, origem }) => {
      const doOrigem = leadsJanela.filter((l) => origemKey(l.origem_lead) === key);
      const convertidosArr = doOrigem.filter(isConvertido);
      const receita = convertidosArr.reduce((acc, l) => acc + receitaDoLead(l), 0);
      const investimento = (costsByKey[key] || 0) * multiplicador;
      const leadsCount = doOrigem.length;
      const convertidos = convertidosArr.length;
      return {
        key,
        origem,
        leads: leadsCount,
        convertidos,
        receita,
        investimento,
        cpl: leadsCount > 0 ? investimento / leadsCount : null,
        cac: convertidos > 0 ? investimento / convertidos : null,
        roi: investimento > 0 ? (receita - investimento) / investimento : null,
      };
    })
    .sort((a, b) => b.investimento - a.investimento || b.leads - a.leads);

  const investimento = rows.reduce((acc, r) => acc + r.investimento, 0);
  const leadsTotal = rows.reduce((acc, r) => acc + r.leads, 0);
  const convertidos = rows.reduce((acc, r) => acc + r.convertidos, 0);
  const receita = rows.reduce((acc, r) => acc + r.receita, 0);

  return {
    rows,
    totais: {
      investimento,
      leadsTotal,
      convertidos,
      receita,
      cplMedio: leadsTotal > 0 ? investimento / leadsTotal : null,
      cacMedio: convertidos > 0 ? investimento / convertidos : null,
      roi: investimento > 0 ? (receita - investimento) / investimento : null,
    },
  };
}
