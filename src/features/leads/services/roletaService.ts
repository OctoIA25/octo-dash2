/**
 * 🎰 SERVIÇO DE GESTÃO DA ROLETA DE CORRETORES (Multi-tenant)
 * 
 * Gerencia quais corretores participam da roleta de distribuição de leads.
 * Apenas corretores ativos na roleta recebem leads quando não há corretor responsável.
 */

import { supabase } from '@/lib/supabaseClient';

/**
 * Interface para participante da roleta
 */
export interface RoletaParticipante {
  id: string;
  tenant_id: string;
  broker_id: string;
  broker_name: string;
  broker_email: string | null;
  broker_phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Interface para corretor disponível (não necessariamente na roleta)
 */
export interface CorretorDisponivel {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  photo_url?: string | null;
  role?: string;
  is_in_roleta?: boolean;
}

const ROLETA_TABLE = 'roleta_participantes';

/**
 * Verifica se a tabela de roleta existe
 */
export async function verificarTabelaRoleta(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(ROLETA_TABLE)
      .select('id')
      .limit(1);
    
    return !error;
  } catch {
    return false;
  }
}

/**
 * Busca todos os participantes ativos da roleta para um tenant
 */
export async function fetchRoletaParticipantes(tenantId: string): Promise<RoletaParticipante[]> {
  try {
    
    const { data, error } = await supabase
      .from(ROLETA_TABLE)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('broker_name', { ascending: true });
    
    if (error) {
      console.error('❌ Erro ao buscar participantes da roleta:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('❌ Erro ao buscar participantes da roleta:', error);
    return [];
  }
}

/**
 * Busca todos os corretores disponíveis do tenant (para seleção na UI)
 * Combina dados de tenant_brokers e tenant_memberships
 * Por padrão, se não houver participantes configurados, todos são marcados como na roleta
 */
export async function fetchCorretoresDisponiveis(tenantId: string): Promise<CorretorDisponivel[]> {
  try {
    
    const corretoresMap = new Map<string, CorretorDisponivel>();
    
    // 1. Buscar de tenant_brokers (corretores cadastrados via XML ou manualmente)
    const { data: tenantBrokers, error: brokersError } = await supabase
      .from('tenant_brokers')
      .select('id, name, email, phone, photo_url, auth_user_id, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    
    if (brokersError) {
      console.warn('⚠️ Erro ao buscar tenant_brokers:', brokersError.message);
    }
    
    // Adicionar corretores de tenant_brokers
    (tenantBrokers || []).forEach(broker => {
      const key = broker.auth_user_id || broker.id;
      if (!corretoresMap.has(key)) {
        corretoresMap.set(key, {
          id: key,
          name: broker.name || 'Sem nome',
          email: broker.email,
          phone: broker.phone,
          photo_url: broker.photo_url,
          role: 'corretor'
        });
      }
    });
    
    // 2. Buscar de tenant_memberships (usuários com acesso ao sistema)
    const { data: members, error: membersError } = await supabase
      .from('tenant_memberships')
      .select('user_id, role')
      .eq('tenant_id', tenantId)
      .in('role', ['corretor', 'team_leader']);
    
    if (membersError) {
      console.warn('⚠️ Erro ao buscar tenant_memberships:', membersError.message);
    }
    
    // Buscar dados dos usuários via user_profiles
    const memberUserIds = (members || [])
      .map(m => m.user_id)
      .filter(id => !corretoresMap.has(id));
    
    if (memberUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, phone, avatar_url')
        .in('id', memberUserIds);
      
      if (profilesError) {
        console.warn('⚠️ Erro ao buscar user_profiles:', profilesError.message);
      }
      
      (profiles || []).forEach(profile => {
        if (!corretoresMap.has(profile.id)) {
          const memberRole = members?.find(m => m.user_id === profile.id)?.role || 'corretor';
          corretoresMap.set(profile.id, {
            id: profile.id,
            name: profile.full_name || profile.email?.split('@')[0] || 'Usuário',
            email: profile.email,
            phone: profile.phone,
            photo_url: profile.avatar_url,
            role: memberRole
          });
        }
      });
    }
    
    // 3. Buscar participantes atuais da roleta para marcar quem já está
    const participantes = await fetchRoletaParticipantes(tenantId);
    const participantesIds = new Set(participantes.map(p => p.broker_id));
    
    // 🎰 PADRÃO: Se não houver nenhum participante configurado, todos estão na roleta
    const todosNaRoleta = participantes.length === 0;
    
    // Marcar quem já está na roleta (ou todos se for primeira vez)
    const corretores = Array.from(corretoresMap.values()).map(c => ({
      ...c,
      is_in_roleta: todosNaRoleta || participantesIds.has(c.id)
    }));
    
    return corretores.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('❌ Erro ao buscar corretores disponíveis:', error);
    return [];
  }
}

/**
 * Adiciona um corretor à roleta
 */
export async function adicionarParticipanteRoleta(
  tenantId: string,
  corretor: CorretorDisponivel
): Promise<{ success: boolean; error?: string }> {
  try {
    
    // Verificar se já existe (ativo ou não)
    const { data: existing } = await supabase
      .from(ROLETA_TABLE)
      .select('id, is_active')
      .eq('tenant_id', tenantId)
      .eq('broker_id', corretor.id)
      .maybeSingle();
    
    if (existing) {
      // Se existe mas está inativo, reativar
      if (!existing.is_active) {
        const { error } = await supabase
          .from(ROLETA_TABLE)
          .update({ 
            is_active: true, 
            updated_at: new Date().toISOString(),
            broker_name: corretor.name,
            broker_email: corretor.email,
            broker_phone: corretor.phone
          })
          .eq('id', existing.id);
        
        if (error) throw error;
        return { success: true };
      }
      
      // Já está ativo
      return { success: true };
    }
    
    // Inserir novo participante
    const { error } = await supabase
      .from(ROLETA_TABLE)
      .insert({
        tenant_id: tenantId,
        broker_id: corretor.id,
        broker_name: corretor.name,
        broker_email: corretor.email,
        broker_phone: corretor.phone,
        is_active: true
      });
    
    if (error) throw error;
    
    return { success: true };
  } catch (error: any) {
    console.error('❌ Erro ao adicionar à roleta:', error);
    return { success: false, error: error.message || 'Erro ao adicionar participante' };
  }
}

/**
 * Remove um corretor da roleta (desativa, não deleta)
 */
export async function removerParticipanteRoleta(
  tenantId: string,
  brokerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    
    const { error } = await supabase
      .from(ROLETA_TABLE)
      .update({ 
        is_active: false, 
        updated_at: new Date().toISOString() 
      })
      .eq('tenant_id', tenantId)
      .eq('broker_id', brokerId);
    
    if (error) throw error;
    
    return { success: true };
  } catch (error: any) {
    console.error('❌ Erro ao remover da roleta:', error);
    return { success: false, error: error.message || 'Erro ao remover participante' };
  }
}

/**
 * Atualiza múltiplos participantes da roleta de uma vez
 * (adiciona novos, remove os que não estão mais na lista)
 */
export async function atualizarParticipantesRoleta(
  tenantId: string,
  corretoresSelecionados: CorretorDisponivel[]
): Promise<{ success: boolean; error?: string; added: number; removed: number }> {
  try {
    
    // Buscar participantes atuais
    const atuais = await fetchRoletaParticipantes(tenantId);
    const atuaisIds = new Set(atuais.map(p => p.broker_id));
    const novosIds = new Set(corretoresSelecionados.map(c => c.id));
    
    let added = 0;
    let removed = 0;
    
    // Adicionar novos
    for (const corretor of corretoresSelecionados) {
      if (!atuaisIds.has(corretor.id)) {
        const result = await adicionarParticipanteRoleta(tenantId, corretor);
        if (result.success) added++;
      }
    }
    
    // Remover os que não estão mais na lista
    for (const participante of atuais) {
      if (!novosIds.has(participante.broker_id)) {
        const result = await removerParticipanteRoleta(tenantId, participante.broker_id);
        if (result.success) removed++;
      }
    }
    
    return { success: true, added, removed };
  } catch (error: any) {
    console.error('❌ Erro ao atualizar roleta:', error);
    return { success: false, error: error.message, added: 0, removed: 0 };
  }
}

/**
 * Busca estatísticas da roleta para o tenant
 */
export async function fetchEstatisticasRoleta(tenantId: string): Promise<{
  totalParticipantes: number;
  totalCorretores: number;
}> {
  try {
    const participantes = await fetchRoletaParticipantes(tenantId);
    const corretores = await fetchCorretoresDisponiveis(tenantId);
    
    return {
      totalParticipantes: participantes.length,
      totalCorretores: corretores.length
    };
  } catch {
    return { totalParticipantes: 0, totalCorretores: 0 };
  }
}
