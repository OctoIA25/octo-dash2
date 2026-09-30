import { etiquetasDe, type ItemComMetadata } from '../notificationKinds';

/** De onde veio, para quem foi, sobre quem é, e se é importante. */
export function Etiquetas({ item }: { item: ItemComMetadata }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {etiquetasDe(item).map((e) => (
        <span
          key={e.texto}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            e.destaque
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {e.texto}
        </span>
      ))}
    </div>
  );
}
