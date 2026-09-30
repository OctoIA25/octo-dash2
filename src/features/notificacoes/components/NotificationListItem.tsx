import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, Check } from 'lucide-react';
import type { NotificationItem } from '@/contexts/NotificationsContext';
import { CLASSES_DO_TOM, destinoDoLink, tipoDe } from '../notificationKinds';
import { Etiquetas } from './Etiquetas';

/** Acima disto o corpo abre cortado em 2 linhas, com "Ver mais". */
const CORPO_LONGO = 180;

interface Props {
  item: NotificationItem;
  onAbrir: (item: NotificationItem) => void;
  onMarcarLida: (id: string) => void;
}

export function NotificationListItem({ item, onAbrir, onMarcarLida }: Props) {
  const [expandido, setExpandido] = useState(false);
  const tipo = tipoDe(item.type);
  const tom = CLASSES_DO_TOM[tipo.tom];
  const Icone = tipo.icone;
  const temDestino = destinoDoLink(item.linkType, item.linkId) !== null;
  const longo = (item.body?.length ?? 0) > CORPO_LONGO;
  const quando = new Date(item.createdAt);

  return (
    <li
      className={`group flex gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 ${
        item.read ? '' : `border-l-4 ${tom.borda}`
      }`}
    >
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tom.fundo}`}>
        <Icone className={`h-4 w-4 ${tom.icone}`} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`min-w-0 flex-1 text-sm ${item.read ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-slate-50'}`}>
            {item.title}
          </p>
          <time dateTime={item.createdAt} title={quando.toLocaleString('pt-BR')} className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
            {formatDistanceToNow(quando, { addSuffix: true, locale: ptBR })}
          </time>
          {!item.read && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600">
              <span className="sr-only">Não lida</span>
            </span>
          )}
        </div>
        {item.body && (
          <p className={`mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400 ${longo && !expandido ? 'line-clamp-2' : ''}`}>
            {item.body}
          </p>
        )}
        <Etiquetas item={item} />
        {(temDestino || longo || !item.read) && (
        <div className="mt-2 flex items-center gap-3">
          {temDestino && (
            <button type="button" onClick={() => onAbrir(item)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
              Abrir <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          )}
          {longo && (
            <button type="button" onClick={() => setExpandido((v) => !v)}
              className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400">
              {expandido ? 'Ver menos' : 'Ver mais'}
            </button>
          )}
          {!item.read && (
            <button type="button" onClick={() => onMarcarLida(item.id)}
              className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 transition-opacity hover:text-slate-800 focus-visible:opacity-100 dark:hover:text-slate-200 sm:opacity-0 sm:group-hover:opacity-100">
              <Check className="h-3 w-3" aria-hidden /> Marcar como lida
            </button>
          )}
        </div>
        )}
      </div>
    </li>
  );
}
