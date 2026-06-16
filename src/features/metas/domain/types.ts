/**
 * Tipos de domínio das Metas.
 *
 * Princípio de design: os tipos separam dois eixos independentes para
 * favorecer extensibilidade sem condicionais espalhadas:
 *
 *  - `categoryId`  → "o quê" a meta mede (VGV, VGC, Captação, ...).
 *                    É TEXTO livre, resolvido por um registry de categorias.
 *                    Adicionar uma categoria nova é apenas dado.
 *
 *  - `model`       → "como" o progresso é estruturado/calculado
 *                    (simples, escalonada, personalizada). Cada modelo tem
 *                    uma estratégia própria. Adicionar um modelo novo é
 *                    adicionar uma estratégia, sem tocar nas existentes.
 *
 * A parte específica de cada modelo mora em `config` (discriminada por
 * `kind`), o que permite evoluir modelos sem migração de banco.
 */

/** Estrutura de cálculo do progresso. Aberta para extensão. */
export type GoalModel = 'simple' | 'scaled' | 'custom';

/** Status persistido (ativar/desativar). */
export type GoalActivationStatus = 'active' | 'inactive';

/** Origem do valor realizado. */
export type GoalSource = 'manual' | 'crm';

/** Abrangência da meta. Apenas metas de equipe podem ser destacadas. */
export type GoalScope = 'team' | 'individual';

/**
 * Status de progresso DERIVADO (nunca persistido) — calculado a partir
 * dos valores e do período. Usado no dashboard e nos filtros.
 */
export type GoalProgressStatus = 'completed' | 'on_track' | 'late' | 'inactive';

/** Como o valor numérico é formatado para exibição. */
export type GoalUnit = 'currency' | 'count' | 'percent';

/** Nível de uma meta escalonada (a quantidade de níveis é livre). */
export interface GoalLevel {
  id: string;
  name: string;
  target: number;
  /** Critério de conclusão (texto livre). */
  criterion?: string;
}

/** Marco intermediário de uma meta personalizada. */
export interface GoalMilestone {
  id: string;
  label: string;
  target: number;
  successCriterion?: string;
}

/** Config específica por modelo, discriminada por `kind`. */
export interface SimpleGoalConfig {
  kind: 'simple';
}

export interface ScaledGoalConfig {
  kind: 'scaled';
  levels: GoalLevel[];
}

export interface CustomGoalConfig {
  kind: 'custom';
  objective: string;
  /** Rótulo livre da unidade de medida (ex: "imóveis", "contratos"). */
  unitLabel: string;
  milestones: GoalMilestone[];
  successCriteria: string;
}

export type GoalConfig = SimpleGoalConfig | ScaledGoalConfig | CustomGoalConfig;

/** Entidade central. Espelha a tabela `goals` (camelCase na aplicação). */
export interface Goal {
  id: string;
  tenantId: string;
  name: string;
  categoryId: string;
  model: GoalModel;
  description: string;
  status: GoalActivationStatus;
  /** ISO date (YYYY-MM-DD). */
  startDate: string;
  /** ISO date (YYYY-MM-DD). */
  endDate: string;
  ownerName: string;
  targetValue: number;
  currentValue: number;
  unit: GoalUnit;
  /** Origem do valor realizado. */
  source: GoalSource;
  /** Abrangência (equipe/individual). */
  scope: GoalScope;
  /** Destacada na tela inicial (no máximo uma por tenant). */
  isFeatured: boolean;
  config: GoalConfig;
  createdAt: string;
  updatedAt: string;
}

/**
 * Campos editáveis no formulário de criação/edição.
 * `isFeatured` é gerenciado por uma ação dedicada (destacar), não pelo form.
 */
export type GoalDraft = Omit<Goal, 'id' | 'tenantId' | 'isFeatured' | 'createdAt' | 'updatedAt'>;

/** Registro do histórico de alterações de uma meta. */
export interface GoalHistoryEntry {
  id: string;
  goalId: string;
  changedByName: string;
  changeType: string;
  summary: string;
  createdAt: string;
}
