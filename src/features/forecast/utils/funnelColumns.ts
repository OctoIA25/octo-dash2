/**
 * As colunas do funil de forecast — as seis etapas finais, na ordem em que o
 * negócio caminha para o fechamento.
 *
 * NÃO reusa `JURIDICO_KANBAN_COLUMNS`: aquelas são as subetapas do jurídico
 * DEPOIS da assinatura (em análise, andamento, recebido). Aqui o eixo é o
 * `stage_id` cru, que é onde o negócio está no funil comercial.
 */

import { somarForecast, type ForecastRow } from './forecastRow';

export interface ForecastColumn {
  /** Igual ao `proposals.stage_id`. */
  id: string;
  title: string;
  color: string;
}

/**
 * Ordem = topo → base do funil. 'arquivado' não entra: a leitura já o exclui.
 *
 * A cor caminha de slate (frio, ainda incerto) a verde (assinado) — o gestor lê
 * o progresso pela coluna antes de ler o texto.
 */
export const FORECAST_COLUMNS: ForecastColumn[] = [
  { id: 'negociacao', title: 'Negociação', color: '#64748b' },
  { id: 'proposta-criada', title: 'Proposta Criada', color: '#8b5cf6' },
  { id: 'proposta-enviada', title: 'Proposta Enviada', color: '#3b82f6' },
  { id: 'propostas-respondidas', title: 'Propostas Respondidas', color: '#6366f1' },
  { id: 'feitura-contrato', title: 'Feitura de Contrato', color: '#f59e0b' },
  { id: 'proposta-assinada', title: 'Proposta Assinada', color: '#10b981' },
];

export interface ForecastColumnData {
  column: ForecastColumn;
  rows: ForecastRow[];
  /** Soma da coluna — é o que vai no cabeçalho, ao lado da contagem. */
  totais: { valor: number; comissao: number };
}

/**
 * Distribui as linhas pelas colunas, preservando a ordem que veio da query
 * (proposta movimentada mais recentemente primeiro dentro de cada etapa).
 *
 * Etapa desconhecida cai na primeira coluna em vez de sumir da tela. O CHECK de
 * `proposals.stage_id` tem exatamente sete valores e a leitura exclui um deles,
 * então isso só acontece se alguém adicionar etapa nova no banco sem atualizar
 * FORECAST_COLUMNS — e nesse dia é melhor o negócio aparecer no lugar errado do
 * que desaparecer sem aviso.
 */
export function agruparPorEtapa(rows: ForecastRow[]): ForecastColumnData[] {
  const baldes = new Map<string, ForecastRow[]>(FORECAST_COLUMNS.map((c) => [c.id, []]));
  const primeira = FORECAST_COLUMNS[0].id;

  for (const row of rows) {
    const balde = baldes.get(row.stageId) ?? baldes.get(primeira);
    balde?.push(row);
  }

  return FORECAST_COLUMNS.map((column) => {
    const linhas = baldes.get(column.id) ?? [];
    return { column, rows: linhas, totais: somarForecast(linhas) };
  });
}
