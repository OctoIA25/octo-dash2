/**
 * Lookups de corretor server-side, portados de
 * src/features/imoveis/services/kenloLeadsService.ts (mesmas queries, provadas).
 * supabase (service_role) é injetado. Consumidos pelo brokerAssigner.
 */
const normalizePhone = (phone) => {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');
  if (clean.length > 11 && clean.startsWith('55')) clean = clean.substring(2);
  if (clean.length === 10) clean = clean.substring(0, 2) + '9' + clean.substring(2);
  return clean.length >= 8 ? clean : null;
};

const normalizeName = (name) => {
  if (!name) return null;
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
};

export function makeBrokerLookups(supabase) {
  async function getCorretorByPropertyCode(tenantId, propertyCode) {
    if (!propertyCode) return null;
    const codigo = String(propertyCode).toUpperCase().trim();
    const { data, error } = await supabase
      .from('imoveis_corretores')
      .select('corretor_id, corretor_nome')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', codigo)
      .maybeSingle();
    if (error || !data?.corretor_nome) return null;
    return { nome: data.corretor_nome, id: data.corretor_id };
  }

  async function findCorretorInSystem(tenantId, { nome, email, telefone } = {}) {
    if (!nome && !email && !telefone) return null;
    try {
      const normalizedEmail = email?.toLowerCase().trim();
      const normalizedPhone = normalizePhone(telefone);
      const normalizedName = normalizeName(nome);

      // 1. tenant_brokers (fonte principal — tem auth_user_id)
      const { data: brokers, error: brokersError } = await supabase
        .from('tenant_brokers')
        .select('id, auth_user_id, name, email, phone')
        .eq('tenant_id', tenantId)
        .not('auth_user_id', 'is', null);

      if (!brokersError && brokers?.length) {
        if (normalizedEmail) {
          const m = brokers.find((b) => b.email?.toLowerCase().trim() === normalizedEmail);
          if (m?.auth_user_id) return { id: m.auth_user_id, nome: m.name || nome || '', matchType: 'email' };
        }
        if (normalizedPhone) {
          const m = brokers.find((b) => {
            const p = normalizePhone(b.phone);
            return p && p.endsWith(normalizedPhone.slice(-8));
          });
          if (m?.auth_user_id) return { id: m.auth_user_id, nome: m.name || nome || '', matchType: 'telefone' };
        }
        if (normalizedName) {
          const m = brokers.find((b) => {
            const n = normalizeName(b.name);
            return n && (n === normalizedName || n.includes(normalizedName) || normalizedName.includes(n));
          });
          if (m?.auth_user_id) return { id: m.auth_user_id, nome: m.name || nome || '', matchType: 'nome' };
        }
      }

      // 2. Fallback: tenant_memberships
      const { data: members, error: membersError } = await supabase
        .from('tenant_memberships')
        .select('user_id, role, users:user_id ( id, email, raw_user_meta_data )')
        .eq('tenant_id', tenantId);

      if (!membersError && members?.length) {
        if (normalizedEmail) {
          const m = members.find((x) => x.users?.email?.toLowerCase().trim() === normalizedEmail);
          if (m) return { id: m.user_id, nome: m.users?.raw_user_meta_data?.name || nome || '', matchType: 'email' };
        }
        if (normalizedPhone) {
          const m = members.find((x) => {
            const p = normalizePhone(x.users?.raw_user_meta_data?.phone || x.users?.raw_user_meta_data?.telefone);
            return p && p.endsWith(normalizedPhone.slice(-8));
          });
          if (m) return { id: m.user_id, nome: m.users?.raw_user_meta_data?.name || nome || '', matchType: 'telefone' };
        }
        if (normalizedName) {
          const m = members.find((x) => {
            const n = normalizeName(x.users?.raw_user_meta_data?.name);
            return n && (n === normalizedName || n.includes(normalizedName) || normalizedName.includes(n));
          });
          if (m) return { id: m.user_id, nome: m.users?.raw_user_meta_data?.name || nome || '', matchType: 'nome' };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  return { getCorretorByPropertyCode, findCorretorInSystem };
}
