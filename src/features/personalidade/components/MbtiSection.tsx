/**
 * MBTI — "Como você pensa". Decompõe as letras do tipo em linguagem leiga (cada
 * letra → o que significa no dia a dia), mostra as 5 dimensões com ScoreBar e revela
 * características/forças/carreira (texto de MBTI_TIPOS). Componente puro.
 */

import { useTheme } from '@/hooks/useTheme';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MBTI_TIPOS } from '@/data/mbtiQuestions';
import type { MBTICorretorProfile } from '@/features/corretores/services/mbtiResultsService';
import { SecaoMetodologia } from './SecaoMetodologia';
import { ScoreBar } from './ScoreBar';
import { anchorOf, isTemaEscuro } from './tokens';
import { DIMENSOES, poloAtivo } from './mbtiDimensoes';

interface MbtiSectionProps {
  mbti: MBTICorretorProfile;
}

export function MbtiSection({ mbti }: MbtiSectionProps) {
  const { currentTheme } = useTheme();
  const anchor = anchorOf('mbti', isTemaEscuro(currentTheme));

  const base = mbti.tipo_mbti.split('-')[0];
  const tipo = MBTI_TIPOS[base];

  return (
    <SecaoMetodologia
      titulo="Como você pensa"
      badge="MBTI"
      subtitulo={tipo ? `${tipo.nome} — ${tipo.apelido}` : mbti.tipo_mbti}
      metodologia="mbti"
    >
      {/* Decomposição das letras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {DIMENSOES.map((dim) => {
          const polo = poloAtivo(dim, mbti.tipo_mbti, mbti.percentuais[dim.chave] ?? 0);
          return (
            <div
              key={dim.chave}
              className="flex gap-3 rounded-xl p-3"
              style={{ backgroundColor: 'hsl(var(--bg-secondary))', border: '1px solid hsl(var(--border))' }}
            >
              <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-base font-black ${anchor.chipBg}`}>
                {polo.letra}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--text-secondary))' }}>
                  {dim.rotulo}
                </p>
                <p className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>{polo.nome}</p>
                <p className="text-xs leading-snug mt-0.5" style={{ color: 'hsl(var(--text-secondary))' }}>{polo.resumo}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Intensidade de cada dimensão */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {DIMENSOES.map((dim) => {
          const polo = poloAtivo(dim, mbti.tipo_mbti, mbti.percentuais[dim.chave] ?? 0);
          return <ScoreBar key={dim.chave} nome={polo.nome} valor={mbti.percentuais[dim.chave] ?? 0} barFill={anchor.barFill} />;
        })}
      </div>

      {/* Detalhes do tipo (texto existente) */}
      {tipo && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="sobre" style={{ borderColor: 'hsl(var(--border))' }}>
            <AccordionTrigger className="text-sm hover:no-underline" style={{ color: 'hsl(var(--text-primary))' }}>
              Quem é {tipo.nome}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'hsl(var(--text-secondary))' }}>
                <p>{tipo.caracteristicas}</p>
                <p><span className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>Pontos fortes: </span>{tipo.pontosFortes}</p>
                <p><span className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>Carreiras que combinam: </span>{tipo.carreira}</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </SecaoMetodologia>
  );
}
