/**
 * MBTI — "Como você pensa". Decompõe as letras do tipo em linguagem leiga (cada
 * letra → o que significa no dia a dia) e revela características/forças/carreira
 * (texto de MBTI_TIPOS). Componente puro.
 *
 * NÃO exibe intensidade por dimensão: o percentual do 16personalities nunca é
 * lido de fato (o scraping foi descontinuado — ver M9), então o valor gravado era
 * uma constante derivada da própria letra (55 para I/S/T/J, 45 para o oposto).
 * Como toda constante caía na mesma faixa, a barra dizia "Moderado" para todo
 * mundo em todas as dimensões — número inventado com aparência de medição.
 * A letra e o tipo continuam: esses vêm da URL do resultado e são reais.
 */

import { useTheme } from '@/hooks/useTheme';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MBTI_TIPOS } from '@/data/mbtiQuestions';
import type { MBTICorretorProfile } from '@/features/corretores/services/mbtiResultsService';
import { SecaoMetodologia } from './SecaoMetodologia';
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
          const polo = poloAtivo(dim, mbti.tipo_mbti);
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
