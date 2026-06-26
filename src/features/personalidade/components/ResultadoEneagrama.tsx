/**
 * View de resultado Eneagrama reutilizável (tela do teste + modal admin).
 * Adapta o `resultadoFinal` do TesteEneagrama para EneagramaCorretorProfile e
 * renderiza header + EneagramaSection + DesenvolvimentoSection. Só apresentação.
 */

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import type { EneagramaCorretorProfile } from '@/features/corretores/services/eneagramaResultsService';
import { EneagramaSection } from './EneagramaSection';
import { DesenvolvimentoSection } from './DesenvolvimentoSection';

/** Shape que o TesteEneagrama mantém em resultadoFinal (scores = contagem bruta). */
export interface ResultadoEneagramaInput {
  tipoPrincipal: number;
  scores: Record<string, number>;
  topTipos: Array<{ tipo: number; score: number }>;
}

interface ResultadoEneagramaProps {
  resultadoFinal: ResultadoEneagramaInput;
  corretorNome: string;
  onVoltar: () => void;
}

function adaptar(input: ResultadoEneagramaInput, nome: string): EneagramaCorretorProfile {
  const tipo = ENEAGRAMA_TIPOS[input.tipoPrincipal];
  const scores9 = {} as EneagramaCorretorProfile['scores'];
  for (let i = 1; i <= 9; i++) {
    (scores9 as Record<number, number>)[i] = Number(input.scores?.[String(i)] ?? input.scores?.[i] ?? 0);
  }
  return {
    corretor_id: 0,
    corretor_nome: nome,
    tipo_principal: input.tipoPrincipal,
    nome_tipo: tipo?.nome ?? '',
    emoji_tipo: tipo?.emoji ?? '',
    cor_tipo: tipo?.cor ?? '',
    scores: scores9,
    data_teste: '',
    historico_testes: 1,
  };
}

export function ResultadoEneagrama({ resultadoFinal, corretorNome, onVoltar }: ResultadoEneagramaProps) {
  const eneagrama = adaptar(resultadoFinal, corretorNome);

  return (
    <div className="fixed inset-0 z-50 overflow-auto py-8 px-4" style={{ backgroundColor: 'hsl(var(--bg-primary))' }}>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onVoltar} className="-ml-2" style={{ color: 'hsl(var(--text-secondary))' }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <span className="text-sm font-medium truncate" style={{ color: 'hsl(var(--text-secondary))' }}>{corretorNome}</span>
        </div>

        <EneagramaSection eneagrama={eneagrama} />
        <DesenvolvimentoSection eneagrama={eneagrama} />
      </div>
    </div>
  );
}
