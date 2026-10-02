/**
 * A etapa "Venda" do funil (02/10) — a conta é do banco
 * (`funil_vendas_no_periodo`, 20261022).
 *
 * As vendas são as da Conferência de vendas, pela data de cada venda. Sem
 * período = todas. Só o número sai daqui: valores seguem só para admin.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Atuacao } from './funilDeSafraService';

export async function contarVendasDoFunil(
  tenantId: string,
  periodo: { de: string; ate: string } | null,
  atuacao: Atuacao,
): Promise<number> {
  const { data, error } = await supabase.rpc('funil_vendas_no_periodo', {
    p_tenant_id: tenantId,
    p_de: periodo?.de ?? null,
    p_ate: periodo?.ate ?? null,
    p_atuacao: atuacao === 'todos' ? null : atuacao,
  });
  // Erro NÃO vira zero: "0 vendas" é uma afirmação, e falsa.
  if (error) throw new Error('Não deu para contar as vendas.');
  return Number(data ?? 0);
}
