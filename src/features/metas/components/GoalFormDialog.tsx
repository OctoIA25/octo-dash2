/**
 * Diálogo de criação/edição de meta.
 *
 * Campos comuns vivem aqui; a parte específica do modelo é delegada ao
 * registry GOAL_MODEL_VIEWS (sem condicionais por tipo). A validação usa
 * a estratégia do domínio (validateGoalDraft).
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GOAL_CATEGORIES, resolveCategory } from '../domain/categories';
import { GOAL_MODELS, validateGoalDraft } from '../domain/models';
import { GOAL_UNIT_LABELS } from '../domain/format';
import {
  applyCategoryDefaults,
  changeDraftModel,
  createEmptyDraft,
  goalToDraft,
} from '../domain/factory';
import type { Goal, GoalDraft, GoalModel, GoalScope, GoalSource, GoalUnit } from '../domain/types';
import { GOAL_MODEL_VIEWS } from './GoalModelViews';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
  today: string;
  isSubmitting: boolean;
  onSubmit: (draft: GoalDraft) => Promise<void>;
}

export function GoalFormDialog({ open, onOpenChange, goal, today, isSubmitting, onSubmit }: Props) {
  const [draft, setDraft] = useState<GoalDraft>(() => createEmptyDraft(today));
  const isEditing = !!goal;

  // Reinicializa o rascunho sempre que o diálogo abre.
  useEffect(() => {
    if (!open) return;
    setDraft(goal ? goalToDraft(goal) : createEmptyDraft(today));
  }, [open, goal, today]);

  const update = (patch: Partial<GoalDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const ModelFields = useMemo(() => GOAL_MODEL_VIEWS[draft.model].Fields, [draft.model]);

  const category = resolveCategory(draft.categoryId);
  const autoSyncAvailable = category.supportsAutoSync;
  const isAutoSynced = autoSyncAvailable && draft.source === 'crm';

  const handleSubmit = async () => {
    const errors = validateGoalDraft(draft);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    await onSubmit(draft);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar meta' : 'Nova meta'}</DialogTitle>
          <DialogDescription>
            Defina os dados da meta. O modelo determina como o progresso é medido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Identidade */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Nome</Label>
            <Input
              id="goal-name"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Ex: Captação Q3"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={draft.categoryId}
                onValueChange={(value) => setDraft((current) => applyCategoryDefaults(current, value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_CATEGORIES.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label} — {category.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select
                value={draft.model}
                onValueChange={(value) => setDraft((current) => changeDraftModel(current, value as GoalModel))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Modelo" />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_MODELS.map((model) => (
                    <SelectItem key={model.model} value={model.model}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-description">Descrição</Label>
            <Textarea
              id="goal-description"
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
              placeholder="Detalhes da meta (opcional)"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-owner">Responsável</Label>
              <Input
                id="goal-owner"
                value={draft.ownerName}
                onChange={(event) => update({ ownerName: event.target.value })}
                placeholder="Nome do responsável"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={draft.unit} onValueChange={(value) => update({ unit: value as GoalUnit })}>
                <SelectTrigger>
                  <SelectValue placeholder="Unidade" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_UNIT_LABELS) as GoalUnit[]).map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {GOAL_UNIT_LABELS[unit]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-start">Início</Label>
              <Input
                id="goal-start"
                type="date"
                value={draft.startDate}
                onChange={(event) => update({ startDate: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-end">Término</Label>
              <Input
                id="goal-end"
                type="date"
                value={draft.endDate}
                onChange={(event) => update({ endDate: event.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Abrangência</Label>
              <Select value={draft.scope} onValueChange={(value) => update({ scope: value as GoalScope })}>
                <SelectTrigger>
                  <SelectValue placeholder="Abrangência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Equipe (todo o time)</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Só metas de equipe podem ser destacadas na tela inicial.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Origem do valor realizado</Label>
              <Select
                value={draft.source}
                onValueChange={(value) => update({ source: value as GoalSource })}
                disabled={!autoSyncAvailable}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="crm" disabled={!autoSyncAvailable}>
                    Automático (CRM)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {autoSyncAvailable
                  ? 'No modo automático, o realizado vem dos dados do CRM.'
                  : 'Esta categoria não possui fonte automática.'}
              </p>
            </div>
          </div>

          {/* Configuração específica do modelo */}
          <div className="rounded-lg border p-3 bg-muted/30">
            <ModelFields draft={draft} onChange={update} />
          </div>

          {/* Progresso atual + status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="goal-current">Valor realizado</Label>
              <Input
                id="goal-current"
                type="number"
                min={0}
                value={draft.currentValue || ''}
                onChange={(event) => update({ currentValue: Number(event.target.value) || 0 })}
                placeholder="Ex: 12"
                disabled={isAutoSynced}
              />
              {isAutoSynced && (
                <p className="text-[11px] text-muted-foreground">
                  Atualizado automaticamente pelo CRM.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 h-10">
              <Switch
                id="goal-status"
                checked={draft.status === 'active'}
                onCheckedChange={(checked) => update({ status: checked ? 'active' : 'inactive' })}
              />
              <Label htmlFor="goal-status" className="cursor-pointer">Meta ativa</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar meta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
