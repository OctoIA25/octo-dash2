/**
 * Plantão da LIA (P2.4).
 *
 * Tudo passa por função do banco, e não por SELECT: `lia_perguntas_corretor`
 * carrega telefone de cliente e foi fechada para `authenticated` em 18/09
 * (migration 20260918_rls_fecha_tabelas_lia). O navegador não lê a tabela —
 * lê `plantao_fila`, que confere a pertinência e devolve só as colunas da tela.
 */

import { supabase } from '@/lib/supabaseClient';
import type { PerguntaDoPlantao } from '../utils/plantao';

export type AbaDoPlantao = 'aguardando' | 'respondidas' | 'mais';

export interface ContadoresDoPlantao {
  aguardando: number;
  respondidas: number;
  expiradas: number;
  na_janela: number;
  por_aprender: number;
  sem_empreendimento: number;
}

export interface FilaDoPlantao {
  aba: string;
  espera_maxima_minutos: number;
  destino: DestinoDoPlantao;
  plantonista_id: string | null;
  /** false = ninguém configurou ainda; a tela mostra o padrão como padrão. */
  configurado: boolean;
  dias: number;
  contadores: ContadoresDoPlantao;
  linhas: PerguntaDoPlantao[];
}

export type DestinoDoPlantao = 'corretor_do_lead' | 'lider_da_equipe' | 'plantonista';

export const DESTINOS: Array<{ valor: DestinoDoPlantao; rotulo: string; ajuda: string }> = [
  { valor: 'corretor_do_lead', rotulo: 'O corretor do lead', ajuda: 'Quem já atende aquele cliente responde.' },
  { valor: 'lider_da_equipe', rotulo: 'O líder da equipe', ajuda: 'Concentra no líder, que repassa.' },
  { valor: 'plantonista', rotulo: 'Um plantonista fixo', ajuda: 'Sempre a mesma pessoa, independente do lead.' },
];

export interface ReguaDoPlantao {
  minutos: number;
  dias: number;
  respondidas: number;
  dentro_do_prazo: number;
  /** null = não houve plantão respondido no período. Não é zero por cento. */
  pct_dentro: number | null;
  mediana_minutos: number | null;
}

/**
 * A aba "Mais perguntadas" precisa de TODAS as perguntas da janela para
 * agrupar; as outras duas só das suas. Por isso `aba` vira 'todas' no banco.
 */
export async function carregarFila(
  tenantId: string,
  aba: AbaDoPlantao,
  dias = 90
): Promise<FilaDoPlantao | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('plantao_fila', {
    p_tenant_id: tenantId,
    p_aba: aba === 'mais' ? 'todas' : aba,
    p_limite: aba === 'mais' ? 500 : 200,
    p_dias: dias,
  });
  // Erro não vira fila vazia: a tela diria "nenhuma pergunta" onde houve falha.
  if (error) throw error;
  return (data as FilaDoPlantao) ?? null;
}

export async function simularRegua(
  tenantId: string,
  minutos: number,
  dias = 90
): Promise<ReguaDoPlantao | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('plantao_regua', {
    p_tenant_id: tenantId,
    p_minutos: minutos,
    p_dias: dias,
  });
  if (error) throw error;
  return (data as ReguaDoPlantao) ?? null;
}

export interface ResultadoDeSalvar {
  ok: boolean;
  documento_id?: string;
  ja_existia?: boolean;
  geral?: boolean;
  motivo?: string;
}

/**
 * Salva a resposta na base. Documento, trecho e marcação numa transação só —
 * ver `plantao_salvar_na_base`. O trecho entra já buscável, sem esperar a LIA
 * indexar: é o que fecha o ciclo do plano no mesmo dia.
 */
export async function salvarNaBase(
  perguntaId: string,
  titulo: string,
  conteudo: string,
  validoAte?: string | null
): Promise<ResultadoDeSalvar> {
  const { data, error } = await supabase.rpc('plantao_salvar_na_base', {
    p_pergunta_id: perguntaId,
    p_titulo: titulo,
    p_conteudo: conteudo,
    p_valido_ate: validoAte || null,
  });
  if (error) throw error;
  return (data as ResultadoDeSalvar) ?? { ok: false, motivo: 'sem_resposta' };
}

export interface ConfigDoPlantao {
  espera_maxima_minutos: number;
  destino: DestinoDoPlantao;
  plantonista_id: string | null;
}

/** O padrão do plano: 30 minutos, para o corretor do lead. */
export const CONFIG_PADRAO: ConfigDoPlantao = {
  espera_maxima_minutos: 30,
  destino: 'corretor_do_lead',
  plantonista_id: null,
};

export async function carregarConfig(tenantId: string): Promise<ConfigDoPlantao> {
  if (!tenantId || tenantId === 'owner') return CONFIG_PADRAO;
  const { data, error } = await supabase
    .from('tenant_plantao_config')
    .select('espera_maxima_minutos, destino, plantonista_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConfigDoPlantao) ?? CONFIG_PADRAO;
}

export async function salvarConfig(tenantId: string, cfg: ConfigDoPlantao): Promise<void> {
  if (!tenantId || tenantId === 'owner') throw new Error('sem imobiliária');
  const { error } = await supabase.from('tenant_plantao_config').upsert(
    {
      tenant_id: tenantId,
      espera_maxima_minutos: cfg.espera_maxima_minutos,
      destino: cfg.destino,
      // Plantonista só faz sentido quando o destino é ele; guardar o resto
      // deixaria uma pessoa apontada para um destino que ninguém usa.
      plantonista_id: cfg.destino === 'plantonista' ? cfg.plantonista_id : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' }
  );
  if (error) throw error;
}
