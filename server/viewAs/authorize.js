/**
 * Autorização do "visualizar como" — quem pode assumir o contexto de LEITURA
 * de quem, dentro de um tenant.
 *
 * Fonte da verdade da autorização. O gate de UI (esconder o seletor) é apenas
 * conveniência: qualquer rota que aceite um acting user chama `authorizeActingUser`
 * e recusa o que não passar.
 *
 * Regras:
 *   - pode assumir outro contexto: owner da plataforma OU role='admin' no tenant;
 *   - o alvo precisa ter membership NO MESMO tenant (nunca cruza tenant);
 *   - a validação é por request (stateless): revogar o admin corta o acesso no
 *     request seguinte, sem token/sessão/expiração para gerenciar.
 *
 * Fica separado de index.js para não criar ciclo de import: server/kpis importa
 * `authorizeActingUser` daqui, e server/viewAs/index.js importa de server/kpis.
 */

import { isPlatformOwner } from '../utils/ownerAuth.js';

/**
 * Teto de membros lidos por busca. Acima disso a busca fica incompleta.
 * ponytail: filtro em memória porque nome/e-mail vivem em DUAS tabelas
 * (tenant_brokers + user_profiles) e um ilike no banco só cobriria uma.
 * Virar busca no banco (view materializada ou coluna de busca) se algum
 * tenant passar de ~1000 membros.
 */
const MAX_MEMBERS = 1000;

/** Máximo devolvido ao header — a lista é para escolher, não para navegar. */
const MAX_RESULTS = 20;

/** O usuário autenticado pode assumir o contexto de outro neste tenant? */
export async function canViewAsOthers(supabase, { userId, userEmail, tenantId }) {
  if (isPlatformOwner(userEmail)) return true;

  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role === 'admin';
}

/** O usuário tem vínculo com este tenant? (barreira anti cross-tenant) */
async function hasMembership(supabase, tenantId, userId) {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

/** Identidades vindas de tenant_brokers (fonte primária), por auth_user_id. */
async function identitiesFromBrokers(supabase, tenantId, userIds) {
  const { data, error } = await supabase
    .from('tenant_brokers')
    .select('auth_user_id, name, email')
    .eq('tenant_id', tenantId)
    .in('auth_user_id', userIds);
  if (error) throw error;

  return new Map(
    (data || [])
      .filter((broker) => broker.auth_user_id)
      .map((broker) => [broker.auth_user_id, { name: broker.name, email: broker.email }]),
  );
}

/** Identidades vindas de user_profiles (fallback), por id. */
async function identitiesFromProfiles(supabase, userIds) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', userIds);
  if (error) throw error;

  return new Map((data || []).map((p) => [p.id, { name: p.full_name, email: p.email }]));
}

/**
 * Nome e e-mail dos membros. Mesmo padrão de server/enps/roster.js:
 * tenant_brokers é primário, user_profiles é o fallback dos que faltarem.
 */
async function loadMemberIdentities(supabase, tenantId, userIds) {
  const byUser = await identitiesFromBrokers(supabase, tenantId, userIds);

  const missingIds = userIds.filter((id) => !byUser.has(id));
  if (missingIds.length === 0) return byUser;

  const fallback = await identitiesFromProfiles(supabase, missingIds);
  for (const [id, identity] of fallback) byUser.set(id, identity);

  return byUser;
}

/** Linha de membership + identidade → item da lista do seletor. */
function toViewableUser(member, identity = {}) {
  const email = identity.email || '';
  return {
    userId: member.user_id,
    role: member.role,
    email,
    name: identity.name || email.split('@')[0] || 'Usuário',
  };
}

/** Casa o termo digitado contra nome ou e-mail (termo vazio casa com tudo). */
function matchesTerm(user, needle) {
  if (!needle) return true;
  return `${user.name} ${user.email}`.toLowerCase().includes(needle);
}

/**
 * Usuários do tenant que podem ser assumidos como contexto, filtrados pelo
 * termo de busca. NÃO autoriza — quem chama já validou com `canViewAsOthers`.
 */
export async function searchTenantUsers(supabase, { tenantId, term = '', excludeUserId = null }) {
  const { data: members, error } = await supabase
    .from('tenant_memberships')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .limit(MAX_MEMBERS);
  if (error) throw error;

  const candidates = (members || []).filter((m) => m.user_id && m.user_id !== excludeUserId);
  if (candidates.length === 0) return [];

  const identities = await loadMemberIdentities(
    supabase,
    tenantId,
    candidates.map((m) => m.user_id),
  );
  const needle = String(term || '').trim().toLowerCase();

  return candidates
    .map((member) => toViewableUser(member, identities.get(member.user_id)))
    .filter((user) => matchesTerm(user, needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, MAX_RESULTS);
}

/**
 * Valida o acting user recebido por query/header.
 *
 * @returns {{ok: true, actingUserId: string|null}} contexto aprovado
 *          (`null` = sem contexto, use o próprio usuário), ou
 *          {{ok: false, status: number, error: string}} para o handler responder.
 */
export async function authorizeActingUser(supabase, { userId, userEmail, tenantId, actingUserId }) {
  const target = normalizeTarget(actingUserId, userId);
  if (!target) return { ok: true, actingUserId: null };

  const allowed = await canViewAsOthers(supabase, { userId, userEmail, tenantId });
  if (!allowed) return { ok: false, status: 403, error: 'view_as_forbidden' };

  const targetIsMember = await hasMembership(supabase, tenantId, target);
  if (!targetIsMember) return { ok: false, status: 403, error: 'view_as_target_not_in_tenant' };

  // Rastro de quem olhou o quê. Só dispara quando há contexto de fato (raro),
  // e usa o console como o resto do servidor — sem tabela de auditoria nova.
  console.log(`[viewAs] ${userEmail} → ${target} (tenant ${tenantId})`);
  return { ok: true, actingUserId: target };
}

/** Id do alvo, ou '' quando não há contexto (ausente, vazio ou o próprio usuário). */
function normalizeTarget(actingUserId, userId) {
  const target = typeof actingUserId === 'string' ? actingUserId.trim() : '';
  return target === userId ? '' : target;
}
