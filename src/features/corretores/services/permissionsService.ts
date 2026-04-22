/**
 * 🔐 Serviço de Gerenciamento de Permissões
 * Integrado com Supabase para persistência de dados
 */

import { UserPermissions, CORRETOR_DEFAULT_PERMISSIONS } from '@/types/permissions';
import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

const STORAGE_KEY = 'user-permissions';
const SUPABASE_TABLE = 'user_permissions'; // Tabela no Supabase (a ser criada)

/**
 * Carrega permissões de usuários
 * Primeiro tenta do localStorage, depois do Supabase
 */
export async function loadUserPermissions(): Promise<UserPermissions[]> {
  try {
    // Tentar carregar do localStorage primeiro (mais rápido)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return data;
    }

    // Se não houver no localStorage, tentar carregar do Supabase
    // (implementação futura quando a tabela for criada)
    return [];
    
  } catch (error) {
    console.error('❌ Erro ao carregar permissões:', error);
    return [];
  }
}

/**
 * Salva permissões de usuários
 * Salva no localStorage e no Supabase
 */
export async function saveUserPermissions(permissions: UserPermissions[]): Promise<boolean> {
  try {
    // Salvar no localStorage (imediato)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(permissions));

    // TODO: Implementar salvamento no Supabase
    // Quando a tabela user_permissions for criada no Supabase,
    // descomentar o código abaixo:
    
    /*
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();
    
    // Limpar permissões antigas
    await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}?select=*`, {
      method: 'DELETE',
      headers: headers
    });
    
    // Inserir novas permissões
    const response = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(permissions)
    });
    
    if (!response.ok) {
      throw new Error(`Erro ao salvar no Supabase: ${response.status}`);
    }
    
    */
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao salvar permissões:', error);
    return false;
  }
}

/**
 * Cria permissões padrão para um novo usuário
 */
export function createDefaultPermissions(userId: string, userName: string): UserPermissions {
  return {
    userId,
    userName,
    userRole: 'corretor',
    menuPermissions: [...CORRETOR_DEFAULT_PERMISSIONS],
    canEditLeads: true,
    canDeleteLeads: false,
    canAssignLeads: false,
    canViewAllLeads: false,
    canExportData: false,
    canManageTeams: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Obtém permissões de um usuário específico
 */
export async function getUserPermissions(userId: string): Promise<UserPermissions | null> {
  const allPermissions = await loadUserPermissions();
  return allPermissions.find(p => p.userId === userId) || null;
}

/**
 * Atualiza permissões de um usuário específico
 */
export async function updateUserPermissions(
  userId: string,
  updates: Partial<UserPermissions>
): Promise<boolean> {
  try {
    const allPermissions = await loadUserPermissions();
    const userIndex = allPermissions.findIndex(p => p.userId === userId);
    
    if (userIndex === -1) {
      console.error('❌ Usuário não encontrado:', userId);
      return false;
    }
    
    // Atualizar permissões
    allPermissions[userIndex] = {
      ...allPermissions[userIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    // Salvar
    return await saveUserPermissions(allPermissions);
    
  } catch (error) {
    console.error('❌ Erro ao atualizar permissões:', error);
    return false;
  }
}

/**
 * Verifica se um usuário tem uma permissão específica
 */
export async function hasPermission(
  userId: string,
  permission: keyof UserPermissions
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId);
  if (!userPermissions) return false;
  
  return Boolean(userPermissions[permission]);
}

/**
 * Verifica se um usuário pode acessar um menu específico
 */
export async function canAccessMenu(
  userId: string,
  menuId: string
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId);
  if (!userPermissions) return false;
  
  return userPermissions.menuPermissions.includes(menuId as any);
}

