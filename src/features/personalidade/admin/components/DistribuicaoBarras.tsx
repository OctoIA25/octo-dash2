/**
 * Distribuição da equipe por tipo (DISC/Eneagrama/MBTI) em barras CSS.
 * Genérico: recebe itens já agregados e mostra "quantas pessoas" por tipo, com o
 * mais comum destacado. Substitui os 3 gráficos duplicados (horizontal+vertical)
 * dos *Statistics por uma representação única e interpretada.
 */

import { useTheme } from '@/hooks/useTheme';
import { anchorOf, isTemaEscuro, type Metodologia } from '@/features/personalidade/components/tokens';

export interface ItemDistribuicao {
  chave: string;       // chave única (ex.: 'D', '3', 'INTJ')
  rotulo: string;      // nome humano (ex.: 'Dominância', 'O Realizador')
  count: number;       // quantas pessoas neste tipo
}

interface DistribuicaoBarrasProps {
  itens: ItemDistribuicao[];
  total: number;       // total de pessoas com teste (para a proporção)
  metodologia: Metodologia;
  /** chave do tipo a destacar (mais comum); opcional */
  destaque?: string;
  onSelecionarTipo?: (chave: string) => void;
  tipoSelecionado?: string | null;
}

export function DistribuicaoBarras({
  itens, total, metodologia, destaque, onSelecionarTipo, tipoSelecionado,
}: DistribuicaoBarrasProps) {
  const { currentTheme } = useTheme();
  const anchor = anchorOf(metodologia, isTemaEscuro(currentTheme));
  const maxCount = Math.max(1, ...itens.map((i) => i.count));

  return (
    <div className="space-y-2.5">
      {itens.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        const largura = Math.round((item.count / maxCount) * 100);
        const ehDestaque = item.chave === destaque;
        const ehSelecionado = item.chave === tipoSelecionado;
        const clicavel = Boolean(onSelecionarTipo);

        return (
          <button
            key={item.chave}
            type="button"
            disabled={!clicavel}
            onClick={() => onSelecionarTipo?.(item.chave)}
            className={`w-full text-left rounded-lg p-2 transition-colors ${clicavel ? 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer' : 'cursor-default'}`}
            style={ehSelecionado ? { backgroundColor: 'hsl(var(--bg-secondary))' } : undefined}
            aria-pressed={ehSelecionado}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-sm font-medium flex items-center gap-2" style={{ color: 'hsl(var(--text-primary))' }}>
                {item.rotulo}
                {ehDestaque && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${anchor.chipBg}`}>
                    Mais comum
                  </span>
                )}
              </span>
              <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'hsl(var(--text-secondary))' }}>
                {item.count} {item.count === 1 ? 'pessoa' : 'pessoas'} · {pct}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--border))' }}>
              <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${anchor.barFill}`} style={{ width: `${largura}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
