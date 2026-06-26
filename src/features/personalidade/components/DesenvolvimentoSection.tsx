/**
 * "Como você evolui" — reaproveita texto já existente (direçãoDeCrescimento e
 * direçãoDeEstresse do Eneagrama) para mostrar para onde a pessoa cresce e o que
 * observar sob pressão. Sem conteúdo novo. Só aparece se houver Eneagrama.
 */

import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import type { EneagramaCorretorProfile } from '@/features/corretores/services/eneagramaResultsService';

interface DesenvolvimentoSectionProps {
  eneagrama: EneagramaCorretorProfile;
}

export function DesenvolvimentoSection({ eneagrama }: DesenvolvimentoSectionProps) {
  const tipo = ENEAGRAMA_TIPOS[eneagrama.tipo_principal];
  if (!tipo) return null;

  return (
    <section className="pl-4 border-l-2" style={{ borderColor: 'hsl(var(--border))' }}>
      <h2 className="text-lg font-bold tracking-tight mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
        Como você evolui
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: 'hsl(var(--bg-secondary))', border: '1px solid hsl(var(--border))' }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span aria-hidden="true">🌱</span>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--text-secondary))' }}>
              Caminho de crescimento
            </h3>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--text-primary))' }}>{tipo.direcaoDeCrescimento}</p>
        </div>

        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: 'hsl(var(--bg-secondary))', border: '1px solid hsl(var(--border))' }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span aria-hidden="true">🧭</span>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--text-secondary))' }}>
              O que observar sob pressão
            </h3>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--text-primary))' }}>{tipo.direcaoDeEstresse}</p>
        </div>
      </div>
    </section>
  );
}
