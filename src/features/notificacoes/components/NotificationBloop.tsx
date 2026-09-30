/**
 * O aviso curto no canto superior direito quando chega algo novo.
 *
 * Toast CUSTOM do Sonner (já instalado): empilha até 3, pausa com o mouse
 * em cima e respeita prefers-reduced-motion no CSS dele. O toast do shadcn
 * não serve: TOAST_LIMIT = 1 faria cada aviso apagar o anterior.
 */
import { toast } from 'sonner';
import { X } from 'lucide-react';
import type { NotificationItem } from '@/contexts/NotificationsContext';
import { CLASSES_DO_TOM, duracaoDoAviso, tipoDe } from '../notificationKinds';
import { Etiquetas } from './Etiquetas';

interface BloopProps {
  item: NotificationItem;
  onAbrir: () => void;
  onFechar: () => void;
}

function Bloop({ item, onAbrir, onFechar }: BloopProps) {
  const tipo = tipoDe(item.type);
  const tom = CLASSES_DO_TOM[tipo.tom];
  const Icone = tipo.icone;
  const importante = item.metadata?.prioridade === 'importante';
  return (
    <div
      className={`flex w-[360px] max-w-[calc(100vw-32px)] gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900 ${
        importante ? 'border-l-4 border-l-amber-500' : ''
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tom.fundo}`}>
        <Icone className={`h-4 w-4 ${tom.icone}`} aria-hidden />
      </span>
      <button type="button" onClick={onAbrir} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{item.title}</p>
        {item.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{item.body}</p>}
        <Etiquetas item={item} />
      </button>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar aviso"
        className="self-start rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Clicar no corpo abre (e marca lida); o ✕ só fecha. */
export function mostrarBloop(item: NotificationItem, onAbrir: (item: NotificationItem) => void) {
  toast.custom(
    (id) => (
      <Bloop
        item={item}
        onAbrir={() => {
          toast.dismiss(id);
          onAbrir(item);
        }}
        onFechar={() => toast.dismiss(id)}
      />
    ),
    { position: 'top-right', duration: duracaoDoAviso(item), unstyled: true }
  );
}
