/**
 * DISC — "Como você age". 4 dimensões com ScoreBar interpretado; a dominante em
 * destaque. Accordion revela descrição e características (texto já existente em
 * DISC_PROFILES). Componente puro: recebe o resultado por prop.
 */

import { useTheme } from '@/hooks/useTheme';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DISC_PROFILES } from '@/data/discQuestions';
import type { DISCResultData } from '@/features/corretores/services/discResultsService';
import { SecaoMetodologia } from './SecaoMetodologia';
import { ScoreBar } from './ScoreBar';
import { anchorOf, isTemaEscuro } from './tokens';
import { decimalToPercent, discScoreToLabel } from '../interpret/scoreToLabel';

interface DiscSectionProps {
  disc: DISCResultData;
}

const ORDEM: Array<'D' | 'I' | 'S' | 'C'> = ['D', 'I', 'S', 'C'];

export function DiscSection({ disc }: DiscSectionProps) {
  const { currentTheme } = useTheme();
  const anchor = anchorOf('disc', isTemaEscuro(currentTheme));

  const valores: Record<'D' | 'I' | 'S' | 'C', number> = {
    D: decimalToPercent(disc.percentual_d),
    I: decimalToPercent(disc.percentual_i),
    S: decimalToPercent(disc.percentual_s),
    C: decimalToPercent(disc.percentual_c),
  };

  const principal = DISC_PROFILES[disc.tipo_principal];

  return (
    <SecaoMetodologia
      titulo="Como você age"
      badge="DISC"
      subtitulo={principal ? `Predomínio em ${principal.nome.toLowerCase()}` : undefined}
      metodologia="disc"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {ORDEM.map((letra) => {
          const p = DISC_PROFILES[letra];
          if (!p) return null;
          const nome = p.nome.charAt(0) + p.nome.slice(1).toLowerCase();
          return <ScoreBar key={letra} nome={nome} valor={valores[letra]} barFill={anchor.barFill} interpret={discScoreToLabel} />;
        })}
      </div>

      <Accordion type="single" collapsible className="w-full">
        {ORDEM.map((letra) => {
          const p = DISC_PROFILES[letra];
          if (!p) return null;
          const nome = p.nome.charAt(0) + p.nome.slice(1).toLowerCase();
          return (
            <AccordionItem key={letra} value={letra} style={{ borderColor: 'hsl(var(--border))' }}>
              <AccordionTrigger className="text-sm hover:no-underline" style={{ color: 'hsl(var(--text-primary))' }}>
                <span className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${anchor.text}`}>{letra}</span>
                  {nome}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'hsl(var(--text-secondary))' }}>
                  <p>{p.descricao}</p>
                  <p><span className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>No dia a dia: </span>{p.caracteristicas}</p>
                  <p><span className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>Pontos fortes: </span>{p.pontos_fortes}</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </SecaoMetodologia>
  );
}
