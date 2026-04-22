/**
 * 🔄 Serviço de Gerenciamento de Corretores
 * Permite criar, editar e gerenciar corretores no sistema
 */

import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

export interface NovoCorretor {
  nome: string;
  email: string;
  senha: string;
  telefone: string;
  equipe: 'verde' | 'vermelha' | 'amarela' | 'azul';
  cargo: 'corretor' | 'gerente' | 'admin';
  creci?: string;
  ativo?: boolean;
}

export interface CorretorCadastrado {
  id: number;
  nm_corretor: string;
  email: string;
  telefone: string;
  equipe: string;
  cargo: string;
  creci?: string;
  ativo: boolean;
  created_at: string;
  created_by?: string;
}

/**
 * Verifica se o usuário pode criar novos corretores
 * Apenas admin e gerentes podem criar corretores
 */
export function podeCriarCorretor(role: string): boolean {
  const rolesPermitidas = ['admin', 'gerente', 'gestao', 'administrador'];
  return rolesPermitidas.includes(role?.toLowerCase() || '');
}

/**
 * Verifica se o usuário pode editar corretores
 */
export function podeEditarCorretor(role: string): boolean {
  const rolesPermitidas = ['admin', 'gerente', 'gestao', 'administrador'];
  return rolesPermitidas.includes(role?.toLowerCase() || '');
}

/**
 * Verifica se o usuário pode excluir corretores
 */
export function podeExcluirCorretor(role: string): boolean {
  const rolesPermitidas = ['admin', 'gestao', 'administrador'];
  return rolesPermitidas.includes(role?.toLowerCase() || '');
}

/**
 * Cria um novo corretor no Supabase (tabela brokers)
 */
export async function criarCorretor(
  corretor: NovoCorretor,
  createdById?: string
): Promise<{ success: boolean; data?: CorretorCadastrado; error?: string }> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    // Verificar se já existe corretor com mesmo email na tabela brokers
    const checkResponse = await fetch(
      `${config.url}/rest/v1/brokers?email=eq.${encodeURIComponent(corretor.email)}&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (checkResponse.ok) {
      const existentes = await checkResponse.json();
      if (existentes && existentes.length > 0) {
        console.warn('⚠️ Corretor com este email já existe');
        return { success: false, error: 'Já existe um corretor cadastrado com este email.' };
      }
    }

    // Verificar se já existe corretor com mesmo nome
    const checkNomeResponse = await fetch(
      `${config.url}/rest/v1/brokers?name=ilike.${encodeURIComponent(corretor.nome)}&limit=1`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (checkNomeResponse.ok) {
      const existentesNome = await checkNomeResponse.json();
      if (existentesNome && existentesNome.length > 0) {
        console.warn('⚠️ Corretor com este nome já existe');
        return { success: false, error: 'Já existe um corretor cadastrado com este nome.' };
      }
    }

    // Mapear equipe para team_id (UUIDs das equipes no Supabase)
    const equipeTeamMap: Record<string, string | null> = {
      'verde': 'e90ff89a-5b06-4d28-aa1d-563887cf06d9',
      'vermelha': '01d5cf79-ab06-470c-9680-4c1ceec44667', 
      'amarela': '989c8bc5-8514-4ddc-bce0-07db039d944a',
      'azul': 'b1f58398-5598-4e7b-9636-5906667992fa'
    };

    // Criar o corretor na tabela brokers (estrutura correta do Supabase)
    const novoCorretorData = {
      name: corretor.nome.trim(),
      email: corretor.email.toLowerCase().trim(),
      phone: corretor.telefone.replace(/\D/g, ''),
      team_id: equipeTeamMap[corretor.equipe] || null,
      creci: corretor.creci || null,
      status: corretor.ativo !== false ? 'ativo' : 'inativo',
      specialty: corretor.cargo, // Usando specialty para armazenar o cargo
      notes: `Criado por: ${createdById || 'sistema'} | Senha: ${corretor.senha}` // Armazenar senha nas notas temporariamente
    };


    const response = await fetch(
      `${config.url}/rest/v1/brokers`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(novoCorretorData)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro ao criar corretor:', response.status, errorText);
      
      // Tentar parse do erro para mensagem mais amigável
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          return { success: false, error: errorJson.message };
        }
      } catch {}
      
      return { success: false, error: `Erro ao criar corretor: ${response.status}` };
    }

    const data = await response.json();

    return { 
      success: true, 
      data: Array.isArray(data) ? data[0] : data 
    };

  } catch (error) {
    console.error('❌ Erro ao criar corretor:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido ao criar corretor' 
    };
  }
}

/**
 * Busca todos os corretores cadastrados
 */
export async function listarCorretores(): Promise<CorretorCadastrado[]> {
  try {
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const response = await fetch(
      `${config.url}/rest/v1/Corretores?select=*&order=nm_corretor.asc`,
      {
        method: 'GET',
        headers: headers
      }
    );

    if (!response.ok) {
      console.error('❌ Erro ao listar corretores:', response.status);
      return [];
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('❌ Erro ao listar corretores:', error);
    return [];
  }
}

/**
 * Atualiza dados de um corretor
 */
export async function atualizarCorretor(
  corretorId: number,
  dados: Partial<NovoCorretor>
): Promise<{ success: boolean; error?: string }> {
  try {
    
    const config = getSupabaseConfig();
    const headers = getAuthenticatedHeaders();

    const dadosAtualizados: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (dados.nome) dadosAtualizados.nm_corretor = dados.nome.trim();
    if (dados.email) dadosAtualizados.email = dados.email.toLowerCase().trim();
    if (dados.senha) dadosAtualizados.senha_hash = dados.senha;
    if (dados.telefone) dadosAtualizados.telefone = dados.telefone.replace(/\D/g, '');
    if (dados.equipe) dadosAtualizados.equipe = dados.equipe;
    if (dados.cargo) {
      dadosAtualizados.cargo = dados.cargo;
      // `role` espelha o cargo no sistema (corretor / team_leader / admin).
      // Gerente é tratado como admin para permissões.
      const cargoToRole: Record<string, string> = {
        corretor: 'corretor',
        team_leader: 'team_leader',
        gerente: 'admin',
        admin: 'admin',
      };
      dadosAtualizados.role = cargoToRole[dados.cargo] ?? 'corretor';
    }
    if (dados.creci !== undefined) dadosAtualizados.creci = dados.creci;
    if (dados.ativo !== undefined) dadosAtualizados.ativo = dados.ativo;

    const response = await fetch(
      `${config.url}/rest/v1/Corretores?id=eq.${corretorId}`,
      {
        method: 'PATCH',
        headers: {
          ...headers,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(dadosAtualizados)
      }
    );

    if (!response.ok) {
      console.error('❌ Erro ao atualizar corretor:', response.status);
      return { success: false, error: `Erro ao atualizar: ${response.status}` };
    }

    return { success: true };

  } catch (error) {
    console.error('❌ Erro ao atualizar corretor:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
}

/**
 * Desativa um corretor (soft delete)
 */
export async function desativarCorretor(
  corretorId: number
): Promise<{ success: boolean; error?: string }> {
  return atualizarCorretor(corretorId, { ativo: false });
}

/**
 * Gera email automático baseado no nome do corretor
 */
export function gerarEmailAutomatico(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '') // Remove caracteres especiais
    + '@octodash.com';
}

/**
 * Valida dados do corretor antes de criar/atualizar
 */
export function validarDadosCorretor(corretor: Partial<NovoCorretor>): { 
  valido: boolean; 
  erros: string[] 
} {
  const erros: string[] = [];

  if (!corretor.nome || corretor.nome.trim().length < 3) {
    erros.push('Nome deve ter pelo menos 3 caracteres');
  }

  if (!corretor.email || !corretor.email.includes('@')) {
    erros.push('Email inválido');
  }

  if (!corretor.senha || corretor.senha.length < 4) {
    erros.push('Senha deve ter pelo menos 4 caracteres');
  }

  if (!corretor.telefone || corretor.telefone.replace(/\D/g, '').length < 10) {
    erros.push('Telefone deve ter pelo menos 10 dígitos');
  }

  if (!corretor.equipe) {
    erros.push('Selecione uma equipe');
  }

  return {
    valido: erros.length === 0,
    erros
  };
}

