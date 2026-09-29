import { memo, type ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ChevronRight, GripVertical, MessageCircle } from 'lucide-react';
import { linkWhatsapp } from '@/lib/contato';
import {
  CONDICOES, COR_SITUACAO_CONDICAO, SITUACOES_CONDICAO, diasDesde, textoHaDias, type EstagioId,
} from '../domain/recruitmentStages';

/**
 * O que o card do Kanban precisa saber de um candidato. É um subconjunto de
 * `Candidato` (recruitmentService) — o tipo fica aqui para o card e seu teste
 * não dependerem do serviço.
 */
export interface CandidatoKanban {
  id: string | number;
  nome: string;
  estagio: EstagioId | string;
  status: string;
  telefone?: string | null;
  fonte?: string | null;
  canal?: string | null;
  cargo?: string | null;
  area?: string | null;
  ts_candidatura?: string | null;
  data_inscricao?: string | null;
  cond_regiao?: string | null;
  cond_tempo?: string | null;
  cond_verba?: string | null;
  coordenador_id?: string | null;
}

const LABEL_SITUACAO: Record<string, string> = Object.fromEntries(
  SITUACOES_CONDICAO.map((s) => [s.id, s.label]),
);

interface ConteudoProps {
  candidato: CandidatoKanban;
  coordenadorNome?: string | null;
  onAbrir: (candidato: CandidatoKanban) => void;
  /** A alça do dnd-kit, desenhada à esquerda do nome. Ausente no overlay. */
  dragHandle?: ReactNode;
  isOverlay?: boolean;
}

/**
 * Conteúdo visual do card — puro, exportado para teste. O arrastar fica em
 * `RecrutamentoKanbanCard`, que embrulha isto com `useDraggable`.
 */
export const RecrutamentoKanbanCardContent = memo(({ candidato, coordenadorNome, onAbrir, dragHandle, isOverlay = false }: ConteudoProps) => {
  const dias = diasDesde(candidato.ts_candidatura ?? candidato.data_inscricao);
  const whatsapp = linkWhatsapp(candidato.telefone);
  const funcao = candidato.cargo || candidato.area || '';
  const canal = candidato.fonte || candidato.canal || '';

  return (
    <div
      onClick={isOverlay ? undefined : () => onAbrir(candidato)}
      className={`rounded-lg p-3 border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 select-none ${isOverlay ? '' : 'cursor-pointer'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {dragHandle}
          <p className="text-xs font-semibold truncate leading-tight text-slate-900 dark:text-slate-100" title={candidato.nome}>
            {candidato.nome}
          </p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate">{canal}</span>
        <span className="shrink-0 tabular-nums">{textoHaDias(dias)}</span>
      </div>

      {funcao && (
        <p className="mt-0.5 text-[11px] truncate text-slate-600 dark:text-slate-300">{funcao}</p>
      )}

      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        {/* As três condições de entrada: região · tempo · verba */}
        <div className="flex items-center gap-1.5" aria-label="Condições de entrada">
          {CONDICOES.map((cond) => {
            const situacao = candidato[cond.id];
            const id = situacao ?? 'pendente';
            return (
              <span
                key={cond.id}
                title={`${cond.label}: ${LABEL_SITUACAO[id] ?? id}`}
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: COR_SITUACAO_CONDICAO[id] ?? COR_SITUACAO_CONDICAO.pendente }}
              />
            );
          })}
        </div>

        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            title="Abrir WhatsApp"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {coordenadorNome && (
        <p className="mt-1.5 text-[10.5px] truncate text-slate-500 dark:text-slate-400" title={coordenadorNome}>
          Coord.: {coordenadorNome}
        </p>
      )}
    </div>
  );
});
RecrutamentoKanbanCardContent.displayName = 'RecrutamentoKanbanCardContent';

interface CardProps {
  candidato: CandidatoKanban;
  coordenadorNome?: string | null;
  onAbrir: (candidato: CandidatoKanban) => void;
}

/** O card arrastável. Em `perdido` não arrasta: perdido não volta ao funil. */
export const RecrutamentoKanbanCard = memo(({ candidato, coordenadorNome, onAbrir }: CardProps) => {
  const perdido = candidato.estagio === 'perdido';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(candidato.id),
    disabled: perdido,
  });

  const dragHandle = perdido ? undefined : (
    <div
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing shrink-0 touch-none text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
      onClick={(e) => e.stopPropagation()}
      aria-label="Arrastar candidato"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </div>
  );

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.35 : 1 }} data-kanban-card="1">
      <RecrutamentoKanbanCardContent
        candidato={candidato}
        coordenadorNome={coordenadorNome}
        onAbrir={onAbrir}
        dragHandle={dragHandle}
      />
    </div>
  );
});
RecrutamentoKanbanCard.displayName = 'RecrutamentoKanbanCard';
