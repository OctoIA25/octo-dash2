/**
 * Botões de avaliação de qualidade (Fatia C). Um humano marca a resposta do
 * agente como correta/incorreta — é o ÚNICO ground truth (não há detecção
 * automática de alucinação). Alimenta agent_response_evaluations via o endpoint,
 * que grava o avaliador do JWT.
 *
 * Sem tenantId → não renderiza (nada a atribuir). Estado local só de UI
 * (feedback do clique); a fonte de verdade é o backend.
 */
import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { submitEvaluation } from '../services/telemetryDashboardService';

interface Props {
  tenantId: string | null | undefined;
  agentSlug: string;
  executionId: string | null | undefined;
}

export function EvaluationButtons({ tenantId, agentSlug, executionId }: Props) {
  const [sent, setSent] = useState<'correct' | 'incorrect' | null>(null);
  const [busy, setBusy] = useState(false);

  if (!tenantId) return null;

  const evaluate = async (verdict: 'correct' | 'incorrect') => {
    if (busy || sent) return;
    setBusy(true);
    try {
      await submitEvaluation({ tenantId, agentSlug, executionId, verdict });
      setSent(verdict);
    } catch {
      // silencioso: avaliação é acessório; não trava o chat. Reabilita para retry.
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p className="text-[10px] mt-1.5" style={{ color: 'hsl(var(--text-secondary))' }}>
        {sent === 'correct' ? 'Avaliada como correta ✓' : 'Avaliada como incorreta ✓'}
      </p>
    );
  }

  const btn = 'inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors disabled:opacity-50';
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span className="text-[10px]" style={{ color: 'hsl(var(--text-secondary))' }}>Esta resposta ajudou?</span>
      <button
        type="button"
        className={btn}
        style={{ borderColor: 'hsl(var(--border))' }}
        disabled={busy}
        onClick={() => evaluate('correct')}
        aria-label="Marcar resposta como correta"
        title="Correta"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className={btn}
        style={{ borderColor: 'hsl(var(--border))' }}
        disabled={busy}
        onClick={() => evaluate('incorrect')}
        aria-label="Marcar resposta como incorreta"
        title="Incorreta"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
