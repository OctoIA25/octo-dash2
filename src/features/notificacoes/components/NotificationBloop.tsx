/**
 * O aviso curto no canto superior direito quando chega algo novo.
 *
 * Toast CUSTOM do Sonner (já instalado): empilha até 3, pausa com o mouse
 * em cima e respeita prefers-reduced-motion no CSS dele. O toast do shadcn
 * não serve: TOAST_LIMIT = 1 faria cada aviso apagar o anterior.
 *
 * A barra fina embaixo mostra quanto tempo o aviso ainda fica — some para
 * quem pediu menos movimento.
 */
import type { CSSProperties } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import type { NotificationItem } from '@/contexts/NotificationsContext';
import { acentoDoAviso, duracaoDoAviso } from '../notificationKinds';
import { AvatarDoAviso, LinhaDeRota } from './RotaDoAviso';

interface BloopProps {
  item: NotificationItem;
  duracao: number;
  onAbrir: () => void;
  onFechar: () => void;
}

function Bloop({ item, duracao, onAbrir, onFechar }: BloopProps) {
  const acento = acentoDoAviso(item);
  const tempo: CSSProperties = { animation: `bloop-tempo ${duracao}ms linear forwards` };
  return (
    <div className="group/bloop relative w-[380px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_40px_-16px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-900">
      {acento && <span className={`absolute inset-y-0 left-0 w-1 ${acento}`} aria-hidden />}
      <div className="flex gap-3 py-3.5 pl-4 pr-2.5">
        <AvatarDoAviso item={item} pequeno />
        <button type="button" onClick={onAbrir} className="min-w-0 flex-1 text-left focus-visible:outline-none">
          <LinhaDeRota item={item} compacta />
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{item.title}</p>
          {item.body && (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-slate-600 dark:text-slate-400">{item.body}</p>
          )}
        </button>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          className="self-start rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <span
        className={`absolute inset-x-0 bottom-0 h-0.5 origin-left motion-reduce:hidden group-hover/bloop:[animation-play-state:paused] ${acento ?? 'bg-blue-600'}`}
        style={tempo}
        aria-hidden
      />
    </div>
  );
}

/** Clicar no corpo abre (e marca lida); o ✕ só fecha. */
export function mostrarBloop(item: NotificationItem, onAbrir: (item: NotificationItem) => void) {
  const duracao = duracaoDoAviso(item);
  toast.custom(
    (id) => (
      <Bloop
        item={item}
        duracao={duracao}
        onAbrir={() => {
          toast.dismiss(id);
          onAbrir(item);
        }}
        onFechar={() => toast.dismiss(id)}
      />
    ),
    { position: 'top-right', duration: duracao, unstyled: true }
  );
}
