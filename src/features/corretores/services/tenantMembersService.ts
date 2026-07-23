import { supabase } from '@/integrations/supabase/client';
import { 
  UserRole, 
  TeamColor, 
  SidebarPermission,
  CORRETOR_SIDEBAR_PERMISSIONS,
  ADMIN_SIDEBAR_PERMISSIONS,
  TEAM_LEADER_SIDEBAR_PERMISSIONS
} from '@/types/permissions';

export interface TenantMember {
  id: string;
  user_id: string;
  tenant_id: string;
  role: 'admin' | 'corretor' | 'team_leader' | 'owner';
  email: string;
  team?: TeamColor;
  permissions?: Record<string, unknown>;
  sidebar_permissions?: SidebarPermission[];
  created_at: string;
  leader_user_id?: string | null;
  creci?: string | null;
}

export interface CreateMemberData {
  email: string;
  password: string;
  role: 'admin' | 'corretor' | 'team_leader';
  name?: string;
  phone?: string;
  team?: TeamColor;
  permissions?: Record<string, unknown>;
  sidebarPermissions?: SidebarPermission[];
  creci?: string;
}

// Função para obter permissões padrão baseado no role
export function getDefaultSidebarPermissions(role: string): SidebarPermission[] {
  switch (role) {
    case 'admin':
    case 'owner':
      return [...ADMIN_SIDEBAR_PERMISSIONS];
    case 'team_leader':
      return [...TEAM_LEADER_SIDEBAR_PERMISSIONS];
    case 'corretor':
    default:
      return [...CORRETOR_SIDEBAR_PERMISSIONS];
  }
}

export interface ServiceResult {
  success: boolean;
  error?: string;
  data?: any;
}

function mapTenantMemberRow(
  member: any,
  leaderMap: Record<string, string | null> = {},
  creciMap: Record<string, string | null> = {},
): TenantMember | null {
  const rawPermissions = member.permissions && typeof member.permissions === 'object' ? member.permissions : undefined;
  const sidebarPerms =
    (Array.isArray(member.sidebar_permissions) ? member.sidebar_permissions : undefined) ||
    (Array.isArray(rawPermissions?.sidebar_permissions) ? rawPermissions.sidebar_permissions : undefined);
  const team = (member.team as TeamColor | undefined) || (rawPermissions?.team as TeamColor | undefined);
  const email = member.email || member.name || member.user_email || member.user_id || '';

  if (!String(email).trim()) return null;
  if (String(email).trim().toLowerCase() === 'email não disponível') return null;

  return {
    id: member.id,
    user_id: member.user_id,
    tenant_id: member.tenant_id,
    role: member.role,
    email,
    team,
    permissions: rawPermissions,
    sidebar_permissions: sidebarPerms,
    created_at: member.created_at,
    leader_user_id: leaderMap[member.user_id] ?? member.leader_user_id ?? null,
    // A RPC get_tenant_members não retorna a coluna `creci` (é anterior a ela);
    // creciMap traz o valor do select paralelo. member.creci cobre o fallback direto.
    creci: creciMap[member.user_id] ?? member.creci ?? null,
  };
}

async function fetchTenantMembersDirectly(tenantId: string): Promise<TenantMember[]> {
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('Erro ao buscar membros direto em tenant_memberships:', error);
    return [];
  }

  return (data || [])
    .map((member: any) => mapTenantMemberRow(member))
    .filter((member): member is TenantMember => Boolean(member));
}

/**
 * Busca todos os membros de um tenant
 * Usa RPC get_tenant_members para bypassa RLS e obter todos os membros
 */
export async function fetchTenantMembers(tenantId: string): Promise<TenantMember[]> {
  try {
    // Usar RPC para buscar membros (bypassa RLS)
    const { data: members, error } = await supabase.rpc('get_tenant_members', {
      p_tenant_id: tenantId
    });

    if (error) {
      console.error('Erro ao buscar membros via RPC:', error);
      return fetchTenantMembersDirectly(tenantId);
    }

    if (!members || members.length === 0) {
      return fetchTenantMembersDirectly(tenantId);
    }

    // Mapear resultado da RPC para o formato esperado.
    // A RPC get_tenant_members não retorna colunas novas (leader_user_id, creci);
    // buscamos ambas num único select paralelo e fazemos merge por user_id.
    const memberIds = (members as any[]).map((m: any) => m.user_id);
    const leaderMap: Record<string, string | null> = {};
    const creciMap: Record<string, string | null> = {};
    if (memberIds.length > 0) {
      const { data: extraData } = await supabase
        .from('tenant_memberships')
        .select('user_id, leader_user_id, creci')
        .eq('tenant_id', tenantId)
        .in('user_id', memberIds);
      (extraData || []).forEach((row: any) => {
        leaderMap[row.user_id] = row.leader_user_id ?? null;
        creciMap[row.user_id] = row.creci ?? null;
      });
    }

    return (members as any[])
      .map((member: any) => mapTenantMemberRow(member, leaderMap, creciMap))
      .filter((member): member is TenantMember => Boolean(member));
  } catch (error) {
    console.error('Erro ao buscar membros do tenant:', error);
    return fetchTenantMembersDirectly(tenantId);
  }
}

/**
 * Cria um novo membro no tenant
 * Cria usuário no Supabase Auth via signUp e vincula ao tenant
 */
export async function createTenantMember(
  tenantId: string,
  memberData: CreateMemberData
): Promise<ServiceResult> {
  try {
    const sidebarPerms = memberData.sidebarPermissions || getDefaultSidebarPermissions(memberData.role);
    const fullPermissions = {
      ...memberData.permissions,
      sidebar_permissions: sidebarPerms,
      team: memberData.team || null
    };

    // 1. Verificar se o usuário já existe como broker no tenant
    const { data: existingBroker } = await supabase
      .from('tenant_brokers')
      .select('auth_user_id, email')
      .eq('tenant_id', tenantId)
      .eq('email', memberData.email)
      .maybeSingle();

    if (existingBroker && existingBroker.auth_user_id) {
      // Broker já existe, verificar se já tem membership
      const { data: existingMembership } = await supabase
        .from('tenant_memberships')
        .select('id')
        .eq('user_id', existingBroker.auth_user_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existingMembership) {
        return { success: false, error: 'Este usuário já é membro desta imobiliária' };
      }

      // Adicionar membership
      const { error: membershipError } = await supabase
        .from('tenant_memberships')
        .insert({
          user_id: existingBroker.auth_user_id,
          tenant_id: tenantId,
          role: memberData.role,
          permissions: fullPermissions,
          creci: memberData.creci?.trim() || null,
        });

      if (membershipError) {
        return { success: false, error: membershipError.message };
      }

      return { success: true };
    }

    // 2. Criar novo usuário via RPC (bypassa validações restritivas da API)
    // Limpar email de espaços extras e caracteres invisíveis
    const cleanEmail = memberData.email.trim().toLowerCase().replace(/\s+/g, '');
    
    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return { success: false, error: 'Formato de email inválido' };
    }
    
    // Validar senha
    if (memberData.password.length < 6) {
      return { success: false, error: 'A senha deve ter pelo menos 6 caracteres' };
    }
    
    
    // Usar RPC para criar usuário diretamente no auth.users
    const { data: createResult, error: createError } = await supabase.rpc('create_auth_user', {
      p_email: cleanEmail,
      p_password: memberData.password,
      p_name: memberData.name || cleanEmail.split('@')[0],
      p_tenant_id: tenantId,
      p_role: memberData.role,
    });

    if (createError) {
      console.error('❌ Erro ao criar usuário via RPC:', createError);
      return { success: false, error: createError.message };
    }

    // Verificar resultado da RPC
    const authResult = createResult as { success: boolean; user_id?: string; error?: string };
    if (!authResult.success) {
      console.error('❌ RPC retornou erro:', authResult.error);
      return { success: false, error: authResult.error || 'Erro ao criar usuário' };
    }

    if (!authResult.user_id) {
      return { success: false, error: 'Erro ao criar usuário - ID não retornado' };
    }

    const userId = authResult.user_id;

    // 3. Usar RPC para adicionar membro (bypassa RLS)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('add_tenant_member', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_role: memberData.role,
      p_name: memberData.name || cleanEmail.split('@')[0],
      p_email: cleanEmail,
      p_phone: memberData.phone || null,
      p_permissions: fullPermissions,
    });

    if (rpcError) {
      console.error('❌ Erro ao adicionar membro via RPC:', rpcError);
      return { success: false, error: 'Usuário criado mas erro ao vincular à imobiliária: ' + rpcError.message };
    }

    // Verificar resultado da RPC
    const result = rpcResult as { success: boolean; error?: string };
    if (!result.success) {
      console.error('❌ RPC retornou erro:', result.error);
      return { success: false, error: result.error || 'Erro ao vincular usuário' };
    }

    const { error: permissionsPersistError } = await supabase
      .from('tenant_memberships')
      .update({ permissions: fullPermissions, creci: memberData.creci?.trim() || null })
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);

    if (permissionsPersistError) {
      console.error('❌ Erro ao persistir permissões após criar membro:', permissionsPersistError);
      return { success: false, error: 'Usuário criado, mas erro ao salvar permissões: ' + permissionsPersistError.message };
    }


    // Usuário criado com sucesso (sem necessidade de confirmação de email)
    return { 
      success: true, 
      data: { userId, needsEmailConfirmation: false } 
    };
  } catch (error: any) {
    console.error('❌ Erro ao criar membro:', error);
    return { success: false, error: error.message || 'Erro ao criar membro' };
  }
}

/**
 * Atualiza o role de um membro
 */
export async function updateMemberRole(
  memberId: string,
  newRole: 'admin' | 'corretor' | 'team_leader'
): Promise<ServiceResult> {
  try {
    const { data, error } = await supabase
      .from('tenant_memberships')
      .update({ role: newRole })
      .eq('id', memberId)
      .select('id');

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Nenhum membro foi atualizado. Verifique as permissões de acesso do tenant.' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao atualizar role:', error);
    return { success: false, error: error.message || 'Erro ao atualizar permissão' };
  }
}

/**
 * Atualiza as permissões de um membro
 */
export async function updateMemberPermissions(
  memberId: string,
  permissions: Record<string, any>,
  creci?: string | null
): Promise<ServiceResult> {
  try {
    // `creci` undefined = não mexe na coluna (retrocompat). null/string = grava.
    const updatePayload: Record<string, any> =
      creci === undefined ? { permissions } : { permissions, creci };

    const { data, error } = await supabase
      .from('tenant_memberships')
      .update(updatePayload)
      .eq('id', memberId)
      .select('id');

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Nenhuma permissão foi salva. Verifique as políticas de acesso do tenant_memberships.' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao atualizar permissões:', error);
    return { success: false, error: error.message || 'Erro ao atualizar permissões' };
  }
}

/**
 * Atualiza o líder (leader_user_id) de um membro corretor
 */
export async function updateMemberLeader(
  memberId: string,
  leaderUserId: string | null
): Promise<ServiceResult> {
  try {
    const { data, error } = await supabase
      .from('tenant_memberships')
      .update({ leader_user_id: leaderUserId } as any)
      .eq('id', memberId)
      .select('id');

    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) {
      return { success: false, error: 'Nenhum membro foi atualizado.' };
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro ao atualizar líder' };
  }
}

/**
 * Admin altera a senha de qualquer membro do tenant (via RPC).
 */
export async function adminUpdateMemberPassword(
  userId: string,
  newPassword: string
): Promise<ServiceResult> {
  try {
    const { data, error } = await supabase.rpc('admin_update_user_password', {
      p_user_id: userId,
      p_new_password: newPassword,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    if (!result?.success) return { success: false, error: result?.error || 'Erro ao alterar senha' };
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao alterar senha';
    return { success: false, error: message };
  }
}

/**
 * Admin altera o email de qualquer membro do tenant (via RPC).
 */
export async function adminUpdateMemberEmail(
  userId: string,
  newEmail: string
): Promise<ServiceResult> {
  try {
    const { data, error } = await supabase.rpc('admin_update_user_email', {
      p_user_id: userId,
      p_new_email: newEmail,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    if (!result?.success) return { success: false, error: result?.error || 'Erro ao alterar email' };
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao alterar email';
    return { success: false, error: message };
  }
}

/**
 * Remove um membro do tenant (apenas da membership)
 */
export async function removeTenantMember(memberId: string): Promise<ServiceResult> {
  try {
    const { data, error } = await supabase
      .from('tenant_memberships')
      .delete()
      .eq('id', memberId)
      .select('id');

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Nenhum membro foi removido. Verifique as permissões de acesso do tenant.' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao remover membro:', error);
    return { success: false, error: error.message || 'Erro ao remover membro' };
  }
}

/**
 * Exclui um membro COMPLETAMENTE do banco de dados
 * Remove de: tenant_memberships, tenant_brokers, e tenta remover do auth
 */
export async function deleteMemberCompletely(
  memberId: string,
  userId: string,
  tenantId: string
): Promise<ServiceResult> {
  try {
    // 1. Remover da tabela tenant_memberships — é o que efetivamente tira o acesso.
    //    Se ISTO falhar, a exclusão falhou (retornamos erro). Os passos seguintes
    //    são limpeza best-effort: seus erros são logados mas não derrubam a operação
    //    (broker/auth órfãos são lixo reutilizável, não bloqueiam nada).
    const { error: membershipError } = await supabase
      .from('tenant_memberships')
      .delete()
      .eq('id', memberId);

    if (membershipError) {
      console.error('❌ Erro ao remover membership:', membershipError);
      return { success: false, error: membershipError.message || 'Erro ao remover vínculo do membro' };
    }

    // 2. Remover da tabela tenant_brokers. A coluna é `auth_user_id` (não `user_id`).
    const { error: brokerError } = await supabase
      .from('tenant_brokers')
      .delete()
      .eq('auth_user_id', userId)
      .eq('tenant_id', tenantId);

    if (brokerError) {
      console.warn('⚠️ Membership removida, mas erro ao remover tenant_brokers:', brokerError);
    }

    // 3. Remover histórico de conversas do agente (limpeza).
    const { error: historicoError } = await supabase
      .from('agent_conversations')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', tenantId);

    if (historicoError) {
      console.warn('⚠️ Erro ao remover histórico de conversas:', historicoError);
    }

    // 4. Best-effort: remover do auth.users via RPC (requer service_role no Supabase).
    //    ponytail: RPC pode não existir ainda — logamos e seguimos; o usuário sem
    //    membership já não acessa. Upgrade: criar/expor delete_user_completely no DB.
    try {
      const { error: authError } = await supabase.rpc('delete_user_completely', {
        p_user_id: userId,
      });
      if (authError) {
        console.warn('⚠️ Erro ao remover usuário do auth (RPC delete_user_completely):', authError);
      }
    } catch (e) {
      console.warn('⚠️ RPC delete_user_completely indisponível:', e);
    }

    return { success: true };
  } catch (error: any) {
    console.error('❌ Erro na exclusão completa:', error);
    return { success: false, error: error.message || 'Erro ao excluir membro' };
  }
}

/**
 * Busca um membro específico pelo ID
 */
export async function getMemberById(memberId: string): Promise<TenantMember | null> {
  try {
    const { data, error } = await supabase
      .from('tenant_memberships')
      .select('*')
      .eq('id', memberId)
      .maybeSingle();
    
    if (error || !data) {
      return null;
    }
    
    return data as TenantMember;
  } catch (error) {
    console.error('Erro ao buscar membro:', error);
    return null;
  }
}
