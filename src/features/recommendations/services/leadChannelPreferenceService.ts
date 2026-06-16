/**
 * Preferência de canal por lead (email/whatsapp), persistida para facilitar a
 * consulta e a futura Fase 2 (agendamento). Não é segredo → acesso direto via
 * Supabase com RLS por tenant. Chave: (tenant_id, lead_source, lead_id).
 */

import { supabase } from '@/lib/supabaseClient';
import type { RecommendationChannel } from './recommendationsApi';

const TABLE = 'lead_recommendation_preferences';

export async function fetchLeadChannelPreference(
  tenantId: string,
  leadSource: string,
  leadId: string,
): Promise<RecommendationChannel[] | null> {
  if (!tenantId || tenantId === 'owner' || !leadId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('channels')
    .eq('tenant_id', tenantId)
    .eq('lead_source', leadSource)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (error || !data?.channels) return null;
  return (data.channels as string[]).filter(
    (c): c is RecommendationChannel => c === 'email' || c === 'whatsapp',
  );
}

export async function saveLeadChannelPreference(
  tenantId: string,
  leadSource: string,
  leadId: string,
  channels: RecommendationChannel[],
): Promise<void> {
  if (!tenantId || tenantId === 'owner' || !leadId) return;
  const { error } = await supabase.from(TABLE).upsert(
    { tenant_id: tenantId, lead_source: leadSource, lead_id: leadId, channels },
    { onConflict: 'tenant_id,lead_source,lead_id' },
  );
  if (error) throw error;
}
