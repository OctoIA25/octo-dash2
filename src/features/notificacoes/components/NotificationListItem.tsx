import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowUpRight, Check } from 'lucide-react';
import type { NotificationItem } from '@/contexts/NotificationsContext';
import { acentoDoAviso, destinoDoLink, rotaDe, rotuloDoLink } from '../notificationKinds';
import { AvatarDoAviso, LinhaDeRota } from './RotaDoAviso';

/** Acima disto o corpo abre cortado em 2 linhas, com "Ver mais". */
const CORPO_LONGO = 180;

interface Props {
  item: NotificationItem;
  onAbrir: (item: NotificationItem) => void;
  onMarcarLida: (id: string) => void;
}

/**
 * Uma linha da caixa de entrada: de quem → para quem, o assunto, o texto e a
 * ação. Não lida = fundo levemente azul e ponto; urgência = faixa à esquerda.
 */
export function NotificationListItem({ item, onAbrir, onMarcarLida }: Props) {
  const [expandido, setExpandido] = useState(false);
  const temDestino = destinoDoLink(item.linkType, item.linkId) !== null;
  const longo = (item.body?.length ?? 0) > CORPO_LONGO;
  const quando = new Date(item.createdAt);
  // Urgência só enquanto não foi lida: um alerta de 3 dias atrás, já visto, não grita mais.
  const acento = item.read ? null : acentoDoAviso(item);
  const { importante } = rotaDe(item);

  return (
    <li
      className={`group relative flex gap-3.5 px-4 py-4 sm:px-5 ${
        item.read ? 'bg-white dark:bg-slate-900' : 'bg-blue-50/60 dark:bg-blue-500/[0.07]'
      }`}
    >
      {acento && <span className={`absolute inset-y-0 left-0 w-1 ${acento}`} aria-hidden />}
      <AvatarDoAviso item={item} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><LinhaDeRota item={item} /></div>
          {!item.read && (
            <button
              type="button"
              onClick={() => onMarcarLida(item.id)}
              title="Marcar como lida"
              aria-label="Marcar como lida"
              className="-my-1 shrink-0 rounded-md p-1 text-slate-400 transition-opacity hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
          )}
          <time
            dateTime={item.createdAt}
            title={quando.toLocaleString('pt-BR')}
            className="shrink-0 pt-0.5 text-xs text-slate-500 dark:text-slate-400"
          >
            {formatDistanceToNow(quando, { addSuffix: true, locale: ptBR })}
          </time>
          {!item.read && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600">
              <span className="sr-only">Não lida</span>
            </span>
          )}
        </div>

        <h3
          className={`mt-1 text-[15px] leading-6 ${
            item.read ? 'font-medium text-slate-800 dark:text-slate-200' : 'font-semibold text-slate-900 dark:text-slate-50'
          }`}
        >
          {item.title}
          {importante && (
            <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 align-[2px] text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              Importante
            </span>
          )}
        </h3>

        {item.body && (
          <p
            className={`mt-1 max-w-[68ch] whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-400 ${
              longo && !expandido ? 'line-clamp-2' : ''
            }`}
          >
            {item.body}
          </p>
        )}

        {(temDestino || longo) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {temDestino && (
              <button
                type="button"
                onClick={() => onAbrir(item)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-500/60"
              >
                {rotuloDoLink(item.linkType)} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            {longo && (
              <button
                type="button"
                onClick={() => setExpandido((v) => !v)}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
              >
                {expandido ? 'Ver menos' : 'Ver mais'}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
