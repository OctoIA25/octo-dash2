/**
 * Registry de VIEWS por modelo de meta (camada de UI).
 *
 * Espelha, no front, o registry de estratégias do domínio. Cada modelo
 * declara:
 *   - `Fields`: o editor da parte específica do modelo no formulário
 *               (ex: níveis da escalonada). Campos COMUNS ficam no
 *               GoalFormDialog — aqui só o que é específico do modelo.
 *   - `Extra`:  a visualização específica no card (ex: lista de níveis).
 *
 * Adicionar um modelo novo = adicionar a estratégia no domínio e uma
 * entrada aqui. Nenhum `if (model === ...)` na UI.
 */

import { Plus, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  createEmptyLevel,
  createEmptyMilestone,
} from '../domain/factory';
import { formatGoalValue } from '../domain/format';
import type { GoalView } from '../domain/metrics';
import type {
  CustomGoalConfig,
  GoalDraft,
  GoalLevel,
  GoalMilestone,
  GoalModel,
  ScaledGoalConfig,
} from '../domain/types';

export interface ModelFieldsProps {
  draft: GoalDraft;
  onChange: (patch: Partial<GoalDraft>) => void;
}

export interface ModelExtraProps {
  view: GoalView;
}

interface GoalModelView {
  Fields: (props: ModelFieldsProps) => JSX.Element;
  Extra: (props: ModelExtraProps) => JSX.Element | null;
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------------------
// Modelo Simples
// ---------------------------------------------------------------------------

function SimpleFields({ draft, onChange }: ModelFieldsProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="goal-target">Valor alvo</Label>
      <Input
        id="goal-target"
        type="number"
        min={0}
        value={draft.targetValue || ''}
        onChange={(event) => onChange({ targetValue: parseNumber(event.target.value) })}
        placeholder="Ex: 50"
      />
    </div>
  );
}

function SimpleExtra(): JSX.Element | null {
  return null;
}

// ---------------------------------------------------------------------------
// Modelo Escalonado (níveis — quantidade livre)
// ---------------------------------------------------------------------------

function ScaledFields({ draft, onChange }: ModelFieldsProps) {
  const config = draft.config.kind === 'scaled' ? draft.config : { kind: 'scaled', levels: [] } as ScaledGoalConfig;

  const commit = (levels: GoalLevel[]) => {
    const maxTarget = levels.reduce((max, level) => Math.max(max, level.target), 0);
    onChange({ config: { kind: 'scaled', levels }, targetValue: maxTarget });
  };

  const updateLevel = (id: string, patch: Partial<GoalLevel>) => {
    commit(config.levels.map((level) => (level.id === id ? { ...level, ...patch } : level)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Níveis</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => commit([...config.levels, createEmptyLevel(config.levels.length)])}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar nível
        </Button>
      </div>

      {config.levels.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum nível adicionado.</p>
      )}

      <div className="space-y-2">
        {config.levels.map((level, index) => (
          <div key={level.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground w-6 shrink-0">{index + 1}.</span>
              <Input
                aria-label={`Nome do nível ${index + 1}`}
                value={level.name}
                onChange={(event) => updateLevel(level.id, { name: event.target.value })}
                placeholder="Nome do nível"
                className="flex-1"
              />
              <Input
                aria-label={`Alvo do nível ${index + 1}`}
                type="number"
                min={0}
                value={level.target || ''}
                onChange={(event) => updateLevel(level.id, { target: parseNumber(event.target.value) })}
                placeholder="Alvo"
                className="w-28"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => commit(config.levels.filter((item) => item.id !== level.id))}
                aria-label={`Remover nível ${index + 1}`}
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
              </Button>
            </div>
            <Input
              aria-label={`Critério de conclusão do nível ${index + 1}`}
              value={level.criterion ?? ''}
              onChange={(event) => updateLevel(level.id, { criterion: event.target.value })}
              placeholder="Critério de conclusão (opcional)"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckpointList({ view }: ModelExtraProps): JSX.Element | null {
  const { checkpoints } = view.progress;
  if (checkpoints.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1.5">
      {checkpoints.map((checkpoint) => (
        <li key={checkpoint.id} className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              'flex items-center justify-center w-4 h-4 rounded-full shrink-0',
              checkpoint.reached ? 'bg-emerald-500 text-white' : 'border border-slate-300 dark:border-slate-600',
            )}
          >
            {checkpoint.reached && <Check className="w-3 h-3" strokeWidth={3} />}
          </span>
          <span className={cn('flex-1', checkpoint.reached ? 'text-foreground' : 'text-muted-foreground')}>
            {checkpoint.label}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatGoalValue(checkpoint.target, view.goal.unit)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Modelo Personalizado
// ---------------------------------------------------------------------------

function CustomFields({ draft, onChange }: ModelFieldsProps) {
  const config =
    draft.config.kind === 'custom'
      ? draft.config
      : ({ kind: 'custom', objective: '', unitLabel: '', milestones: [], successCriteria: '' } as CustomGoalConfig);

  const commit = (patch: Partial<CustomGoalConfig>, targetOverride?: number) => {
    const next: CustomGoalConfig = { ...config, ...patch };
    const maxTarget = next.milestones.reduce((max, milestone) => Math.max(max, milestone.target), 0);
    onChange({
      config: next,
      ...(maxTarget > 0 ? { targetValue: maxTarget } : targetOverride !== undefined ? { targetValue: targetOverride } : {}),
    });
  };

  const updateMilestone = (id: string, patch: Partial<GoalMilestone>) => {
    commit({ milestones: config.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="goal-objective">Objetivo</Label>
        <Textarea
          id="goal-objective"
          value={config.objective}
          onChange={(event) => commit({ objective: event.target.value })}
          placeholder="Descreva o objetivo desta meta"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="goal-unit-label">Unidade de medida</Label>
          <Input
            id="goal-unit-label"
            value={config.unitLabel}
            onChange={(event) => commit({ unitLabel: event.target.value })}
            placeholder="Ex: contratos"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goal-custom-target">Valor alvo</Label>
          <Input
            id="goal-custom-target"
            type="number"
            min={0}
            value={draft.targetValue || ''}
            onChange={(event) => onChange({ targetValue: parseNumber(event.target.value) })}
            placeholder="Alvo final"
            disabled={config.milestones.length > 0}
          />
          {config.milestones.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Derivado do maior marco.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Marcos intermediários</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => commit({ milestones: [...config.milestones, createEmptyMilestone()] })}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar marco
          </Button>
        </div>
        {config.milestones.map((milestone, index) => (
          <div key={milestone.id} className="flex items-center gap-2">
            <Input
              aria-label={`Nome do marco ${index + 1}`}
              value={milestone.label}
              onChange={(event) => updateMilestone(milestone.id, { label: event.target.value })}
              placeholder="Nome do marco"
              className="flex-1"
            />
            <Input
              aria-label={`Alvo do marco ${index + 1}`}
              type="number"
              min={0}
              value={milestone.target || ''}
              onChange={(event) => updateMilestone(milestone.id, { target: parseNumber(event.target.value) })}
              placeholder="Alvo"
              className="w-28"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => commit({ milestones: config.milestones.filter((m) => m.id !== milestone.id) })}
              aria-label={`Remover marco ${index + 1}`}
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="goal-success">Critérios de sucesso</Label>
        <Textarea
          id="goal-success"
          value={config.successCriteria}
          onChange={(event) => commit({ successCriteria: event.target.value })}
          placeholder="O que define o sucesso desta meta?"
          rows={2}
        />
      </div>
    </div>
  );
}

function CustomExtra({ view }: ModelExtraProps): JSX.Element | null {
  const config = view.goal.config;
  const objective = config.kind === 'custom' ? config.objective : '';
  const list = CheckpointList({ view });

  if (!objective && !list) return null;

  return (
    <div className="mt-3 space-y-2">
      {objective && <p className="text-sm text-muted-foreground">{objective}</p>}
      {list}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const GOAL_MODEL_VIEWS: Record<GoalModel, GoalModelView> = {
  simple: { Fields: SimpleFields, Extra: SimpleExtra },
  scaled: { Fields: ScaledFields, Extra: CheckpointList },
  custom: { Fields: CustomFields, Extra: CustomExtra },
};
