/**
 * Eneagrama — "O que te move". Não tem scores por dimensão: é um tipo com
 * motivação/medo/forças/atenção/crescimento. Apresentado em pares contrastantes
 * para leitura rápida. Todo texto vem de ENEAGRAMA_TIPOS (já existente).
 */

import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import type { EneagramaCorretorProfile } from '@/features/corretores/services/eneagramaResultsService';
import { SecaoMetodologia } from './SecaoMetodologia';

interface EneagramaSectionProps {
  eneagrama: EneagramaCorretorProfile;
}

interface ParProps {
  icone: string;
  titulo: string;
  texto: string;
}

function Par({ icone, titulo, texto }: ParProps) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'hsl(var(--bg-secondary))', border: '1px solid hsl(var(--border))' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span aria-hidden="true">{icone}</span>
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--text-secondary))' }}>
          {titulo}
        </h3>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--text-primary))' }}>{texto}</p>
    </div>
  );
}

export function EneagramaSection({ eneagrama }: EneagramaSectionProps) {
  const tipo = ENEAGRAMA_TIPOS[eneagrama.tipo_principal];
  if (!tipo) return null;

  return (
    <SecaoMetodologia
      titulo="O que te move"
      badge="Eneagrama"
      subtitulo={`${tipo.nome} — ${tipo.descricaoBreve}`}
      metodologia="eneagrama"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Par icone="🎯" titulo="O que te motiva" texto={tipo.motivacaoCentral} />
        <Par icone="🛡️" titulo="O que você evita" texto={tipo.medoBasico} />
        <Par icone="💪" titulo="Seus pontos fortes" texto={tipo.pontosFortes} />
        <Par icone="⚠️" titulo="Pontos de atenção" texto={tipo.pontosDeAtencao} />
      </div>
    </SecaoMetodologia>
  );
}
