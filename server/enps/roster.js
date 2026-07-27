// Roster de corretores ATIVOS de um tenant + contato + gestor.
//
// Corretor ativo = tenant_memberships WHERE role='corretor' (NÃO há coluna status
// em tenant_memberships — filtrar por ela dá 42703). O vínculo com o gestor é
// leader_user_id na própria linha (a RPC get_tenant_members NÃO devolve essa coluna,
// por isso o SELECT direto). Contato: tenant_brokers é overlay PARCIAL (primário),
// user_profiles é o fallback. Telefone é best-effort (pode ser null).
//
// Padrão de query espelha server/leadAssignment.js:139.

import { normalizePhone } from '../utils/phone.js';

export async function getActiveCorretores(supabase, tenantId) {
  const { data: members, error: membersError } = await supabase
    .from('tenant_memberships')
    .select('user_id, leader_user_id')
    .eq('tenant_id', tenantId)
    .eq('role', 'corretor');

  if (membersError) {
    console.error('❌ eNPS roster — erro em tenant_memberships:', membersError);
    return [];
  }
  if (!members || members.length === 0) return [];

  // Contato primário: tenant_brokers ativos do tenant (overlay parcial).
  const { data: brokers, error: brokersError } = await supabase
    .from('tenant_brokers')
    .select('auth_user_id, email, phone')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (brokersError) {
    console.error('❌ eNPS roster — erro em tenant_brokers:', brokersError);
  }

  const brokerByUser = new Map();
  for (const b of brokers || []) {
    if (b.auth_user_id) brokerByUser.set(b.auth_user_id, b);
  }

  // Fallback: user_profiles só p/ corretores sem linha em tenant_brokers.
  const missingIds = members
    .map((m) => m.user_id)
    .filter((id) => !brokerByUser.has(id));

  const profileByUser = new Map();
  if (missingIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, email, phone')
      .in('id', missingIds);

    if (profilesError) {
      console.error('❌ eNPS roster — erro em user_profiles:', profilesError);
    }
    for (const p of profiles || []) {
      profileByUser.set(p.id, p);
    }
  }

  return members.map((m) => {
    const contact = brokerByUser.get(m.user_id) || profileByUser.get(m.user_id) || {};
    return {
      userId: m.user_id,
      leaderUserId: m.leader_user_id ?? null,
      email: contact.email ?? null,
      phone: normalizePhone(contact.phone, { withCountryCode: true }) || null,
    };
  });
}
