/**
 * Agenda da LIA (P2.5).
 *
 * Lê por função do banco, e não por SELECT: `lia_followups` foi revogada de
 * `authenticated` em 18/09 porque `motivo` e `message_sent` carregam texto de
 * conversa com o cliente.
 *
 * Esta é a visão de GESTÃO, do tenant inteiro. O que o corretor vê do SEU lead
 * continua vindo de `GET /api/v1/leads/:leadId/cadencia`, que tem a sua própria
 * regra de quem enxerga o quê.
 */

import { supabase } from '@/lib/supabaseClient';

export type AbaDaAgenda = 'hoje' | 'a_cumprir' | 'pedidos_pelo_lead' | 'atrasados' | 'nao_sairam';

export type QuemPediu = 'lead' | 'lia' | 'corretor';

export interface LinhaDaAgenda {
  id: string;
  lead_id: string | null;
  lead_nome: string | null;
  quando: string;
  motivo: string | null;
  tag: string | null;
  status: string;
  pedido_por: QuemPediu;
  tentativas: number;
  enviado_em: string | null;
  canal: string | null;
  template: string | null;
  erro: string | null;
  /** O disparador antigo escrevia a falha aqui; linha velha só tem isto. */
  cancelado_por: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
}

export interface ContadoresDaAgenda {
  hoje: number;
  a_cumprir: number;
  pedidos_pelo_lead: number;
  atrasados: number;
  nao_sairam: number;
  na_janela: number;
}

export interface Agenda {
  aba: string;
  dias: number;
  pode_falar_das: string;
  pode_falar_ate: string;
  dias_permitidos: number[];
  /** false = ninguém configurou; a tela mostra o padrão como padrão. */
  configurado: boolean;
  contadores: ContadoresDaAgenda;
  linhas: LinhaDaAgenda[];
}

export async function carregarAgenda(
  tenantId: string,
  aba: AbaDaAgenda,
  dias = 30
): Promise<Agenda | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('agenda_lia_fila', {
    p_tenant_id: tenantId,
    p_aba: aba,
    p_limite: 200,
    p_dias: dias,
  });
  // Erro não vira agenda vazia: a tela diria "nada agendado" onde houve falha.
  if (error) throw error;
  return (data as Agenda) ?? null;
}

export interface ConfigDaAgenda {
  pode_falar_das: string;
  pode_falar_ate: string;
  dias_permitidos: number[];
}

/** O que o plano pede: não incomodar antes das 9h nem depois das 20h. */
export const CONFIG_PADRAO: ConfigDaAgenda = {
  pode_falar_das: '09:00',
  pode_falar_ate: '20:00',
  dias_permitidos: [0, 1, 2, 3, 4, 5, 6],
};

export const NOMES_DOS_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export async function carregarConfig(tenantId: string): Promise<ConfigDaAgenda> {
  if (!tenantId || tenantId === 'owner') return CONFIG_PADRAO;
  const { data, error } = await supabase
    .from('tenant_agenda_lia_config')
    .select('pode_falar_das, pode_falar_ate, dias_permitidos')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return CONFIG_PADRAO;
  return {
    // O Postgres devolve `time` como "09:00:00"; o <input type="time"> quer "09:00".
    pode_falar_das: String(data.pode_falar_das).slice(0, 5),
    pode_falar_ate: String(data.pode_falar_ate).slice(0, 5),
    dias_permitidos: data.dias_permitidos ?? CONFIG_PADRAO.dias_permitidos,
  };
}

export async function salvarConfig(tenantId: string, cfg: ConfigDaAgenda): Promise<void> {
  if (!tenantId || tenantId === 'owner') throw new Error('sem imobiliária');
  const { error } = await supabase.from('tenant_agenda_lia_config').upsert(
    {
      tenant_id: tenantId,
      pode_falar_das: cfg.pode_falar_das,
      pode_falar_ate: cfg.pode_falar_ate,
      dias_permitidos: cfg.dias_permitidos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' }
  );
  if (error) throw error;
}
