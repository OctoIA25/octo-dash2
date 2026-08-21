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
