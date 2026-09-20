/**
 * O que acontece DEPOIS de mover a etapa sem os pré-requisitos (P1.6).
 *
 * Duas ações, as duas acessórias: se falharem, a etapa continua mudada e o
 * corretor continua trabalhando. Por isso nenhuma das duas lança.
 */

import { supabase } from '@/lib/supabaseClient';
import type { Pendencia } from '../utils/preRequisitos';

/**
 * Registra no extrato do lead que a etapa mudou com pendências.
 *
 * Passa pelo servidor porque `lead_events` só aceita a chave de serviço — o
 * navegador não escreve no extrato, e é de propósito: extrato que o usuário
 * pode escrever não é extrato.
 */
export async function registrarRequisitosIgnorados(
  leadId: string,
  etapa: string,
  pendencias: Pendencia[]
): Promise<void> {
  if (!leadId || !etapa || pendencias.length === 0) return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;

    await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/requisitos-ignorados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa, pendencias: pendencias.map((p) => p.id) }),
    });
  } catch {
    // O registro é acessório: perdê-lo não pode desfazer a mudança de etapa
    // nem aparecer como erro para o corretor, que fez tudo certo.
  }
}

/**
 * Carimba a hora da assinatura na proposta vinculada.
 *
 * Só quando ainda não há hora gravada — a decisão de não regravar mora na
 * regra (`deveCarimbarAssinatura`), e aqui há a mesma guarda no `is null`
 * porque entre a leitura e a escrita outra pessoa pode ter assinado.
 */
export async function carimbarAssinatura(tenantId: string, leadId: string): Promise<void> {
  if (!tenantId || tenantId === 'owner' || !leadId) return;
  try {
    await supabase
      .from('proposals')
      .update({ signed_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('lead_id', leadId)
      .is('signed_at', null);
  } catch {
    // idem: acessório.
  }
}
