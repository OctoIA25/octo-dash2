/**
 * Leitura e escrita da planilha de forecast.
 *
 * As linhas são as propostas fora de 'arquivado' — `tg_mirror_lead_to_proposal`
 * já materializa toda negociação/proposta do CRM em `proposals`. Este serviço
 * só junta o lead e devolve a linha pronta.
 *
 * O corte por papel NÃO é feito aqui: a policy de SELECT de `proposals`
 * (20260602_proposals_restrict_corretor_read) já devolve o tenant inteiro para
 * gestor e só as próprias para corretor. Repetir o filtro no front criaria uma
 * segunda fonte de verdade discordando do banco.
 */

import { supabase } from '@/lib/supabaseClient';
import {
  toForecastRow,
  type ForecastLeadRow,
  type ForecastProposalRow,
  type ForecastRow,
} from '../utils/forecastRow';

/**
 * ponytail: teto explícito. O PostgREST corta em 1000 SEM erro, então sem
 * `.limit()` a lista mentiria em silêncio. Se um tenant chegar aqui, o caminho
 * é paginar — não aumentar o número.
 */
const MAX_LINHAS = 1000;

/** Tamanho do lote do `.in()` de leads: evita URL gigante no PostgREST. */
const LOTE_LEADS = 200;

const PROPOSAL_COLUMNS =
  'id, lead_id, stage_id, agent_name, property_reference, value, updated_at, ' +
  'forecast_empreendimento, forecast_unidade, forecast_previsao, forecast_estado, ' +
  'parties:proposal_parties(party_type, full_name)';

const LEAD_COLUMNS = 'id, name, assigned_at, created_at, updated_at, classification';

/** Detalha o erro do PostgREST: `.message` costuma vir vazio (ex.: 42703). */
function erroSupabase(contexto: string, error: unknown): Error {
  const e = (error || {}) as { message?: string; code?: string; details?: string; hint?: string };
  console.error(`[forecast] ${contexto}`, {
    code: e.code,
    message: e.message,
    details: e.details,
    hint: e.hint,
  });
  return new Error(e.message || e.details || `${contexto} (code ${e.code || 'desconhecido'})`);
}

async function fetchLeadsPorId(ids: string[]): Promise<Map<string, ForecastLeadRow>> {
  const mapa = new Map<string, ForecastLeadRow>();
  if (ids.length === 0) return mapa;

  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += LOTE_LEADS) {
    lotes.push(ids.slice(i, i + LOTE_LEADS));
  }

  const resultados = await Promise.all(
    lotes.map((lote) => supabase.from('leads').select(LEAD_COLUMNS).in('id', lote)),
  );

  for (const { data, error } of resultados) {
    if (error) throw erroSupabase('falha ao buscar leads do forecast', error);
    for (const lead of (data || []) as ForecastLeadRow[]) {
      mapa.set(lead.id, lead);
    }
  }

  return mapa;
}

export async function fetchForecast(tenantId: string): Promise<ForecastRow[]> {
  if (!tenantId || tenantId === 'owner') return [];

  const { data, error } = await supabase
    .from('proposals')
    .select(PROPOSAL_COLUMNS)
    .eq('tenant_id', tenantId)
    .neq('stage_id', 'arquivado')
    // Tiradas da planilha pelo corretor/gestor (20260825_proposals_forecast_oculto).
    .eq('forecast_oculto', false)
    .order('updated_at', { ascending: false })
    .limit(MAX_LINHAS);

  if (error) throw erroSupabase('falha ao buscar propostas do forecast', error);

  const propostas = (data || []) as unknown as ForecastProposalRow[];
  if (propostas.length === MAX_LINHAS) {
    console.warn(
      `[forecast] teto de ${MAX_LINHAS} linhas atingido — a lista pode estar truncada.`,
    );
  }

  const leadIds = [...new Set(propostas.map((p) => p.lead_id).filter((id): id is string => !!id))];
  const leads = await fetchLeadsPorId(leadIds);

  return propostas.map((p) => toForecastRow(p, (p.lead_id && leads.get(p.lead_id)) || null));
}

/** Os quatro campos que a planilha grava. Ver spec 2026-08-20. */
export interface ForecastPatch {
  empreendimento?: string;
  unidade?: string;
  previsaoFechamento?: string;
  estadoAtual?: string;
}

/** Campo em branco volta a ser NULL: "vazio" tem uma representação só. */
const ouNulo = (valor: string | undefined): string | null => {
  const limpo = (valor ?? '').trim();
  return limpo === '' ? null : limpo;
};

export async function updateForecast(proposalId: string, patch: ForecastPatch): Promise<void> {
  const linha: Record<string, string | null> = {};
  if ('empreendimento' in patch) linha.forecast_empreendimento = ouNulo(patch.empreendimento);
  if ('unidade' in patch) linha.forecast_unidade = ouNulo(patch.unidade);
  if ('previsaoFechamento' in patch) linha.forecast_previsao = ouNulo(patch.previsaoFechamento);
  if ('estadoAtual' in patch) linha.forecast_estado = ouNulo(patch.estadoAtual);

  if (Object.keys(linha).length === 0) return;

  const { error } = await supabase.from('proposals').update(linha).eq('id', proposalId);

  // Sem catch silencioso: se o UPDATE falhar, quem chama precisa avisar o
  // usuário — senão o campo volta ao valor antigo no próximo refetch e ninguém
  // entende por quê.
  if (error) throw erroSupabase('falha ao salvar campo do forecast', error);
}

// ---------------------------------------------------------------------------
// Colocar / tirar leads da planilha (20260825_proposals_forecast_oculto).
// ---------------------------------------------------------------------------

/** Lead candidato a entrar no forecast — o que o seletor mostra e o INSERT usa. */
export interface LeadParaForecast {
  id: string;
  name: string | null;
  phone: string | null;
  property_code: string | null;
  property_value: number | string | null;
  final_sale_value: number | string | null;
  assigned_agent_name: string | null;
}

/**
 * Busca leads ativos pelo nome, para o seletor de "colocar no forecast".
 * `apenasDoCorretor` repete no front o recorte que o corretor já tem no CRM —
 * o RLS de `leads` não recorta por usuário (limitação conhecida), então sem
 * este filtro o seletor ofereceria leads de colegas.
 */
export async function searchLeadsParaForecast(
  tenantId: string,
  termo: string,
  apenasDoCorretor: string | null,
): Promise<LeadParaForecast[]> {
  let query = supabase
    .from('leads')
    .select('id, name, phone, property_code, property_value, final_sale_value, assigned_agent_name')
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .ilike('name', `%${termo.trim()}%`)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (apenasDoCorretor) query = query.eq('assigned_agent_id', apenasDoCorretor);

  const { data, error } = await query;
  if (error) throw erroSupabase('falha ao buscar leads para o forecast', error);
  return (data || []) as LeadParaForecast[];
}

/**
 * Coloca um lead no forecast.
 *
 * Se o lead já tem proposta-espelho, basta desocultá-la (e, se ela estava
 * 'arquivado' de um arquivamento antigo, volta para 'negociacao' — senão o
 * clique "funciona" e a linha não aparece). Se não tem, cria a proposta com o
 * mesmo shape que `tg_mirror_lead_to_proposal` criaria quando o lead virasse
 * negócio: o trigger encontra a linha depois (source='crm') e passa a governar
 * a etapa normalmente.
 */
export async function addLeadToForecast(tenantId: string, lead: LeadParaForecast): Promise<void> {
  const { data: existente, error: erroBusca } = await supabase
    .from('proposals')
    .select('id, stage_id, forecast_oculto')
    .eq('tenant_id', tenantId)
    .eq('lead_id', lead.id)
    .maybeSingle();

  if (erroBusca) throw erroSupabase('falha ao verificar proposta do lead', erroBusca);

  if (existente) {
    const patch: Record<string, unknown> = { forecast_oculto: false };
    if (existente.stage_id === 'arquivado') patch.stage_id = 'negociacao';

    const { data, error } = await supabase
      .from('proposals')
      .update(patch)
      .eq('id', existente.id)
      .select('id');

    if (error) throw erroSupabase('falha ao recolocar lead no forecast', error);
    // RLS pode negar o UPDATE sem erro (0 linhas). Sem este throw o usuário
    // clica, nada acontece e ninguém sabe por quê.
    if (!data?.length) throw new Error('Sem permissão para colocar este lead no forecast.');
    return;
  }

  const valor = Number(lead.final_sale_value) || Number(lead.property_value) || 0;
  const { error } = await supabase.from('proposals').insert({
    tenant_id: tenantId,
    lead_id: lead.id,
    source: 'crm',
    property_reference: lead.property_code || '',
    agent_name: lead.assigned_agent_name || '',
    status: 'Negociação',
    stage_id: 'negociacao',
    value: valor,
  });

  if (error) {
    // Corrida: alguém criou a proposta no mesmo instante — o lead já está lá.
    if ((error as { code?: string }).code === '23505') return;
    throw erroSupabase('falha ao colocar lead no forecast', error);
  }
}

/** Tira a linha da planilha. Reversível — não arquiva o lead nem apaga a proposta. */
export async function removeFromForecast(proposalId: string): Promise<void> {
  const { data, error } = await supabase
    .from('proposals')
    .update({ forecast_oculto: true })
    .eq('id', proposalId)
    .select('id');

  if (error) throw erroSupabase('falha ao tirar lead do forecast', error);
  if (!data?.length) throw new Error('Sem permissão para tirar este lead do forecast.');
}
