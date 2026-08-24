/**
 * A planilha de forecast: uma linha por negócio, nas colunas do controle que o
 * gestor já mantinha à mão.
 *
 * Apresentação pura — recebe as linhas prontas e devolve as edições. Quatro
 * células são editáveis (empreendimento, unidade, previsão e posição); o resto
 * é leitura, porque vem do CRM.
 *
 * ponytail: sem ordenação, filtro, seleção de células ou exportação. É a
 * planilha pedida; cada um desses entra quando alguém sentir falta de verdade.
 */

import { useEffect, useState } from 'react';
import { etapaDoForecast } from '../utils/etapas';
import { moeda, dataBR } from '../utils/format';
import { somarForecast, type ForecastRow } from '../utils/forecastRow';
import type { ForecastPatch } from '../services/forecastService';

/**
 * Grade da planilha: cada célula desenha sua própria borda. Com
 * `border-separate` a borda do cabeçalho fixo não some ao rolar — é o defeito
 * conhecido de `border-collapse` + `position: sticky`.
 */
const CELULA = 'border-b border-r border-slate-200 px-2 py-1.5 last:border-r-0 dark:border-slate-800';

/**
 * Célula editável. Mantém rascunho local enquanto tem foco e só avisa o pai no
 * blur, quando o valor mudou de verdade — assim digitar não dispara um UPDATE
 * por tecla.
 */
function CelulaEditavel({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  type = 'text',
}: {
  value: string;
  onCommit: (novo: string) => void;
  ariaLabel: string;
  placeholder?: string;
  type?: 'text' | 'date';
}) {
  const [rascunho, setRascunho] = useState(value);

  // O refetch pode trazer valor novo (outro usuário editou o mesmo negócio).
  useEffect(() => setRascunho(value), [value]);

  return (
    <input
      type={type}
      value={rascunho}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => {
        if (rascunho !== value) onCommit(rascunho);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setRascunho(value);
      }}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px]
                 text-slate-700 outline-none transition-colors
                 placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400
                 focus:bg-white dark:text-slate-200 dark:placeholder:text-slate-500
                 dark:hover:border-slate-600 dark:focus:border-slate-500 dark:focus:bg-slate-900"
    />
  );
}

interface ForecastTableProps {
  rows: ForecastRow[];
  onSave: (proposalId: string, patch: ForecastPatch) => void;
}

export function ForecastTable({ rows, onSave }: ForecastTableProps) {
  const totais = somarForecast(rows);

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full border-separate border-spacing-0 text-left">
        {/* Tabela nativa, não `@/components/ui/table`: o wrapper dele é um segundo
            container de rolagem e o cabeçalho fixo pararia de grudar. */}
        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
          <tr>
            {[
              'Corretor',
              'Empreendimento',
              'Unidade de interesse',
              'Valor',
              'Comissão',
              'Lead',
              'Data de atendimento',
              'Previsão de fechamento',
              'Posição atual',
            ].map((titulo) => (
              <th
                key={titulo}
                className={`h-9 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide ${CELULA}`}
              >
                {titulo}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const quem = row.lead || 'Lead sem nome';
            const etapa = etapaDoForecast(row.stageId);

            return (
              <tr
                key={row.proposalId}
                className="text-[13px] transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/50"
              >
                <td className={`${CELULA} min-w-[130px] text-slate-600 dark:text-slate-300`}>
                  {row.corretor || '—'}
                </td>

                <td className={`${CELULA} min-w-[170px]`}>
                  <CelulaEditavel
                    value={row.empreendimento}
                    placeholder="Empreendimento…"
                    ariaLabel={`Empreendimento de ${quem}`}
                    onCommit={(v) => onSave(row.proposalId, { empreendimento: v })}
                  />
                </td>

                <td className={`${CELULA} min-w-[130px]`}>
                  <CelulaEditavel
                    value={row.unidade}
                    placeholder="Unidade…"
                    ariaLabel={`Unidade de ${quem}`}
                    onCommit={(v) => onSave(row.proposalId, { unidade: v })}
                  />
                </td>

                <td
                  className={`${CELULA} whitespace-nowrap text-right font-medium tabular-nums text-slate-900 dark:text-slate-100`}
                >
                  {moeda(row.valor)}
                </td>

                <td
                  className={`${CELULA} whitespace-nowrap text-right tabular-nums text-emerald-600 dark:text-emerald-400`}
                >
                  {moeda(row.comissao.valor)}
                  <span className="ml-1 text-[11px] text-slate-400">
                    {row.comissao.percentual.toLocaleString('pt-BR')}%
                  </span>
                </td>

                <td
                  className={`${CELULA} min-w-[150px] font-medium text-slate-900 dark:text-slate-100`}
                >
                  {quem}
                </td>

                <td
                  className={`${CELULA} whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300`}
                >
                  {dataBR(row.dataAtendimento)}
                </td>

                <td className={`${CELULA} min-w-[150px]`}>
                  <CelulaEditavel
                    type="date"
                    value={row.previsaoFechamento ?? ''}
                    ariaLabel={`Previsão de fechamento de ${quem}`}
                    onCommit={(v) => onSave(row.proposalId, { previsaoFechamento: v })}
                  />
                </td>

                {/*
                  A etapa vem do CRM e não se edita aqui; o texto ao lado é a
                  observação do gestor sobre onde o negócio realmente está.
                */}
                <td className={`${CELULA} min-w-[220px]`}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: `${etapa.color}1f`, color: etapa.color }}
                    >
                      {etapa.title}
                    </span>
                    <CelulaEditavel
                      value={row.estadoAtual}
                      placeholder="Observação…"
                      ariaLabel={`Posição atual de ${quem}`}
                      onCommit={(v) => onSave(row.proposalId, { estadoAtual: v })}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>

        <tfoot className="sticky bottom-0 bg-slate-50 dark:bg-slate-900">
          <tr className="[&>td]:border-t-2 [&>td]:border-t-slate-300 dark:[&>td]:border-t-slate-700">
            <td className={`${CELULA} text-[12px] text-slate-500`} colSpan={3}>
              {rows.length} {rows.length === 1 ? 'negócio' : 'negócios'}
            </td>
            <td
              className={`${CELULA} whitespace-nowrap text-right font-semibold tabular-nums`}
            >
              {moeda(totais.valor)}
            </td>
            <td
              className={`${CELULA} whitespace-nowrap text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400`}
            >
              {moeda(totais.comissao)}
            </td>
            <td className={CELULA} colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
