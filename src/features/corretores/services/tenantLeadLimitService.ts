import { supabase } from '@/integrations/supabase/client';

// ============================================================
// Tipos
// ============================================================

export type BlockingMode = 'carteira' | 'pendencia' | 'both';

export interface TenantLeadLimitConfig {
  id?: string;
  tenant_id: string;
  lead_limit_enabled: boolean;
  max_active_leads_per_broker: number;
  max_pending_response_leads_per_broker: number;
  blocking_mode: BlockingMode;
  warning_threshold_percent: number;
  pending_statuses: string[];
  exclusive_lead_timeout_minutes: number;
  general_lead_timeout_minutes: number;
  created_at?: string;
  updated_at?: string;
}

export interface BrokerLeadLimitOverride {
  lead_limit_enabled?: boolean;
  custom_max_active_leads?: number | null;
  custom_max_pending_response_leads?: number | null;
  receives_auto_leads?: boolean;
  limit_exempt?: boolean;
  custom_exclusive_timeout_minutes?: number | null;
  custom_general_timeout_minutes?: number | null;
}

export interface BrokerLeadCounts {
  active_leads: number;
  pending_response_leads: number;
}

export type BrokerStatus = 'ok' | 'warning' | 'blocked_carteira' | 'blocked_pendencia' | 'blocked_both' | 'disabled' | 'exempt';

export interface BrokerEligibility {
  eligible: boolean;
  status: BrokerStatus;
  active_leads: number;
  pending_response_leads: number;
  max_active: number;
  max_pending: number;
  block_reason?: string;
}

// Valores padrão de configuração
export const DEFAULT_LEAD_LIMIT_CONFIG: Omit<TenantLeadLimitConfig, 'tenant_id'> = {
  lead_limit_enabled: false,
  max_active_leads_per_broker: 100,
  max_pending_response_leads_per_broker: 50,
  blocking_mode: 'both',
  warning_threshold_percent: 80,
  pending_statuses: ['Novos Leads'],
  exclusive_lead_timeout_minutes: 30,
  general_lead_timeout_minutes: 5,
};

// Todos os status possíveis do kanban
export const KANBAN_STATUSES = [
  'Novos Leads',
  'Interação',
  'Visita Agendada',
  'Visita Realizada',
  'Negociação',
  'Proposta Criada',
  'Proposta Enviada',
  'Proposta Assinada',
  'Arquivado',
];

// ============================================================
// Fetch / Save config do tenant
// ============================================================

export async function fetchLeadLimitConfig(
  tenantId: string
): Promise<TenantLeadLimitConfig | null> {
  if (!tenantId) return null;
  try {
    const { data, error } = await (supabase as any)
      .from('tenant_lead_limit_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('[LeadLimit] Erro ao buscar config:', error.message);
      return null;
    }
    return data as TenantLeadLimitConfig | null;
  } catch (e) {
    console.error('[LeadLimit] Exceção ao buscar config:', e);
    return null;
  }
}

export async function saveLeadLimitConfig(
  tenantId: string,
  config: Partial<Omit<TenantLeadLimitConfig, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId) return { success: false, error: 'tenantId inválido' };
  try {
    const { error } = await (supabase as any)
      .from('tenant_lead_limit_config')
      .upsert({ tenant_id: tenantId, ...config }, { onConflict: 'tenant_id' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}

// ============================================================
// Contagem de leads por corretor (tenant-scoped)
// ============================================================

export async function getBrokerLeadCounts(
  tenantId: string,
  agentId: string,
  pendingStatuses: string[]
): Promise<BrokerLeadCounts> {
  if (!tenantId || !agentId) {
    return { active_leads: 0, pending_response_leads: 0 };
  }

  try {
    // Total de leads ativos (excluindo arquivados)
    const { count: activeCount } = await (supabase as any)
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('assigned_agent_id', agentId)
      .neq('status', 'Arquivado');

    // Leads com resposta pendente (status dentro dos pendingStatuses configurados)
    let pendingCount = 0;
    if (pendingStatuses.length > 0) {
      const { count } = await (supabase as any)
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_agent_id', agentId)
        .in('status', pendingStatuses);
      pendingCount = count ?? 0;
    }

    return {
      active_leads: activeCount ?? 0,
      pending_response_leads: pendingCount,
    };
  } catch (e) {
    console.error('[LeadLimit] Erro ao contar leads:', e);
    return { active_leads: 0, pending_response_leads: 0 };
  }
}

// ============================================================
// Verificação de elegibilidade
// ============================================================

export async function checkBrokerEligibility(
  tenantId: string,
  agentId: string,
  config: TenantLeadLimitConfig,
  override?: BrokerLeadLimitOverride
): Promise<BrokerEligibility> {
  // Se o override desabilita recebimento automático
  if (override?.receives_auto_leads === false) {
    return {
      eligible: false,
      status: 'disabled',
      active_leads: 0,
      pending_response_leads: 0,
      max_active: config.max_active_leads_per_broker,
      max_pending: config.max_pending_response_leads_per_broker,
      block_reason: 'Recebimento automático desativado para este corretor',
    };
  }

  // Se o corretor está isento de limite
  if (override?.limit_exempt === true) {
    return {
      eligible: true,
      status: 'exempt',
      active_leads: 0,
      pending_response_leads: 0,
      max_active: config.max_active_leads_per_broker,
      max_pending: config.max_pending_response_leads_per_broker,
    };
  }

  // Se o limite não está habilitado (nem globalmente, nem por override)
  const effectiveEnabled =
    override?.lead_limit_enabled !== undefined
      ? override.lead_limit_enabled
      : config.lead_limit_enabled;

  if (!effectiveEnabled) {
    return {
      eligible: true,
      status: 'ok',
      active_leads: 0,
      pending_response_leads: 0,
      max_active: config.max_active_leads_per_broker,
      max_pending: config.max_pending_response_leads_per_broker,
    };
  }

  // Limites efetivos (override tem prioridade sobre global)
  const maxActive =
    override?.custom_max_active_leads != null
      ? override.custom_max_active_leads
      : config.max_active_leads_per_broker;

  const maxPending =
    override?.custom_max_pending_response_leads != null
      ? override.custom_max_pending_response_leads
      : config.max_pending_response_leads_per_broker;

  const counts = await getBrokerLeadCounts(tenantId, agentId, config.pending_statuses);

  const { active_leads, pending_response_leads } = counts;
  const { blocking_mode } = config;

  const carteiraBloqueada = active_leads >= maxActive;
  const pendenciaBloqueada = pending_response_leads >= maxPending;

  let status: BrokerStatus = 'ok';
  let eligible = true;
  let block_reason: string | undefined;

  if (blocking_mode === 'both') {
    if (carteiraBloqueada && pendenciaBloqueada) {
      status = 'blocked_both';
      eligible = false;
      block_reason = `Carteira (${active_leads}/${maxActive}) e pendências (${pending_response_leads}/${maxPending}) no limite`;
    } else if (carteiraBloqueada) {
      status = 'blocked_carteira';
      eligible = false;
      block_reason = `Carteira no limite (${active_leads}/${maxActive} leads)`;
    } else if (pendenciaBloqueada) {
      status = 'blocked_pendencia';
      eligible = false;
      block_reason = `Muitas pendências (${pending_response_leads}/${maxPending} leads)`;
    }
  } else if (blocking_mode === 'carteira') {
    if (carteiraBloqueada) {
      status = 'blocked_carteira';
      eligible = false;
      block_reason = `Carteira no limite (${active_leads}/${maxActive} leads)`;
    }
  } else if (blocking_mode === 'pendencia') {
    if (pendenciaBloqueada) {
      status = 'blocked_pendencia';
      eligible = false;
      block_reason = `Muitas pendências (${pending_response_leads}/${maxPending} leads)`;
    }
  }

  // Verificar aviso (warning)
  if (eligible && status === 'ok') {
    const threshold = config.warning_threshold_percent / 100;
    const carteiraWarning = maxActive > 0 && active_leads / maxActive >= threshold;
    const pendenciaWarning = maxPending > 0 && pending_response_leads / maxPending >= threshold;
    if (carteiraWarning || pendenciaWarning) {
      status = 'warning';
    }
  }

  return {
    eligible,
    status,
    active_leads,
    pending_response_leads,
    max_active: maxActive,
    max_pending: maxPending,
    block_reason,
  };
}

// ============================================================
// Batch: conta leads de todos os corretores em 2 queries
// ============================================================

export async function getBrokerLeadCountsBatch(
  tenantId: string,
  pendingStatuses: string[]
): Promise<Record<string, BrokerLeadCounts>> {
  if (!tenantId) return {};
  try {
    const [activeRes, pendingRes] = await Promise.all([
      (supabase as any)
        .from('leads')
        .select('assigned_agent_id')
        .eq('tenant_id', tenantId)
        .neq('status', 'Arquivado')
        .not('assigned_agent_id', 'is', null),
      pendingStatuses.length > 0
        ? (supabase as any)
            .from('leads')
            .select('assigned_agent_id')
            .eq('tenant_id', tenantId)
            .in('status', pendingStatuses)
            .not('assigned_agent_id', 'is', null)
        : Promise.resolve({ data: [] }),
    ]);

    const result: Record<string, BrokerLeadCounts> = {};

    (activeRes.data || []).forEach((row: any) => {
      const id = row.assigned_agent_id;
      if (!result[id]) result[id] = { active_leads: 0, pending_response_leads: 0 };
      result[id].active_leads++;
    });

    (pendingRes.data || []).forEach((row: any) => {
      const id = row.assigned_agent_id;
      if (!result[id]) result[id] = { active_leads: 0, pending_response_leads: 0 };
      result[id].pending_response_leads++;
    });

    return result;
  } catch (e) {
    console.error('[LeadLimit] Erro no batch de contagem:', e);
    return {};
  }
}

// ============================================================
// Helpers de exibição
// ============================================================

export function getBrokerStatusLabel(status: BrokerStatus): string {
  switch (status) {
    case 'ok': return 'Disponível';
    case 'warning': return 'Próximo do limite';
    case 'blocked_carteira': return 'Carteira cheia';
    case 'blocked_pendencia': return 'Pendências em excesso';
    case 'blocked_both': return 'Bloqueado';
    case 'disabled': return 'Pausado';
    case 'exempt': return 'Sem limite';
    default: return 'Disponível';
  }
}

export function getBrokerStatusColor(status: BrokerStatus): string {
  switch (status) {
    case 'ok': return 'text-green-700 bg-green-50 border-green-200';
    case 'warning': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    case 'blocked_carteira':
    case 'blocked_pendencia':
    case 'blocked_both': return 'text-red-700 bg-red-50 border-red-200';
    case 'disabled': return 'text-gray-600 bg-gray-50 border-gray-200';
    case 'exempt': return 'text-blue-700 bg-blue-50 border-blue-200';
    default: return 'text-green-700 bg-green-50 border-green-200';
  }
}
