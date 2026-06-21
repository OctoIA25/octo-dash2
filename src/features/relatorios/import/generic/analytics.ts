/**
 * Camada de Analytics do pipeline generico.
 *
 * Interface PLUGAVEL: o estagio "IA/Analytics" e abstraido por AnalyticsProvider.
 * Por padrao usamos o provider HEURISTICO (deterministico, sem custo/PII), que ja
 * gera insights uteis a partir dos metadados. Um provider de IA (LLM) pode ser
 * adicionado depois implementando a mesma interface — sem mudar o restante do fluxo.
 *
 * Decisao (diretrizes: seguranca por padrao, sem custo para problema hipotetico):
 * NENHUM dado de planilha sai da aplicacao a menos que um provider de IA seja
 * explicitamente injetado. O default nunca chama rede.
 */

import type { AnalyticsInsight, ColumnMetadata, GenericTable } from './types';

export interface AnalyticsProvider {
    id: string;
    analyze(table: GenericTable, metadata: ColumnMetadata[]): Promise<AnalyticsInsight[]>;
}

/** Provider nulo: nao gera insights (usado quando se quer desligar a etapa). */
export const noopAnalyticsProvider: AnalyticsProvider = {
    id: 'noop',
    async analyze(): Promise<AnalyticsInsight[]> {
        return [];
    },
};

const formatNumber = (value: number): string =>
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);

/**
 * Provider heuristico (default): deriva insights deterministicos dos metadados.
 * Exemplos: somas/medias de colunas numericas, colunas com muitos vazios,
 * colunas categoricas dominantes. Sem rede, sem IA.
 */
export const heuristicAnalyticsProvider: AnalyticsProvider = {
    id: 'heuristic',
    async analyze(table: GenericTable, metadata: ColumnMetadata[]): Promise<AnalyticsInsight[]> {
        const insights: AnalyticsInsight[] = [];

        if (table.rows.length === 0) return insights;

        for (const column of metadata) {
            if ((column.type === 'number' || column.type === 'currency') && column.numeric) {
                insights.push({
                    source: 'heuristic',
                    title: `Resumo de "${column.label}"`,
                    detail: `Soma ${formatNumber(column.numeric.sum)} · media ${formatNumber(column.numeric.avg)} · `
                        + `min ${formatNumber(column.numeric.min)} · max ${formatNumber(column.numeric.max)}.`,
                });
            }

            const emptyRatio = column.emptyCount / (column.filledCount + column.emptyCount || 1);
            if (emptyRatio >= 0.5 && column.type !== 'empty') {
                insights.push({
                    source: 'heuristic',
                    title: `Coluna "${column.label}" pouco preenchida`,
                    detail: `${Math.round(emptyRatio * 100)}% das celulas estao vazias.`,
                });
            }

            if (column.type === 'category') {
                insights.push({
                    source: 'heuristic',
                    title: `"${column.label}" e categorica`,
                    detail: `${column.distinctCount} categorias distintas (ex.: ${column.sample.slice(0, 3).join(', ')}).`,
                });
            }
        }

        return insights;
    },
};

/** Provider default do pipeline. Troque por um de IA injetando outro AnalyticsProvider. */
export const defaultAnalyticsProvider = heuristicAnalyticsProvider;
