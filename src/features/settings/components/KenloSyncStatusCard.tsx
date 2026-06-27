/**
 * Card de status da sincronização de leads do Kenlo, na página de Integrações.
 *
 * O sync roda no servidor em background com estado durável (kenlo_integrations.
 * sync_state). Este card lê esse estado e mostra de forma legível — running /
 * done / error / stalled — para o usuário NÃO ficar cego esperando.
 *
 * Polling inteligente (espelha WatermarkReprocessNotice): só polla enquanto o
 * status é 'running'; para ao concluir. Ao clicar "Sincronizar agora", dispara
 * o sync e começa a acompanhar.
 *
 * ponytail: os endpoints /sync/status e /sync/run são owner-only hoje, então o
 * card só mostra estado real para o owner da plataforma. Para um admin de tenant
 * ver o próprio status, tornar GET /sync/status tenant-scoped (routes.js).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, type LucideIcon } from 'lucide-react';
import {
  getKenloSyncStatus,
  triggerKenloSync,
  type KenloIntegrationStatus,
} from '@/features/settings/services/kenloSyncService';

const POLL_MS = 6000;

interface CardView {
  Icon: LucideIcon;
  iconClass: string;
  title: string;
  desc: string;
  spinning: boolean;
}

/** Deriva a aparência do card a partir do status — declarativo, um lugar só. */
function syncView(s: KenloIntegrationStatus | null): CardView {
  const sync = s?.sync;
  if (sync?.status === 'running' && !sync.stalled) {
    return {
      Icon: Loader2,
      iconClass: 'animate-spin text-blue-600 dark:text-blue-400',
      title: 'Sincronizando leads do Kenlo…',
      desc: `${sync.saved ?? 0} importado(s)${sync.mode === 'BACKFILL' ? ' (carga inicial)' : ''}.`,
      spinning: true,
    };
  }
  if (sync?.stalled) {
    return {
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
      title: 'Sincronização interrompida',
      desc: 'O processo parou no meio. Clique em Sincronizar agora para retomar.',
      spinning: false,
    };
  }
  if (sync?.status === 'error') {
    return {
      Icon: AlertTriangle,
      iconClass: 'text-amber-500',
      title: 'Falha na sincronização',
      desc: sync.error_message || 'Erro desconhecido. Tente novamente.',
      spinning: false,
    };
  }
  if (sync?.status === 'done') {
    const quando = s?.last_sync_at ? relativo(s.last_sync_at) : 'agora';
    const erros = sync.errors ? ` · ${sync.errors} erro(s)` : ' · sem erros';
    return {
      Icon: CheckCircle2,
      iconClass: 'text-emerald-500',
      title: `Último sync: ${quando}`,
      desc: `${s?.leads_count ?? 0} leads no total · ${sync.new ?? 0} novo(s)${erros}.`,
      spinning: false,
    };
  }
  // Sem sync_state ainda (nunca sincronizou)
  return {
    Icon: RefreshCw,
    iconClass: 'text-slate-400',
    title: 'Sincronização não iniciada',
    desc: 'Clique em Sincronizar agora para importar os leads do Kenlo.',
    spinning: false,
  };
}

/** "há 3 min", "há 2 h", "ontem" — feedback humano do último sync. */
function relativo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

export function KenloSyncStatusCard({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<KenloIntegrationStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef(false);
  const aliveRef = useRef(true);

  const tick = useCallback(async () => {
    if (!aliveRef.current) return;
    const s = await getKenloSyncStatus(tenantId);
    if (!aliveRef.current) return;
    setState(s);
    if (s?.sync?.status === 'running' && !s.sync.stalled) {
      timerRef.current = setTimeout(tick, POLL_MS);
    } else {
      pollingRef.current = false; // concluído/erro → para de pollar
    }
  }, [tenantId]);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    tick();
  }, [tick]);

  // Ao montar: checa uma vez; se já está rodando, acompanha.
  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      const s = await getKenloSyncStatus(tenantId);
      if (!aliveRef.current) return;
      setState(s);
      if (s?.sync?.status === 'running' && !s.sync.stalled) startPolling();
    })();
    return () => {
      aliveRef.current = false;
      pollingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tenantId, startPolling]);

  const handleSync = async () => {
    setTriggering(true);
    try {
      await triggerKenloSync();
      startPolling(); // começa a acompanhar imediatamente
    } finally {
      setTriggering(false);
    }
  };

  const { Icon, iconClass, title, desc, spinning } = syncView(state);
  const running = state?.sync?.status === 'running' && !state.sync.stalled;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={triggering || running}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${spinning || triggering ? 'animate-spin' : ''}`} />
          {running ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </div>
    </div>
  );
}
