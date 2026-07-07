/**
 * 🪦 Soft-delete de tenants (tenants.deleted_at) — filtro server-side.
 *
 * O servidor usa service_role, que bypassa RLS; então quem itera tenants
 * (syncs Kenlo/Santa Ângela) ou envia mensagens (deliverRecommendation)
 * precisa filtrar tenants soft-deletados explicitamente. Este helper é a
 * fonte única desse filtro.
 *
 * Fail-open por design: se a consulta falhar (hiccup de rede), devolve Set
 * vazio e o processamento segue — processar um tenant deletado por um ciclo é
 * inofensivo; paralisar TODOS os tenants por um erro transitório não é.
 */
export async function getDeletedTenantIds(supabase, tenantIds) {
  const ids = [...new Set((tenantIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .in('id', ids)
      .not('deleted_at', 'is', null);
    if (error) throw error;
    return new Set((data || []).map((r) => r.id));
  } catch (err) {
    console.warn('[tenants] verificação de soft-delete indisponível (fail-open):', err?.message);
    return new Set();
  }
}
