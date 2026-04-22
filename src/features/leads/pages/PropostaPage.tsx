/**
 * Página de Propostas
 * Rota: /metricas/proposta
 */

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useDraggable,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Search, Filter, Download, LayoutGrid, List, ChevronRight, GripVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Proposta {
  id: string;
  cliente: string;
  clienteInicial: string;
  corretor: string;
  corretorInicial: string;
  valor: number;
  imovelRef: string;
  imovelEndereco: string;
  stageId: string;
  data: string;
  tipo: 'venda' | 'locacao';
}

const STAGES = [
  { id: 'nova',        label: 'Nova Proposta',    color: '#3b82f6' },
  { id: 'analise',     label: 'Em Análise',        color: '#f59e0b' },
  { id: 'negociacao',  label: 'Em Negociação',     color: '#f97316' },
  { id: 'aceita',      label: 'Proposta Aceita',   color: '#22c55e' },
  { id: 'recusada',    label: 'Recusada',          color: '#ef4444' },
] as const;

const SAMPLE: Proposta[] = [
  { id: '1', cliente: 'Teste', clienteInicial: 'T', corretor: 'Teste', corretorInicial: 'T', valor: 0, imovelRef: 'TESTE', imovelEndereco: 'Endereço de teste', stageId: 'nova', data: '07/04/2025', tipo: 'venda' },
];

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const avatarColor = (ch: string) => {
  const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#06b6d4', '#f59e0b'];
  return palette[ch.charCodeAt(0) % palette.length];
};

// ── Draggable Card ──────────────────────────────────────────────────────────
function KanbanCard({ proposta, isDragging }: { proposta: Proposta; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: proposta.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    backgroundColor: 'var(--bg-primary)',
    borderColor: 'var(--border)',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg p-3 border transition-shadow hover:shadow-md select-none"
    >
      {/* Drag handle + cliente + valor */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing shrink-0 touch-none"
            style={{ color: 'var(--text-secondary)' }}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: avatarColor(proposta.clienteInicial) }}
          >
            {proposta.clienteInicial}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
              {proposta.cliente}
            </p>
            <p className="text-xs font-bold" style={{ color: '#3b82f6' }}>
              {fmt(proposta.valor)}
            </p>
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
      </div>

      {/* Imóvel */}
      <div className="mb-2">
        <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{proposta.imovelRef}</p>
        <p className="text-[10px] leading-snug line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
          {proposta.imovelEndereco}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 min-w-0">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
            style={{ backgroundColor: avatarColor(proposta.corretorInicial) }}
          >
            {proposta.corretorInicial}
          </div>
          <span className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{proposta.corretor}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
            {proposta.tipo === 'venda' ? 'Venda' : 'Locação'}
          </Badge>
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{proposta.data}</span>
        </div>
      </div>
    </div>
  );
}

// ── Droppable Column ────────────────────────────────────────────────────────
function KanbanColumn({
  stage,
  cards,
  activeId,
}: {
  stage: typeof STAGES[number];
  cards: Proposta[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      className="flex flex-col rounded-xl border w-[260px] shrink-0 overflow-hidden transition-colors"
      style={{
        borderColor: isOver ? stage.color : 'var(--border)',
        backgroundColor: isOver ? stage.color + '0d' : 'var(--bg-secondary)',
      }}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: 'var(--text-primary)' }}>
            {stage.label}
          </span>
        </div>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: stage.color + '22', color: stage.color }}
        >
          {cards.length}
        </span>
      </div>

      {/* Cards area */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
        {cards.length === 0 && !isOver && (
          <p className="text-xs text-center py-6 italic" style={{ color: 'var(--text-secondary)' }}>
            Nenhuma proposta
          </p>
        )}

        {cards.map(p => (
          <KanbanCard key={p.id} proposta={p} isDragging={p.id === activeId} />
        ))}

        {/* Add button */}
        <button
          className="w-full py-2 rounded-lg border border-dashed text-xs flex items-center justify-center gap-1 transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = stage.color)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <Plus className="h-3 w-3" />
          Adicionar
        </button>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export const PropostaPage = () => {
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [search, setSearch] = useState('');
  const [propostas, setPropostas] = useState<Proposta[]>(SAMPLE);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const filtered = propostas.filter(p =>
    !search ||
    p.cliente.toLowerCase().includes(search.toLowerCase()) ||
    p.imovelRef.toLowerCase().includes(search.toLowerCase()) ||
    p.corretor.toLowerCase().includes(search.toLowerCase())
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const propostaId = String(active.id);
    const newStage = String(over.id);
    if (!STAGES.find(s => s.id === newStage)) return;
    setPropostas(prev =>
      prev.map(p => p.id === propostaId ? { ...p, stageId: newStage } : p)
    );
  };

  const activeCard = propostas.find(p => p.id === activeId);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b flex-wrap shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Nova Proposta
        </Button>

        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-secondary)' }} />
          <Input
            placeholder="Buscar cliente, imóvel, corretor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <Button variant="outline" size="sm">
          <Filter className="h-3.5 w-3.5 mr-1" />
          Filtros
        </Button>
        <Button variant="outline" size="sm">
          <Download className="h-3.5 w-3.5 mr-1" />
          Exportar
        </Button>

        {/* View toggle */}
        <div className="ml-auto flex items-center rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {(['kanban', 'lista'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors"
              style={{
                backgroundColor: view === v ? '#2563eb' : 'var(--bg-secondary)',
                color: view === v ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {v === 'kanban' ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── KANBAN ── */}
      {view === 'kanban' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-3 h-full" style={{ minWidth: `${STAGES.length * 268}px` }}>
              {STAGES.map(stage => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  cards={filtered.filter(p => p.stageId === stage.id)}
                  activeId={activeId}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeCard && (
              <div className="rotate-2 shadow-2xl opacity-95 w-[244px]">
                <KanbanCard proposta={activeCard} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── LISTA ── */}
      {view === 'lista' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                  {['Cliente', 'Corretor', 'Imóvel', 'Valor', 'Etapa', 'Tipo', 'Data'].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const stage = STAGES.find(s => s.id === p.stageId);
                  return (
                    <tr
                      key={p.id}
                      className="border-b cursor-pointer transition-colors"
                      style={{
                        borderColor: 'var(--border)',
                        backgroundColor: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: avatarColor(p.clienteInicial) }}
                          >
                            {p.clienteInicial}
                          </div>
                          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{p.cliente}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{p.corretor}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{p.imovelRef}</p>
                        <p className="text-[10px] truncate max-w-[200px]" style={{ color: 'var(--text-secondary)' }}>{p.imovelEndereco}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: '#3b82f6' }}>{fmt(p.valor)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: stage?.color + '22', color: stage?.color }}
                        >
                          {stage?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {p.tipo === 'venda' ? 'Venda' : 'Locação'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{p.data}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
