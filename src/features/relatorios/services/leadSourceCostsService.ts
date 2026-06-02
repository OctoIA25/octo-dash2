import { supabase } from '@/integrations/supabase/client';

// ============================================================
// Custo de investimento por origem de lead (aba Financeiro)
// Cada linha = quanto o tenant gasta por MÊS com aquela origem.
// ============================================================

export interface LeadSourceCost {
  id?: string;
  tenant_id: string;
  origem: string;
  monthly_cost: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Mapa { origem -> custo mensal } com os custos salvos do tenant.
 * Origens sem custo cadastrado simplesmente não aparecem no mapa.
 */
export async function fetchLeadSourceCosts(
  tenantId: string
): Promise<Record<string, number>> {
  if (!tenantId) return {};
  try {
    const { data, error } = await (supabase as any)
      .from('tenant_lead_source_costs')
      .select('origem, monthly_cost')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[LeadSourceCosts] Erro ao buscar custos:', error.message);
      return {};
    }

    const map: Record<string, number> = {};
    (data ?? []).forEach((row: { origem: string; monthly_cost: number | string }) => {
      map[row.origem] = Number(row.monthly_cost) || 0;
    });
    return map;
  } catch (e) {
    console.error('[LeadSourceCosts] Exceção ao buscar custos:', e);
    return {};
  }
}

/**
 * Salva (upsert) o custo mensal de uma origem para o tenant.
 * Um custo 0 mantém o registro (origem cadastrada com gasto zerado).
 */
export async function saveLeadSourceCost(
  tenantId: string,
  origem: string,
  monthlyCost: number
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId) return { success: false, error: 'tenantId inválido' };

  // Normaliza a chave (case-insensitive + trim) para garantir UMA única linha
  // por origem no banco — "ZAP Imoveis" e "Zap Imoveis" gravam na mesma chave.
  const key = origem.trim().toLowerCase();
  if (!key) return { success: false, error: 'origem inválida' };

  // Arredonda a 2 casas para casar com NUMERIC(14,2) e evitar divergência
  // entre o valor otimista e o persistido.
  const valor =
    Number.isFinite(monthlyCost) && monthlyCost > 0 ? Math.round(monthlyCost * 100) / 100 : 0;

  try {
    const { error } = await (supabase as any)
      .from('tenant_lead_source_costs')
      .upsert(
        { tenant_id: tenantId, origem: key, monthly_cost: valor },
        { onConflict: 'tenant_id,origem' }
      );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro desconhecido' };
  }
}
