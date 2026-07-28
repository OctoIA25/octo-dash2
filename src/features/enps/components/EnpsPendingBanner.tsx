/**
 * Faixa discreta no topo da dash quando o corretor tem uma pesquisa eNPS aberta
 * e ainda não respondeu. Descoberta in-app (o eNPS também chega por e-mail/WhatsApp,
 * mas quem não abre o canal não veria a pesquisa). Não bloqueia nada; dispensável.
 *
 * Some sozinho quando: não há pendência, o corretor responde (a query invalida ao
 * voltar), ou o ciclo fecha. O "×" esconde na sessão atual (state local).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useEnpsPending } from '../hooks/useEnps';

/** 'YYYY-MM-01' → 'Julho' (mês por extenso, pt-BR). Vazio se não parsear. */
function monthLabel(periodStart: string): string {
  if (!periodStart) return '';
  const d = new Date(`${periodStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.toLocaleDateString('pt-BR', { month: 'long' });
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function EnpsPendingBanner() {
  const pending = useEnpsPending();
  const [dismissed, setDismissed] = useState(false);

  if (!pending.pending || dismissed) return null;

  const mes = monthLabel(pending.periodStart);
  const href = `/enps/responder?cycle=${encodeURIComponent(pending.cycleId)}`;

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/30">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 shrink-0">
        <Sparkles className="w-[18px] h-[18px] text-blue-600 dark:text-blue-400" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 leading-tight">
          Pesquisa de satisfação (eNPS){mes ? ` — ${mes}` : ''}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
          Leva menos de 1 minuto e suas respostas são anônimas.
        </p>
      </div>
      <Link
        to={href}
        className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold transition-colors"
      >
        Responder
      </Link>
      <button
        type="button"
        aria-label="Dispensar aviso"
        onClick={() => setDismissed(true)}
        className="shrink-0 grid place-items-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <X className="w-4 h-4" strokeWidth={2} />
      </button>
    </div>
  );
}
