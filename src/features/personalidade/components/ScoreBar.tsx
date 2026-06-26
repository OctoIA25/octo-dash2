/**
 * Elemento-assinatura da tela: traduz um score (0–100) em barra + rótulo
 * qualitativo, sem expor o número cru. Briefing: "Ao invés de 87%, 'Muito elevado'".
 */

import { scoreToLabel, type ScoreLabel } from '../interpret/scoreToLabel';

interface ScoreBarProps {
  /** rótulo da dimensão, ex.: "Dominância" ou "Mente" */
  nome: string;
  /** score 0–100 */
  valor: number;
  /** classe de cor do preenchimento (vem da âncora da metodologia) */
  barFill: string;
  /** interpretador do score; permite escala relativa (ex.: DISC). Default: 0–100 */
  interpret?: (valor: number) => ScoreLabel;
}

export function ScoreBar({ nome, valor, barFill, interpret = scoreToLabel }: ScoreBarProps) {
  const { label, nivel } = interpret(valor);
  const pct = Math.min(100, Math.max(0, valor));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium" style={{ color: 'hsl(var(--text-primary))' }}>
          {nome}
        </span>
        <span className="text-xs font-semibold" style={{ color: 'hsl(var(--text-secondary))' }}>
          {label}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--border))' }}
        role="meter"
        aria-valuenow={nivel}
        aria-valuemin={1}
        aria-valuemax={5}
        aria-label={`${nome}: ${label}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${barFill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
