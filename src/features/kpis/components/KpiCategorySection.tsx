/**
 * Seção de uma categoria de KPIs na Home: cabeçalho com rail colorido + ícone,
 * faixa de KPIs "hero" (isFeatured) e grade densa dos demais, mais um slot
 * `extra` para as visualizações da categoria (funil, gráficos). Colapsável.
 *
 * "Burra" por design: recebe os cards já agrupados/ordenados pela página.
 */
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { KpiCompactCard, KpiHeroCard } from './KpiComponents';
import type { CategoryColor } from './kpiCategoryConfig';
import type { KpiSummaryCard } from '../types';

interface Props {
  category: string;
  title: string;
  icon: LucideIcon;
  /** Cor-assinatura da categoria (faixa do header + destaque do hero). */
  color: CategoryColor;
  cards: KpiSummaryCard[];
  extra?: ReactNode;
  defaultOpen?: boolean;
}

export function KpiCategorySection({ category, title, icon: Icon, color, cards, extra, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (cards.length === 0 && !extra) return null;

  const hero = cards.filter((c) => c.isFeatured);
  const compact = cards.filter((c) => !c.isFeatured);

  return (
    <section id={`kpi-cat-${category}`} className="scroll-mt-24">
      {/* Cabeçalho como FAIXA tonal (não um fio): a área colorida identifica a
          categoria de relance — é o que diferencia visualmente as seções. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`w-full flex items-center gap-2.5 mb-3 rounded-lg px-3 py-2.5 ${color.headerBg}`}
      >
        <Icon className={`w-4 h-4 ${color.headerIcon}`} strokeWidth={2.25} aria-hidden />
        <h2 className={`text-[14px] font-bold tracking-tight ${color.headerText}`}>{title}</h2>
        <span className={`text-[12px] font-medium opacity-70 ${color.headerText}`}>
          {cards.length} {cards.length === 1 ? 'indicador' : 'indicadores'}
        </span>
        <ChevronDown
          className={`w-4 h-4 ml-auto transition-transform ${color.headerIcon} ${open ? '' : '-rotate-90'}`}
          strokeWidth={2.25}
          aria-hidden
        />
      </button>

      <div id={panelId} hidden={!open} className="space-y-4 mb-8">
        {hero.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hero.map((c) => (
              <KpiHeroCard key={c.id} card={c} valueColor={color.heroValue} borderColor={color.heroBorder} />
            ))}
          </div>
        )}
        {compact.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {compact.map((c) => <KpiCompactCard key={c.id} card={c} />)}
          </div>
        )}
        {extra}
      </div>
    </section>
  );
}
