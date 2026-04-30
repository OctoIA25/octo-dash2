/**
 * Seção de Meus Leads Atribuídos - KANBAN VIEW
 * Mostra os leads em formato Kanban com drag and drop
 */

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { CriarLeadQuickModal } from './CriarLeadQuickModal';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LeadDetailsModal } from './LeadDetailsModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Loader2,
  Clock,
  GripVertical,
  MessageSquare,
  Phone,
  Home,
  Mail,
  Plus,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Handshake,
  FileText,
  Send,
  FileCheck,
  Filter,
  RotateCcw,
  Headphones,
  MapPin,
  ClipboardList,
  Presentation,
  Lock,
  UserPlus,
  Megaphone,
  Reply,
  FileSignature,
} from 'lucide-react';
import {
  fetchLeadsDoCorretorCRM,
  fetchLeadsDoCorretorPorNome,
  fetchTodosLeadsCRM,
  atualizarStatusLeadCRM,
  arquivarLeadCRM,
  LEAD_TYPE_INTERESSADO,
  LEAD_TYPE_PROPRIETARIO,
  type KanbanLead,
  type LeadType,
} from '../services/leadsService';
import {
  fetchTenantBolsaoConfig,
  type TenantBolsaoConfig,
} from '../services/tenantBolsaoConfigService';
import { useRegisterNovoActions } from '@/contexts/NovoActionsContext';
import type { BolsaoLead } from '../services/bolsaoService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Archive } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  useDraggable,
  pointerWithin,
  rectIntersection,
  type Modifier,
  type CollisionDetection,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { startAutoSync, SyncConfig } from '@/features/imoveis/services/santaAngelaSyncService';

/** Detecção de colisão baseada no cursor (fallback: rectIntersection). */
const cursorCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

/** Centraliza o DragOverlay embaixo do cursor. */
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

// Tipo para status do Kanban — string livre para suportar tanto Interessado quanto Proprietário
type KanbanStatus = string;

type KanbanColumnDef = {
  id: KanbanStatus;
  title: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Funil Cliente Interessado (8 etapas)
const KANBAN_INTERESSADO_COLUMNS: KanbanColumnDef[] = [
  { id: 'novos-leads',       title: 'Novos Leads',       color: '#06b6d4', icon: Sparkles },
  { id: 'interacao',         title: 'Interação',         color: '#3b82f6', icon: MessageSquare },
  { id: 'visita-agendada',   title: 'Visita Agendada',   color: '#22c55e', icon: Calendar },
  { id: 'visita-realizada',  title: 'Visita Realizada',  color: '#16a34a', icon: CheckCircle2 },
  { id: 'negociacao',        title: 'Negociação',        color: '#f97316', icon: Handshake },
  { id: 'proposta-criada',   title: 'Proposta Criada',   color: '#f59e0b', icon: FileText },
  { id: 'proposta-enviada',  title: 'Proposta Enviada',  color: '#ef4444', icon: Send },
  { id: 'proposta-assinada', title: 'Proposta Assinada', color: '#dc2626', icon: FileCheck },
];

// Funil Cliente Proprietário (11 etapas — mesmas do VendedoresFunnelChart)
const KANBAN_PROPRIETARIO_COLUMNS: KanbanColumnDef[] = [
  { id: 'novos-proprietarios',        title: 'Novos Proprietários',       color: '#06b6d4', icon: Sparkles },
  { id: 'em-atendimento',             title: 'Em Atendimento',            color: '#3b82f6', icon: Headphones },
  { id: 'primeira-visita',            title: 'Primeira Visita',           color: '#22c55e', icon: MapPin },
  { id: 'criacao-estudo-mercado',     title: 'Criação Estudo de Mercado', color: '#0ea5e9', icon: ClipboardList },
  { id: 'apresentacao-estudo-mercado', title: 'Apresentação Estudo Mercado', color: '#8b5cf6', icon: Presentation },
  { id: 'nao-exclusivo',              title: 'Não Exclusivo',             color: '#f59e0b', icon: Lock },
  { id: 'exclusivo',                  title: 'Exclusivo',                 color: '#10b981', icon: CheckCircle2 },
  { id: 'cadastro',                   title: 'Cadastro',                  color: '#0891b2', icon: UserPlus },
  { id: 'plano-marketing',            title: 'Plano de Marketing',        color: '#ec4899', icon: Megaphone },
  { id: 'propostas-respondidas',      title: 'Propostas Respondidas',     color: '#f97316', icon: Reply },
  { id: 'feitura-contrato',           title: 'Feitura de Contrato',       color: '#dc2626', icon: FileSignature },
];

/**
 * Retorna as colunas do Kanban baseado no tipo de lead.
 */
const getKanbanColumns = (leadType: LeadType): KanbanColumnDef[] =>
  leadType === LEAD_TYPE_PROPRIETARIO ? KANBAN_PROPRIETARIO_COLUMNS : KANBAN_INTERESSADO_COLUMNS;

const avatarPalette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#06b6d4', '#f59e0b'];
const avatarColorFor = (char: string) => avatarPalette[(char || 'A').charCodeAt(0) % avatarPalette.length];
const BRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

const getLeadStatus = (lead: KanbanLead, columns: KanbanColumnDef[]): KanbanStatus => {
  const fallback = columns[0]?.id ?? 'novos-leads';
  const status = lead?.status;

  if (!status || typeof status !== 'string') {
    return fallback;
  }

  const statusLower = String(status)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos ("ã", "ç", etc.)
    .replace(/\s+/g, '-');

  // Match exato com alguma coluna disponível
  if (columns.some(col => col.id === statusLower)) {
    return statusLower;
  }

  // Aliases Interessado
  if (statusLower === 'novo' || statusLower === 'novos-leads') return 'novos-leads';
  if (statusLower === 'assumido' || statusLower === 'interacao') return 'interacao';
  if (statusLower === 'atendido' || statusLower === 'visita-agendada') return 'visita-agendada';
  if (statusLower === 'visita-realizada') return 'visita-realizada';
  if (statusLower === 'negociacao') return 'negociacao';
  if (statusLower === 'proposta-criada') return 'proposta-criada';
  if (statusLower === 'proposta-enviada') return 'proposta-enviada';
  if (statusLower === 'proposta-assinada' || statusLower === 'finalizado') return 'proposta-assinada';

  // Aliases Proprietário
  if (statusLower === 'novo-proprietario' || statusLower === 'novos-proprietarios') return 'novos-proprietarios';
  if (statusLower === 'em-atendimento') return 'em-atendimento';
  if (statusLower === 'primeira-visita') return 'primeira-visita';
  if (statusLower.startsWith('criacao-estudo') || statusLower === 'criando-estudo' || statusLower === 'estudo-em-criacao' || statusLower === 'preparando-estudo') return 'criacao-estudo-mercado';
  if (statusLower.startsWith('apresentacao-estudo') || statusLower === 'apresentando-estudo') return 'apresentacao-estudo-mercado';
  if (statusLower === 'nao-exclusivo') return 'nao-exclusivo';
  if (statusLower === 'exclusivo') return 'exclusivo';
  if (statusLower === 'cadastro') return 'cadastro';
  if (statusLower === 'plano-de-marketing' || statusLower === 'plano-marketing') return 'plano-marketing';
  if (statusLower === 'propostas-respondidas' || statusLower === 'proposta-respondida') return 'propostas-respondidas';
  if (statusLower === 'feitura-de-contrato' || statusLower === 'feitura-contrato') return 'feitura-contrato';

  return fallback;
};

// Componente do Card Arrastável
interface KanbanCardProps {
  lead: KanbanLead;
  onClick: () => void;
  mostrarCorretor?: boolean;
  bolsaoConfig?: TenantBolsaoConfig | null;
  nowMs?: number;
  bolsaoStatus?: { queue_attempt: number; atendido: boolean; status: string } | null;
  onAssumirDoBolsao?: (leadId: string) => void;
}

interface KanbanCardContentProps {
  lead: KanbanLead;
  onClick: () => void;
  mostrarCorretor?: boolean;
  isOverlay?: boolean;
  bolsaoConfig?: TenantBolsaoConfig | null;
  nowMs?: number;
  /** Estado do espelho do bolsão pra esse lead — usado pra "Assumir do bolsão" */
  bolsaoStatus?: { queue_attempt: number; atendido: boolean; status: string } | null;
  onAssumirDoBolsao?: (leadId: string) => void;
}

/**
 * Linha de contagem regressiva pro bolsão.
 * Aparece somente quando:
 *  - lead.participa_bolsao = true
 *  - lead.atendido = false (status = "novos-leads")
 *  - existe config carregada
 */
const BolsaoCountdownLine = memo(({
  lead,
  config,
  nowMs,
}: {
  lead: KanbanLead;
  config: TenantBolsaoConfig;
  nowMs: number;
}) => {
  if (!lead.participa_bolsao) return null;
  // status do KanbanLead vem como slug ("novos-leads", "interacao", etc.)
  if (lead.status !== 'novos-leads') return null;
  // Cronômetro reseta a cada redistribuição via roleta — usa assigned_at
  const baseTs = lead.assigned_at || lead.created_at;
  if (!baseTs) return null;

  const limiteMin = lead.is_exclusive
    ? config.tempoExpiracaoExclusivo
    : config.tempoExpiracaoNaoExclusivo;
  const baseMs = new Date(baseTs).getTime();
  if (Number.isNaN(baseMs)) return null;
  const expiresMs = baseMs + limiteMin * 60_000;
  const remainMs = expiresMs - nowMs;
  const remainMin = Math.floor(remainMs / 60_000);

  const destino = config.teamQueueEnabled ? 'Próximo da equipe' : 'Próximo da roleta';

  // Quando expirou, o card sai da view do corretor atual logo que a redistribuição rodar.
  // Não mostramos nenhum aviso intermediário.
  if (remainMin <= 0) {
    return null;
  }

  const isUrgent = remainMin < 10;
  const colorClass = isUrgent
    ? 'text-rose-600 dark:text-rose-400'
    : remainMin < 30
      ? 'text-orange-600 dark:text-orange-400'
      : 'text-slate-500 dark:text-slate-400';

  const formatRemain = (m: number) => {
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const rem = m % 60;
      return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
    }
    return `${m}m`;
  };

  return (
    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
      <div className={`flex items-center gap-1 text-[10px] font-semibold ${colorClass}`}>
        <Clock className="h-3 w-3" />
        {formatRemain(remainMin)} p/ bolsão
      </div>
      <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate" title={`Próximo destino: ${destino}`}>
        → {destino}
      </span>
    </div>
  );
});

BolsaoCountdownLine.displayName = 'BolsaoCountdownLine';

/**
 * Conteúdo visual do card — recebe opcionalmente `dragHandle` (o
 * GripVertical com listeners do dnd-kit) para renderizar à esquerda do avatar.
 * Quando `isOverlay=true` estamos desenhando o clone do DragOverlay.
 */
const KanbanCardContent = memo(({ lead, onClick, mostrarCorretor, isOverlay = false, dragHandle, bolsaoConfig, nowMs, bolsaoStatus, onAssumirDoBolsao }: KanbanCardContentProps & { dragHandle?: React.ReactNode }) => {
  const nome = lead.nomedolead || 'Lead sem nome';
  const telefone = lead.lead || lead.numerocorretor || '';
  const portal = lead.portal || '';
  const corretorResponsavel = lead.corretor_responsavel || lead.corretor || '';
  const valor = typeof lead.property_value === 'number' ? lead.property_value : 0;
  const inicial = nome.charAt(0).toUpperCase();
  const corretorInicial = (corretorResponsavel || '?').charAt(0).toUpperCase();

  const createdAt = lead.created_at ? new Date(lead.created_at) : null;
  const dataFmt = createdAt
    ? createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <div
      onClick={isOverlay ? undefined : onClick}
      className={`rounded-lg p-3 border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 select-none ${isOverlay ? '' : 'cursor-pointer mb-2'}`}
    >
      {/* Header: handle + avatar + nome + valor */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {dragHandle}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: avatarColorFor(inicial) }}
          >
            {inicial}
          </div>
          <div className="min-w-0">
            <p
              className="text-xs font-semibold truncate leading-tight text-slate-900 dark:text-slate-100"
              title={nome}
            >
              {nome}
            </p>
            {valor > 0 && (
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                {BRL(valor)}
              </p>
            )}
            {valor === 0 && portal && (
              <p className="text-[10px] truncate text-slate-500 dark:text-slate-400">
                {portal}
              </p>
            )}
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
      </div>

      {/* Bloco principal: código do imóvel em destaque + telefone */}
      <div className="mb-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Home className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">
            {lead.codigo || '—'}
          </p>
        </div>
        {telefone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
            <p className="text-[10px] leading-snug truncate text-slate-500 dark:text-slate-400">
              {telefone}
            </p>
          </div>
        )}
      </div>

      {/* Footer: corretor atribuído + badge + data */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {corretorResponsavel ? (
            <>
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                style={{ backgroundColor: avatarColorFor(corretorInicial) }}
              >
                {corretorInicial}
              </div>
              <span className="text-[10px] truncate text-slate-600 dark:text-slate-300 font-medium" title={corretorResponsavel}>
                {corretorResponsavel}
              </span>
            </>
          ) : (
            <span className="text-[10px] italic text-slate-400 dark:text-slate-500">
              Sem corretor
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {lead.temperature && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 capitalize border-slate-200 dark:border-slate-700">
              {lead.temperature}
            </Badge>
          )}
          {dataFmt && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
              {dataFmt}
            </span>
          )}
        </div>
      </div>

      {/* Countdown do bolsão — escondido quando já assumido do bolsão */}
      {bolsaoConfig && nowMs !== undefined && !(bolsaoStatus?.atendido && bolsaoStatus?.status === 'assumido') && (
        <BolsaoCountdownLine lead={lead} config={bolsaoConfig} nowMs={nowMs} />
      )}

      {/* Botão "Assumir do bolsão" — aparece quando lead foi redistribuído (queue_attempt > 0) e ainda não foi assumido */}
      {bolsaoStatus && bolsaoStatus.queue_attempt > 0 && !bolsaoStatus.atendido && onAssumirDoBolsao && !isOverlay && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAssumirDoBolsao(lead.id);
          }}
          className="mt-2 w-full h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.4} />
          Assumir do bolsão
        </button>
      )}

      {/* Badge "Assumido do bolsão" — depois de clicar no botão */}
      {bolsaoStatus?.atendido && bolsaoStatus?.status === 'assumido' && (
        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-semibold">
          <CheckCircle2 className="w-3 h-3" strokeWidth={2.4} />
          Assumido do bolsão
        </div>
      )}
    </div>
  );
});

KanbanCardContent.displayName = 'KanbanCardContent';

const KanbanCard = memo(({ lead, onClick, mostrarCorretor, bolsaoConfig, nowMs, bolsaoStatus, onAssumirDoBolsao }: KanbanCardProps) => {
  // Quando há DragOverlay, o card ORIGINAL não recebe `transform` — só muda opacity
  // para marcar a posição de origem. O overlay (portal no body) é quem segue o cursor.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });

  const style: React.CSSProperties = {
    opacity: isDragging ? 0.35 : 1,
  };

  const dragHandle = (
    <div
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing shrink-0 touch-none text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
      onClick={(e) => e.stopPropagation()}
      aria-label="Arrastar lead"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </div>
  );

  return (
    <div ref={setNodeRef} style={style} data-kanban-card="1">
      <KanbanCardContent
        lead={lead}
        onClick={onClick}
        mostrarCorretor={mostrarCorretor}
        dragHandle={dragHandle}
        bolsaoConfig={bolsaoConfig}
        nowMs={nowMs}
        bolsaoStatus={bolsaoStatus}
        onAssumirDoBolsao={onAssumirDoBolsao}
      />
    </div>
  );
});
KanbanCard.displayName = 'KanbanCard';

// Componente da Coluna
interface KanbanColumnProps {
  column: { id: KanbanStatus; title: string; color: string; icon: React.ComponentType<{ className?: string }> };
  leads: KanbanLead[];
  onLeadClick: (lead: KanbanLead) => void;
  onAdicionarLead?: () => void;
  mostrarCorretor?: boolean;
  bolsaoConfig?: TenantBolsaoConfig | null;
  nowMs?: number;
  bolsaoStatusMap?: Record<string, { queue_attempt: number; atendido: boolean; status: string }>;
  onAssumirDoBolsao?: (leadId: string) => void;
}

const CARDS_PER_PAGE = 15;

const KanbanColumn = memo(({ column, leads, onLeadClick, onAdicionarLead, mostrarCorretor, bolsaoConfig, nowMs, bolsaoStatusMap, onAssumirDoBolsao }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [visibleCount, setVisibleCount] = useState(CARDS_PER_PAGE);

  const visibleLeads = leads.slice(0, visibleCount);
  const hasMore = leads.length > visibleCount;

  return (
    <div
      className={`flex flex-col w-[260px] h-full shrink-0 transition-all rounded-xl border bg-white dark:bg-slate-900 ${
        isOver
          ? 'border-blue-400 dark:border-blue-500 shadow-sm'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Column header — linha fina slate-100/slate-800 como no Estudo de Mercado */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
            {column.title}
          </span>
        </div>
        <span
          className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0 tabular-nums"
          style={{ backgroundColor: column.color + '1a', color: column.color }}
        >
          {leads.length}
        </span>
      </div>

      {/* Cards area — flex-1 expande para toda altura disponível (coluna longa e óbvia como drop zone) */}
      <div ref={setNodeRef} className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 bg-slate-50/30 dark:bg-slate-950/30">
          {leads.length === 0 && !isOver && (
            <p className="text-[11px] text-center py-6 italic text-slate-400 dark:text-slate-500">
              Nenhum lead
            </p>
          )}

          {visibleLeads.map((lead) => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              onClick={() => onLeadClick(lead)}
              mostrarCorretor={mostrarCorretor}
              bolsaoConfig={bolsaoConfig}
              nowMs={nowMs}
              bolsaoStatus={bolsaoStatusMap?.[lead.id] ?? null}
              onAssumirDoBolsao={onAssumirDoBolsao}
            />
          ))}

          {hasMore && (
            <button
              onClick={() => setVisibleCount(prev => prev + CARDS_PER_PAGE)}
              className="w-full py-2 rounded-lg border border-dashed text-[11px] flex items-center justify-center gap-1 transition-colors border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
            >
              Mostrar mais ({leads.length - visibleCount})
            </button>
          )}

          <button
            type="button"
            onClick={onAdicionarLead}
            className="w-full py-2 rounded-lg border border-dashed text-[11px] flex items-center justify-center gap-1 transition-colors border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400"
          >
            <Plus className="h-3 w-3" />
            Adicionar
          </button>
        </div>
    </div>
  );
});
KanbanColumn.displayName = 'KanbanColumn';

interface MeusLeadsAtribuidosSectionProps {
  /** 1 = Interessado (default), 2 = Proprietário. Controla colunas do Kanban e filtro de dados. */
  leadType?: LeadType;
}

export const MeusLeadsAtribuidosSection = ({
  leadType = LEAD_TYPE_INTERESSADO,
}: MeusLeadsAtribuidosSectionProps = {}) => {
  const { user, isCorretor, isAdmin, isLoading: authLoading, tenantId } = useAuth();
  const kanbanColumns = useMemo(() => getKanbanColumns(leadType), [leadType]);

  // Iniciar sincronização automática do Santa Angela (apenas para tenant autorizado)
  useEffect(() => {
    const SANTA_ANGELA_TENANT_ID = '65c69875-dc83-4062-90f6-6f6adc30df26';
    
    if (tenantId && tenantId === SANTA_ANGELA_TENANT_ID) {
      const config: SyncConfig = {
        tenantId: tenantId,
        intervalMinutes: 5,
        enabled: true,
      };
      startAutoSync(config);
    }
  }, [tenantId]);

  // Modal de criar lead — permanece no Kanban; emite `leadsEventEmitter` no sucesso.
  const [createModalStage, setCreateModalStage] = useState<string | null>(null);
  const handleAdicionarLead = useCallback((stageTitle?: string) => {
    setCreateModalStage(stageTitle ?? '');
  }, []);
  const handleCloseCreateModal = useCallback(() => setCreateModalStage(null), []);

  // Registra a ação do botão "Novo" do header conforme o tipo do Kanban.
  const isProprietarioKanban = leadType === LEAD_TYPE_PROPRIETARIO;
  useRegisterNovoActions(
    isProprietarioKanban ? 'meus-leads:kanban-proprietario' : 'meus-leads:kanban',
    [
      {
        id: isProprietarioKanban ? 'novo-proprietario' : 'novo-lead',
        label: isProprietarioKanban ? 'Novo Proprietário' : 'Novo Lead',
        icon: Plus,
        onClick: () => setCreateModalStage(''),
      },
    ]
  );
  const { toast } = useToast();
  
  const [meusLeads, setMeusLeads] = useState<KanbanLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadSelecionado, setLeadSelecionado] = useState<KanbanLead | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [leadParaArquivar, setLeadParaArquivar] = useState<KanbanLead | null>(null);
  const [motivoArquivamento, setMotivoArquivamento] = useState('');
  const [motivoPredefinido, setMotivoPredefinido] = useState<string>('sem_interesse');
  const [arquivando, setArquivando] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Estados dos filtros
  const [filtroPeriodo, setFiltroPeriodo] = useState<'todos' | 'personalizado'>('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filtroTemperatura, setFiltroTemperatura] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  
  // Estados para scroll horizontal
  const kanbanContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isDraggingScroll, setIsDraggingScroll] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [scrollStartX, setScrollStartX] = useState(0);

  // Bolsão: config do tenant + clock que tica a cada 30s para alimentar o countdown
  const [bolsaoConfig, setBolsaoConfig] = useState<TenantBolsaoConfig | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') {
      setBolsaoConfig(null);
      return;
    }
    let cancelled = false;
    fetchTenantBolsaoConfig(tenantId)
      .then((cfg) => { if (!cancelled) setBolsaoConfig(cfg); })
      .catch(() => { /* silencioso — sem config, countdown não aparece */ });
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Dispara a expiração do bolsão imediatamente ao abrir o kanban — assim leads
  // que já bateram o tempo são redistribuídos pra próxima pessoa da roleta sem
  // esperar o cron de 1 min.
  useEffect(() => {
    if (!tenantId || tenantId === 'owner') return;
    supabase.rpc('expire_bolsao_leads').then(({ error }) => {
      if (error) {
        console.warn('[MeusLeads] expire_bolsao_leads falhou:', error.message);
      } else {
        leadsEventEmitter.emit();
      }
    });
  }, [tenantId]);

  /**
   * Espelho do bolsão pros leads exibidos. Quando uma row tem
   * `queue_attempt > 0` significa que o lead foi redistribuído (caiu no bolsão).
   * Quando `atendido=true && status='assumido'` o corretor já clicou em
   * "Assumir do bolsão" — o cronômetro está parado, exibimos o badge.
   */
  interface BolsaoMirrorRow {
    source_lead_id: string;
    queue_attempt: number;
    atendido: boolean;
    status: string;
  }
  const [bolsaoStatusMap, setBolsaoStatusMap] = useState<Record<string, BolsaoMirrorRow>>({});
  const carregarBolsaoStatus = useCallback(async (leadIds: string[]) => {
    if (leadIds.length === 0) {
      setBolsaoStatusMap({});
      return;
    }
    const result = await supabase
      .from('bolsao')
      .select('source_lead_id, queue_attempt, atendido, status')
      .in('source_lead_id', leadIds);
    if (result.error) {
      console.warn('[MeusLeads] erro ao buscar status do bolsão:', result.error.message);
      return;
    }
    const rows = (result.data ?? []) as Array<Record<string, unknown>>;
    const map: Record<string, BolsaoMirrorRow> = {};
    for (const row of rows) {
      const sid = row.source_lead_id as string | null;
      if (!sid) continue;
      map[sid] = {
        source_lead_id: sid,
        queue_attempt: Number(row.queue_attempt ?? 0),
        atendido: Boolean(row.atendido),
        status: String(row.status ?? 'novo'),
      };
    }
    setBolsaoStatusMap(map);
  }, []);

  /** Marca lead como assumido do bolsão — cronômetro para, badge aparece. */
  const handleAssumirDoBolsao = useCallback(async (leadId: string) => {
    const { error } = await supabase
      .from('bolsao')
      .update({
        atendido: true,
        data_atendimento: new Date().toISOString(),
        status: 'assumido',
      })
      .eq('source_lead_id', leadId);
    if (error) {
      toast({ title: 'Erro ao assumir', description: error.message, variant: 'destructive' });
      return;
    }
    // Atualiza o map local + emite evento
    setBolsaoStatusMap((prev) => ({
      ...prev,
      [leadId]: { ...(prev[leadId] ?? { source_lead_id: leadId, queue_attempt: 1 }), atendido: true, status: 'assumido' },
    }));
    toast({ title: '✅ Lead assumido do bolsão', description: 'Cronômetro parado.' });
    leadsEventEmitter.emit();
  }, [toast]);
  
  // Sensores iguais aos do Kanban de Proposta — distance=6 evita "pick-up" acidental.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Carregar meus leads
  const carregarMeusLeads = useCallback(async () => {
    // Aguardar auth terminar de carregar antes de buscar leads
    if (authLoading) {
      return;
    }

    // Se for Admin, busca TODOS os leads em andamento
    if (isAdmin) {
      try {
        setLoading(true);
        const data = await fetchTodosLeadsCRM(tenantId || undefined, leadType);
        setMeusLeads(data);
      } catch (error) {
        console.error('Erro ao carregar todos os leads (admin):', error);
        toast({
          title: "Erro ao carregar leads",
          description: "Não foi possível carregar os leads gerais.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Para corretor: buscar por ID do usuário ou por nome
    // Tentar obter userId do auth, senão buscar diretamente da sessão Supabase
    let userId = user?.id;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    }
    
    // Usar name do AuthUser ou extrair do email
    const corretorNome = user?.name || user?.email?.split('@')[0] || '';
    
    
    if (!userId && !corretorNome) {
      console.warn('⚠️ Nenhum corretor logado');
      setMeusLeads([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Tentar buscar por ID primeiro
      const effectiveTenantId = tenantId || undefined;
      let data = userId
        ? await fetchLeadsDoCorretorCRM(userId, effectiveTenantId, corretorNome, leadType)
        : [];

      // Se não encontrou por ID, tentar só por nome
      if (data.length === 0 && corretorNome) {
        data = await fetchLeadsDoCorretorPorNome(corretorNome, effectiveTenantId, leadType);
      }
      setMeusLeads(data);
      
    } catch (error) {
      console.error('Erro ao carregar meus leads:', error);
      toast({
        title: "Erro ao carregar leads",
        description: "Não foi possível carregar seus leads.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAdmin, user?.id, user?.name, user?.email, toast, tenantId, leadType]);

  // Carregar ao montar - buscar sempre que o componente montar (busca userId da sessão)
  useEffect(() => {
    carregarMeusLeads();
  }, [carregarMeusLeads]);

  // Sincroniza o status do bolsão (queue_attempt, atendido) sempre que mudar lista
  useEffect(() => {
    carregarBolsaoStatus(meusLeads.map((l) => l.id));
  }, [meusLeads, carregarBolsaoStatus]);

  // Refetch quando outro lugar do app atualiza um lead (funil/pipeline, etc.)
  useEffect(() => {
    const unsubscribe = leadsEventEmitter.subscribe(() => {
      carregarMeusLeads();
    });
    return unsubscribe;
  }, [carregarMeusLeads]);

  // Verificar scroll horizontal e atualizar indicadores
  const checkScroll = () => {
    if (!kanbanContainerRef.current) return;
    const container = kanbanContainerRef.current;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  // Scroll para esquerda/direita
  const scrollHorizontal = (direction: 'left' | 'right') => {
    if (!kanbanContainerRef.current) return;
    const container = kanbanContainerRef.current;
    const scrollAmount = 300; // Quantidade de pixels para rolar
    
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Handlers para drag de scroll - Otimizado para performance
  const handleMouseDown = (e: React.MouseEvent) => {
    // Não iniciar scroll-drag se o clique é em um card do kanban (dnd-kit precisa
    // capturar o evento) ou em botões/links interativos.
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-kanban-card]') ||
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    
    if (!kanbanContainerRef.current) return;
    setIsDraggingScroll(true);
    setDragStartX(e.clientX);
    setScrollStartX(kanbanContainerRef.current.scrollLeft);
    e.preventDefault();
    e.stopPropagation();
  };

  // Adicionar listeners para drag de scroll - Máxima fluidez
  useEffect(() => {
    if (!isDraggingScroll) return;

    const container = kanbanContainerRef.current;
    if (!container) return;

    let lastScrollCheck = 0;
    
    const moveHandler = (e: MouseEvent) => {
      if (!container) return;
      
      // Scroll direto sem requestAnimationFrame para máxima responsividade
      const deltaX = e.clientX - dragStartX;
      container.scrollLeft = scrollStartX - deltaX;
      
      // Throttle checkScroll - apenas a cada 150ms durante drag
      const now = performance.now();
      if (now - lastScrollCheck > 150) {
        checkScroll();
        lastScrollCheck = now;
      }
    };
    
    const upHandler = () => {
      setIsDraggingScroll(false);
      // Verificar scroll ao soltar
      requestAnimationFrame(() => checkScroll());
    };
    
    // Usar passive para melhor performance e captura para garantir eventos
    document.addEventListener('mousemove', moveHandler, { passive: true, capture: false });
    document.addEventListener('mouseup', upHandler, { passive: true });
    document.addEventListener('mouseleave', upHandler, { passive: true });
    
    return () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      document.removeEventListener('mouseleave', upHandler);
    };
  }, [isDraggingScroll, dragStartX, scrollStartX]);

  // Verificar scroll ao montar e ao redimensionar
  useEffect(() => {
    const container = kanbanContainerRef.current;

    checkScroll();
    window.addEventListener('resize', checkScroll);
    if (container) {
      container.addEventListener('scroll', checkScroll);
    }

    return () => {
      window.removeEventListener('resize', checkScroll);
      if (container) {
        container.removeEventListener('scroll', checkScroll);
      }
    };
  }, []);

  // Função para mapear status do lead para etapa do funil
  const mapearStatusParaEtapa = useCallback(
    (status: string | null | undefined): KanbanStatus => {
      return getLeadStatus({ status } as KanbanLead, kanbanColumns);
    },
    [kanbanColumns]
  );

  const findLeadById = useCallback((leadId: string) => {
    return meusLeads.find(lead => lead.id === leadId) || null;
  }, [meusLeads]);

  const findContainerByItemId = useCallback((itemId: string): KanbanStatus | null => {
    if (kanbanColumns.some(column => column.id === itemId)) {
      return itemId as KanbanStatus;
    }

    const lead = findLeadById(itemId);
    return lead ? getLeadStatus(lead, kanbanColumns) : null;
  }, [findLeadById, kanbanColumns]);

  // Aplicar filtros nos leads (memoizado)
  const leadsFiltrados = useMemo(() => meusLeads.filter(lead => {
    const leadRecord = lead as unknown as Record<string, unknown>;

    if (filtroPeriodo === 'personalizado' && (dataInicio || dataFim)) {
      const dataLead = new Date(lead.created_at);
      const inicio = dataInicio ? new Date(dataInicio) : new Date(0);
      const fim = dataFim ? new Date(dataFim) : new Date();
      if (dataFim) fim.setHours(23, 59, 59, 999);
      if (dataLead < inicio || dataLead > fim) return false;
    }

    if (filtroTemperatura !== 'todos') {
      const temp = String((leadRecord.temperature ?? leadRecord.status_temperatura ?? '')).toLowerCase();
      if (filtroTemperatura === 'quente' && temp !== 'quente') return false;
      if (filtroTemperatura === 'morno' && temp !== 'morno') return false;
      if (filtroTemperatura === 'frio' && temp !== 'frio') return false;
    }

    if (filtroTipo !== 'todos') {
      const tipo = String((leadRecord.tipo_negocio ?? leadRecord.finalidade ?? '')).toLowerCase();
      if (filtroTipo === 'venda' && tipo !== 'venda') return false;
      if (filtroTipo === 'locacao' && tipo !== 'locação' && tipo !== 'locacao') return false;
    }

    return true;
  }), [meusLeads, filtroPeriodo, dataInicio, dataFim, filtroTemperatura, filtroTipo]);

  // Agrupar leads filtrados por etapa do funil (memoizado)
  const leadsAgrupados = useMemo(() => {
    return kanbanColumns.reduce((acc, column) => {
      acc[column.id] = leadsFiltrados.filter(lead => {
        try {
          return mapearStatusParaEtapa(lead?.status ?? null) === column.id;
        } catch {
          return false;
        }
      });
      return acc;
    }, {} as Record<KanbanStatus, KanbanLead[]>);
  }, [leadsFiltrados, kanbanColumns, mapearStatusParaEtapa]);

  // Clique no lead → abre o modal de edição (mesmo modal de criação em modo editar)
  const [editingLead, setEditingLead] = useState<KanbanLead | null>(null);
  const handleLeadClick = useCallback((lead: KanbanLead) => {
    setEditingLead(lead);
  }, []);
  const handleCloseEditModal = useCallback(() => setEditingLead(null), []);

  // Handler para início do drag (memoizado)
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // Handler de fim de drag — igual Proposta: solta em uma coluna, atualiza status.
  // Sem reordenação dentro da mesma coluna, sem animação de re-layout.
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const leadId = String(active.id);
    const overId = String(over.id);
    const lead = findLeadById(leadId);
    if (!lead) return;

    // `over.id` é sempre o id da coluna (cada coluna é droppable). Se o usuário
    // soltar sobre outro card, caímos na mesma coluna do card de destino.
    const destColumnId = kanbanColumns.find((c) => c.id === overId)?.id
      ?? findContainerByItemId(overId);
    if (!destColumnId) return;

    const etapaAtual = getLeadStatus(lead, kanbanColumns);
    if (etapaAtual === destColumnId) return;

    // Slug → status humano (usa título da coluna; leadsService normaliza via mapKanbanSlugToStatus)
    const destColumn = kanbanColumns.find((c) => c.id === destColumnId);
    const statusParaSalvar = destColumn?.title ?? destColumnId;

    // Update otimista no estado local — sem arrayMove, só muda o status.
    setMeusLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: statusParaSalvar } : l))
    );

    try {
      await atualizarStatusLeadCRM(leadId, statusParaSalvar);
      toast({
        title: '✅ Etapa atualizada',
        description: `Lead movido para ${kanbanColumns.find((c) => c.id === destColumnId)?.title}`,
        className: 'bg-green-500/10 border-green-500/50',
      });
    } catch (error) {
      // Rollback em caso de falha
      setMeusLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: lead.status } : l))
      );
      console.error('Erro ao atualizar status:', error);
      toast({
        title: 'Erro ao atualizar status',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  // Lead ativo sendo arrastado
  const activeLead = activeId ? meusLeads.find(l => l.id === activeId) : null;

  const temFiltroAtivo = filtroPeriodo !== 'todos' || filtroTemperatura !== 'todos' || filtroTipo !== 'todos';

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ── Toolbar única — estilo Proposta ── */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b flex-wrap shrink-0"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {/* Título compacto */}
        <div className="flex items-center gap-2 shrink-0">
          <User className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Meus Leads
          </h1>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: '#3b82f622', color: '#3b82f6' }}
          >
            {meusLeads.length}
          </span>
        </div>

        {/* Divisor */}
        <div className="h-5 w-px" style={{ backgroundColor: 'var(--border)' }} />

        {/* Filtros compactos */}
        <Select value={filtroPeriodo} onValueChange={(value) => setFiltroPeriodo(value as 'todos' | 'personalizado')}>
          <SelectTrigger className="h-8 text-xs w-[150px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos períodos</SelectItem>
            <SelectItem value="personalizado">Personalizado</SelectItem>
          </SelectContent>
        </Select>

        {filtroPeriodo === 'personalizado' && (
          <>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="h-8 text-xs w-[130px]"
            />
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="h-8 text-xs w-[130px]"
            />
          </>
        )}

        <Select value={filtroTemperatura} onValueChange={setFiltroTemperatura}>
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue placeholder="Temperatura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas temperaturas</SelectItem>
            <SelectItem value="quente">Quente</SelectItem>
            <SelectItem value="morno">Morno</SelectItem>
            <SelectItem value="frio">Frio</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="h-8 text-xs w-[120px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos tipos</SelectItem>
            <SelectItem value="venda">Venda</SelectItem>
            <SelectItem value="locacao">Locação</SelectItem>
          </SelectContent>
        </Select>

        {temFiltroAtivo && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFiltroPeriodo('todos');
              setDataInicio('');
              setDataFim('');
              setFiltroTemperatura('todos');
              setFiltroTipo('todos');
            }}
            className="h-8 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Limpar
          </Button>
        )}

        {/* Contador + botão atualizar na direita */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{leadsFiltrados.length}</strong>
            {' '}de{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{meusLeads.length}</strong>
          </span>
          <Button
            onClick={() => carregarMeusLeads()}
            disabled={loading}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Clock className="h-3.5 w-3.5 mr-1" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {/* Container do Kanban com scroll horizontal e drag */}
      <div className="relative w-full flex-1 flex flex-col min-h-0">
        {/* Indicador de scroll à esquerda */}
        {showLeftArrow && (
          <button
            onClick={() => scrollHorizontal('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-50 border rounded-full p-2 shadow-lg transition-all hover:scale-110"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label="Rolar para esquerda"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Indicador de scroll à direita */}
        {showRightArrow && (
          <button
            onClick={() => scrollHorizontal('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-50 border rounded-full p-2 shadow-lg transition-all hover:scale-110"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label="Rolar para direita"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Área de conteúdo com scroll horizontal - Barra sempre visível na parte inferior */}
        <div 
          ref={kanbanContainerRef}
          className={`flex-1 overflow-x-auto overflow-y-hidden ${isDraggingScroll ? 'cursor-grabbing select-none' : ''}`}
          onMouseDown={handleMouseDown}
          style={{ 
            willChange: isDraggingScroll ? 'scroll-position' : 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollBehavior: 'auto', // Scroll instantâneo durante drag
            overscrollBehaviorX: 'contain', // Prevenir scroll da página durante drag
            transform: 'translateZ(0)', // Hardware acceleration
            backfaceVisibility: 'hidden', // Otimização de renderização
            scrollbarGutter: 'stable' // Garante espaço para a barra de scroll
          }}
        >

        {/* Conteúdo do Kanban — flex col para banners ficarem em cima e colunas esticarem pra baixo */}
        <div className="p-4 h-full flex flex-col min-h-0">
        {(loading || authLoading) ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 className="h-16 w-16 text-purple-500 animate-spin mb-4" />
            <p className="text-muted-foreground text-lg font-semibold">
              Carregando seus leads...
            </p>
          </div>
        ) : (
          <>
            {/* Banner de estado vazio — aparece ACIMA das colunas, Kanban continua visível */}
            {meusLeads.length === 0 && (
              <Card className="mb-4 border-dashed">
                <CardContent className="p-6 flex items-center gap-4">
                  <User className="h-10 w-10 text-purple-500 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground">Nenhum lead atribuído ainda</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quando leads forem atribuídos a você, aparecerão nas colunas abaixo.
                      Você pode arrastar leads entre as etapas quando eles chegarem.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            {meusLeads.length > 0 && leadsFiltrados.length === 0 && (
              <Card className="mb-4 border-dashed">
                <CardContent className="p-6 flex items-center gap-4">
                  <Filter className="h-10 w-10 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground">Nenhum lead encontrado com os filtros atuais</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Limpe os filtros para ver todos os seus {meusLeads.length} leads.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFiltroPeriodo('todos');
                      setFiltroTemperatura('todos');
                      setFiltroTipo('todos');
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Limpar Filtros
                  </Button>
                </CardContent>
              </Card>
            )}

          <DndContext
            sensors={sensors}
            collisionDetection={cursorCollisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Grid de Colunas do Kanban - flex-1 min-h-0 força colunas a ocuparem toda altura restante */}
            <div className="flex gap-3 flex-1 min-h-0 pb-4" style={{ minWidth: 'fit-content' }}>
              {kanbanColumns.map((column) => (
                <div key={column.id} id={column.id} className="h-full flex-shrink-0">
                  <KanbanColumn
                    column={column}
                    leads={leadsAgrupados[column.id] || []}
                    onLeadClick={handleLeadClick}
                    onAdicionarLead={() => handleAdicionarLead(column.title)}
                    mostrarCorretor={isAdmin}
                    bolsaoConfig={bolsaoConfig}
                    nowMs={nowMs}
                    bolsaoStatusMap={bolsaoStatusMap}
                    onAssumirDoBolsao={handleAssumirDoBolsao}
                  />
                </div>
              ))}
            </div>

            <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null}>
              {activeLead ? (
                <div className="rotate-2 shadow-2xl opacity-95 w-[244px] pointer-events-none">
                  <KanbanCardContent
                    lead={activeLead}
                    onClick={() => {}}
                    mostrarCorretor={isAdmin}
                    isOverlay
                    bolsaoConfig={bolsaoConfig}
                    nowMs={nowMs}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          </>
        )}
        </div>
        </div>
      </div>
      
      {/* Modal de Detalhes do Lead */}
      {/* Modal "Criar Lead" — abre sem sair do Kanban */}
      <CriarLeadQuickModal
        isOpen={createModalStage !== null}
        onClose={handleCloseCreateModal}
        tenantId={tenantId}
        stageHint={createModalStage || undefined}
        leadType={leadType}
      />

      {/* Modal "Editar Lead" — reutiliza o mesmo componente em modo edit */}
      <CriarLeadQuickModal
        isOpen={editingLead !== null}
        onClose={handleCloseEditModal}
        tenantId={tenantId}
        editingLead={editingLead}
        leadType={leadType}
      />

      <LeadDetailsModal
        lead={leadSelecionado as unknown as BolsaoLead | null}
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setLeadSelecionado(null);
        }}
        onAssumirLead={async () => {
          // Não permite assumir aqui pois já está atribuído
        }}
        onConfirmarAtendimento={async () => {
          // Não usa mais este botão, agora é pelo drag and drop
        }}
        onArquivarLead={(lead) => {
          setLeadParaArquivar(lead as unknown as KanbanLead);
          setMotivoArquivamento('');
          setModalAberto(false);
        }}
        isAssumindoLead={false}
        isConfirmandoLead={false}
        isAdmin={isAdmin}
        isCorretor={isCorretor}
        currentCorretor={user?.email?.split('@')[0] || ''}
        onAtualizarStatusLead={async (leadId: number, novoStatus: string) => {
          try {
            await atualizarStatusLeadCRM(String(leadId), novoStatus);
            
            // Atualizar estado local
            setMeusLeads(prevLeads =>
              prevLeads.map(l =>
                l.id === String(leadId) ? { ...l, status: novoStatus } : l
              )
            );
            
            toast({
              title: "✅ Status atualizado!",
              description: `Lead movido para ${kanbanColumns.find(c => c.id === novoStatus)?.title || novoStatus}`,
              className: "bg-green-500/10 border-green-500/50"
            });
          } catch (error) {
            console.error('Erro ao atualizar status:', error);
            toast({
              title: "Erro ao atualizar status",
              description: String(error),
              variant: "destructive"
            });
          }
        }}
      />

      {/* Modal de confirmação de arquivamento */}
      {leadParaArquivar && (
        <Dialog open onOpenChange={() => setLeadParaArquivar(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5 text-orange-500" />
                Arquivar lead
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Arquivando: <strong className="text-foreground">{leadParaArquivar.nomedolead || 'Lead sem nome'}</strong>
              </p>
              <div className="space-y-1.5">
                <Label>Motivo do arquivamento</Label>
                <Select value={motivoPredefinido} onValueChange={setMotivoPredefinido}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_interesse">Sem interesse</SelectItem>
                    <SelectItem value="ja_fechou_outro">Já fechou com outro</SelectItem>
                    <SelectItem value="contato_errado">Contato errado / inválido</SelectItem>
                    <SelectItem value="fora_perfil">Fora do perfil</SelectItem>
                    <SelectItem value="duplicado">Lead duplicado</SelectItem>
                    <SelectItem value="nao_respondeu">Não respondeu</SelectItem>
                    <SelectItem value="erro">Erro / cadastro incorreto</SelectItem>
                    <SelectItem value="outro">Outro (descrever abaixo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="motivo-arquivar" className="text-xs text-muted-foreground">
                  {motivoPredefinido === 'outro' ? 'Descreva o motivo' : 'Observações (opcional)'}
                </Label>
                <Textarea
                  id="motivo-arquivar"
                  placeholder={motivoPredefinido === 'outro' ? 'Descreva o motivo...' : 'Detalhes adicionais (opcional)'}
                  value={motivoArquivamento}
                  onChange={(e) => setMotivoArquivamento(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLeadParaArquivar(null)}>Cancelar</Button>
              <Button
                disabled={arquivando}
                onClick={async () => {
                  if (!leadParaArquivar) return;
                  setArquivando(true);
                  try {
                    const MOTIVO_LABELS: Record<string, string> = {
                      sem_interesse: 'Sem interesse',
                      ja_fechou_outro: 'Já fechou com outro',
                      contato_errado: 'Contato errado / inválido',
                      fora_perfil: 'Fora do perfil',
                      duplicado: 'Lead duplicado',
                      nao_respondeu: 'Não respondeu',
                      erro: 'Erro / cadastro incorreto',
                      outro: 'Outro',
                    };
                    const motivoFinal = motivoPredefinido === 'outro'
                      ? (motivoArquivamento.trim() || 'Outro motivo')
                      : `${MOTIVO_LABELS[motivoPredefinido] || 'Arquivado'}${motivoArquivamento.trim() ? ` — ${motivoArquivamento.trim()}` : ''}`;

                    const result = await arquivarLeadCRM(
                      leadParaArquivar.id,
                      motivoFinal
                    );
                    if (result.success) {
                      setMeusLeads(prev => prev.filter(l => l.id !== leadParaArquivar.id));
                      toast({
                        title: '✅ Lead arquivado',
                        description: `${leadParaArquivar.nomedolead} foi arquivado.`,
                        className: 'bg-orange-500/10 border-orange-500/50'
                      });
                      setLeadParaArquivar(null);
                    } else {
                      toast({ title: 'Erro ao arquivar', description: result.message, variant: 'destructive' });
                    }
                  } finally {
                    setArquivando(false);
                  }
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {arquivando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
                Arquivar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
