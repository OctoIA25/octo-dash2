/**
 * Cor-âncora por metodologia. Uma cor sóbria por sistema, consistente em toda a
 * tela (DISC=âmbar, MBTI=índigo, Eneagrama=teal). Tudo o mais usa as CSS vars de
 * tema (--bg-primary, --text-primary, --border) para adaptar aos 3 temas do app.
 *
 * Por que não usar o variant `dark:` do Tailwind: o app tem 3 temas (branco/cinza/
 * escuro) via next-themes. Só 'escuro' aplica class="dark"; 'cinza' aplica
 * class="gray" (também fundo escuro) e NÃO dispara `dark:`. Para não pintar cores
 * claras sobre fundo escuro no tema cinza, derivamos do isDark (cinza OU escuro),
 * a mesma convenção já usada nas telas existentes.
 */

export type Metodologia = 'disc' | 'mbti' | 'eneagrama';

export interface AnchorTheme {
  text: string;    // texto de destaque (título/realce da seção)
  barFill: string; // preenchimento da barra de score
  chipBg: string;  // fundo suave do badge/chip da seção
  ring: string;    // borda de realce (border-left da seção)
}

const PALETTE: Record<Metodologia, { light: AnchorTheme; dark: AnchorTheme }> = {
  disc: {
    light: { text: 'text-amber-700', barFill: 'bg-amber-500', chipBg: 'bg-amber-100 text-amber-800', ring: 'border-amber-400/60' },
    dark:  { text: 'text-amber-300', barFill: 'bg-amber-400', chipBg: 'bg-amber-500/15 text-amber-200', ring: 'border-amber-500/40' },
  },
  mbti: {
    light: { text: 'text-indigo-700', barFill: 'bg-indigo-500', chipBg: 'bg-indigo-100 text-indigo-800', ring: 'border-indigo-400/60' },
    dark:  { text: 'text-indigo-300', barFill: 'bg-indigo-400', chipBg: 'bg-indigo-500/15 text-indigo-200', ring: 'border-indigo-500/40' },
  },
  eneagrama: {
    light: { text: 'text-teal-700', barFill: 'bg-teal-500', chipBg: 'bg-teal-100 text-teal-800', ring: 'border-teal-400/60' },
    dark:  { text: 'text-teal-300', barFill: 'bg-teal-400', chipBg: 'bg-teal-500/15 text-teal-200', ring: 'border-teal-500/40' },
  },
};

export function anchorOf(metodologia: Metodologia, isDark: boolean): AnchorTheme {
  return PALETTE[metodologia][isDark ? 'dark' : 'light'];
}

/** Convenção do app: cinza e escuro são fundos escuros; branco é claro. */
export function isTemaEscuro(currentTheme: string): boolean {
  return currentTheme === 'escuro' || currentTheme === 'cinza' || currentTheme === 'preto';
}
