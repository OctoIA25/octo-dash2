import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { CellValue, ColumnMetadata, ColumnType, GenericReport } from '../types';

interface GenericReportViewProps {
  report: GenericReport;
  /** Limite de linhas renderizadas na tabela (preview). */
  maxRows?: number;
}

const TYPE_LABEL: Record<ColumnType, string> = {
  number: 'Numero',
  currency: 'Moeda',
  date: 'Data',
  boolean: 'Booleano',
  category: 'Categoria',
  text: 'Texto',
  empty: 'Vazia',
};

const TYPE_BADGE: Record<ColumnType, string> = {
  number: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  currency: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  date: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  boolean: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  category: 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  text: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  empty: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

function formatCell(value: CellValue): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';
  return String(value);
}

export function GenericReportView({ report, maxRows = 50 }: GenericReportViewProps) {
  const { table, metadata, insights } = report;
  const [showAll, setShowAll] = useState(false);

  const visibleRows = useMemo(
    () => (showAll ? table.rows : table.rows.slice(0, maxRows)),
    [showAll, table.rows, maxRows],
  );

  const metaByName = useMemo(
    () => Object.fromEntries(metadata.map((m) => [m.name, m])),
    [metadata],
  );

  if (table.columns.length === 0) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="flex min-h-[160px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Nenhuma coluna reconhecida na planilha.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      {table.truncated && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Exibindo as primeiras {table.rows.length.toLocaleString('pt-BR')} de {table.totalRows.toLocaleString('pt-BR')} linhas (arquivo grande, truncado).
        </div>
      )}

      {insights.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Insights</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {insights.map((insight, index) => (
              <Card key={`${insight.source}-${index}`} className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{insight.title}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{insight.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Colunas detectadas ({metadata.length})
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {metadata.map((column) => (
            <ColumnSummary key={column.name} column={column} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Dados ({table.rows.length.toLocaleString('pt-BR')} linhas)
          </h3>
          {table.rows.length > maxRows && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              {showAll ? `Mostrar so ${maxRows}` : `Mostrar todas (${table.rows.length})`}
            </button>
          )}
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="max-h-[60vh] min-w-0 overflow-x-auto overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  {table.columns.map((column) => (
                    <th key={column.name} className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                      <span>{column.label}</span>
                      <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[metaByName[column.name]?.type ?? 'text']}`}>
                        {TYPE_LABEL[metaByName[column.name]?.type ?? 'text']}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="bg-white dark:bg-slate-900">
                    {table.columns.map((column) => (
                      <td key={column.name} className="whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-300">
                        {formatCell(row[column.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function ColumnSummary({ column }: { column: ColumnMetadata }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{column.label}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[column.type]}`}>
          {TYPE_LABEL[column.type]}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {column.filledCount} preenchidas · {column.distinctCount} distintas
        {column.emptyCount > 0 ? ` · ${column.emptyCount} vazias` : ''}
      </p>
      {column.numeric && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          soma {column.numeric.sum.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
          {' · '}media {column.numeric.avg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
        </p>
      )}
    </div>
  );
}
