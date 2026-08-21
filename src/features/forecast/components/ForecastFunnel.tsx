/**
 * O funil de forecast: uma coluna por etapa, um card por negócio.
 *
 * Apresentação pura — recebe as linhas prontas e devolve as edições. O
 * agrupamento vive em `funnelColumns.ts` para ser testável sem React.
 *
 * ponytail: cards não arrastam. A etapa é do CRM — quem move o negócio é o
 * corretor no kanban de leads/propostas, e o funil reflete. Arrastar aqui
 * significaria escrever `leads.status` a partir de uma tela de leitura, que é
 * outra feature e outro risco.
 */

import { agruparPorEtapa } from '../utils/funnelColumns';
import { moedaCompacta } from '../utils/format';
import type { ForecastRow } from '../utils/forecastRow';
import type { ForecastPatch } from '../services/forecastService';
import { ForecastCard } from './ForecastCard';

interface ForecastFunnelProps {
  rows: ForecastRow[];
  onSave: (proposalId: string, patch: ForecastPatch) => void;
}

export function ForecastFunnel({ rows, onSave }: ForecastFunnelProps) {
  const colunas = agruparPorEtapa(rows);

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
      {colunas.map(({ column, rows: linhas, totais }) => (
        <section
          key={column.id}
          className="flex w-[260px] shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <header
            className="rounded-t-lg border-b px-3 py-2.5"
            style={{ borderColor: `${column.color}33`, backgroundColor: `${column.color}10` }}
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                className="truncate text-[12px] font-bold uppercase tracking-wide"
                style={{ color: column.color }}
              >
                {column.title}
              </h3>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: `${column.color}22`, color: column.color }}
              >
                {linhas.length}
              </span>
            </div>

            <p className="mt-1 truncate text-[12px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
              {moedaCompacta(totais.valor)}
              <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">
                · {moedaCompacta(totais.comissao)} em comissão
              </span>
            </p>
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {linhas.length === 0 ? (
              <p className="px-2 py-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
                Sem negócios
              </p>
            ) : (
              linhas.map((row) => (
                <ForecastCard key={row.proposalId} row={row} onSave={onSave} />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
