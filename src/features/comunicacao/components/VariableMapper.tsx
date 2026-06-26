/**
 * VariableMapper — mapeia cada variável posicional ({{N}}) de um template a um
 * campo do lead ou um valor fixo. Reusado por Campanha (etapa 4) e Disparador.
 */
import { LEAD_FIELD_OPTIONS, type VarMapping } from '../variableMapping';

interface Props {
  variables: string[];
  mapping: VarMapping;
  onChange: (mapping: VarMapping) => void;
}

export function VariableMapper({ variables, mapping, onChange }: Props) {
  if (variables.length === 0) {
    return <p className="text-[12px] text-slate-400">Este template não usa variáveis.</p>;
  }
  function setEntry(v: string, type: 'lead_field' | 'fixed', value: string) {
    onChange({ ...mapping, [v]: { type, value } });
  }
  return (
    <div className="space-y-2">
      {variables.map((v) => {
        const entry = mapping[v];
        const sel = entry?.type === 'fixed' ? '__fixed__' : entry?.value || '';
        return (
          <div key={v} className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500 w-12 shrink-0">{`{{${v}}}`}</span>
            <select
              aria-label={`Variável ${v}`}
              value={sel}
              onChange={(e) => {
                if (e.target.value === '__fixed__') setEntry(v, 'fixed', entry?.type === 'fixed' ? entry.value : '');
                else if (e.target.value === '') { const next = { ...mapping }; delete next[v]; onChange(next); }
                else setEntry(v, 'lead_field', e.target.value);
              }}
              className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px]"
            >
              <option value="">— escolher —</option>
              {LEAD_FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              <option value="__fixed__">Valor fixo</option>
            </select>
            {entry?.type === 'fixed' && (
              <input
                aria-label={`Texto fixo ${v}`}
                value={entry.value}
                onChange={(e) => setEntry(v, 'fixed', e.target.value)}
                placeholder="texto…"
                className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[12.5px] flex-1"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default VariableMapper;
