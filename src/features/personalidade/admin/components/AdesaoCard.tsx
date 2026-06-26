/**
 * Card de adesão de um teste na equipe. Interpreta a proporção (X de Y fizeram)
 * em vez de mostrar só "90%" cru — o gestor entende na hora se está bom.
 */

import type { Metodologia } from '@/features/personalidade/components/tokens';
import { useTheme } from '@/hooks/useTheme';
import { anchorOf, isTemaEscuro } from '@/features/personalidade/components/tokens';

interface AdesaoCardProps {
  nome: string;          // "DISC", "Eneagrama", "MBTI"
  comTeste: number;
  total: number;
  metodologia: Metodologia;
}

/** Rótulo qualitativo da adesão (apresentação de um número que já existe). */
function rotuloAdesao(pct: number): string {
  if (pct >= 90) return 'Adesão excelente';
  if (pct >= 70) return 'Boa adesão';
  if (pct >= 40) return 'Adesão parcial';
  if (pct > 0) return 'Adesão baixa';
  return 'Ninguém fez ainda';
}

export function AdesaoCard({ nome, comTeste, total, metodologia }: AdesaoCardProps) {
  const { currentTheme } = useTheme();
  const anchor = anchorOf(metodologia, isTemaEscuro(currentTheme));
  const pct = total > 0 ? Math.round((comTeste / total) * 100) : 0;
  const faltam = Math.max(0, total - comTeste);

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'hsl(var(--bg-secondary))', border: '1px solid hsl(var(--border))' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold" style={{ color: 'hsl(var(--text-primary))' }}>{nome}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${anchor.chipBg}`}>
          {rotuloAdesao(pct)}
        </span>
      </div>

      <p className="text-sm mb-3" style={{ color: 'hsl(var(--text-secondary))' }}>
        <span className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>{comTeste}</span> de {total} fizeram
        {faltam > 0 && ` · faltam ${faltam}`}
      </p>

      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
        <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${anchor.barFill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
