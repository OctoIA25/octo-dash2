/**
 * As etapas finais do funil comercial — de onde sai a "posição atual" da linha
 * da planilha.
 *
 * NÃO reusa `JURIDICO_KANBAN_COLUMNS`: aquelas são as subetapas do jurídico
 * DEPOIS da assinatura (em análise, andamento, recebido). Aqui o eixo é o
 * `stage_id` cru, que é onde o negócio está no funil comercial.
 */

export interface ForecastEtapa {
  /** Igual ao `proposals.stage_id`. */
  id: string;
  title: string;
  color: string;
}

/**
 * Ordem = topo → base do funil. 'arquivado' não entra: a leitura já o exclui.
 *
 * A cor caminha de slate (frio, ainda incerto) a verde (assinado) — o gestor lê
 * o progresso pela cor antes de ler o texto.
 */
export const FORECAST_ETAPAS: ForecastEtapa[] = [
  { id: 'negociacao', title: 'Negociação', color: '#64748b' },
  { id: 'proposta-criada', title: 'Proposta Criada', color: '#8b5cf6' },
  { id: 'proposta-enviada', title: 'Proposta Enviada', color: '#3b82f6' },
  { id: 'propostas-respondidas', title: 'Propostas Respondidas', color: '#6366f1' },
  { id: 'feitura-contrato', title: 'Feitura de Contrato', color: '#f59e0b' },
  { id: 'proposta-assinada', title: 'Proposta Assinada', color: '#10b981' },
];

/**
 * Etapa desconhecida devolve o próprio id em vez de sumir da célula. O CHECK de
 * `proposals.stage_id` tem exatamente sete valores e a leitura exclui um deles,
 * então isso só acontece se alguém adicionar etapa nova no banco sem atualizar
 * FORECAST_ETAPAS — e nesse dia é melhor a linha mostrar o id cru do que nada.
 */
export function etapaDoForecast(stageId: string): ForecastEtapa {
  return (
    FORECAST_ETAPAS.find((e) => e.id === stageId) ?? {
      id: stageId,
      title: stageId || '—',
      color: '#94a3b8',
    }
  );
}
