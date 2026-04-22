/**
 * 🔄 XML Sync Service - Sincronização Automática de Imóveis para Corretores
 * 
 * Este serviço sincroniza os imóveis do XML com a tabela imoveis_corretores,
 * garantindo que cada corretor veja seus imóveis em "Meus Imóveis".
 */

import { supabase } from '@/lib/supabaseClient';
import { Imovel } from '../services/kenloService';
import { getTenantImoveis } from '../services/imoveisXmlService';
import { findCorretorInSystem } from '../services/kenloLeadsService';

const DEBUG_LOGS = import.meta.env?.VITE_DEBUG_LOGS === 'true';

export interface SyncResult {
  success: boolean;
  totalImoveis: number;
  imoveisSincronizados: number;
  corretoresEncontrados: number;
  erros: string[];
  diagnostico?: DiagnosticoAtribuicao[];
}

export interface DiagnosticoAtribuicao {
  codigoImovel: string;
  corretorXml: string;
  corretorSistema: string | null;
  status: 'atribuido' | 'conflito' | 'sem_corretor' | 'erro';
  mensagem: string;
}

export interface CorretorMatch {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  matchType: 'email' | 'telefone' | 'nome';
}

interface TenantMember {
  user_id: string;
  role: string;
  users: {
    id: string;
    email?: string;
    raw_user_meta_data?: {
      name?: string;
      phone?: string;
      telefone?: string;
    };
  } | null;
}

interface ImoveisCorretoresRow {
  id: string;
  tenant_id: string;
  codigo_imovel: string;
  corretor_id: string | null;
  corretor_nome: string | null;
  corretor_telefone: string | null;
  corretor_email: string | null;
}

/**
 * Normaliza telefone para comparação (remove máscaras, código do país, etc)
 */
const normalizePhone = (phone: string | undefined | null): string | null => {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');
  
  // Remover código do país se presente (55)
  if (clean.length > 11 && clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Se tiver 10 dígitos, adicionar 9 após DDD para celular
  if (clean.length === 10) {
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
  }
  
  return clean.length >= 8 ? clean : null;
};

/**
 * Normaliza nome para comparação (remove acentos, lowercase)
 */
const normalizeName = (name: string | undefined | null): string | null => {
  if (!name) return null;
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

/**
 * Verifica se um imóvel já está atribuído no sistema
 */
const getExistingAssignment = async (
  tenantId: string,
  codigoImovel: string
): Promise<ImoveisCorretoresRow | null> => {
  const { data, error } = await supabase
    .from('imoveis_corretores')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('codigo_imovel', codigoImovel.toUpperCase())
    .maybeSingle();
  
  if (error && error.code !== 'PGRST116') {
    if (DEBUG_LOGS) console.error('❌ Erro ao verificar atribuição:', error);
  }
  
  return data as ImoveisCorretoresRow | null;
};

/**
 * Atribui um imóvel a um corretor na tabela imoveis_corretores
 */
const assignImovelToCorretor = async (
  tenantId: string,
  codigoImovel: string,
  corretor: { id: string; nome: string; matchType?: string },
  corretorXml: { nome?: string; email?: string; telefone?: string }
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('imoveis_corretores')
      .upsert({
        tenant_id: tenantId,
        codigo_imovel: codigoImovel.toUpperCase(),
        corretor_id: corretor.id,
        corretor_nome: corretor.nome || corretorXml.nome,
        corretor_telefone: corretorXml.telefone || null,
        corretor_email: corretorXml.email || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'tenant_id,codigo_imovel'
      });
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
  }
};

/**
 * Sincroniza imóveis do XML com a tabela imoveis_corretores
 * - Não sobrescreve atribuições existentes (apenas diagnostica conflitos)
 * - Atribui apenas imóveis sem atribuição prévia
 */
export const syncImoveisFromXml = async (
  tenantId: string,
  forceSync: boolean = false
): Promise<SyncResult> => {
  const result: SyncResult = {
    success: false,
    totalImoveis: 0,
    imoveisSincronizados: 0,
    corretoresEncontrados: 0,
    erros: [],
    diagnostico: []
  };
  
  try {
    if (DEBUG_LOGS) console.log('🔄 [xmlSyncService] Iniciando sincronização...');
    
    // 1. Buscar imóveis do XML (do cache do tenant com dados de corretor)
    const imoveis = getTenantImoveis(tenantId);
    result.totalImoveis = imoveis.length;
    
    if (imoveis.length === 0) {
      result.erros.push('Nenhum imóvel encontrado no XML');
      return result;
    }
    
    if (DEBUG_LOGS) console.log(`📊 ${imoveis.length} imóveis encontrados no XML`);
    
    // 2. Filtrar imóveis que têm corretor no XML
    const imoveisComCorretor = imoveis.filter(
      (i: Imovel) => i.corretor_nome || i.corretor_email || i.corretor_numero
    );
    
    if (DEBUG_LOGS) console.log(`👤 ${imoveisComCorretor.length} imóveis com corretor no XML`);
    
    const corretoresUnicos = new Set<string>();
    
    // 3. Processar cada imóvel
    for (const imovel of imoveisComCorretor) {
      const codigoImovel = imovel.referencia?.toUpperCase();
      if (!codigoImovel) continue;
      
      const corretorXml = {
        nome: imovel.corretor_nome,
        email: imovel.corretor_email,
        telefone: imovel.corretor_numero
      };
      
      // Identificar corretor único
      const corretorKey = corretorXml.email || corretorXml.telefone || corretorXml.nome;
      if (corretorKey) corretoresUnicos.add(corretorKey);
      
      // Verificar se já existe atribuição
      const existingAssignment = await getExistingAssignment(tenantId, codigoImovel);
      
      if (existingAssignment && existingAssignment.corretor_id) {
        // Já tem atribuição - verificar se é o mesmo corretor
        const corretorSistema = await findCorretorInSystem(tenantId, corretorXml);
        
        if (corretorSistema && existingAssignment.corretor_id === corretorSistema.id) {
          // Mesmo corretor - tudo ok
          result.diagnostico?.push({
            codigoImovel,
            corretorXml: corretorXml.nome || 'N/A',
            corretorSistema: existingAssignment.corretor_nome,
            status: 'atribuido',
            mensagem: 'Imóvel já atribuído ao corretor correto'
          });
        } else {
          // Corretor diferente - CONFLITO (não sobrescrever)
          result.diagnostico?.push({
            codigoImovel,
            corretorXml: corretorXml.nome || 'N/A',
            corretorSistema: existingAssignment.corretor_nome,
            status: 'conflito',
            mensagem: `Conflito: XML indica ${corretorXml.nome}, mas está atribuído a ${existingAssignment.corretor_nome}. Somente admin pode alterar.`
          });
        }
        continue;
      }
      
      // Buscar corretor no sistema
      const corretorMatch = await findCorretorInSystem(tenantId, corretorXml);
      
      if (!corretorMatch) {
        // Corretor não encontrado no sistema
        result.diagnostico?.push({
          codigoImovel,
          corretorXml: corretorXml.nome || 'N/A',
          corretorSistema: null,
          status: 'sem_corretor',
          mensagem: `Corretor "${corretorXml.nome}" não encontrado no sistema. Cadastre-o primeiro.`
        });
        continue;
      }
      
      // Atribuir imóvel ao corretor
      const assignResult = await assignImovelToCorretor(
        tenantId,
        codigoImovel,
        corretorMatch,
        corretorXml
      );
      
      if (assignResult.success) {
        result.imoveisSincronizados++;
        result.diagnostico?.push({
          codigoImovel,
          corretorXml: corretorXml.nome || 'N/A',
          corretorSistema: corretorMatch.nome,
          status: 'atribuido',
          mensagem: `Atribuído via ${corretorMatch.matchType}`
        });
        
        if (DEBUG_LOGS) {
        }
      } else {
        result.erros.push(`Erro ao atribuir ${codigoImovel}: ${assignResult.error}`);
        result.diagnostico?.push({
          codigoImovel,
          corretorXml: corretorXml.nome || 'N/A',
          corretorSistema: corretorMatch.nome,
          status: 'erro',
          mensagem: assignResult.error || 'Erro desconhecido'
        });
      }
    }
    
    result.corretoresEncontrados = corretoresUnicos.size;
    result.success = true;
    
    if (DEBUG_LOGS) {
    }
    
    return result;
  } catch (err) {
    result.erros.push(err instanceof Error ? err.message : 'Erro desconhecido');
    return result;
  }
};

/**
 * Sincroniza imóveis do XML para um corretor específico (pelo user_id)
 * Útil para o botão "Sincronizar" individual
 */
export const syncImoveisForCorretor = async (
  tenantId: string,
  corretorUserId: string
): Promise<SyncResult> => {
  const result: SyncResult = {
    success: false,
    totalImoveis: 0,
    imoveisSincronizados: 0,
    corretoresEncontrados: 1,
    erros: [],
    diagnostico: []
  };
  
  try {
    if (DEBUG_LOGS) console.log(`🔄 [xmlSyncService] Sincronizando para corretor ${corretorUserId}...`);
    
    // 1. Buscar dados do corretor de tenant_brokers (fonte principal)
    let corretorEmail: string | undefined;
    let corretorNome: string | undefined;
    let corretorTelefone: string | null = null;
    
    // Primeiro: buscar em tenant_brokers pelo auth_user_id
    const { data: brokerData, error: brokerError } = await supabase
      .from('tenant_brokers')
      .select('id, name, email, phone')
      .eq('auth_user_id', corretorUserId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    
    if (!brokerError && brokerData) {
      corretorEmail = brokerData.email?.toLowerCase();
      corretorNome = brokerData.name;
      corretorTelefone = normalizePhone(brokerData.phone);
      if (DEBUG_LOGS) console.log('👤 [xmlSyncService] Dados do tenant_brokers:', { corretorEmail, corretorNome });
    } else {
      // Fallback: buscar em profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone')
        .eq('id', corretorUserId)
        .maybeSingle();
      
      if (profileData) {
        corretorEmail = profileData.email?.toLowerCase();
        corretorNome = profileData.full_name;
        corretorTelefone = normalizePhone(profileData.phone);
        if (DEBUG_LOGS) console.log('👤 [xmlSyncService] Dados do profiles:', { corretorEmail, corretorNome });
      } else {
        result.erros.push('Corretor não encontrado em tenant_brokers nem profiles');
        return result;
      }
    }
    
    if (DEBUG_LOGS) {
    }
    
    // 2. Buscar imóveis do XML (do cache do tenant com dados de corretor)
    const imoveis = getTenantImoveis(tenantId);
    result.totalImoveis = imoveis.length;
    
    if (imoveis.length === 0) {
      result.erros.push('Nenhum imóvel encontrado no XML');
      return result;
    }
    
    // 3. Filtrar imóveis deste corretor
    const meusImoveis = imoveis.filter((imovel: Imovel) => {
      // Match por email
      if (corretorEmail && imovel.corretor_email?.toLowerCase() === corretorEmail) {
        return true;
      }
      
      // Match por telefone
      if (corretorTelefone) {
        const imovelPhone = normalizePhone(imovel.corretor_numero);
        if (imovelPhone && imovelPhone.endsWith(corretorTelefone.slice(-8))) {
          return true;
        }
      }
      
      // Match por nome
      if (corretorNome) {
        const normalizedCorretorNome = normalizeName(corretorNome);
        const normalizedImovelNome = normalizeName(imovel.corretor_nome);
        if (normalizedCorretorNome && normalizedImovelNome && (
          normalizedCorretorNome === normalizedImovelNome ||
          normalizedCorretorNome.includes(normalizedImovelNome) ||
          normalizedImovelNome.includes(normalizedCorretorNome)
        )) {
          return true;
        }
      }
      
      return false;
    });
    
    if (DEBUG_LOGS) console.log(`📊 ${meusImoveis.length} imóveis encontrados para este corretor`);
    
    // 4. Atribuir cada imóvel
    for (const imovel of meusImoveis) {
      const codigoImovel = imovel.referencia?.toUpperCase();
      if (!codigoImovel) continue;
      
      // Verificar se já existe atribuição
      const existingAssignment = await getExistingAssignment(tenantId, codigoImovel);
      
      if (existingAssignment && existingAssignment.corretor_id) {
        if (existingAssignment.corretor_id === corretorUserId) {
          // Já atribuído a este corretor
          result.diagnostico?.push({
            codigoImovel,
            corretorXml: imovel.corretor_nome || 'N/A',
            corretorSistema: existingAssignment.corretor_nome,
            status: 'atribuido',
            mensagem: 'Já atribuído'
          });
        } else {
          // Atribuído a outro corretor
          result.diagnostico?.push({
            codigoImovel,
            corretorXml: imovel.corretor_nome || 'N/A',
            corretorSistema: existingAssignment.corretor_nome,
            status: 'conflito',
            mensagem: `Atribuído a outro corretor: ${existingAssignment.corretor_nome}`
          });
        }
        continue;
      }
      
      // Atribuir
      const { error } = await supabase
        .from('imoveis_corretores')
        .upsert({
          tenant_id: tenantId,
          codigo_imovel: codigoImovel,
          corretor_id: corretorUserId,
          corretor_nome: corretorNome || imovel.corretor_nome,
          corretor_telefone: imovel.corretor_numero || null,
          corretor_email: corretorEmail || imovel.corretor_email || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'tenant_id,codigo_imovel'
        });
      
      if (error) {
        result.erros.push(`Erro em ${codigoImovel}: ${error.message}`);
        result.diagnostico?.push({
          codigoImovel,
          corretorXml: imovel.corretor_nome || 'N/A',
          corretorSistema: corretorNome,
          status: 'erro',
          mensagem: error.message
        });
      } else {
        result.imoveisSincronizados++;
        result.diagnostico?.push({
          codigoImovel,
          corretorXml: imovel.corretor_nome || 'N/A',
          corretorSistema: corretorNome,
          status: 'atribuido',
          mensagem: 'Sincronizado do XML'
        });
        
        if (DEBUG_LOGS) console.log(`✅ ${codigoImovel} atribuído`);
      }
    }
    
    result.success = true;
    return result;
  } catch (err) {
    result.erros.push(err instanceof Error ? err.message : 'Erro desconhecido');
    return result;
  }
};

/**
 * Busca corretor responsável por um imóvel
 * Pipeline: 1) imoveis_corretores → 2) XML direto
 */
export const getCorretorByCodigoImovel = async (
  tenantId: string,
  codigoImovel: string
): Promise<{ nome: string; id?: string; telefone?: string; email?: string } | null> => {
  const codigo = codigoImovel.toUpperCase().trim();
  
  // 1. Buscar em imoveis_corretores
  const { data: assignment } = await supabase
    .from('imoveis_corretores')
    .select('corretor_id, corretor_nome, corretor_telefone, corretor_email')
    .eq('tenant_id', tenantId)
    .eq('codigo_imovel', codigo)
    .maybeSingle();
  
  if (assignment?.corretor_nome) {
    return {
      nome: assignment.corretor_nome,
      id: assignment.corretor_id,
      telefone: assignment.corretor_telefone,
      email: assignment.corretor_email
    };
  }
  
  // 2. Fallback: buscar no XML (do cache do tenant)
  const imoveis = getTenantImoveis(tenantId);
  const imovel = imoveis.find((i) => i.referencia?.toUpperCase() === codigo);
  
  if (imovel?.corretor_nome) {
    return {
      nome: imovel.corretor_nome,
      telefone: imovel.corretor_numero,
      email: imovel.corretor_email
    };
  }
  
  return null;
};

/**
 * Sincroniza imóveis do XML para TODOS os corretores do tenant
 * Executa a mesma lógica da aba "Meus Imóveis" para cada corretor
 */
export const syncImoveisForAllCorretores = async (
  tenantId: string
): Promise<{ ok: boolean; summary: { total: number; sincronizados: number; erros: number }; detalhes: Array<{ nome: string; imoveis: number; erro?: string }> }> => {
  const summary = { total: 0, sincronizados: 0, erros: 0 };
  const detalhes: Array<{ nome: string; imoveis: number; erro?: string }> = [];
  
  try {
    
    // 1. Buscar todos os corretores do tenant com auth_user_id
    const { data: corretores, error: fetchError } = await supabase
      .from('tenant_brokers')
      .select('id, auth_user_id, name, email, phone')
      .eq('tenant_id', tenantId)
      .not('auth_user_id', 'is', null);
    
    if (fetchError) {
      console.error('❌ Erro ao buscar corretores:', fetchError);
      return { ok: false, summary, detalhes: [{ nome: 'Sistema', imoveis: 0, erro: fetchError.message }] };
    }
    
    if (!corretores || corretores.length === 0) {
      console.warn('⚠️ Nenhum corretor encontrado com auth_user_id');
      return { ok: false, summary, detalhes: [{ nome: 'Sistema', imoveis: 0, erro: 'Nenhum corretor com login encontrado' }] };
    }
    
    summary.total = corretores.length;
    
    // 2. Para cada corretor, executar syncImoveisForCorretor
    for (const corretor of corretores) {
      try {
        
        const result = await syncImoveisForCorretor(tenantId, corretor.auth_user_id!);
        
        if (result.success) {
          summary.sincronizados += result.imoveisSincronizados;
          detalhes.push({
            nome: corretor.name || corretor.email || corretor.id,
            imoveis: result.imoveisSincronizados
          });
        } else {
          summary.erros++;
          detalhes.push({
            nome: corretor.name || corretor.email || corretor.id,
            imoveis: 0,
            erro: result.erros.join(', ')
          });
          console.warn(`⚠️ ${corretor.name}: ${result.erros.join(', ')}`);
        }
      } catch (err) {
        summary.erros++;
        detalhes.push({
          nome: corretor.name || corretor.email || corretor.id,
          imoveis: 0,
          erro: err instanceof Error ? err.message : 'Erro desconhecido'
        });
      }
    }
    
    return { ok: true, summary, detalhes };
  } catch (err) {
    console.error('❌ [syncImoveisForAllCorretores] Erro geral:', err);
    return { 
      ok: false, 
      summary, 
      detalhes: [{ nome: 'Sistema', imoveis: 0, erro: err instanceof Error ? err.message : 'Erro desconhecido' }] 
    };
  }
};

/**
 * Obtém timestamp da última sincronização
 */
export const getLastSyncTime = (tenantId: string): Date | null => {
  const stored = localStorage.getItem(`xml-sync-last-run-${tenantId}`);
  return stored ? new Date(stored) : null;
};

/**
 * Define timestamp da última sincronização
 */
export const setLastSyncTime = (tenantId: string): void => {
  localStorage.setItem(`xml-sync-last-run-${tenantId}`, new Date().toISOString());
};

/**
 * Verifica se deve executar sincronização automática
 * (1x por dia, preferencialmente de madrugada)
 */
export const shouldAutoSync = (tenantId: string): boolean => {
  const lastSync = getLastSyncTime(tenantId);
  if (!lastSync) return true;
  
  const now = new Date();
  const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
  
  // Sincronizar se passou mais de 20 horas
  if (hoursSinceSync >= 20) return true;
  
  // Ou se é madrugada (00:00 - 06:00) e última sync foi ontem
  const hour = now.getHours();
  if (hour >= 0 && hour <= 6) {
    const lastSyncDate = lastSync.toDateString();
    const todayDate = now.toDateString();
    if (lastSyncDate !== todayDate) return true;
  }
  
  return false;
};
