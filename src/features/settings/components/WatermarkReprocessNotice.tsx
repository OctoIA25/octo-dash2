/**
 * Notificação GLOBAL e flutuante do reprocessamento da marca d'água.
 *
 * O reprocessamento (regenerar derivados + reapontar URLs) roda no SERVIDOR, em
 * background, com progresso DURÁVEL no banco. Então o usuário não precisa ficar
 * preso na tela — esta notificação segue por qualquer página e some ao concluir.
 *
 * Performance: NÃO faz polling constante. Só polla quando:
 *   - foi disparado nesta sessão (evento 'watermark:reprocess-started'), ou
 *   - ao montar já havia um reprocessamento em andamento.
 * Para de pollar assim que conclui.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, X, type LucideIcon } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { getReprocessStatus, type ReprocessStatus } from '@/features/imoveis/services/watermarkService';

const POLL_MS = 6000;

interface NoticeView {
  Icon: LucideIcon;
  iconClass: string;
  title: string;
  desc: string;
  showBar: boolean;
  pct: number;
}

/**
 * Deriva TODA a aparência da notificação a partir do status — de uma só vez.
 * Antes, a máquina de 4 estados (running → stalled → error → done) era repetida
 * em três cadeias de ternários no JSX (ícone, título, descrição). Centralizar
 * aqui deixa o componente declarativo e torna cada estado testável isoladamente.
 */
function reprocessView(state: ReprocessStatus): NoticeView {
  if (state.running) {
    return {
      Icon: Loader2,
      iconClass: 'animate-spin text-blue-600 dark:text-blue-400',
      title: 'Reprocessando fotos…',
      desc: `${state.done}${state.total ? `/${state.total}` : ''} atualizada(s).`,
      showBar: state.total > 0,
      pct: state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : 0,
    };
  }
  if (state.stalled) {
    return {
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
      title: 'Reprocessamento interrompido',
      desc: 'Salve novamente para retomar de onde parou.',
      showBar: false,
      pct: 0,
    };
  }
  if (state.status === 'error') {
    return {
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
      title: 'Falha no reprocessamento',
      desc: state.error || 'Tente novamente.',
      showBar: false,
      pct: 0,
    };
  }
  return {
    Icon: CheckCircle2,
    iconClass: 'text-emerald-500',
    title: 'Fotos reprocessadas',
    desc: `${state.done} foto(s) atualizadas.`,
    showBar: false,
    pct: 0,
  };
}

export function WatermarkReprocessNotice() {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId;
  const [state, setState] = useState<(ReprocessStatus & { stalled?: boolean }) | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (!tenantId) return;
    let alive = true;

    const stop = () => {
      pollingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    const tick = async () => {
      if (!alive) return;
      const s = (await getReprocessStatus(tenantId)) as ReprocessStatus & { stalled?: boolean; running?: boolean };
      if (!alive) return;
      setState(s);
      setDismissed(false);
      if (s.running) {
        timerRef.current = setTimeout(tick, POLL_MS); // continua acompanhando
      } else {
        pollingRef.current = false; // concluído/erro → para de pollar
      }
    };

    const startPolling = () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      tick();
    };

    // 1) Ao montar: checa uma vez; se já está rodando, acompanha.
    (async () => {
      const s = (await getReprocessStatus(tenantId)) as ReprocessStatus & { running?: boolean };
      if (!alive) return;
      if (s.running) startPolling();
    })();

    // 2) Disparado nesta sessão (logo/opacidade/escala salvos) → acompanha já.
    const onStarted = () => startPolling();
    window.addEventListener('watermark:reprocess-started', onStarted);

    return () => {
      alive = false;
      stop();
      window.removeEventListener('watermark:reprocess-started', onStarted);
    };
  }, [tenantId]);

  // Some sozinho alguns segundos após concluir.
  useEffect(() => {
    if (state && (state.status === 'done' || state.status === 'error') && !state.running) {
      // Concluído: avisa as páginas de imóveis (montadas) para recarregarem as
      // fotos com as URLs novas (marca aplicada/removida) sem refresh manual.
      if (state.status === 'done') {
        window.dispatchEvent(new CustomEvent('watermark:reprocess-done'));
      }
      const t = setTimeout(() => setDismissed(true), state.status === 'error' ? 12000 : 6000);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (!state || dismissed) return null;
  const running = !!state.running;
  const stalled = !!state.stalled;
  if (!running && !stalled && state.status !== 'done' && state.status !== 'error') return null;

  const { Icon, iconClass, title, desc, showBar, pct } = reprocessView(state);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-white dark:bg-slate-900 shadow-lg border-slate-200 dark:border-slate-700 p-3.5 animate-in slide-in-from-bottom-4 fade-in">
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
          {showBar && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
