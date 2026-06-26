/**
 * Wrapper de seção: cabeçalho em linguagem leiga + badge com o nome técnico.
 * Padroniza espaçamento, hierarquia e a cor-âncora de cada metodologia, para que
 * DISC/MBTI/Eneagrama leiam como capítulos consistentes de um mesmo perfil.
 */

import type { ReactNode } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { anchorOf, isTemaEscuro, type Metodologia } from './tokens';

interface SecaoMetodologiaProps {
  /** título em linguagem do dia a dia, ex.: "Como você age" */
  titulo: string;
  /** nome técnico, vira badge discreto, ex.: "DISC" */
  badge: string;
  /** subtítulo opcional (o tipo/perfil resultante em linguagem humana) */
  subtitulo?: string;
  metodologia: Metodologia;
  children: ReactNode;
}

export function SecaoMetodologia({ titulo, badge, subtitulo, metodologia, children }: SecaoMetodologiaProps) {
  const { currentTheme } = useTheme();
  const anchor = anchorOf(metodologia, isTemaEscuro(currentTheme));

  return (
    <section className={`pl-4 border-l-2 ${anchor.ring}`}>
      <header className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-bold tracking-tight" style={{ color: 'hsl(var(--text-primary))' }}>
            {titulo}
          </h2>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${anchor.chipBg}`}>
            {badge}
          </span>
        </div>
        {subtitulo && (
          <p className={`text-sm font-semibold ${anchor.text}`}>{subtitulo}</p>
        )}
      </header>
      {children}
    </section>
  );
}
