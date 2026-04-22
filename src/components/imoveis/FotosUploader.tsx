/**
 * 📸 FotosUploader — Upload + ordenação (drag & drop) + legendas
 *
 * Recebe fotos no formato legado (string[]) ou novo ({url, legenda}[]) e
 * devolve sempre no formato novo. Compatível com a coluna `fotos JSONB`
 * usada em `condominios` e `imoveis_locais`.
 */

import { useMemo, useRef } from 'react';
import { Upload, Trash2, GripVertical, Star, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Foto, FotoInput } from './fotos-helpers';
export type { Foto, FotoInput } from './fotos-helpers';

interface FotosUploaderProps {
  fotos: FotoInput[];
  onChange: (fotos: Foto[]) => void;
  accent?: 'blue' | 'pink';
  inputId?: string;
  maxSizeMB?: number;
}

function normalizeFotos(raw: FotoInput[]): Foto[] {
  const list = (raw || [])
    .map((f) =>
      typeof f === 'string'
        ? { url: f, legenda: '', isCapa: false }
        : { url: f.url, legenda: f.legenda ?? '', isCapa: !!f.isCapa },
    )
    .filter((f) => !!f.url);
  // Garante exatamente uma capa: se nenhuma marcada, a primeira vira capa
  if (list.length > 0 && !list.some((f) => f.isCapa)) {
    list[0] = { ...list[0], isCapa: true };
  }
  return list;
}


interface SortableFotoProps {
  id: string;
  foto: Foto;
  index: number;
  isCapa: boolean;
  accent: 'blue' | 'pink';
  onRemove: () => void;
  onLegendaChange: (legenda: string) => void;
  onSetCapa: () => void;
}

function SortableFoto({
  id,
  foto,
  index,
  isCapa,
  accent,
  onRemove,
  onLegendaChange,
  onSetCapa,
}: SortableFotoProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const ringColor = accent === 'pink' ? 'ring-pink-500' : 'ring-blue-500';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-lg overflow-hidden border border-border bg-card ${
        isCapa ? `ring-2 ${ringColor}` : ''
      }`}
    >
      <div className="relative aspect-video">
        <img src={foto.url} alt={foto.legenda || `Foto ${index + 1}`} className="w-full h-full object-cover" />

        {/* Handle de arrastar */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Arrastar para reordenar"
          className="absolute top-1 left-1 p-1 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Badge de posição */}
        <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
          {index + 1}
        </div>

        {/* Badge CAPA */}
        {isCapa && (
          <div className="absolute bottom-1 right-1 bg-yellow-400 text-yellow-950 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1 shadow">
            <Star className="h-2.5 w-2.5" fill="currentColor" />
            Capa
          </div>
        )}

        {/* Ações */}
        <div className="absolute top-1 right-1 flex gap-1">
          <button
            type="button"
            onClick={onSetCapa}
            aria-label={isCapa ? 'Foto de capa' : 'Definir como capa'}
            title={isCapa ? 'Foto de capa' : 'Definir como capa'}
            className={`p-1 rounded transition-colors ${
              isCapa
                ? 'bg-yellow-400 text-yellow-900'
                : 'bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-yellow-400 hover:text-yellow-900'
            }`}
          >
            <Star className="h-3.5 w-3.5" fill={isCapa ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover foto"
            className="p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-2">
        <Input
          type="text"
          placeholder="Legenda (ex: Sala de estar, Fachada, Vista)"
          value={foto.legenda ?? ''}
          onChange={(e) => onLegendaChange(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

export function FotosUploader({
  fotos,
  onChange,
  accent = 'blue',
  inputId = 'fotos-upload',
  maxSizeMB = 10,
}: FotosUploaderProps) {
  const normalized = useMemo(() => normalizeFotos(fotos), [fotos]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = normalized.map((_, i) => `foto-${i}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(normalized, oldIndex, newIndex));
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve((event.target?.result as string) ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const maxBytes = maxSizeMB * 1024 * 1024;
    const skipped: string[] = [];

    const toLoad = Array.from(files).filter((file) => {
      if (file.size > maxBytes) {
        skipped.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        return false;
      }
      return true;
    });

    // Lê todos em paralelo, mas agrupa o resultado em UMA única atualização
    const results = await Promise.all(toLoad.map(readFileAsDataUrl));
    const novas: Foto[] = results
      .filter((url): url is string => !!url)
      .map((url) => ({ url, legenda: '', isCapa: false }));

    if (novas.length > 0) {
      onChange([...normalizeFotos(fotos), ...novas]);
    }

    if (skipped.length > 0) {
      console.warn(`⚠️ ${skipped.length} foto(s) ignorada(s) por exceder ${maxSizeMB}MB:`, skipped);
      alert(
        `${skipped.length} foto(s) ignorada(s) por passar de ${maxSizeMB}MB:\n\n${skipped.join('\n')}\n\n` +
          `Reduza a resolução ou aumente o limite.`,
      );
    }
  };

  const removeAt = (index: number) => {
    onChange(normalized.filter((_, i) => i !== index));
  };

  const setLegendaAt = (index: number, legenda: string) => {
    onChange(normalized.map((f, i) => (i === index ? { ...f, legenda } : f)));
  };

  const setCapaAt = (index: number) => {
    onChange(normalized.map((f, i) => ({ ...f, isCapa: i === index })));
  };

  const borderHover = accent === 'pink' ? 'hover:border-pink-500/50' : 'hover:border-primary/50';
  const iconColor = accent === 'pink' ? 'text-pink-500' : 'text-muted-foreground';
  const iconBg = accent === 'pink' ? 'bg-pink-500/10' : '';

  return (
    <div className="space-y-3">
      <div className={`border-2 border-dashed border-border rounded-lg p-4 text-center transition-colors ${borderHover}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          id={inputId}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <label htmlFor={inputId} className="cursor-pointer">
          <div className="flex flex-col items-center gap-2">
            <div className={`p-3 rounded-full ${iconBg}`}>
              <Upload className={`h-7 w-7 ${iconColor}`} />
            </div>
            <span className="text-sm text-text-primary font-medium">Clique para selecionar fotos</span>
            <span className="text-xs text-muted-foreground">
              PNG, JPG até {maxSizeMB}MB cada • Arraste para reordenar • Clique na ⭐ para definir a capa
            </span>
          </div>
        </label>
      </div>

      {normalized.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {normalized.map((foto, index) => (
                <SortableFoto
                  key={ids[index]}
                  id={ids[index]}
                  foto={foto}
                  index={index}
                  isCapa={!!foto.isCapa}
                  accent={accent}
                  onRemove={() => removeAt(index)}
                  onLegendaChange={(legenda) => setLegendaAt(index, legenda)}
                  onSetCapa={() => setCapaAt(index)}
                />
              ))}

              {/* Tile "+" para adicionar mais sem perder a grid */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-video rounded-lg border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                aria-label="Adicionar mais fotos"
              >
                <Plus className="h-6 w-6" />
                <span className="text-xs font-medium">Adicionar mais</span>
              </button>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {normalized.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {normalized.length} foto(s) • Arraste para reordenar • ⭐ define a capa
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar mais fotos
          </button>
        </div>
      )}
    </div>
  );
}
