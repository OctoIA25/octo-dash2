import { supabase } from '@/lib/supabaseClient';

export interface HorarioDiaConfig {
  ativo: boolean;
  inicio: string;
  termino: string;
}

export type TeamQueueOrder = 'random' | 'linear' | 'balanced';

export interface TenantBolsaoConfig {
  tempoExpiracaoExclusivo: number;
  tempoExpiracaoNaoExclusivo: number;
  intervaloVerificacao: number;
  notificarExpiracao: boolean;
  autoRefresh: boolean;
  intervaloAutoRefresh: number;
  disponibilidadeLead: 'todos' | 'equipe';
  roletaEnabled: boolean;
  teamQueueEnabled: boolean;
  teamQueueOrder: TeamQueueOrder;
  horarioFuncionamento: {
    segunda: HorarioDiaConfig;
    terca: HorarioDiaConfig;
    quarta: HorarioDiaConfig;
    quinta: HorarioDiaConfig;
    sexta: HorarioDiaConfig;
    sabado: HorarioDiaConfig;
    domingo: HorarioDiaConfig;
  };
}

export const DEFAULT_BOLSAO_CONFIG: TenantBolsaoConfig = {
  tempoExpiracaoExclusivo: 60,
  tempoExpiracaoNaoExclusivo: 60,
  intervaloVerificacao: 60,
  notificarExpiracao: true,
  autoRefresh: true,
  intervaloAutoRefresh: 30,
  disponibilidadeLead: 'todos',
  roletaEnabled: true,
  teamQueueEnabled: false,
  teamQueueOrder: 'balanced' as TeamQueueOrder,
  horarioFuncionamento: {
    segunda: { ativo: true, inicio: '09:00', termino: '18:00' },
    terca: { ativo: true, inicio: '09:00', termino: '18:00' },
    quarta: { ativo: true, inicio: '09:00', termino: '18:00' },
    quinta: { ativo: true, inicio: '09:00', termino: '18:00' },
    sexta: { ativo: true, inicio: '09:00', termino: '18:00' },
    sabado: { ativo: true, inicio: '09:00', termino: '13:00' },
    domingo: { ativo: false, inicio: '09:00', termino: '18:00' }
  }
};

const STORAGE_KEY = 'bolsao-config';

const normalizeConfig = (value: Partial<TenantBolsaoConfig> | null | undefined): TenantBolsaoConfig => ({
  ...DEFAULT_BOLSAO_CONFIG,
  ...value,
  horarioFuncionamento: {
    ...DEFAULT_BOLSAO_CONFIG.horarioFuncionamento,
    ...(value?.horarioFuncionamento || {})
  }
});

export const getLocalBolsaoConfig = (): TenantBolsaoConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BOLSAO_CONFIG;
    return normalizeConfig(JSON.parse(raw) as Partial<TenantBolsaoConfig>);
  } catch {
    return DEFAULT_BOLSAO_CONFIG;
  }
};

export const saveLocalBolsaoConfig = (config: TenantBolsaoConfig) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export async function fetchTenantBolsaoConfig(tenantId: string): Promise<TenantBolsaoConfig> {
  if (!tenantId || tenantId === 'owner') {
    return getLocalBolsaoConfig();
  }

  const { data, error } = await supabase
    .from('tenant_bolsao_config')
    .select('tempo_expiracao_exclusivo, tempo_expiracao_nao_exclusivo, intervalo_verificacao, notificar_expiracao, auto_refresh, intervalo_auto_refresh, disponibilidade_lead, horario_funcionamento, team_queue_enabled, team_queue_order, roleta_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    console.warn('⚠️ Erro ao buscar config do bolsão no Supabase:', error.message);
    return getLocalBolsaoConfig();
  }

  const config = normalizeConfig(data ? {
    tempoExpiracaoExclusivo: data.tempo_expiracao_exclusivo,
    tempoExpiracaoNaoExclusivo: data.tempo_expiracao_nao_exclusivo,
    intervaloVerificacao: data.intervalo_verificacao,
    notificarExpiracao: data.notificar_expiracao,
    autoRefresh: data.auto_refresh,
    intervaloAutoRefresh: data.intervalo_auto_refresh,
    disponibilidadeLead: data.disponibilidade_lead,
    roletaEnabled: (data as any).roleta_enabled ?? true,
    teamQueueEnabled: data.team_queue_enabled ?? false,
    teamQueueOrder: (data.team_queue_order as TeamQueueOrder) ?? 'balanced',
    horarioFuncionamento: data.horario_funcionamento
  } : null);

  saveLocalBolsaoConfig(config);
  return config;
}

export async function saveTenantBolsaoConfig(tenantId: string, config: TenantBolsaoConfig): Promise<void> {
  saveLocalBolsaoConfig(config);

  if (!tenantId || tenantId === 'owner') {
    return;
  }

  const { error } = await supabase
    .from('tenant_bolsao_config')
    .upsert({
      tenant_id: tenantId,
      tempo_expiracao_exclusivo: config.tempoExpiracaoExclusivo,
      tempo_expiracao_nao_exclusivo: config.tempoExpiracaoNaoExclusivo,
      intervalo_verificacao: config.intervaloVerificacao,
      notificar_expiracao: config.notificarExpiracao,
      auto_refresh: config.autoRefresh,
      intervalo_auto_refresh: config.intervaloAutoRefresh,
      disponibilidade_lead: config.disponibilidadeLead,
      roleta_enabled: config.roletaEnabled,
      team_queue_enabled: config.teamQueueEnabled,
      team_queue_order: config.teamQueueOrder,
      horario_funcionamento: config.horarioFuncionamento
    }, { onConflict: 'tenant_id' });

  if (error) {
    throw error;
  }
}
