import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Eye, EyeOff, Lock, Target } from 'lucide-react';
import type { DashboardKpi } from '@/features/kpis/domain/kpiTypes';
import { sourcePresentation } from './kpiPresentation';

interface Props {
  kpis: DashboardKpi[];
  isLoading: boolean;
  onEdit: (k: DashboardKpi) => void;
  onDelete: (k: DashboardKpi) => void;
  onReorder: (ids: string[]) => void;
  onToggleVisible: (k: DashboardKpi) => void;
  onToggleStatus: (k: DashboardKpi) => void;
}
type RowHandlers = Omit<Props, 'kpis' | 'isLoading' | 'onReorder'>;

/** Botão de ação compacto, com realce no hover da linha. */
function IconAction({ label, onClick, danger, children }: {
  label: string; onClick: () => void; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-md text-slate-400 transition-colors
        hover:bg-slate-100 dark:hover:bg-slate-800
        ${danger ? 'hover:text-rose-600 dark:hover:text-rose-400' : 'hover:text-slate-700 dark:hover:text-slate-200'}`}
    >
      {children}
    </button>
  );
}

function Row({ kpi, position, ...h }: { kpi: DashboardKpi; position: number } & RowHandlers) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: kpi.id });
  const src = sourcePresentation(kpi.source);
  const SourceIcon = src.icon;
  const dimmed = !kpi.isVisible || kpi.status === 'inactive';

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative flex items-stretch overflow-hidden rounded-xl border bg-white dark:bg-slate-900
        ${isDragging
          ? 'z-10 border-slate-300 shadow-lg dark:border-slate-700'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'}`}
    >
      {/* Barra de origem (cor codifica a fonte do dado). */}
      <span className={`w-1 shrink-0 ${src.bar} ${dimmed ? 'opacity-40' : ''}`} aria-hidden />

      {/* Trilho de ordem + handle: a posição AQUI = a ordem no dashboard. */}
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${kpi.name}`}
        className="flex w-11 shrink-0 cursor-grab flex-col items-center justify-center gap-0.5 border-r border-slate-100 text-slate-400 active:cursor-grabbing dark:border-slate-800"
      >
        <span className="text-[12px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
          {String(position).padStart(2, '0')}
        </span>
        <GripVertical className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2} />
      </button>

      {/* Corpo */}
      <div className={`flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 ${dimmed ? 'opacity-55' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{kpi.name}</p>
            {kpi.isSystem && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400" title="KPI nativo do sistema">
                <Lock className="h-3 w-3" /> nativo
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] font-medium ${src.pill}`}>
              <SourceIcon className="h-3 w-3" strokeWidth={2.2} /> {src.short}
            </span>
            {kpi.categoryId && kpi.categoryId !== 'geral' && (
              <span className="text-[11px] text-slate-400">{kpi.categoryId}</span>
            )}
            {kpi.status === 'inactive' && (
              <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10.5px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">inativo</span>
            )}
            {!kpi.isVisible && (
              <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10.5px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">oculto</span>
            )}
          </div>
        </div>

        {/* Ações: visibilidade sempre; editar sempre; excluir só se não-nativo. */}
        <div className="flex shrink-0 items-center gap-0.5">
          <IconAction label={kpi.isVisible ? 'Ocultar do dashboard' : 'Mostrar no dashboard'} onClick={() => h.onToggleVisible(kpi)}>
            {kpi.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </IconAction>
          <IconAction label="Editar KPI" onClick={() => h.onEdit(kpi)}>
            <Pencil className="h-4 w-4" />
          </IconAction>
          {!kpi.isSystem && (
            <IconAction label="Excluir KPI" danger onClick={() => h.onDelete(kpi)}>
              <Trash2 className="h-4 w-4" />
            </IconAction>
          )}
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="h-9 w-9 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg bg-white text-slate-400 shadow-sm dark:bg-slate-900">
        <Target className="h-5 w-5" />
      </div>
      <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Nenhum KPI configurado</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] text-slate-500 dark:text-slate-400">
        Crie um KPI ou importe metas de uma planilha. A ordem aqui define a ordem no dashboard.
      </p>
    </div>
  );
}

export function KpiList({ kpis, isLoading, onReorder, ...h }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (isLoading) return <ListSkeleton />;
  if (!kpis.length) return <EmptyState />;

  const ids = kpis.map((k) => k.id);
  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = ids.indexOf(String(event.active.id));
    const newIndex = ids.indexOf(String(event.over.id));
    if (oldIndex < 0 || newIndex < 0) return; // id fora da lista (re-render) → não corrompe
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {kpis.map((k, i) => (
            <Row key={k.id} kpi={k} position={i + 1} {...h} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
