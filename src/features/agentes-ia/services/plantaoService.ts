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
  /**
   * Perguntas do período que ficaram de fora porque não dá para dizer de
   * quem são — `corretor_id` nulo, ou com um nome no lugar do id. Zero para
   * quem vê a imobiliária inteira: nada lhe foi escondido.
   */
  sem_dono_oculto: number;
  /** Esperando além da régua agora (pendentes e expiradas). */
  atrasadas: number;
  /** Mediana, em minutos, de quanto levou para responder. null = nada respondido no período. */
  mediana_resposta_min: number | null;
}

/** Uma área que a pessoa pode filtrar, com o total do período ANTES do filtro. */
export interface AreaDoPlantao {
  /** Id da equipe, ou 'sem_equipe'. */
  id: string;
  nome: string | null;
  total: number;
  pendentes: number;
}

/** O que a tela pede além da aba. Datas de São Paulo, as duas inclusivas. */
export interface FiltroDoPlantao {
  de: string;
  ate: string;
  /** null = todas as áreas que a pessoa enxerga. */
  equipe: string | null;
}

export interface FilaDoPlantao {
  aba: string;
  espera_maxima_minutos: number;
  destino: DestinoDoPlantao;
  plantonista_id: string | null;
  /** false = ninguém configurou ainda; a tela mostra o padrão como padrão. */
  configurado: boolean;
  dias: number;
  /** Até onde a pessoa enxerga. A tela diz isso em vez de deixar a lista curta sem explicação. */
  recorte: 'imobiliaria' | 'equipe' | 'proprias';
  ve_tudo: boolean;
  contadores: ContadoresDoPlantao;
  equipes: AreaDoPlantao[];
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
  filtro: FiltroDoPlantao
): Promise<FilaDoPlantao | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('plantao_fila', {
    p_tenant_id: tenantId,
    p_aba: aba === 'mais' ? 'todas' : aba,
    p_limite: aba === 'mais' ? 500 : 200,
    p_de: filtro.de,
    p_ate: filtro.ate,
    p_equipe: filtro.equipe,
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

/**
 * Responder uma pergunta do plantão PELA DASH.
 *
 * Até 26/09 não existia: a tela mostrava a pergunta e não havia como
 * responder — quem respondia era o corretor no WhatsApp. A LIA pediu o evento
 * `plantao.respondida` com `origem: "dash"`, e o evento não tinha fonte.
 *
 * A RPC grava a resposta E enfileira o aviso na MESMA transação: se saísse de
 * fora, uma falha no meio deixaria a pergunta respondida na tela e o lead sem
 * resposta nenhuma.
 */
export interface ResultadoDeResponder {
  ok: boolean;
  motivo?: 'pergunta_nao_encontrada' | 'sem_acesso' | 'resposta_vazia' | 'ja_respondida';
  /** Quando `ja_respondida`: o que já estava lá, para a tela poder mostrar. */
  resposta?: string;
  respondida_em?: string;
  por?: string;
}

export async function responderPergunta(
  perguntaId: string,
  resposta: string,
): Promise<ResultadoDeResponder> {
  const { data, error } = await supabase.rpc('plantao_responder', {
    p_pergunta_id: perguntaId,
    p_resposta: resposta,
  });
  if (error) throw error;
  return (data as ResultadoDeResponder) ?? { ok: false, motivo: 'sem_acesso' };
}

export interface ConfigDoPlantao {
  espera_maxima_minutos: number;
  destino: DestinoDoPlantao;
  plantonista_id: string | null;
  /**
   * Perguntas de LANÇAMENTO (28/09): quem responde, depois de quantas horas o
   * diretor é avisado, e quem é o diretor. Vazio = segue o `destino` e não escala.
   */
  lancamento_responsavel_id: string | null;
  lancamento_escala_horas: number;
  lancamento_escala_para_id: string | null;
}

/** O padrão do plano: 30 minutos, para o corretor do lead. */
export const CONFIG_PADRAO: ConfigDoPlantao = {
  espera_maxima_minutos: 30,
  destino: 'corretor_do_lead',
  plantonista_id: null,
  lancamento_responsavel_id: null,
  lancamento_escala_horas: 24,
  lancamento_escala_para_id: null,
};

export async function carregarConfig(tenantId: string): Promise<ConfigDoPlantao> {
  if (!tenantId || tenantId === 'owner') return CONFIG_PADRAO;
  const { data, error } = await supabase
    .from('tenant_plantao_config')
    .select('espera_maxima_minutos, destino, plantonista_id, lancamento_responsavel_id, lancamento_escala_horas, lancamento_escala_para_id')
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
      lancamento_responsavel_id: cfg.lancamento_responsavel_id,
      lancamento_escala_horas: cfg.lancamento_escala_horas,
      lancamento_escala_para_id: cfg.lancamento_escala_para_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' }
  );
  if (error) throw error;
}
