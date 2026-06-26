/**
 * View de resultado DISC reutilizável (tela do teste + modal admin).
 * Adapta o `resultadoFinal` do TesteDISC para o shape DISCResultData e renderiza
 * header + DiscSection. Sem cálculo/save — só apresentação.
 */

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DISCResultData } from '@/features/corretores/services/discResultsService';
import { DiscSection } from './DiscSection';

/** Shape que o TesteDISC mantém em resultadoFinal (percentuais decimais 0–1). */
export interface ResultadoDiscInput {
  resultado: { D: number; I: number; S: number; C: number };
  dominantes: Array<{ perfil: 'D' | 'I' | 'S' | 'C'; percentual: number }>;
}

interface ResultadoDiscProps {
  resultadoFinal: ResultadoDiscInput;
  corretorNome: string;
  onVoltar: () => void;
}

function adaptar(input: ResultadoDiscInput, nome: string): DISCResultData {
  const principal = input.dominantes[0]?.perfil ?? 'D';
  return {
    id: '',
    corretor_id: 0,
    corretor_nome: nome,
    tipo_principal: principal,
    percentual_d: input.resultado.D,
    percentual_i: input.resultado.I,
    percentual_s: input.resultado.S,
    percentual_c: input.resultado.C,
    perfis_dominantes: input.dominantes.map((d) => d.perfil),
    data_teste: '',
    versao_teste: 0,
    created_at: '',
  } as DISCResultData;
}

export function ResultadoDisc({ resultadoFinal, corretorNome, onVoltar }: ResultadoDiscProps) {
  const disc = adaptar(resultadoFinal, corretorNome);

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: 'hsl(var(--bg-primary))' }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onVoltar} className="-ml-2" style={{ color: 'hsl(var(--text-secondary))' }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <span className="text-sm font-medium truncate" style={{ color: 'hsl(var(--text-secondary))' }}>{corretorNome}</span>
        </div>

        <DiscSection disc={disc} />
      </div>
    </div>
  );
}
