/**
 * 🔄 Serviço de Leads Kenlo - Multi-tenant
 * Salva e busca leads do Kenlo no Supabase
 */

import { supabase } from '@/lib/supabaseClient';

const DEBUG_LOGS = import.meta.env?.VITE_DEBUG_LOGS === 'true';

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
 * Busca corretor no sistema por nome, email ou telefone
 * Pipeline: tenant_brokers → tenant_memberships
 * Retorna o user_id (auth_user_id) para vincular ao lead
 */
export const findCorretorInSystem = async (
  tenantId: string,
  corretorInfo: { nome?: string; email?: string; telefone?: string }
): Promise<{ id: string; nome: string; matchType: 'email' | 'telefone' | 'nome' } | null> => {
  const { nome, email, telefone } = corretorInfo;
  
  if (!nome && !email && !telefone) return null;
  
  try {
    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedPhone = normalizePhone(telefone);
    const normalizedName = normalizeName(nome);
    
    // 1. Buscar em tenant_brokers (fonte principal - tem auth_user_id)
    const { data: brokers, error: brokersError } = await supabase
      .from('tenant_brokers')
      .select('id, auth_user_id, name, email, phone')
      .eq('tenant_id', tenantId)
      .not('auth_user_id', 'is', null);
    
    if (!brokersError && brokers && brokers.length > 0) {
      // Match por email
      if (normalizedEmail) {
        const match = brokers.find(b => b.email?.toLowerCase().trim() === normalizedEmail);
        if (match?.auth_user_id) {
          return { id: match.auth_user_id, nome: match.name || nome || '', matchType: 'email' };
        }
      }
      
      // Match por telefone
      if (normalizedPhone) {
        const match = brokers.find(b => {
          const brokerPhone = normalizePhone(b.phone);
          return brokerPhone && brokerPhone.endsWith(normalizedPhone.slice(-8));
        });
        if (match?.auth_user_id) {
          return { id: match.auth_user_id, nome: match.name || nome || '', matchType: 'telefone' };
        }
      }
      
      // Match por nome
      if (normalizedName) {
        const match = brokers.find(b => {
          const brokerName = normalizeName(b.name);
          return brokerName && (
            brokerName === normalizedName ||
            brokerName.includes(normalizedName) ||
            normalizedName.includes(brokerName)
          );
        });
        if (match?.auth_user_id) {
          return { id: match.auth_user_id, nome: match.name || nome || '', matchType: 'nome' };
        }
      }
    }
    
    // 2. Fallback: Buscar em tenant_memberships
    const { data: members, error: membersError } = await supabase
      .from('tenant_memberships')
      .select(`
        user_id,
        role,
        users:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq('tenant_id', tenantId);
    
    if (!membersError && members && members.length > 0) {
      // Match por email
      if (normalizedEmail) {
        const match = members.find((m: any) => {
          const memberEmail = m.users?.email?.toLowerCase().trim();
          return memberEmail === normalizedEmail;
        });
        if (match) {
          return {
            id: match.user_id,
            nome: (match as any).users?.raw_user_meta_data?.name || nome || '',
            matchType: 'email'
          };
        }
      }
      
      // Match por telefone
      if (normalizedPhone) {
        const match = members.find((m: any) => {
          const memberPhone = normalizePhone(
            m.users?.raw_user_meta_data?.phone || m.users?.raw_user_meta_data?.telefone
          );
          return memberPhone && memberPhone.endsWith(normalizedPhone.slice(-8));
        });
        if (match) {
          return {
            id: match.user_id,
            nome: (match as any).users?.raw_user_meta_data?.name || nome || '',
            matchType: 'telefone'
          };
        }
      }
      
      // Match por nome
      if (normalizedName) {
        const match = members.find((m: any) => {
          const memberName = normalizeName(m.users?.raw_user_meta_data?.name);
          return memberName && (
            memberName === normalizedName ||
            memberName.includes(normalizedName) ||
            normalizedName.includes(memberName)
          );
        });
        if (match) {
          return {
            id: match.user_id,
            nome: (match as any).users?.raw_user_meta_data?.name || nome || '',
            matchType: 'nome'
          };
        }
      }
    }
    
    return null;
  } catch (err) {
    if (DEBUG_LOGS) console.error('❌ [kenloLeadsService] Erro em findCorretorInSystem:', err);
    return null;
  }
};

/**
 * Busca corretor responsável por um imóvel na tabela imoveis_corretores
 */
const getCorretorByPropertyCode = async (
  tenantId: string,
  propertyCode: string
): Promise<{ nome: string; id?: string } | null> => {
  if (!propertyCode) return null;
  
  const codigo = propertyCode.toUpperCase().trim();
  
  const { data, error } = await supabase
    .from('imoveis_corretores')
    .select('corretor_id, corretor_nome')
    .eq('tenant_id', tenantId)
    .eq('codigo_imovel', codigo)
    .maybeSingle();
  
  if (error || !data?.corretor_nome) return null;
  
  return {
    nome: data.corretor_nome,
    id: data.corretor_id
  };
};

export interface KenloLead {
  _id: string;
  client: {
    name: string;
    phone: string;
    email: string;
  };
  timestamp: string;
  portal?: string;
  // Detalhes extras do Ingaia
  interest?: {
    id?: number;
    referenceLead?: string;
    reference?: string;
    name?: string;
    image?: string;
    isRent?: boolean;
    isSale?: boolean;
    type?: string;
    [key: string]: any;
  };
  message?: string;
  attendedBy?: any;
  raw_data?: any;
}

export interface KenloLeadDB {
  id: string;
  tenant_id: string;
  external_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  lead_timestamp: string;
  portal: string | null;
  raw_data: any;
  created_at: string;
}

const PORTAL_CODE_TO_NAME: Record<number, string> = {
  512: 'Chaves na Mão',
  1546: 'Cliquei Mudei',
  12: 'Imóvel Web',
  1834: 'Portal Kenlo',
  8: 'Site'
};

const extractPortalCode = (lead: any): number | null => {
  const candidates = [
    lead?.portal,
    lead?.portalId,
    lead?.portal_id,
    lead?.portalID,
    lead?.idMediaOrigin,
    lead?.id_media_origin,
    lead?.origem,
    lead?.origemId,
    lead?.origem_id,
    lead?.source,
    lead?.sourceId,
    lead?.source_id,
    lead?.raw_data?.portal,
    lead?.raw_data?.portalId,
    lead?.raw_data?.portal_id,
    lead?.raw_data?.portalID,
    lead?.raw_data?.idMediaOrigin,
    lead?.raw_data?.id_media_origin,
    lead?.raw_data?.origem,
    lead?.raw_data?.origemId,
    lead?.raw_data?.origem_id,
    lead?.raw_data?.source,
    lead?.raw_data?.sourceId,
    lead?.raw_data?.source_id,
    lead?.raw_data?.interest?.portal,
    lead?.raw_data?.interest?.portalId,
    lead?.raw_data?.interest?.portal_id,
    lead?.raw_data?.interest?.idMediaOrigin,
    lead?.raw_data?.interest?.id_media_origin,
    lead?.raw_data?.interest?.source,
    lead?.raw_data?.interest?.sourceId,
    lead?.raw_data?.interest?.source_id
  ];

  for (const v of candidates) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n) && v.trim() !== '') return n;
    }
    if (v && typeof v === 'object') {
      const id = (v as any).id ?? (v as any)._id ?? (v as any).portalId ?? (v as any).portal_id;
      if (typeof id === 'number' && Number.isFinite(id)) return id;
      if (typeof id === 'string') {
        const n = Number(id);
        if (Number.isFinite(n) && id.trim() !== '') return n;
      }
    }
  }
  return null;
};

const normalizePortal = (lead: any): string | null => {
  const code = extractPortalCode(lead);
  if (code !== null) {
    return PORTAL_CODE_TO_NAME[code] || `Portal ${code}`;
  }

  const direct = lead?.portal ?? lead?.raw_data?.portal;
  if (typeof direct === 'string' && direct.trim() !== '') return direct;
  return null;
};

const shouldIgnoreLead = (lead: any): boolean => {
  const id = lead?._id || lead?.id || lead?.external_id;
  const name = lead?.client?.name || lead?.client_name;
  const email = lead?.client?.email || lead?.client_email;
  const phone = lead?.client?.phone || lead?.client_phone;
  const message = lead?.message || lead?.raw_data?.message;

  if (id === '67571a368b8373fff6d92ebc') return true;
  if (name === 'Olx Validador URL') return true;
  if (email === 'olx.validador.url@email.com') return true;
  if (typeof phone === 'string' && phone.replace(/\D/g, '').endsWith('999999999')) return true;
  if (typeof message === 'string' && message.toLowerCase().includes('lead de teste')) return true;
  return false;
};

/**
 * Salva leads do Kenlo no Supabase para o tenant atual
 */
export const saveKenloLeads = async (
  tenantId: string,
  leads: KenloLead[]
): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const filteredLeads = leads.filter((lead: any) => !shouldIgnoreLead(lead));

    if (DEBUG_LOGS) {
      if (filteredLeads.length <= 20) {
      } else {
      }
    }

    if (!tenantId || tenantId === 'owner') {
      console.error('❌ TenantId inválido:', tenantId);
      return { success: false, count: 0, error: 'TenantId inválido' };
    }

    // Preparar dados para insert
    const leadsToInsert = filteredLeads.map((lead: any) => {
      // Concatenar DDD + telefone (ddd vem separado no Ingaia)
      const ddd = lead.client?.ddd || '';
      const phone = lead.client?.phone || '';
      
      // Se o telefone já começa com o DDD, não concatenar novamente
      let fullPhone = phone;
      if (ddd && phone && !phone.startsWith(ddd)) {
        fullPhone = `${ddd}${phone.replace(/\D/g, '')}`;
      }

      const portalName = normalizePortal(lead);
      
      return {
        tenant_id: tenantId,
        external_id: lead._id || `temp-${Date.now()}`,
        client_name: lead.client?.name || '',
        client_phone: fullPhone,
        client_email: lead.client?.email || '',
        lead_timestamp: lead.timestamp || new Date().toISOString(),
        portal: portalName,
        // Detalhes do lead (colunas específicas)
        message: lead.message || null,
        interest_image: lead.interest?.image || null,
        interest_reference: lead.interest?.referenceLead || lead.interest?.reference || null,
        interest_type: lead.interest?.type || null,
        interest_is_sale: lead.interest?.isSale || null,
        interest_is_rent: lead.interest?.isRent || null,
        attended_by_name: lead.attendedBy?.name || (Array.isArray(lead.attendedBy) && lead.attendedBy[0]?.name) || null,
        raw_data: lead
      };
    });

    // ========================================================================
    // ATRIBUIÇÃO AUTOMÁTICA DE CORRETOR - Pipeline robusto
    // ========================================================================
    // Prioridade (CÓDIGO DO IMÓVEL PRIMEIRO - mais confiável):
    // 1. Se tem código do imóvel → buscar corretor responsável em imoveis_corretores
    // 2. Se não achou por imóvel, usar attendedBy do Kenlo → match com sistema
    // ========================================================================
    for (const leadData of leadsToInsert) {
      let corretorId: string | null = null;
      let corretorNome: string | null = null;
      let matchMethod: string | null = null;
      
      // 1. PRIMEIRO: Buscar pelo código do imóvel (mais confiável - "Meus Imóveis")
      if (leadData.interest_reference) {
        const corretorImovel = await getCorretorByPropertyCode(tenantId, leadData.interest_reference);
        if (corretorImovel) {
          // Se imoveis_corretores já tem o corretor_id, usar direto
          if (corretorImovel.id) {
            corretorId = corretorImovel.id;
            corretorNome = corretorImovel.nome;
            matchMethod = 'imovel_corretor_id';
          } else {
            // Senão, fazer match do nome com o sistema
            const corretorMatch = await findCorretorInSystem(tenantId, { nome: corretorImovel.nome });
            if (corretorMatch) {
              corretorId = corretorMatch.id;
              corretorNome = corretorMatch.nome;
              matchMethod = `imovel_${corretorMatch.matchType}`;
            } else {
              // Usar só o nome mesmo
              corretorNome = corretorImovel.nome;
              matchMethod = 'imovel_nome';
            }
          }
          if (DEBUG_LOGS) {
          }
        }
      }
      
      // 2. FALLBACK: Se não achou por imóvel, usar attendedBy do Kenlo
      if (!corretorId && leadData.attended_by_name) {
        const corretorMatch = await findCorretorInSystem(tenantId, { nome: leadData.attended_by_name });
        if (corretorMatch) {
          corretorId = corretorMatch.id;
          corretorNome = corretorMatch.nome;
          matchMethod = `attendedBy_${corretorMatch.matchType}`;
          if (DEBUG_LOGS) {
          }
        } else {
          // Manter o nome original do Kenlo se não encontrou no sistema
          corretorNome = leadData.attended_by_name;
          matchMethod = 'attendedBy_kenlo';
        }
      }
      
      // Atualizar dados do lead
      if (corretorNome) {
        leadData.attended_by_name = corretorNome;
      }
      if (corretorId) {
        (leadData as any).attended_by_id = corretorId;
      }
    }

    if (DEBUG_LOGS) console.log(`📦 ${leadsToInsert.length} leads para salvar/atualizar`);

    const batchSize = 500;
    let totalSaved = 0;

    for (let i = 0; i < leadsToInsert.length; i += batchSize) {
      const batch = leadsToInsert.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(leadsToInsert.length / batchSize);

      if (DEBUG_LOGS) console.log(`📦 Salvando lote ${batchNumber}/${totalBatches} (${batch.length} leads)...`);

      const { data, error } = await supabase
        .from('kenlo_leads')
        .upsert(batch, {
          onConflict: 'tenant_id,external_id',
          ignoreDuplicates: false
        })
        .select('external_id');

      if (error) {
        console.error('❌ Erro Supabase ao salvar lote:', error.message, error.code, error.details);
        return { success: false, count: totalSaved, error: error.message };
      }

      totalSaved += data?.length || batch.length;
    }

    if (DEBUG_LOGS) console.log(`✅ ${totalSaved} leads salvos/atualizados com sucesso`);
    return { success: true, count: totalSaved };

  } catch (error) {
    console.error('❌ Erro catch ao salvar leads:', error);
    return { 
      success: false, 
      count: 0, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * Busca leads do Kenlo do Supabase para o tenant atual
 * Busca em lotes de 1000 para contornar o limite do Supabase
 */
export const fetchKenloLeads = async (
  tenantId: string
): Promise<{ leads: KenloLead[]; error?: string }> => {
  try {
    if (DEBUG_LOGS) console.log(`📥 Buscando leads do Kenlo para tenant ${tenantId}...`);

    const allData: KenloLeadDB[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    // Buscar em lotes de 1000
    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('kenlo_leads')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('lead_timestamp', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('❌ Erro ao buscar leads:', error);
        return { leads: [], error: error.message };
      }

      if (data && data.length > 0) {
        allData.push(...data);
        if (DEBUG_LOGS) console.log(`📦 Lote ${page + 1}: ${data.length} leads (total: ${allData.length})`);
      }

      hasMore = data && data.length === pageSize;
      page++;
    }

    // Converter de volta para o formato KenloLead (usando colunas específicas)
    const leads: KenloLead[] = allData.map((row: any) => {
      // Concatenar DDD + telefone se disponível
      const ddd = row.raw_data?.client?.ddd || '';
      const phone = row.client_phone || row.raw_data?.client?.phone || '';
      const fullPhone = ddd && phone ? `${ddd}${phone.replace(/\D/g, '')}` : phone;
      
      return {
        _id: row.external_id,
        client: {
          name: row.client_name,
          phone: fullPhone,
          email: row.client_email
        },
        timestamp: row.lead_timestamp,
        portal: (row.portal || normalizePortal({ raw_data: row.raw_data }) || undefined) as any,
        // Detalhes extras (das colunas específicas OU do raw_data como fallback)
        message: row.message || row.raw_data?.message,
        interest: row.interest_image || row.interest_reference ? {
          image: row.interest_image || row.raw_data?.interest?.image,
          referenceLead: row.interest_reference || row.raw_data?.interest?.referenceLead,
          reference: row.interest_reference || row.raw_data?.interest?.reference,
          type: row.interest_type || row.raw_data?.interest?.type,
          isSale: row.interest_is_sale ?? row.raw_data?.interest?.isSale,
          isRent: row.interest_is_rent ?? row.raw_data?.interest?.isRent
        } : row.raw_data?.interest,
        attendedBy: row.attended_by_name ? { name: row.attended_by_name } : row.raw_data?.attendedBy,
        raw_data: row.raw_data
      };
    });

    const filteredLeads = leads.filter((lead: any) => !shouldIgnoreLead(lead));

    if (DEBUG_LOGS) console.log(`✅ ${filteredLeads.length} leads encontrados no total`);
    return { leads: filteredLeads };

  } catch (error) {
    console.error('❌ Erro ao buscar leads:', error);
    return { 
      leads: [], 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * Salva ou atualiza a integração Kenlo do tenant (com credenciais para reautenticação)
 */
export const saveKenloIntegration = async (
  tenantId: string,
  email: string,
  leadsCount: number,
  password?: string,
  authToken?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const updateData: any = {
      tenant_id: tenantId,
      kenlo_email: email,
      status: 'active',
      leads_count: leadsCount,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Salvar senha e token se fornecidos
    if (password) updateData.kenlo_password = password;
    if (authToken) updateData.auth_token = authToken;
    
    const { error } = await supabase
      .from('kenlo_integrations')
      .upsert(updateData, {
        onConflict: 'tenant_id'
      });

    if (error) {
      console.error('❌ Erro ao salvar integração:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * Atualiza APENAS dados de sync (leads_count, token, last_sync_at).
 * NUNCA sobrescreve email ou senha — evita race condition com alterações do usuário.
 */
export const updateKenloSyncData = async (
  tenantId: string,
  leadsCount: number,
  authToken?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const updateData: any = {
      leads_count: leadsCount,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (authToken) updateData.auth_token = authToken;

    const { error } = await supabase
      .from('kenlo_integrations')
      .update(updateData)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[KenloSync] Erro ao atualizar sync data:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
};

/**
 * Busca a integração Kenlo do tenant
 */
export const fetchKenloIntegration = async (
  tenantId: string
): Promise<{ integration: any | null; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('kenlo_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao buscar integração:', error);
      return { integration: null, error: error.message };
    }

    return { integration: data };
  } catch (error) {
    return { 
      integration: null, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * Desconecta a integração Kenlo (marca como inativa) SEM deletar os leads
 * Os leads permanecem no banco de dados da imobiliária permanentemente
 */
export const disconnectKenloIntegration = async (
  tenantId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Apenas marcar integração como inativa - NÃO deletar leads
    const { error } = await supabase
      .from('kenlo_integrations')
      .update({
        status: 'inactive',
        auth_token: null, // Remover token de autenticação
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * @deprecated Use disconnectKenloIntegration para desconectar sem perder dados.
 * Esta função DELETA todos os leads e deve ser usada apenas para limpar dados completamente.
 */
export const removeKenloIntegration = async (
  tenantId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // ATENÇÃO: Esta função deleta TODOS os leads permanentemente
    console.warn('⚠️ removeKenloIntegration chamada - isso vai DELETAR todos os leads!');
    
    // Remover leads
    await supabase
      .from('kenlo_leads')
      .delete()
      .eq('tenant_id', tenantId);

    // Remover integração
    const { error } = await supabase
      .from('kenlo_integrations')
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * Busca leads arquivados de kenlo_leads mapeados para KanbanLead
 */
export const fetchKenloLeadsArquivados = async (
  tenantId: string
): Promise<import('@/features/leads/services/leadsService').KanbanLead[]> => {
  try {
    const { data, error } = await supabase
      .from('kenlo_leads')
      .select('id, external_id, client_name, client_phone, client_email, portal, attended_by_name, archived_at, archive_reason, lead_timestamp')
      .eq('tenant_id', tenantId)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });
    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.external_id || row.id,
      created_at: row.lead_timestamp || '',
      codigo: null,
      corretor: row.attended_by_name || null,
      lead: row.client_phone || null,
      numerocorretor: null,
      status: 'arquivado',
      corretor_responsavel: row.attended_by_name || null,
      numero_corretor_responsavel: null,
      data_atribuicao: null,
      atendido: null,
      data_atendimento: null,
      data_finalizacao: null,
      data_expiracao: null,
      nomedolead: row.client_name || null,
      Foto: null,
      portal: row.portal || null,
      email: row.client_email || null,
      temperature: null,
      property_value: null,
      comments: null,
      archived_at: row.archived_at,
      archive_reason: row.archive_reason,
      _sourceTable: 'kenlo_leads',
    } as import('@/features/leads/services/leadsService').KanbanLead & { _sourceTable: string }));
  } catch {
    return [];
  }
};

/**
 * Arquiva um lead da integração Kenlo (kenlo_leads) com motivo
 */
export const arquivarKenloLead = async (
  leadId: string,
  motivo?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('kenlo_leads')
      .update({
        archived_at: new Date().toISOString(),
        archive_reason: motivo || 'Arquivado pelo usuário',
        updated_at: new Date().toISOString()
      })
      .eq('external_id', leadId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
};

/**
 * Desarquiva um lead da integração Kenlo (kenlo_leads)
 */
export const desarquivarKenloLead = async (
  leadId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('kenlo_leads')
      .update({
        archived_at: null,
        archive_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq('external_id', leadId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
};
