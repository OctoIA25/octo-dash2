import { memo, useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { COLUNAS_KANBAN, resolverSolta, type EstagioId } from '../domain/recruitmentStages';
import { RecrutamentoKanbanCard, RecrutamentoKanbanCardContent, type CandidatoKanban } from './RecrutamentoKanbanCard';

/**
 * Kanban de candidatos: uma coluna por etapa do funil + Perdido, por último e
 * em cinza (é saída, não etapa). Copiado do Kanban de leads
 * (MeusLeadsAtribuidosSection) no que é mecânica — sensores, colisão pelo
 * cursor, overlay, "Mostrar mais" — e diferente no que é regra: aqui o funil
 * só anda para frente, e soltar em Perdido pede o motivo em vez de mover.
 */

const cursorCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;
  const offsetX = coords.x - draggingNodeRect.left;
  const offsetY = coords.y - draggingNodeRect.top;
  return {
    ...transform,
    x: transform.x + offsetX - draggingNodeRect.width / 2,
    y: transform.y + offsetY - draggingNodeRect.height / 2,
  };
};

const CARDS_POR_PAGINA = 15;

interface ColunaProps {
  coluna: (typeof COLUNAS_KANBAN)[number];
  candidatos: CandidatoKanban[];
  coordenadores?: Record<string, string>;
  onAbrir: (c: CandidatoKanban) => void;
}

const KanbanColuna = memo(({ coluna, candidatos, coordenadores, onAbrir }: ColunaProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id });
  const [visiveis, setVisiveis] = useState(CARDS_POR_PAGINA);
  const mostrados = candidatos.slice(0, visiveis);
  const restantes = candidatos.length - visiveis;

  return (
    <section
      aria-label={coluna.title}
      className={`flex flex-col w-[260px] h-full shrink-0 transition-all rounded-xl border bg-white dark:bg-slate-900 ${
        isOver ? 'border-blue-400 dark:border-blue-500 shadow-sm' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: coluna.color }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
            {coluna.title}
          </span>
        </div>
        <span
          data-testid="kanban-contagem"
          className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0 tabular-nums"
          style={{ backgroundColor: coluna.color + '1a', color: coluna.color }}
        >
          {candidatos.length}
        </span>
      </div>

      <div ref={setNodeRef} className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 bg-slate-50/30 dark:bg-slate-950/30">
        {candidatos.length === 0 && !isOver && (
          <p className="text-[11px] text-center py-6 italic text-slate-400 dark:text-slate-500">Nenhum candidato</p>
        )}

        {mostrados.map((c) => (
          <RecrutamentoKanbanCard
            key={String(c.id)}
            candidato={c}
            coordenadorNome={c.coordenador_id ? coordenadores?.[c.coordenador_id] : undefined}
            onAbrir={onAbrir}
          />
        ))}

        {restantes > 0 && (
          <button
            type="button"
            onClick={() => setVisiveis((v) => v + CARDS_POR_PAGINA)}
            className="w-full py-2 rounded-lg border border-dashed text-[11px] flex items-center justify-center gap-1 transition-colors border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
          >
            Mostrar mais ({restantes})
          </button>
        )}
      </div>
    </section>
  );
});
KanbanColuna.displayName = 'KanbanColuna';

export interface RecrutamentoKanbanProps {
  candidatos: CandidatoKanban[];
  /** user_id → nome/e-mail, para o rodapé do card. */
  coordenadores?: Record<string, string>;
  carregando?: boolean;
  onAbrir: (candidato: CandidatoKanban) => void;
  onMover: (candidato: CandidatoKanban, para: EstagioId) => void | Promise<unknown>;
  onEncerrar: (candidato: CandidatoKanban) => void;
}

export const RecrutamentoKanban = ({ candidatos, coordenadores, carregando = false, onAbrir, onMover, onEncerrar }: RecrutamentoKanbanProps) => {
  const [ativoId, setAtivoId] = useState<string | null>(null);

  // distance=6 evita "pick-up" acidental ao clicar para abrir a ficha.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Agrupa pelo ID do estágio, nunca pelo label: label é tradução para a tela.
  const porColuna = useMemo(() => {
    const grupos = Object.fromEntries(COLUNAS_KANBAN.map((c) => [c.id, [] as CandidatoKanban[]])) as Record<EstagioId, CandidatoKanban[]>;
    for (const c of candidatos) grupos[c.estagio as EstagioId]?.push(c);
    return grupos;
  }, [candidatos]);

  const ativo = useMemo(
    () => (ativoId ? candidatos.find((c) => String(c.id) === ativoId) ?? null : null),
    [ativoId, candidatos],
  );

  const handleDragStart = useCallback((e: DragStartEvent) => setAtivoId(String(e.active.id)), []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setAtivoId(null);
    const candidato = candidatos.find((c) => String(c.id) === String(e.active.id));
    if (!candidato) return;
    const decisao = resolverSolta(candidato, e.over ? String(e.over.id) : null);
    switch (decisao.acao) {
      case 'nada': return;
      case 'aviso': toast.warning(decisao.motivo); return;
      case 'encerrar': onEncerrar(candidato); return;
      case 'mover': void onMover(candidato, decisao.para); return;
    }
  }, [candidatos, onEncerrar, onMover]);

  if (carregando && candidatos.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando candidatos…
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cursorCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setAtivoId(null)}
    >
      {/* Ocupa a altura que o pai der (a sub-área /recrutamento/kanban dá a página
          inteira abaixo dos filtros); as colunas rolam na horizontal. */}
      <div className="h-full overflow-x-auto">
        <div className="flex gap-3 h-full min-h-[420px]" style={{ minWidth: 'fit-content' }}>
          {COLUNAS_KANBAN.map((coluna) => (
            <KanbanColuna
              key={coluna.id}
              coluna={coluna}
              candidatos={porColuna[coluna.id] ?? []}
              coordenadores={coordenadores}
              onAbrir={onAbrir}
            />
          ))}
        </div>
      </div>

      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null}>
        {ativo ? (
          <div className="rotate-2 shadow-2xl opacity-95 w-[244px] pointer-events-none">
            <RecrutamentoKanbanCardContent candidato={ativo} onAbrir={() => {}} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
