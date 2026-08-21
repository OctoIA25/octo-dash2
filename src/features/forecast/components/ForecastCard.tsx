/**
 * Um negócio dentro da coluna do funil.
 *
 * Carrega as mesmas informações que a planilha do gestor tinha, e os dois
 * campos que nascem em branco (previsão e estado) continuam editáveis aqui —
 * era o motivo de o funil ter cards em vez de ser só um gráfico.
 */

import { useEffect, useState } from 'react';
import { CalendarClock, User } from 'lucide-react';
import { moeda, dataCurta } from '../utils/format';
import type { ForecastRow } from '../utils/forecastRow';
import type { ForecastPatch } from '../services/forecastService';

/**
 * Campo editável embutido no card. Mantém rascunho local enquanto tem foco e
 * só avisa o pai no blur, quando o valor mudou de verdade — assim digitar não
 * dispara um UPDATE por tecla.
 */
function CampoEditavel({
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
      className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[12px]
                 text-slate-700 outline-none transition-colors
                 placeholder:text-slate-400 hover:border-slate-200 focus:border-slate-400
                 focus:bg-white dark:text-slate-200 dark:placeholder:text-slate-500
                 dark:hover:border-slate-700 dark:focus:border-slate-500 dark:focus:bg-slate-900"
    />
  );
}

interface ForecastCardProps {
  row: ForecastRow;
  onSave: (proposalId: string, patch: ForecastPatch) => void;
}

export function ForecastCard({ row, onSave }: ForecastCardProps) {
  const quem = row.lead || 'Lead sem nome';

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <h4 className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
        {quem}
      </h4>

      {row.corretor && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
          <User className="h-3 w-3 shrink-0" />
          {row.corretor}
        </p>
      )}

      <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
        <CampoEditavel
          value={row.empreendimento}
          placeholder="Empreendimento…"
          ariaLabel={`Empreendimento de ${quem}`}
          onCommit={(v) => onSave(row.proposalId, { empreendimento: v })}
        />
        <CampoEditavel
          value={row.unidade}
          placeholder="Unidade…"
          ariaLabel={`Unidade de ${quem}`}
          onCommit={(v) => onSave(row.proposalId, { unidade: v })}
        />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-slate-100 pt-1.5 dark:border-slate-800">
        <span className="text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {moeda(row.valor)}
        </span>
        <span className="whitespace-nowrap text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
          {row.comissao.percentual.toLocaleString('pt-BR')}% · {moeda(row.comissao.valor)}
        </span>
      </div>

      <p
        className="mt-1 flex items-center gap-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400"
        title="Data de atendimento · último atendimento"
      >
        <CalendarClock className="h-3 w-3 shrink-0" />
        {dataCurta(row.dataAtendimento)} · {dataCurta(row.ultimoAtendimento)}
      </p>

      <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
        <label className="flex items-center gap-1">
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">Prev.</span>
          <CampoEditavel
            type="date"
            value={row.previsaoFechamento ?? ''}
            ariaLabel={`Previsão de fechamento de ${quem}`}
            onCommit={(v) => onSave(row.proposalId, { previsaoFechamento: v })}
          />
        </label>
        <CampoEditavel
          value={row.estadoAtual}
          placeholder="Estado atual…"
          ariaLabel={`Estado atual de ${quem}`}
          onCommit={(v) => onSave(row.proposalId, { estadoAtual: v })}
        />
      </div>
    </article>
  );
}
