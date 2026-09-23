/**
 * Formulários da Meta (P2.7).
 *
 * Os interruptores de captação e LIA são gravados direto na tabela — a RLS já
 * exige gestão. O que fala com a Meta (listar formulários, baixar histórico)
 * passa pelo servidor: é lá que mora o token da integração, e ele nunca desce
 * para o navegador.
 */

import { supabase } from '@/lib/supabaseClient';

export interface FormularioDaMeta {
  form_id: string;
  nome: string | null;
  page_id: string | null;
  captacao_ativa: boolean;
  lia_atende: boolean;
  baixado_ate: string | null;
  sincronizado_em: string | null;
  leads_na_base: number;
  novos_24h: number;
  /** Quantos leads deste formulário entraram sem campanha — o "Baixar" fecha. */
  sem_campanha: number;
  ultimo_lead_em: string | null;
  empreendimento_codigo: string | null;
  destino: 'lancamento' | 'pega_tudo';

  /**
   * O `leads_count` da Meta. É o total da VIDA INTEIRA do formulário, não do
   * período — comparar sem lembrar disso acusa perda onde há só história
   * anterior à integração. `null` = este formulário nunca foi sincronizado.
   */
  leads_na_meta: number | null;
  /** Quando esse número foi lido. Sem ele, um número velho tem cara de novo. */
  leads_na_meta_em: string | null;
  /** ACTIVE, PAUSED, ARCHIVED… na Meta. Também vinha e era descartado. */
  status_na_meta: string | null;
  /** Meta menos Dash, nos DOIS sentidos. `null` = não foi perguntado. */
  diferenca: number | null;

  /** Eventos que a Meta mandou e falharam ao virar lead. */
  eventos_travados: number;
  /** Eventos parados na fila há mais de uma hora. */
  eventos_parados: number;
  ultimo_erro: string | null;
}

export interface ContadoresDaMeta {
  formularios: number;
  captando: number;
  lia_atende: number;
  sem_direcionamento: number;
  leads_na_base: number;
  novos_24h: number;
  sem_campanha: number;
  sincronizado_em: string | null;

  /** O lado da Meta, somando só os formulários já perguntados. */
  leads_na_meta: number;
  formularios_conferidos: number;
  conferido_em: string | null;

  /** O alerta: a Meta avisou e o lead não chegou a existir. */
  eventos_travados: number;
  eventos_parados: number;

  /**
   * Campanhas dos últimos 30 dias que entregam por CONVERSA, não por
   * formulário. Esta tela não as enxerga — e precisa dizer isso.
   */
  campanhas_sem_formulario: number;
}

export interface PainelDaMeta {
  linhas: FormularioDaMeta[];
  contadores: ContadoresDaMeta;
}

export async function carregarPainel(tenantId: string): Promise<PainelDaMeta | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('meta_formularios_painel', { p_tenant_id: tenantId });
  // Erro não vira painel vazio: a tela diria "nenhum formulário" onde houve falha.
  if (error) throw error;
  return (data as PainelDaMeta) ?? null;
}

/**
 * Liga ou desliga um interruptor.
 *
 * Grava só o campo mexido: mandar a linha inteira sobrescreveria o outro
 * interruptor com o valor que a tela tinha em mãos, que pode estar velho se
 * alguém mexeu em outra aba.
 */
export async function alternar(
  tenantId: string,
  formIds: string[],
  campo: 'captacao_ativa' | 'lia_atende',
  valor: boolean
): Promise<void> {
  if (!tenantId || formIds.length === 0) return;
  const { error } = await supabase
    .from('meta_formularios')
    .update({ [campo]: valor, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .in('form_id', formIds);
  if (error) throw error;
}

async function chamarServidor<T>(caminho: string, corpo: Record<string, unknown>): Promise<T> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error('sessão expirada');
  const r = await fetch(caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  const json = await r.json();
  if (!r.ok || !json?.ok) throw new Error(json?.error ?? `falhou (${r.status})`);
  return json as T;
}

export function sincronizar(tenantId: string): Promise<{ formularios: number }> {
  return chamarServidor('/api/v1/meta/formularios/sincronizar', { tenantId });
}

export interface RelatorioDeDownload {
  encontrados: number;
  criados: number;
  completados: number;
  ja_tinham: number;
  falhas: Array<{ leadgen_id: string; erro: string }>;
}

export function baixarLeads(
  tenantId: string,
  formId: string,
  tudo = false
): Promise<RelatorioDeDownload> {
  return chamarServidor('/api/v1/meta/formularios/baixar', { tenantId, formId, tudo });
}
