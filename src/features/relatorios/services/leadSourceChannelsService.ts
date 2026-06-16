import { supabase } from '@/integrations/supabase/client';
import { origemChannelKey } from '../utils/canalClassifier';

// ============================================================
// Canal por origem de lead (gráficos "por Canal" dos Relatórios)
// Cada linha = a qual canal o tenant decidiu que aquela origem
// pertence (ex: "zap imóveis" -> "Portais Imobiliários").
// Origens sem linha aqui usam a sugestão automática do
// canalClassifier — o banco guarda só as escolhas manuais.
// ============================================================

export interface LeadSourceChannel {
  id?: string;
  tenant_id: string;
  origem: string;
  canal: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Mapa { chave da origem (trim+lowercase) -> canal } com as escolhas
 * manuais salvas do tenant. Origens sem escolha não aparecem no mapa.
 */
export async function fetchLeadSourceChannels(
  tenantId: string
): Promise<Record<string, string>> {
  if (!tenantId) return {};
  try {
    const { data, error } = await (supabase as any)
      .from('tenant_lead_source_channels')
      .select('origem, canal')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[LeadSourceChannels] Erro ao buscar canais:', error.message);
      return {};
    }

    const map: Record<string, string> = {};
    (data ?? []).forEach((row: { origem: string; canal: string }) => {
      const key = origemChannelKey(row.origem);
      const canal = (row.canal || '').trim();
      if (key && canal) map[key] = canal;
    });
    return map;
  } catch (e) {
    console.error('[LeadSourceChannels] Exceção ao buscar canais:', e);
    return {};
  }
}

/**
 * Salva (upsert) o canal escolhido para uma origem do tenant.
 * A origem é normalizada (trim + lowercase) para garantir UMA única
 * linha por origem — "ZAP Imoveis" e "Zap Imoveis" gravam na mesma chave.
 */
export async function saveLeadSourceChannel(
  tenantId: string,
  origem: string,
  canal: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId) return { success: false, error: 'tenantId inválido' };

  const key = origemChannelKey(origem);
  if (!key) return { success: false, error: 'origem inválida' };

  const canalLimpo = (canal || '').trim();
  if (!canalLimpo) return { success: false, error: 'canal inválido' };

  try {
    const { error } = await (supabase as any)
      .from('tenant_lead_source_channels')
      .upsert(
        { tenant_id: tenantId, origem: key, canal: canalLimpo },
        { onConflict: 'tenant_id,origem' }
      );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}

/**
 * Remove a escolha manual de uma origem — ela volta a usar a sugestão
 * automática do classificador nos gráficos.
 */
export async function deleteLeadSourceChannel(
  tenantId: string,
  origem: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId) return { success: false, error: 'tenantId inválido' };

  const key = origemChannelKey(origem);
  if (!key) return { success: false, error: 'origem inválida' };

  try {
    const { error } = await (supabase as any)
      .from('tenant_lead_source_channels')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('origem', key);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}
