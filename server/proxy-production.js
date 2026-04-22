/**
 * 🚀 SERVIDOR PROXY DE PRODUÇÃO - KENLO XML
 * 
 * Este servidor:
 * - Serve a aplicação React (build)
 * - Faz proxy para o XML do Kenlo (resolve CORS)
 * - Serve o XML local como fallback
 * - Funciona tanto em localhost quanto em Docker/produção
 * 
 * Uso:
 * - Desenvolvimento: npm run dev (usa Vite proxy)
 * - Produção: node server/proxy-production.js
 * - Docker: automático via Dockerfile
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// SUPABASE CLIENT - API INTEGRATION
// =============================================================================
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ [proxy-production] Missing Supabase env vars: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Usar service_role key se disponível (bypassa RLS), senão usar anon key
const effectiveKey = supabaseServiceKey || supabaseAnonKey;
const usingServiceRole = !!supabaseServiceKey;

if (!usingServiceRole) {
  console.warn('⚠️ [proxy-production] SUPABASE_SERVICE_ROLE_KEY não definida. Usando anon key (sujeito a RLS).');
  console.warn('   Adicione SUPABASE_SERVICE_ROLE_KEY ao .env para acesso completo às tabelas com RLS.');
}

if (effectiveKey.startsWith('sb_') || !effectiveKey.startsWith('eyJ')) {
  console.error('❌ [proxy-production] Invalid Supabase key. Use JWT key (eyJ...), not publishable (sb_...).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, effectiveKey);
console.log('🔌 Supabase conectado:', supabaseUrl, usingServiceRole ? '(service_role)' : '(anon)');

// =============================================================================
// EXPRESS APP INITIALIZATION
// =============================================================================
const PORT = parseInt(process.env.PORT || '8080', 10);
const startTime = Date.now();
let serverStarting = true;
let serverReady = false;

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// =============================================================================
// BUSCA DE DADOS DO IMÓVEL - Corretor e Foto
// =============================================================================

/**
 * Busca dados do imóvel (corretor, foto) no cache ou tabela imoveis_corretores
 * @param {string} propertyCode - Código de referência do imóvel (ex: CA0099, AP0123)
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<{agent_name: string|null, main_photo: string|null}>}
 */
async function getPropertyData(propertyCode, tenantId) {
  if (!propertyCode || !tenantId) return { agent_name: null, main_photo: null };
  
  try {
    console.log(`🔍 Buscando dados do imóvel ${propertyCode} no tenant ${tenantId}...`);
    
    // 1. Primeiro, tentar buscar no cache de imóveis (properties_cache)
    const { data: cachedProperty, error: cacheError } = await supabase
      .from('properties_cache')
      .select('agent_name, agent_phone, agent_email, main_photo, title')
      .eq('tenant_id', tenantId)
      .eq('property_code', propertyCode)
      .single();
    
    if (!cacheError && cachedProperty) {
      console.log(`✅ Imóvel encontrado no cache: ${cachedProperty.title || propertyCode}`);
      return {
        agent_name: cachedProperty.agent_name || null,
        main_photo: cachedProperty.main_photo || null
      };
    }
    
    // 2. Fallback: buscar na tabela imoveis_corretores (legado)
    const { data: corretorData, error: corretorError } = await supabase
      .from('imoveis_corretores')
      .select('corretor_nome, corretor_email, corretor_telefone, foto_imovel')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', propertyCode)
      .single();
    
    if (!corretorError && corretorData) {
      console.log(`✅ Corretor encontrado na tabela legado: ${corretorData.corretor_nome}`);
      return {
        agent_name: corretorData.corretor_nome || null,
        main_photo: corretorData.foto_imovel || null
      };
    }
    
    console.log(`⚠️ Nenhum dado encontrado para imóvel ${propertyCode}`);
    return { agent_name: null, main_photo: null };
  } catch (error) {
    console.error('❌ Erro ao buscar dados do imóvel:', error.message);
    return { agent_name: null, main_photo: null };
  }
}

const fetchPropertyData = async (propertyCode, tenantId) => {
  if (!propertyCode || !tenantId) {
    return null;
  }

  try {
    console.log(`🔍 Buscando dados do imóvel ${propertyCode} no tenant ${tenantId}...`);
    
    // 1. Primeiro, tentar buscar no cache de imóveis (properties_cache)
    const { data: cachedProperty, error: cacheError } = await supabase
      .from('properties_cache')
      .select('agent_name, agent_phone, agent_email, main_photo, title')
      .eq('tenant_id', tenantId)
      .eq('property_code', propertyCode)
      .single();
    
    if (!cacheError && cachedProperty) {
      console.log(`✅ Imóvel encontrado no cache: ${cachedProperty.title || propertyCode}`);
      return {
        agent_name: cachedProperty.agent_name || null,
        main_photo: cachedProperty.main_photo || null
      };
    }
    
    // 2. Fallback: buscar na tabela imoveis_corretores (legado)
    const { data: corretorData, error: corretorError } = await supabase
      .from('imoveis_corretores')
      .select('corretor_nome, corretor_email, corretor_telefone, foto_imovel')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', propertyCode)
      .single();
    
    if (!corretorError && corretorData) {
      console.log(`✅ Corretor encontrado na tabela legado: ${corretorData.corretor_nome}`);
      return {
        agent_name: corretorData.corretor_nome || null,
        main_photo: corretorData.foto_imovel || null
      };
    }
    
    console.log(`⚠️ Nenhum dado encontrado para imóvel ${propertyCode}`);
    return { agent_name: null, main_photo: null };
  } catch (error) {
    console.error('❌ Erro ao buscar dados do imóvel:', error.message);
    return { agent_name: null, main_photo: null };
  }
};

const resolvePropertyExclusivity = async (tenantId, propertyCode) => {
  if (!tenantId || !propertyCode) {
    return false;
  }

  const normalizedCode = propertyCode.trim().toUpperCase();

  try {
    const { data: localProperty } = await supabase
      .from('imoveis_locais')
      .select('exclusivo')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', normalizedCode)
      .maybeSingle();

    if (localProperty && typeof localProperty.exclusivo === 'boolean') {
      return localProperty.exclusivo;
    }

    const { data: brokerProperty } = await supabase
      .from('imoveis_corretores')
      .select('exclusivo')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', normalizedCode)
      .maybeSingle();

    if (brokerProperty && typeof brokerProperty.exclusivo === 'boolean') {
      return brokerProperty.exclusivo;
    }
  } catch (error) {
    console.warn('⚠️ Não foi possível resolver exclusividade do imóvel:', error.message);
  }

  return false;
};

// =============================================================================
// API v1 - CRM ENDPOINTS
// =============================================================================
/**
 * Middleware de validação de API Key via Supabase
 * Valida a API Key e retorna o tenant_id associado
 */
const validateApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API Key ausente. Use: Authorization: Bearer <api_key>'
      }
    });
  }
  
  const apiKey = authHeader.split(' ')[1];
  
  // Validar formato da API Key
  if (!apiKey.startsWith('octo_')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'API Key inválida. Keys devem começar com octo_'
      }
    });
  }
  
  try {
    // Buscar API Key no Supabase
    const { data, error } = await supabase
      .from('tenant_api_keys')
      .select('tenant_id, status')
      .eq('api_key', apiKey)
      .eq('provider', 'crm')
      .single();
    
    if (error || !data) {
      console.log('❌ API Key não encontrada:', apiKey.substring(0, 20) + '...');
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'API Key não encontrada ou inválida'
        }
      });
    }
    
    if (data.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'API_KEY_REVOKED',
          message: 'API Key foi revogada'
        }
      });
    }
    
    // Adicionar tenant_id ao request para uso nos endpoints
    req.tenantId = data.tenant_id;
    req.apiKey = apiKey;
    
    console.log('✅ API Key validada para tenant:', data.tenant_id);
    next();
  } catch (err) {
    console.error('❌ Erro ao validar API Key:', err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Erro ao validar API Key'
      }
    });
  }
};

// ============================================
// HEALTH CHECK ENDPOINTS (públicos - sem autenticação)
// Usados pelo Dockerfile HEALTHCHECK e EasyPanel
// ============================================

// /healthz - Liveness probe (use este no EasyPanel)
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// /health - Health check completo
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  res.status(200).json({
    status: serverReady ? 'healthy' : 'starting',
    uptime: Math.floor(uptime),
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
    },
    timestamp: new Date().toISOString(),
    service: 'OctoDash CRM'
  });
});

// /ready - Readiness probe
app.get('/ready', (req, res) => {
  if (serverReady) {
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ status: 'starting', timestamp: new Date().toISOString() });
  }
});

// ============================================
// API v1 - HEALTH CHECK (público)
// ============================================
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    version: 'v1',
    timestamp: new Date().toISOString(),
    service: 'OctoDash CRM API'
  });
});

// ============================================
// API v1 - LEADS
// ============================================

// GET /api/v1/leads - Listar leads da Central de Leads (kenlo_leads)
app.get('/api/v1/leads', validateApiKey, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      portal,
      search,
      start_date,
      end_date,
      attended_by
    } = req.query;

    // Buscar da tabela kenlo_leads (Central de Leads)
    let query = supabase
      .from('kenlo_leads')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId);

    // Filtros
    if (portal) query = query.eq('portal', portal);
    if (attended_by) query = query.eq('attended_by_name', attended_by);
    if (search) {
      query = query.or(`client_name.ilike.%${search}%,client_phone.ilike.%${search}%,client_email.ilike.%${search}%`);
    }
    if (start_date) query = query.gte('lead_timestamp', start_date);
    if (end_date) query = query.lte('lead_timestamp', end_date);

    // Paginação
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    query = query.order('lead_timestamp', { ascending: false });

    const { data, error, count } = await query;

    if (error) throw error;

    // Mapear campos para formato padronizado da API
    const mappedData = (data || []).map(lead => ({
      id: lead.id,
      tenant_id: lead.tenant_id,
      external_id: lead.external_id,
      name: lead.client_name,
      phone: lead.client_phone,
      email: lead.client_email,
      portal: lead.portal,
      message: lead.message,
      interest_image: lead.interest_image,
      interest_reference: lead.interest_reference,
      interest_type: lead.interest_type,
      interest_is_sale: lead.interest_is_sale,
      interest_is_rent: lead.interest_is_rent,
      attended_by: lead.attended_by_name,
      lead_timestamp: lead.lead_timestamp,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      raw_data: lead.raw_data
    }));

    res.json({
      success: true,
      data: mappedData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        total_pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Erro ao listar leads:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/leads/:id - Buscar lead por ID (Central de Leads)
app.get('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: lead, error } = await supabase
      .from('kenlo_leads')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead com ID ${id} não encontrado`
          }
        });
      }
      throw error;
    }

    // Mapear para formato padronizado
    const mappedLead = {
      id: lead.id,
      tenant_id: lead.tenant_id,
      external_id: lead.external_id,
      name: lead.client_name,
      phone: lead.client_phone,
      email: lead.client_email,
      portal: lead.portal,
      message: lead.message,
      interest_image: lead.interest_image,
      interest_reference: lead.interest_reference,
      interest_type: lead.interest_type,
      interest_is_sale: lead.interest_is_sale,
      interest_is_rent: lead.interest_is_rent,
      attended_by: lead.attended_by_name,
      lead_timestamp: lead.lead_timestamp,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      raw_data: lead.raw_data
    };

    res.json({
      success: true,
      data: mappedLead
    });
  } catch (error) {
    console.error('❌ Erro ao buscar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/leads/phone/:phone - Buscar lead por telefone (Central de Leads)
app.get('/api/v1/leads/phone/:phone', validateApiKey, async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = phone.replace(/\D/g, '');

    const { data, error } = await supabase
      .from('kenlo_leads')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .or(`client_phone.ilike.%${cleanPhone}%,client_phone.ilike.%${phone}%`)
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Lead com telefone ${phone} não encontrado`
        }
      });
    }

    const lead = data[0];
    const mappedLead = {
      id: lead.id,
      tenant_id: lead.tenant_id,
      external_id: lead.external_id,
      name: lead.client_name,
      phone: lead.client_phone,
      email: lead.client_email,
      portal: lead.portal,
      message: lead.message,
      interest_image: lead.interest_image,
      interest_reference: lead.interest_reference,
      interest_type: lead.interest_type,
      interest_is_sale: lead.interest_is_sale,
      interest_is_rent: lead.interest_is_rent,
      attended_by: lead.attended_by_name,
      lead_timestamp: lead.lead_timestamp,
      created_at: lead.created_at,
      updated_at: lead.updated_at
    };

    res.json({
      success: true,
      data: mappedLead,
      exists: true
    });
  } catch (error) {
    console.error('❌ Erro ao buscar lead por telefone:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// Helper: Normalize stage value (accepts numeric or string)
const normalizeStage = (value) => {
  if (!value) return 'new';
  const stageMap = {
    '1': 'new', '2': 'contacted', '3': 'qualified', '4': 'visit_scheduled',
    '5': 'visit_done', '6': 'negotiation', '7': 'proposal', '8': 'closed_won', '9': 'closed_lost',
    'new': 'new', 'contacted': 'contacted', 'qualified': 'qualified',
    'visit_scheduled': 'visit_scheduled', 'visit_done': 'visit_done',
    'negotiation': 'negotiation', 'proposal': 'proposal',
    'closed_won': 'closed_won', 'closed_lost': 'closed_lost'
  };
  return stageMap[String(value).toLowerCase()] || 'new';
};

// Helper: Normalize temperature value (accepts numeric or string)
const normalizeTemperature = (value) => {
  if (!value) return 'cold';
  const tempMap = {
    '1': 'cold', '2': 'warm', '3': 'hot',
    'cold': 'cold', 'warm': 'warm', 'hot': 'hot',
    'frio': 'cold', 'morno': 'warm', 'quente': 'hot'
  };
  return tempMap[String(value).toLowerCase()] || 'cold';
};

// ============================================
// ROLETA DE CORRETORES - Estado em memória por tenant
// ============================================
const tenantRoletaState = new Map();

/**
 * Normaliza telefone para formato padrão do sistema
 * Sempre retorna com código do país +55
 * @param {string} phone - Telefone em qualquer formato
 * @param {boolean} withCountryCode - Se true, retorna com 55 no início (default: true)
 * @returns {string|null} Telefone normalizado ou null
 */
const normalizePhone = (phone, withCountryCode = true) => {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');
  
  // Remover código do país se presente para normalizar
  if (clean.length > 11 && clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  
  // Se tiver 10 dígitos (DDD + 8), adicionar 9 após DDD (celular)
  if (clean.length === 10) {
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
  }
  
  // Adicionar código do país +55 se solicitado
  if (withCountryCode && clean.length === 11) {
    clean = '55' + clean;
  }
  
  return clean;
};

/**
 * Compara dois telefones normalizados (ignora código do país)
 */
const phonesMatch = (phone1, phone2) => {
  if (!phone1 || !phone2) return false;
  const p1 = normalizePhone(phone1, false);
  const p2 = normalizePhone(phone2, false);
  return p1 && p2 && p1 === p2;
};

/**
 * Busca todos os corretores da aba "Acessos e Permissões" (tenant_brokers + tenant_memberships)
 * Esta é a fonte de verdade para listar corretores do sistema
 */
const getAllBrokersFromACL = async (tenantId) => {
  const brokerMap = new Map();
  
  try {
    // 1. Buscar de tenant_brokers (corretores cadastrados via XML ou manualmente)
    const { data: tenantBrokers, error: brokersError } = await supabase
      .from('tenant_brokers')
      .select('id, name, email, phone, photo_url, auth_user_id, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    
    if (brokersError) {
      console.error('❌ Erro ao buscar tenant_brokers:', brokersError);
    }
    
    // Adicionar corretores de tenant_brokers ao mapa
    (tenantBrokers || []).forEach(broker => {
      const key = broker.auth_user_id || broker.id;
      if (!brokerMap.has(key)) {
        brokerMap.set(key, {
          id: key,
          broker_id: broker.id,
          auth_user_id: broker.auth_user_id,
          name: broker.name,
          email: broker.email,
          phone: normalizePhone(broker.phone),
          photo_url: broker.photo_url,
          status: broker.status
        });
      }
    });
    
    // 2. Buscar de tenant_memberships (usuários com acesso ao sistema)
    // Nota: constraint atual só aceita 'admin' e 'corretor'
    const { data: members, error: membersError } = await supabase
      .from('tenant_memberships')
      .select('user_id, role')
      .eq('tenant_id', tenantId)
      .eq('role', 'corretor');
    
    if (membersError) {
      console.error('❌ Erro ao buscar tenant_memberships:', membersError);
    }
    
    // Buscar dados dos usuários via user_profiles (view de auth.users)
    const memberUserIds = (members || []).map(m => m.user_id).filter(id => !brokerMap.has(id));
    
    if (memberUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, phone, avatar_url')
        .in('id', memberUserIds);
      
      if (profilesError) {
        console.error('❌ Erro ao buscar user_profiles:', profilesError);
      }
      
      (profiles || []).forEach(profile => {
        if (!brokerMap.has(profile.id)) {
          const memberRole = members?.find(m => m.user_id === profile.id)?.role || 'corretor';
          brokerMap.set(profile.id, {
            id: profile.id,
            auth_user_id: profile.id,
            name: profile.full_name || profile.email?.split('@')[0] || 'Usuário',
            email: profile.email,
            phone: normalizePhone(profile.phone),
            photo_url: profile.avatar_url,
            status: 'active',
            role: memberRole
          });
        }
      });
    }
    
    return Array.from(brokerMap.values());
  } catch (error) {
    console.error('❌ Erro ao buscar corretores do ACL:', error);
    return [];
  }
};

/**
 * Busca corretor por nome, email ou telefone nas fontes do sistema
 * Ordem de busca: nome exato > email > telefone normalizado
 */
const findBrokerByIdentifier = async (tenantId, { name, email, phone }) => {
  // Buscar todos os corretores do ACL
  const allBrokers = await getAllBrokersFromACL(tenantId);
  
  if (allBrokers.length === 0) return null;
  
  // 1. Buscar por nome (case insensitive)
  if (name) {
    const normalizedName = name.trim().toLowerCase();
    const byName = allBrokers.find(b => b.name?.toLowerCase() === normalizedName);
    if (byName) {
      console.log(`✅ Corretor encontrado por nome: ${byName.name}`);
      return byName;
    }
  }
  
  // 2. Buscar por email
  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const byEmail = allBrokers.find(b => b.email?.toLowerCase() === normalizedEmail);
    if (byEmail) {
      console.log(`✅ Corretor encontrado por email: ${byEmail.name}`);
      return byEmail;
    }
  }
  
  // 3. Buscar por telefone (usando comparação normalizada)
  if (phone) {
    const byPhone = allBrokers.find(b => phonesMatch(b.phone, phone));
    if (byPhone) {
      console.log(`✅ Corretor encontrado por telefone: ${byPhone.name}`);
      return byPhone;
    }
  }
  
  return null;
};

/**
 * Busca config de limite de leads do tenant + override do corretor.
 * Retorna { eligible, reason } indicando se o corretor pode receber novos leads.
 * Não bloqueia se a config estiver desativada.
 */
const checkBrokerLeadLimitForTenant = async (tenantId, brokerId) => {
  if (!tenantId || !brokerId) return { eligible: true };

  try {
    // 1. Buscar config global do tenant
    const { data: cfg } = await supabase
      .from('tenant_lead_limit_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!cfg || !cfg.lead_limit_enabled) return { eligible: true };

    // 2. Buscar override do corretor em tenant_memberships.permissions->lead_limit
    const { data: membership } = await supabase
      .from('tenant_memberships')
      .select('permissions')
      .eq('tenant_id', tenantId)
      .eq('user_id', brokerId)
      .maybeSingle();

    const override = membership?.permissions?.lead_limit || {};

    // Pausado: não recebe leads automáticos
    if (override.receives_auto_leads === false) {
      return { eligible: false, reason: `Corretor ${brokerId} pausado para recebimento automático` };
    }

    // Isento: sem limite
    if (override.limit_exempt === true) return { eligible: true };

    // Override habilita/desabilita individualmente
    const effectiveEnabled = override.lead_limit_enabled !== undefined
      ? override.lead_limit_enabled
      : cfg.lead_limit_enabled;
    if (!effectiveEnabled) return { eligible: true };

    // Limites efetivos
    const maxActive = override.custom_max_active_leads != null
      ? override.custom_max_active_leads
      : cfg.max_active_leads_per_broker;
    const maxPending = override.custom_max_pending_response_leads != null
      ? override.custom_max_pending_response_leads
      : cfg.max_pending_response_leads_per_broker;

    const pendingStatuses = Array.isArray(cfg.pending_statuses) && cfg.pending_statuses.length > 0
      ? cfg.pending_statuses
      : ['Novos Leads'];

    // 3. Contar leads ativos do corretor
    const [activeResult, pendingResult] = await Promise.all([
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_agent_id', brokerId)
        .neq('status', 'Arquivado'),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_agent_id', brokerId)
        .in('status', pendingStatuses),
    ]);

    const activeCount = activeResult.count ?? 0;
    const pendingCount = pendingResult.count ?? 0;

    const mode = cfg.blocking_mode || 'both';
    const carteiraBloqueada = mode !== 'pendencia' && activeCount >= maxActive;
    const pendenciaBloqueada = mode !== 'carteira' && pendingCount >= maxPending;

    if (carteiraBloqueada && pendenciaBloqueada) {
      return {
        eligible: false,
        reason: `Carteira (${activeCount}/${maxActive}) e pendências (${pendingCount}/${maxPending}) no limite`,
      };
    }
    if (carteiraBloqueada) {
      return {
        eligible: false,
        reason: `Carteira no limite (${activeCount}/${maxActive} leads ativos)`,
      };
    }
    if (pendenciaBloqueada) {
      return {
        eligible: false,
        reason: `Muitas pendências (${pendingCount}/${maxPending} leads pendentes)`,
      };
    }

    return { eligible: true };
  } catch (err) {
    console.error('❌ Erro ao checar limite de leads:', err);
    return { eligible: true }; // fail-open: não bloqueia em erro
  }
};

/**
 * Pipeline de atribuição automática de corretor:
 * 1. raw_data.attendedBy (leads Kenlo) - busca no ACL por nome/email/telefone
 * 2. properties_cache (XML sincronizado) - busca corretor responsável no ACL
 * 3. imoveis_corretores (Meus Imóveis) - busca corretor responsável no ACL
 * 4. Roleta (fallback) - distribui entre corretores do ACL
 */
const resolveBrokerForLead = async (propertyCode, tenantId, rawData = null) => {
  let broker = null;
  let method = null;
  
  // 1. Verificar se veio com attendedBy do Kenlo
  if (rawData?.attendedBy && Array.isArray(rawData.attendedBy) && rawData.attendedBy.length > 0) {
    const attendedBroker = rawData.attendedBy[0];
    if (attendedBroker?.name || attendedBroker?.email || attendedBroker?.phone) {
      // Buscar corretor no ACL por nome/email/telefone
      const foundBroker = await findBrokerByIdentifier(tenantId, {
        name: attendedBroker.name,
        email: attendedBroker.email,
        phone: attendedBroker.phone || attendedBroker.cel
      });
      
      if (foundBroker) {
        const limitCheck = await checkBrokerLeadLimitForTenant(tenantId, foundBroker.id || foundBroker.auth_user_id);
        if (!limitCheck.eligible) {
          console.log(`⚠️ Corretor ${foundBroker.name} bloqueado por limite (Kenlo attendedBy): ${limitCheck.reason}. Tentando roleta...`);
        } else {
          broker = foundBroker;
          method = 'kenlo_attended_by';
          console.log(`✅ Corretor via Kenlo attendedBy (validado no ACL): ${broker.name}`);
          return { broker, method };
        }
      }
      
      // Se não encontrou no ACL, usar dados do Kenlo mesmo (sem checar limite — ID desconhecido)
      if (!broker && attendedBroker.name) {
        broker = { 
          name: attendedBroker.name, 
          id: attendedBroker.id?.toString() || null,
          phone: normalizePhone(attendedBroker.phone || attendedBroker.cel),
          email: attendedBroker.email
        };
        method = 'kenlo_attended_by';
        console.log(`✅ Corretor via Kenlo attendedBy (não validado no ACL): ${broker.name}`);
        return { broker, method };
      }
    }
  }
  
  // 2. Buscar no cache/XML por código do imóvel
  if (propertyCode) {
    const code = propertyCode.trim().toUpperCase();
    
    // 2a. properties_cache (XML) - busca dados do corretor responsável
    const { data: cached } = await supabase
      .from('properties_cache')
      .select('agent_name, agent_phone, agent_email')
      .eq('tenant_id', tenantId)
      .eq('property_code', code)
      .single();
    
    if (cached?.agent_name || cached?.agent_email || cached?.agent_phone) {
      // Buscar corretor no ACL por nome/email/telefone
      const foundBroker = await findBrokerByIdentifier(tenantId, {
        name: cached.agent_name,
        email: cached.agent_email,
        phone: cached.agent_phone
      });
      
      if (foundBroker) {
        const limitCheck = await checkBrokerLeadLimitForTenant(tenantId, foundBroker.id || foundBroker.auth_user_id);
        if (!limitCheck.eligible) {
          console.log(`⚠️ Corretor ${foundBroker.name} bloqueado por limite (XML cache): ${limitCheck.reason}. Tentando roleta...`);
        } else {
          broker = foundBroker;
          method = 'xml_property_cache';
          console.log(`✅ Corretor via XML/cache (validado no ACL): ${broker.name}`);
          return { broker, method };
        }
      }
      
      // Se não encontrou no ACL, usar dados do XML mesmo (sem checar limite)
      if (!broker && cached.agent_name) {
        broker = { 
          name: cached.agent_name, 
          phone: normalizePhone(cached.agent_phone),
          email: cached.agent_email
        };
        method = 'xml_property_cache';
        console.log(`✅ Corretor via XML/cache (não validado no ACL): ${broker.name}`);
        return { broker, method };
      }
    }
    
    // 2b. imoveis_corretores (Meus Imóveis) - atribuição manual
    const { data: manual } = await supabase
      .from('imoveis_corretores')
      .select('corretor_nome, corretor_id, corretor_telefone, corretor_email')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', code)
      .single();
    
    if (manual?.corretor_nome || manual?.corretor_email || manual?.corretor_telefone) {
      // Buscar corretor no ACL por nome/email/telefone
      const foundBroker = await findBrokerByIdentifier(tenantId, {
        name: manual.corretor_nome,
        email: manual.corretor_email,
        phone: manual.corretor_telefone
      });
      
      if (foundBroker) {
        const limitCheck = await checkBrokerLeadLimitForTenant(tenantId, foundBroker.id || foundBroker.auth_user_id);
        if (!limitCheck.eligible) {
          console.log(`⚠️ Corretor ${foundBroker.name} bloqueado por limite (Meus Imóveis): ${limitCheck.reason}. Tentando roleta...`);
        } else {
          broker = foundBroker;
          method = 'meus_imoveis';
          console.log(`✅ Corretor via Meus Imóveis (validado no ACL): ${broker.name}`);
          return { broker, method };
        }
      }
      
      // Se não encontrou no ACL, usar dados da tabela mesmo (sem checar limite)
      if (!broker && manual.corretor_nome) {
        broker = { 
          name: manual.corretor_nome, 
          id: manual.corretor_id, 
          phone: normalizePhone(manual.corretor_telefone),
          email: manual.corretor_email
        };
        method = 'meus_imoveis';
        console.log(`✅ Corretor via Meus Imóveis (não validado no ACL): ${broker.name}`);
        return { broker, method };
      }
    }
  }
  
  // 3. ROLETA - nenhum corretor responsável encontrado
  console.log(`⚙️ Código ${propertyCode || 'N/A'} sem corretor responsável, usando roleta...`);
  const roletaBroker = await getNextBrokerFromRoleta(tenantId);
  
  if (roletaBroker) {
    broker = roletaBroker;
    method = 'roleta';
    console.log(`🎰 Corretor via roleta: ${broker.name}`);
    return { broker, method };
  }
  
  return { broker: null, method: null };
};

/**
 * Roleta racional de corretores (Multi-tenant)
 * Fonte primária: roleta_participantes (corretores selecionados pelo admin)
 * Fallback 1: Acessos e Permissões (tenant_memberships + tenant_brokers)
 * Fallback 2: imoveis_corretores (para compatibilidade)
 */
const getNextBrokerFromRoleta = async (tenantId) => {
  try {
    let brokerList = [];
    
    // 1. FONTE PRIMÁRIA: Buscar corretores ATIVOS na tabela roleta_participantes
    const { data: participantes, error: participantesError } = await supabase
      .from('roleta_participantes')
      .select('broker_id, broker_name, broker_email, broker_phone')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    
    if (!participantesError && participantes && participantes.length > 0) {
      brokerList = participantes.map(p => ({
        id: p.broker_id,
        name: p.broker_name,
        email: p.broker_email,
        phone: normalizePhone(p.broker_phone)
      }));
      console.log(`🎰 Roleta: ${brokerList.length} corretor(es) configurados na roleta`);
    }
    
    // 2. FALLBACK 1: Se não houver participantes configurados, usar ACL (todos os corretores)
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor configurado na roleta, usando ACL...');
      brokerList = await getAllBrokersFromACL(tenantId);
    }
    
    // 3. FALLBACK 2: Se não houver no ACL, tentar imoveis_corretores
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor no ACL, tentando imoveis_corretores...');
      const { data: brokers } = await supabase
        .from('imoveis_corretores')
        .select('corretor_nome, corretor_id, corretor_telefone, corretor_email')
        .eq('tenant_id', tenantId)
        .not('corretor_nome', 'is', null);
      
      if (brokers && brokers.length > 0) {
        // Deduplicar por nome
        const seen = new Set();
        brokerList = brokers
          .filter(b => {
            if (seen.has(b.corretor_nome)) return false;
            seen.add(b.corretor_nome);
            return true;
          })
          .map(b => ({
            id: b.corretor_id,
            name: b.corretor_nome,
            phone: normalizePhone(b.corretor_telefone),
            email: b.corretor_email
          }));
      }
    }
    
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor disponível para roleta');
      return null;
    }

    // Filtrar corretores bloqueados por limite de leads
    const { data: limitCfg } = await supabase
      .from('tenant_lead_limit_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (limitCfg?.lead_limit_enabled) {
      const eligibleList = [];
      for (const b of brokerList) {
        const bid = b.id || b.auth_user_id;
        const check = await checkBrokerLeadLimitForTenant(tenantId, bid);
        if (check.eligible) {
          eligibleList.push(b);
        } else {
          console.log(`⚠️ Roleta: ${b.name} ignorado — ${check.reason}`);
        }
      }
      if (eligibleList.length === 0) {
        console.log('⚠️ Roleta: todos os corretores estão no limite de leads');
        return null;
      }
      brokerList = eligibleList;
      console.log(`🎰 Roleta após filtro de limite: ${brokerList.length} corretor(es) elegível(is)`);
    }

    // Estado da roleta por tenant (round-robin)
    if (!tenantRoletaState.has(tenantId)) {
      tenantRoletaState.set(tenantId, { lastIndex: -1 });
    }
    
    const state = tenantRoletaState.get(tenantId);
    const nextIndex = (state.lastIndex + 1) % brokerList.length;
    state.lastIndex = nextIndex;
    
    const selectedBroker = brokerList[nextIndex];
    console.log(`🎰 Roleta: ${nextIndex + 1}/${brokerList.length} - ${selectedBroker.name}`);
    return selectedBroker;
  } catch (error) {
    console.error('❌ Erro na roleta:', error);
    return null;
  }
};

/**
 * Mapear stage (int ou string) para status do Kanban (string)
 * Usado para compatibilidade entre API e Kanban do corretor
 */
const mapStageToKanbanStatus = (stage) => {
  const stageMap = {
    1: 'Novos Leads',
    2: 'Interação',
    3: 'Visita Agendada',
    4: 'Visita Realizada',
    5: 'Negociação',
    6: 'Proposta Criada',
    7: 'Proposta Enviada',
    8: 'Proposta Assinada',
    9: 'Proposta Assinada',
    'new': 'Novos Leads',
    'contacted': 'Interação',
    'qualified': 'Interação',
    'visit_scheduled': 'Visita Agendada',
    'visit_done': 'Visita Realizada',
    'negotiation': 'Negociação',
    'proposal': 'Proposta Criada',
    'closed_won': 'Proposta Assinada',
    'closed_lost': 'Arquivado'
  };
  return stageMap[stage] || stageMap[parseInt(stage)] || 'Novos Leads';
};

/**
 * Mapear temperatura para formato do CRM
 */
const mapTemperatureToCRM = (temp) => {
  const tempMap = {
    1: 'Frio', 2: 'Morno', 3: 'Quente',
    'cold': 'Frio', 'warm': 'Morno', 'hot': 'Quente',
    'frio': 'Frio', 'morno': 'Morno', 'quente': 'Quente'
  };
  return tempMap[temp] || tempMap[String(temp).toLowerCase()] || 'Frio';
};

// POST /api/v1/leads - Criar lead com atribuição automática
// Pipeline: attendedBy → XML/cache → Meus Imóveis → Roleta
// INSERE EM: kenlo_leads (Central de Leads) + leads (Kanban do Corretor)
app.post('/api/v1/leads', validateApiKey, async (req, res) => {
  try {
    const { 
      name, phone, email, portal, message, comments,
      interest_reference, property_code, codigo_imovel,
      is_exclusive, exclusivo, imovel_exclusivo,
      interest_type, interest_is_sale, interest_is_rent, interest_image, 
      attended_by, assigned_agent, corretor, broker_id,
      stage, etapa_funil, temperature, temperatura,
      lead_type, tipo_lead,
      raw_data, auto_assign = true
    } = req.body;
    
    // Normalizar lead_type: 1 = Interessado (default), 2 = Proprietário
    const normalizedLeadType = (() => {
      const rawType = lead_type || tipo_lead;
      if (rawType === 2 || rawType === '2' || String(rawType).toLowerCase() === 'proprietario' || String(rawType).toLowerCase() === 'proprietário') {
        return 2;
      }
      return 1; // Default: Interessado
    })();
    
    // Normalizar campos
    const propertyCode = interest_reference || property_code || codigo_imovel;
    const explicitBroker = attended_by || assigned_agent || corretor;
    const leadStage = normalizeStage(stage || etapa_funil);
    const leadTemperature = normalizeTemperature(temperature || temperatura);
    const leadMessage = message || comments;
    const explicitExclusiveValue = is_exclusive ?? exclusivo ?? imovel_exclusivo;
    const normalizedExclusive = explicitExclusiveValue === undefined || explicitExclusiveValue === null
      ? null
      : explicitExclusiveValue === true || explicitExclusiveValue === 'true' || explicitExclusiveValue === '1' || explicitExclusiveValue === 1 || String(explicitExclusiveValue).toLowerCase() === 'sim';

    if (!name && !phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Nome ou telefone é obrigatório'
        }
      });
    }

    let assignedBroker = null;
    let assignedBrokerId = broker_id || null;
    let assignmentMethod = null;
    let propertyImage = interest_image;
    const resolvedIsExclusive = normalizedExclusive !== null
      ? normalizedExclusive
      : await resolvePropertyExclusivity(req.tenantId, propertyCode);

    // Atribuição automática se não veio corretor explícito
    if (!explicitBroker && auto_assign !== false) {
      const { broker, method } = await resolveBrokerForLead(propertyCode, req.tenantId, raw_data);
      if (broker) {
        assignedBroker = broker.name;
        assignedBrokerId = broker.id || broker.auth_user_id || null;
        assignmentMethod = method;
      }
    } else if (explicitBroker) {
      assignedBroker = explicitBroker;
      assignmentMethod = 'explicit';
      // Tentar encontrar o ID do corretor pelo nome
      if (!assignedBrokerId) {
        const foundBroker = await findBrokerByIdentifier(req.tenantId, { name: explicitBroker });
        if (foundBroker) {
          assignedBrokerId = foundBroker.id || foundBroker.auth_user_id;
        }
      }
    }

    // Buscar foto do imóvel se não informada
    if (!propertyImage && propertyCode) {
      const { data: cached } = await supabase
        .from('properties_cache')
        .select('main_photo')
        .eq('tenant_id', req.tenantId)
        .eq('property_code', propertyCode.trim().toUpperCase())
        .single();
      propertyImage = cached?.main_photo || null;
    }

    // ============================================
    // 1. INSERIR EM kenlo_leads (Central de Leads)
    // ============================================
    const kenloLeadData = {
      tenant_id: req.tenantId,
      client_name: name,
      client_phone: phone,
      client_email: email,
      portal: portal || 'API',
      message: leadMessage,
      interest_reference: propertyCode?.trim().toUpperCase() || null,
      interest_type: interest_type || (propertyCode ? 'property' : null),
      interest_is_sale: interest_is_sale,
      interest_is_rent: interest_is_rent,
      interest_image: propertyImage,
      is_exclusive: resolvedIsExclusive,
      attended_by_name: assignedBroker,
      stage: leadStage,
      temperature: leadTemperature,
      external_id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      lead_timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      raw_data: { 
        source: 'API', 
        original_request: req.body, 
        auto_assigned: assignmentMethod !== 'explicit' && assignedBroker ? { broker: assignedBroker, method: assignmentMethod } : null
      }
    };

    const { data: kenloData, error: kenloError } = await supabase
      .from('kenlo_leads')
      .insert(kenloLeadData)
      .select()
      .single();

    if (kenloError) {
      console.error('❌ Erro ao inserir em kenlo_leads:', kenloError);
      throw kenloError;
    }

    // ============================================
    // 2. INSERIR EM leads (Kanban do Corretor)
    // Esta é a tabela que o Kanban "Meus Leads" lê
    // ============================================
    const kanbanStatus = mapStageToKanbanStatus(stage || etapa_funil || 1);
    const kanbanTemperature = mapTemperatureToCRM(temperature || temperatura || 'cold');

    const crmLeadData = {
      tenant_id: req.tenantId,
      name: name || 'Lead sem nome',
      phone: phone,
      email: email,
      source: portal || 'API',
      source_lead_id: kenloData.id, // Referência ao kenlo_leads
      status: kanbanStatus,
      temperature: kanbanTemperature,
      property_code: propertyCode?.trim().toUpperCase() || null,
      is_exclusive: resolvedIsExclusive,
      assigned_agent_id: assignedBrokerId,
      assigned_agent_name: assignedBroker,
      comments: leadMessage,
      lead_type: normalizedLeadType, // 1 = Interessado (default), 2 = Proprietário
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: crmData, error: crmError } = await supabase
      .from('leads')
      .insert(crmLeadData)
      .select()
      .single();

    if (crmError) {
      console.error('❌ Erro ao inserir em leads (CRM):', crmError);
      // Não falhar a requisição, apenas logar (lead já foi criado em kenlo_leads)
    } else {
      console.log(`✅ Lead criado no Kanban: ${crmData.id} → ${assignedBroker || 'Sem corretor'} (${kanbanStatus})`);
    }

    // Mapear resposta
    const mappedLead = {
      id: kenloData.id,
      crm_id: crmData?.id || null,
      tenant_id: kenloData.tenant_id,
      external_id: kenloData.external_id,
      name: kenloData.client_name,
      phone: kenloData.client_phone,
      email: kenloData.client_email,
      portal: kenloData.portal,
      message: kenloData.message,
      property_code: kenloData.interest_reference,
      interest_reference: kenloData.interest_reference,
      is_exclusive: resolvedIsExclusive,
      interest_image: kenloData.interest_image,
      interest_type: kenloData.interest_type,
      interest_is_sale: kenloData.interest_is_sale,
      interest_is_rent: kenloData.interest_is_rent,
      assigned_agent: kenloData.attended_by_name,
      assigned_agent_id: assignedBrokerId,
      attended_by: kenloData.attended_by_name,
      stage: kenloData.stage,
      kanban_status: kanbanStatus,
      temperature: kenloData.temperature,
      lead_timestamp: kenloData.lead_timestamp,
      created_at: kenloData.created_at
    };

    const response = {
      success: true,
      data: mappedLead,
      message: assignedBroker 
        ? `Lead criado e atribuído a ${assignedBroker} (via ${assignmentMethod})`
        : 'Lead criado com sucesso na Central de Leads'
    };
    
    if (assignedBroker && assignmentMethod !== 'explicit') {
      response.auto_assigned = {
        broker_name: assignedBroker,
        broker_id: assignedBrokerId,
        method: assignmentMethod
      };
    }
    
    res.status(201).json(response);
  } catch (error) {
    console.error('❌ Erro ao criar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PUT /api/v1/leads/:id - Atualizar lead (completo) na Central de Leads
app.put('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, phone, email, portal, message, 
      attended_by, assigned_agent, corretor,
      interest_reference, property_code, codigo_imovel,
      stage, etapa_funil, temperature, temperatura
    } = req.body;
    
    // Normalizar campos
    const propertyCode = interest_reference || property_code || codigo_imovel;
    const broker = attended_by || assigned_agent || corretor;
    const leadStage = (stage || etapa_funil) ? normalizeStage(stage || etapa_funil) : null;
    const leadTemperature = (temperature || temperatura) ? normalizeTemperature(temperature || temperatura) : null;
    
    // Mapear para estrutura da kenlo_leads
    const updateData = {
      updated_at: new Date().toISOString()
    };
    if (name) updateData.client_name = name;
    if (phone) updateData.client_phone = phone;
    if (email) updateData.client_email = email;
    if (portal) updateData.portal = portal;
    if (message) updateData.message = message;
    if (broker) updateData.attended_by_name = broker;
    if (propertyCode) updateData.interest_reference = propertyCode;
    if (leadStage) updateData.stage = leadStage;
    if (leadTemperature) updateData.temperature = leadTemperature;

    const { data, error } = await supabase
      .from('kenlo_leads')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead com ID ${id} não encontrado`
          }
        });
      }
      throw error;
    }

    // Mapear resposta
    const mappedLead = {
      id: data.id,
      tenant_id: data.tenant_id,
      name: data.client_name,
      phone: data.client_phone,
      email: data.client_email,
      portal: data.portal,
      message: data.message,
      property_code: data.interest_reference,
      interest_reference: data.interest_reference,
      assigned_agent: data.attended_by_name,
      attended_by: data.attended_by_name,
      stage: data.stage,
      temperature: data.temperature,
      updated_at: data.updated_at
    };

    res.json({
      success: true,
      data: mappedLead,
      message: 'Lead atualizado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id - Atualizar lead (parcial) na Central de Leads
app.patch('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, phone, email, portal, message, 
      attended_by, assigned_agent, corretor,
      interest_reference, property_code, codigo_imovel,
      stage, etapa_funil, temperature, temperatura
    } = req.body;
    
    // Normalizar campos
    const propertyCode = interest_reference || property_code || codigo_imovel;
    const broker = attended_by || assigned_agent || corretor;
    const leadStage = (stage || etapa_funil) ? normalizeStage(stage || etapa_funil) : undefined;
    const leadTemperature = (temperature || temperatura) ? normalizeTemperature(temperature || temperatura) : undefined;
    
    // Mapear para estrutura da kenlo_leads
    const updateData = {
      updated_at: new Date().toISOString()
    };
    if (name !== undefined) updateData.client_name = name;
    if (phone !== undefined) updateData.client_phone = phone;
    if (email !== undefined) updateData.client_email = email;
    if (portal !== undefined) updateData.portal = portal;
    if (message !== undefined) updateData.message = message;
    if (broker !== undefined) updateData.attended_by_name = broker;
    if (propertyCode !== undefined) updateData.interest_reference = propertyCode;
    if (leadStage !== undefined) updateData.stage = leadStage;
    if (leadTemperature !== undefined) updateData.temperature = leadTemperature;

    const { data, error } = await supabase
      .from('kenlo_leads')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead com ID ${id} não encontrado`
          }
        });
      }
      throw error;
    }

    // Mapear resposta
    const mappedLead = {
      id: data.id,
      tenant_id: data.tenant_id,
      name: data.client_name,
      phone: data.client_phone,
      email: data.client_email,
      portal: data.portal,
      message: data.message,
      property_code: data.interest_reference,
      interest_reference: data.interest_reference,
      assigned_agent: data.attended_by_name,
      attended_by: data.attended_by_name,
      stage: data.stage,
      temperature: data.temperature,
      updated_at: data.updated_at
    };

    res.json({
      success: true,
      data: mappedLead,
      message: 'Lead atualizado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id/agent - Atribuir corretor (attended_by) na Central de Leads
app.patch('/api/v1/leads/:id/agent', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { attended_by, assigned_agent, corretor } = req.body;
    
    const broker = attended_by || assigned_agent || corretor;

    if (!broker) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Campo attended_by é obrigatório'
        }
      });
    }

    const { data, error } = await supabase
      .from('kenlo_leads')
      .update({ 
        attended_by_name: attended_by,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead com ID ${id} não encontrado`
          }
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data: {
        id: data.id,
        name: data.client_name,
        phone: data.client_phone,
        attended_by: data.attended_by_name,
        updated_at: data.updated_at
      },
      message: `Lead atribuído a ${attended_by}`
    });
  } catch (error) {
    console.error('❌ Erro ao atribuir corretor:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// DELETE /api/v1/leads/:id - Deletar lead da Central de Leads
app.delete('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar lead antes de deletar para retornar dados
    const { data: leadToDelete } = await supabase
      .from('kenlo_leads')
      .select('id, client_name, client_phone')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (!leadToDelete) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Lead com ID ${id} não encontrado`
        }
      });
    }

    const { error } = await supabase
      .from('kenlo_leads')
      .delete()
      .eq('id', id)
      .eq('tenant_id', req.tenantId);

    if (error) throw error;

    res.json({
      success: true,
      data: {
        id: leadToDelete.id,
        name: leadToDelete.client_name,
        phone: leadToDelete.client_phone
      },
      message: 'Lead deletado com sucesso da Central de Leads'
    });
  } catch (error) {
    console.error('❌ Erro ao deletar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/leads/batch - Criar leads em lote na Central de Leads
app.post('/api/v1/leads/batch', validateApiKey, async (req, res) => {
  try {
    const { leads } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Array de leads é obrigatório'
        }
      });
    }

    if (leads.length > 100) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Máximo de 100 leads por requisição'
        }
      });
    }

    // Mapear para estrutura da kenlo_leads (aceita múltiplos nomes de campos)
    const leadsToInsert = leads.map((lead, index) => {
      // Normalizar campos
      const propertyCode = lead.interest_reference || lead.property_code || lead.codigo_imovel;
      const broker = lead.attended_by || lead.assigned_agent || lead.corretor;
      const leadStage = normalizeStage(lead.stage || lead.etapa_funil);
      const leadTemperature = normalizeTemperature(lead.temperature || lead.temperatura);
      
      return {
        tenant_id: req.tenantId,
        client_name: lead.name,
        client_phone: lead.phone,
        client_email: lead.email,
        portal: lead.portal || 'API',
        message: lead.message || lead.comments,
        interest_reference: propertyCode,
        interest_type: lead.interest_type || (propertyCode ? 'property' : null),
        interest_is_sale: lead.interest_is_sale,
        interest_is_rent: lead.interest_is_rent,
        interest_image: lead.interest_image,
        attended_by_name: broker,
        stage: leadStage,
        temperature: leadTemperature,
        external_id: `api_batch_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
        lead_timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        raw_data: { source: 'API_BATCH', original_request: lead }
      };
    });

    const { data, error } = await supabase
      .from('kenlo_leads')
      .insert(leadsToInsert)
      .select();

    if (error) throw error;

    // Mapear resposta
    const mappedData = (data || []).map(lead => ({
      id: lead.id,
      name: lead.client_name,
      phone: lead.client_phone,
      email: lead.client_email,
      portal: lead.portal,
      created_at: lead.created_at
    }));

    res.status(201).json({
      success: true,
      data: mappedData,
      count: mappedData.length,
      message: `${mappedData.length} leads criados com sucesso na Central de Leads`
    });
  } catch (error) {
    console.error('❌ Erro ao criar leads em lote:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/leads/upsert - Criar ou atualizar lead por telefone na Central de Leads
app.post('/api/v1/leads/upsert', validateApiKey, async (req, res) => {
  try {
    const { 
      phone, name, email, portal, message, comments,
      interest_reference, property_code, codigo_imovel,
      attended_by, assigned_agent, corretor,
      stage, etapa_funil, temperature, temperatura
    } = req.body;
    
    // Normalizar campos
    const propertyCode = interest_reference || property_code || codigo_imovel;
    const broker = attended_by || assigned_agent || corretor;
    const leadStage = normalizeStage(stage || etapa_funil);
    const leadTemperature = normalizeTemperature(temperature || temperatura);
    const leadMessage = message || comments;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Telefone é obrigatório para upsert'
        }
      });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // Verificar se existe na Central de Leads
    const { data: existing } = await supabase
      .from('kenlo_leads')
      .select('id')
      .eq('tenant_id', req.tenantId)
      .or(`client_phone.ilike.%${cleanPhone}%,client_phone.ilike.%${phone}%`)
      .limit(1);

    let result;
    let isNew = false;

    if (existing && existing.length > 0) {
      // Atualizar
      const updateData = { updated_at: new Date().toISOString() };
      if (name) updateData.client_name = name;
      if (email) updateData.client_email = email;
      if (portal) updateData.portal = portal;
      if (leadMessage) updateData.message = leadMessage;
      if (propertyCode) updateData.interest_reference = propertyCode;
      if (broker) updateData.attended_by_name = broker;
      if (stage || etapa_funil) updateData.stage = leadStage;
      if (temperature || temperatura) updateData.temperature = leadTemperature;

      const { data, error } = await supabase
        .from('kenlo_leads')
        .update(updateData)
        .eq('id', existing[0].id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Criar
      const { data, error } = await supabase
        .from('kenlo_leads')
        .insert({
          tenant_id: req.tenantId,
          client_name: name,
          client_phone: phone,
          client_email: email,
          portal: portal || 'API',
          message: leadMessage,
          interest_reference: propertyCode,
          interest_type: propertyCode ? 'property' : null,
          attended_by_name: broker,
          stage: leadStage,
          temperature: leadTemperature,
          external_id: `api_upsert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          lead_timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          raw_data: { source: 'API_UPSERT', original_request: req.body }
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
      isNew = true;
    }

    // Mapear resposta
    const mappedLead = {
      id: result.id,
      name: result.client_name,
      phone: result.client_phone,
      email: result.client_email,
      portal: result.portal,
      created_at: result.created_at,
      updated_at: result.updated_at
    };

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: mappedLead,
      created: isNew,
      message: isNew ? 'Lead criado com sucesso na Central de Leads' : 'Lead atualizado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro no upsert:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// API v1 - ROLETA DE CORRETORES
// ============================================

// GET /api/v1/roleta - Consultar estado da roleta da imobiliária
// Retorna todos os participantes ativos e quem será o próximo a receber um lead
app.get('/api/v1/roleta', validateApiKey, async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // Buscar participantes ativos da roleta (fonte primária)
    const { data: participantes, error: participantesError } = await supabase
      .from('roleta_participantes')
      .select('broker_id, broker_name, broker_email, broker_phone, is_active, created_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    let brokerList = [];
    let source = 'roleta_participantes';

    if (!participantesError && participantes && participantes.length > 0) {
      brokerList = participantes.map((p, index) => ({
        position: index + 1,
        broker_id: p.broker_id,
        name: p.broker_name,
        email: p.broker_email || null,
        phone: p.broker_phone || null,
        added_at: p.created_at
      }));
    } else {
      // Fallback: buscar corretores do ACL
      source = 'tenant_memberships';
      const aclBrokers = await getAllBrokersFromACL(tenantId);
      brokerList = aclBrokers.map((b, index) => ({
        position: index + 1,
        broker_id: b.id,
        name: b.name,
        email: b.email || null,
        phone: b.phone || null,
        added_at: null
      }));
    }

    // Calcular quem é o próximo (sem avançar o índice — apenas leitura)
    const state = tenantRoletaState.get(tenantId);
    const lastIndex = state ? state.lastIndex : -1;
    const nextIndex = brokerList.length > 0 ? (lastIndex + 1) % brokerList.length : null;
    const nextBroker = nextIndex !== null ? brokerList[nextIndex] : null;

    // Marcar o próximo na lista
    const brokersWithStatus = brokerList.map((b, i) => ({
      ...b,
      is_next: i === nextIndex
    }));

    res.json({
      success: true,
      data: {
        total: brokerList.length,
        source,
        next_broker: nextBroker
          ? { position: nextBroker.position, name: nextBroker.name, broker_id: nextBroker.broker_id, phone: nextBroker.phone, email: nextBroker.email }
          : null,
        brokers: brokersWithStatus
      },
      message: brokerList.length === 0
        ? 'Nenhum corretor configurado na roleta'
        : `Roleta com ${brokerList.length} corretor(es). Próximo: ${nextBroker?.name || 'N/A'}`
    });
  } catch (error) {
    console.error('❌ Erro ao buscar roleta:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// ============================================
// FILA POR EQUIPE — Team Queue
// ============================================

/**
 * Retorna os corretores elegíveis para receber um lead via fila da equipe.
 * Busca membros com mesmo leader_user_id e mesma equipe que o corretor original,
 * excluindo o próprio corretor e somente role = corretor.
 */
const getNextBrokerFromTeamQueue = async (tenantId, originalCorretorUserId, originalCorretorName) => {
  try {
    // 1. Localizar dados do corretor original
    let originalMember = null;
    if (originalCorretorUserId) {
      const { data } = await supabase
        .from('tenant_memberships')
        .select('user_id, leader_user_id, permissions')
        .eq('tenant_id', tenantId)
        .eq('user_id', originalCorretorUserId)
        .single();
      originalMember = data;
    }

    if (!originalMember && originalCorretorName) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id')
        .ilike('full_name', originalCorretorName.trim())
        .limit(1);
      if (profiles?.[0]?.id) {
        const { data } = await supabase
          .from('tenant_memberships')
          .select('user_id, leader_user_id, permissions')
          .eq('tenant_id', tenantId)
          .eq('user_id', profiles[0].id)
          .single();
        originalMember = data;
      }
    }

    if (!originalMember?.leader_user_id || !(originalMember.permissions?.team)) {
      console.log('ℹ️ [teamQueue] Corretor sem leader_user_id ou equipe — sem fila de equipe');
      return null;
    }

    const { leader_user_id, permissions } = originalMember;
    const team = permissions.team;

    // 2. Buscar candidatos elegíveis
    const { data: members, error } = await supabase
      .from('tenant_memberships')
      .select('user_id, permissions')
      .eq('tenant_id', tenantId)
      .eq('role', 'corretor')
      .eq('leader_user_id', leader_user_id)
      .neq('user_id', originalMember.user_id);

    if (error || !members || members.length === 0) return null;

    const sameTeam = members.filter(m => m.permissions?.team === team);
    if (sameTeam.length === 0) return null;

    // 3. Obter perfis dos candidatos
    const userIds = sameTeam.map(m => m.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, phone')
      .in('id', userIds);

    const candidates = sameTeam
      .map(m => {
        const p = profiles?.find(pr => pr.id === m.user_id);
        if (!p) return null;
        return {
          id: m.user_id,
          name: p.full_name || p.email?.split('@')[0] || 'Corretor',
          email: p.email || '',
          phone: normalizePhone(p.phone),
          team,
          leader_user_id
        };
      })
      .filter(Boolean);

    if (candidates.length === 0) return null;

    // 4. Escolher o com menos atribuições recentes (últimos 30 dias)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: history } = await supabase
      .from('lead_queue_history')
      .select('redistributed_to_user_id')
      .eq('tenant_id', tenantId)
      .eq('success', true)
      .gte('created_at', since);

    const counts = new Map(candidates.map(c => [c.id, 0]));
    (history || []).forEach(h => {
      if (h.redistributed_to_user_id && counts.has(h.redistributed_to_user_id)) {
        counts.set(h.redistributed_to_user_id, (counts.get(h.redistributed_to_user_id) || 0) + 1);
      }
    });

    const sorted = [...candidates].sort((a, b) => {
      const diff = (counts.get(a.id) || 0) - (counts.get(b.id) || 0);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

    console.log(`✅ [teamQueue] Próximo da fila: ${sorted[0].name} (equipe ${team})`);
    return sorted[0];
  } catch (error) {
    console.error('❌ [teamQueue] Erro:', error);
    return null;
  }
};

// POST /api/v1/bolsao/:id/redistribute - Redistribuir lead via fila da equipe
app.post('/api/v1/bolsao/:id/redistribute', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const bolsaoId = parseInt(id, 10);

    if (isNaN(bolsaoId)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'ID do bolsão inválido' } });
    }

    const { data: lead, error: leadError } = await supabase
      .from('bolsao')
      .select('id, tenant_id, corretor, corretor_responsavel, original_corretor_user_id, queue_attempt')
      .eq('id', bolsaoId)
      .eq('tenant_id', tenantId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead não encontrado' } });
    }

    const originalName = lead.corretor_responsavel || lead.corretor || null;
    const nextBroker = await getNextBrokerFromTeamQueue(tenantId, lead.original_corretor_user_id || null, originalName);

    if (!nextBroker) {
      return res.json({
        success: true,
        redistributed: false,
        message: 'Nenhum membro elegível na fila da equipe. Lead permanece no Bolsão.'
      });
    }

    const attemptNumber = (lead.queue_attempt || 0) + 1;
    const agora = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('bolsao')
      .update({
        corretor_responsavel: nextBroker.name,
        numero_corretor_responsavel: nextBroker.phone || null,
        data_atribuicao: agora,
        status: 'novo',
        atendido: false,
        data_atendimento: null,
        queue_attempt: attemptNumber,
        original_corretor_user_id: lead.original_corretor_user_id || null
      })
      .eq('id', bolsaoId);

    if (updateError) throw updateError;

    await supabase.from('lead_queue_history').insert({
      tenant_id: tenantId,
      bolsao_lead_id: bolsaoId,
      original_corretor_name: originalName,
      original_corretor_user_id: lead.original_corretor_user_id || null,
      redistributed_to_name: nextBroker.name,
      redistributed_to_user_id: nextBroker.id,
      team: nextBroker.team,
      leader_user_id: nextBroker.leader_user_id,
      reason: 'expired_no_response_team_queue',
      attempt_number: attemptNumber,
      success: true
    });

    console.log(`✅ [teamQueue] Lead #${bolsaoId} redistribuído → ${nextBroker.name} (tentativa ${attemptNumber})`);
    res.json({
      success: true,
      redistributed: true,
      data: {
        broker_name: nextBroker.name,
        broker_id: nextBroker.id,
        team: nextBroker.team,
        attempt_number: attemptNumber
      },
      message: `Lead redistribuído para ${nextBroker.name} via fila da equipe`
    });
  } catch (error) {
    console.error('❌ Erro ao redistribuir lead:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
});

// GET /api/v1/team-queue/candidates - Candidatos elegíveis para um corretor
app.get('/api/v1/team-queue/candidates', validateApiKey, async (req, res) => {
  try {
    const { corretor_user_id, corretor_name } = req.query;
    const tenantId = req.tenantId;

    const nextBroker = await getNextBrokerFromTeamQueue(tenantId, corretor_user_id || null, corretor_name || null);

    res.json({
      success: true,
      data: nextBroker ? [nextBroker] : [],
      message: nextBroker ? `Próximo da fila: ${nextBroker.name}` : 'Nenhum candidato elegível'
    });
  } catch (error) {
    console.error('❌ Erro ao buscar candidatos:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
});

// POST /api/v1/leads/roleta - Cadastrar lead com distribuição FORÇADA via roleta
// Sempre distribui para o próximo corretor da roleta (ignora pipeline de imóvel)
// Suporta stage/etapa_funil para definir em qual etapa do funil o lead entra
app.post('/api/v1/leads/roleta', validateApiKey, async (req, res) => {
  try {
    const {
      name, phone, email, portal, message, comments,
      interest_reference, property_code, codigo_imovel,
      interest_type, interest_is_sale, interest_is_rent, interest_image,
      stage, etapa_funil, temperature, temperatura,
      lead_type, tipo_lead
    } = req.body;

    // Validação
    if (!name && !phone) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Nome ou telefone é obrigatório' }
      });
    }

    // Normalizar campos
    const propertyCode = interest_reference || property_code || codigo_imovel;
    const leadStage = normalizeStage(stage || etapa_funil);
    const leadTemperature = normalizeTemperature(temperature || temperatura);
    const leadMessage = message || comments;
    const normalizedLeadType = (() => {
      const rawType = lead_type || tipo_lead;
      if (rawType === 2 || rawType === '2' || String(rawType).toLowerCase() === 'proprietario' || String(rawType).toLowerCase() === 'proprietário') {
        return 2;
      }
      return 1;
    })();

    // Distribuição FORÇADA via roleta (ignora imóvel/pipeline)
    const broker = await getNextBrokerFromRoleta(req.tenantId);

    if (!broker) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'NO_BROKER_AVAILABLE',
          message: 'Nenhum corretor disponível na roleta. Configure participantes em Configurações > Roleta.'
        }
      });
    }

    const assignedBroker = broker.name;
    const assignedBrokerId = broker.id || broker.auth_user_id || null;

    // Buscar foto do imóvel se não informada
    let propertyImage = interest_image;
    if (!propertyImage && propertyCode) {
      const { data: cached } = await supabase
        .from('properties_cache')
        .select('main_photo')
        .eq('tenant_id', req.tenantId)
        .eq('property_code', propertyCode.trim().toUpperCase())
        .single();
      propertyImage = cached?.main_photo || null;
    }

    // 1. INSERIR EM kenlo_leads (Central de Leads)
    const kenloLeadData = {
      tenant_id: req.tenantId,
      client_name: name,
      client_phone: phone,
      client_email: email,
      portal: portal || 'API',
      message: leadMessage,
      interest_reference: propertyCode?.trim().toUpperCase() || null,
      interest_type: interest_type || (propertyCode ? 'property' : null),
      interest_is_sale: interest_is_sale,
      interest_is_rent: interest_is_rent,
      interest_image: propertyImage,
      attended_by_name: assignedBroker,
      stage: leadStage,
      temperature: leadTemperature,
      external_id: `api_roleta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      lead_timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      raw_data: {
        source: 'API_ROLETA',
        original_request: req.body,
        auto_assigned: { broker: assignedBroker, method: 'roleta_forced' }
      }
    };

    const { data: kenloData, error: kenloError } = await supabase
      .from('kenlo_leads')
      .insert(kenloLeadData)
      .select()
      .single();

    if (kenloError) {
      console.error('❌ Erro ao inserir em kenlo_leads (roleta):', kenloError);
      throw kenloError;
    }

    // 2. INSERIR EM leads (Kanban do Corretor)
    const kanbanStatus = mapStageToKanbanStatus(stage || etapa_funil || 1);
    const kanbanTemperature = mapTemperatureToCRM(temperature || temperatura || 'cold');

    const crmLeadData = {
      tenant_id: req.tenantId,
      name: name || 'Lead sem nome',
      phone: phone,
      email: email,
      source: portal || 'API',
      source_lead_id: kenloData.id,
      status: kanbanStatus,
      temperature: kanbanTemperature,
      property_code: propertyCode?.trim().toUpperCase() || null,
      assigned_agent_id: assignedBrokerId,
      assigned_agent_name: assignedBroker,
      comments: leadMessage,
      lead_type: normalizedLeadType,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: crmData, error: crmError } = await supabase
      .from('leads')
      .insert(crmLeadData)
      .select()
      .single();

    if (crmError) {
      console.error('❌ Erro ao inserir em leads/Kanban (roleta):', crmError);
    } else {
      console.log(`✅ Lead roleta criado no Kanban: ${crmData.id} → ${assignedBroker} (${kanbanStatus})`);
    }

    // Mapear resposta
    const mappedLead = {
      id: kenloData.id,
      crm_id: crmData?.id || null,
      tenant_id: kenloData.tenant_id,
      external_id: kenloData.external_id,
      name: kenloData.client_name,
      phone: kenloData.client_phone,
      email: kenloData.client_email,
      portal: kenloData.portal,
      message: kenloData.message,
      property_code: kenloData.interest_reference,
      assigned_agent: assignedBroker,
      assigned_agent_id: assignedBrokerId,
      stage: kenloData.stage,
      kanban_status: kanbanStatus,
      temperature: kenloData.temperature,
      lead_timestamp: kenloData.lead_timestamp,
      created_at: kenloData.created_at
    };

    res.status(201).json({
      success: true,
      message: `Lead cadastrado com sucesso. Distribuído na roleta para o corretor ${assignedBroker}.`,
      assigned_broker: {
        name: assignedBroker,
        id: assignedBrokerId,
        phone: broker.phone || null,
        email: broker.email || null
      },
      data: mappedLead
    });
  } catch (error) {
    console.error('❌ Erro ao criar lead via roleta:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// ============================================
// API v1 - REFERENCE DATA (público)
// ============================================

app.get('/api/v1/reference/stages', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'Novos Leads', description: 'Leads recém-chegados' },
      { id: 2, name: 'Em Atendimento', description: 'Em processo de atendimento' },
      { id: 3, name: 'Interação', description: 'Cliente interagindo' },
      { id: 4, name: 'Visita Agendada', description: 'Visita marcada' },
      { id: 5, name: 'Visita Realizada', description: 'Visita concluída' },
      { id: 6, name: 'Negociação', description: 'Em negociação' },
      { id: 7, name: 'Proposta Criada', description: 'Proposta elaborada' },
      { id: 8, name: 'Proposta Enviada', description: 'Proposta enviada ao cliente' },
      { id: 9, name: 'Proposta Assinada', description: 'Venda concluída' },
      { id: 10, name: 'Arquivado', description: 'Lead arquivado' }
    ]
  });
});

app.get('/api/v1/reference/statuses', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'Novos Leads', color: '#6366f1' },
      { id: 2, name: 'Em Atendimento', color: '#8b5cf6' },
      { id: 3, name: 'Interação', color: '#a855f7' },
      { id: 4, name: 'Visita Agendada', color: '#d946ef' },
      { id: 5, name: 'Visita Realizada', color: '#ec4899' },
      { id: 6, name: 'Negociação', color: '#f43f5e' },
      { id: 7, name: 'Proposta Criada', color: '#f97316' },
      { id: 8, name: 'Proposta Enviada', color: '#eab308' },
      { id: 9, name: 'Proposta Assinada', color: '#22c55e' },
      { id: 10, name: 'Arquivado', color: '#64748b' }
    ]
  });
});

app.get('/api/v1/reference/temperatures', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, value: 'Frio', color: '#3b82f6' },
      { id: 2, value: 'Morno', color: '#f59e0b' },
      { id: 3, value: 'Quente', color: '#ef4444' }
    ]
  });
});

app.get('/api/v1/reference/sources', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 0, name: 'LIA Serhant', category: 'ai' },
      { id: 1, name: 'WhatsApp', category: 'channels' },
      { id: 2, name: 'Facebook', category: 'channels' },
      { id: 3, name: 'Instagram', category: 'channels' },
      { id: 4, name: 'Google Ads', category: 'channels' },
      { id: 5, name: 'LinkedIn', category: 'channels' },
      { id: 6, name: 'Site', category: 'channels' },
      { id: 7, name: 'Email', category: 'channels' },
      { id: 8, name: 'Landing Page', category: 'channels' },
      { id: 9, name: 'API', category: 'channels' },
      { id: 10, name: 'Zap Imóveis', category: 'portal' },
      { id: 11, name: 'Viva Real', category: 'portal' },
      { id: 12, name: 'Imovelweb', category: 'portal' },
      { id: 13, name: 'OLX', category: 'portal' },
      { id: 14, name: 'Chave na Mão', category: 'portal' },
      { id: 15, name: 'Manual', category: 'other' }
    ]
  });
});

// POST /api/v1/properties/sync - Sincronizar imóveis do XML para o banco
app.post('/api/v1/properties/sync', validateApiKey, async (req, res) => {
  try {
    const { properties } = req.body;
    
    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Array de properties é obrigatório'
        }
      });
    }
    
    console.log(`📦 Sincronizando ${properties.length} imóveis para tenant ${req.tenantId}...`);
    
    // Mapear para estrutura da tabela
    const propertiesToUpsert = properties.map(prop => ({
      tenant_id: req.tenantId,
      codigo_imovel: prop.referencia || prop.property_code || prop.codigo,
      corretor_nome: prop.corretor_nome || prop.agent_name,
      corretor_email: prop.corretor_email || prop.agent_email,
      corretor_telefone: prop.corretor_numero || prop.agent_phone,
      corretor_foto: prop.corretor_foto || prop.agent_photo,
      foto_imovel: prop.fotos?.[0] || prop.main_photo || prop.foto,
      titulo_imovel: prop.titulo || prop.title,
      tipo_imovel: prop.tipo || prop.property_type,
      valor_venda: prop.valor_venda || prop.sale_price,
      valor_locacao: prop.valor_locacao || prop.rent_price,
      updated_at: new Date().toISOString()
    }));
    
    // Upsert (insert ou update se já existir)
    const { data, error } = await supabase
      .from('imoveis_corretores')
      .upsert(propertiesToUpsert, { 
        onConflict: 'tenant_id,codigo_imovel',
        ignoreDuplicates: false 
      })
      .select();
    
    if (error) throw error;
    
    console.log(`✅ ${data?.length || 0} imóveis sincronizados com sucesso`);
    
    res.json({
      success: true,
      count: data?.length || 0,
      message: `${data?.length || 0} imóveis sincronizados com sucesso`
    });
  } catch (error) {
    console.error('❌ Erro ao sincronizar imóveis:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/properties/:code - Buscar imóvel por código
app.get('/api/v1/properties/:code', validateApiKey, async (req, res) => {
  try {
    const { code } = req.params;
    
    const { data, error } = await supabase
      .from('imoveis_corretores')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .eq('codigo_imovel', code)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Imóvel ${code} não encontrado`
          }
        });
      }
      throw error;
    }
    
    res.json({
      success: true,
      data: {
        property_code: data.codigo_imovel,
        title: data.titulo_imovel,
        property_type: data.tipo_imovel,
        main_photo: data.foto_imovel,
        agent_name: data.corretor_nome,
        agent_email: data.corretor_email,
        agent_phone: data.corretor_telefone,
        agent_photo: data.corretor_foto,
        sale_price: data.valor_venda,
        rent_price: data.valor_locacao
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar imóvel:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// API v1 - BROKERS
// Fonte: Acessos e Permissões (tenant_brokers + tenant_memberships)
// ============================================

// GET /api/v1/brokers - Listar corretores da aba "Acessos e Permissões"
app.get('/api/v1/brokers', validateApiKey, async (req, res) => {
  try {
    const { phone, tenant_id, include_assignments } = req.query;
    const effectiveTenantId = tenant_id || req.tenantId;

    // Se busca por telefone específico
    if (phone) {
      const foundBroker = await findBrokerByIdentifier(effectiveTenantId, { phone });
      
      if (foundBroker) {
        // Buscar imóveis atribuídos ao corretor
        let propertyQuery = supabase
          .from('imoveis_corretores')
          .select('codigo_imovel');
        
        if (foundBroker.id) {
          propertyQuery = propertyQuery.or(`corretor_id.eq.${foundBroker.id},corretor_nome.ilike.${foundBroker.name}`);
        } else {
          propertyQuery = propertyQuery.ilike('corretor_nome', foundBroker.name);
        }
        
        if (effectiveTenantId) propertyQuery = propertyQuery.eq('tenant_id', effectiveTenantId);
        
        const { data: assignments } = await propertyQuery;
        
        return res.json({
          success: true,
          data: [{
            ...foundBroker,
            property_codes: (assignments || []).map(a => a.codigo_imovel)
          }],
          count: 1,
          found_by: 'phone',
          source: 'acessos_permissoes'
        });
      }
      
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: `Nenhum corretor encontrado com telefone ${phone}`
      });
    }

    // ============================================
    // BUSCAR TODOS OS CORRETORES DE "ACESSOS E PERMISSÕES"
    // Esta é a fonte de verdade para listar corretores
    // ============================================
    
    const brokers = await getAllBrokersFromACL(effectiveTenantId);
    
    // Enriquecer com dados adicionais
    for (const broker of brokers) {
      broker.property_codes = [];
      broker.leads_count = 0;
    }
    
    // Buscar atribuições de imóveis para todos os corretores
    if (include_assignments === 'true' || brokers.length > 0) {
      let assignQuery = supabase
        .from('imoveis_corretores')
        .select('corretor_id, corretor_nome, codigo_imovel');
      
      if (effectiveTenantId) assignQuery = assignQuery.eq('tenant_id', effectiveTenantId);
      
      const { data: assignments } = await assignQuery;
      
      (assignments || []).forEach(a => {
        // Tentar associar por corretor_id primeiro
        let found = brokers.find(b => b.id === a.corretor_id || b.auth_user_id === a.corretor_id);
        
        // Fallback: associar por nome (case insensitive)
        if (!found && a.corretor_nome) {
          found = brokers.find(b => b.name?.toLowerCase() === a.corretor_nome?.toLowerCase());
        }
        
        if (found && a.codigo_imovel) {
          found.property_codes.push(a.codigo_imovel);
        }
      });
    }

    // Contar leads atribuídos a cada corretor
    if (brokers.length > 0) {
      let leadsQuery = supabase
        .from('kenlo_leads')
        .select('attended_by_name, corretor_id');
      
      if (effectiveTenantId) leadsQuery = leadsQuery.eq('tenant_id', effectiveTenantId);
      
      const { data: leads } = await leadsQuery;
      
      (leads || []).forEach(lead => {
        // Por corretor_id
        let found = brokers.find(b => b.id === lead.corretor_id || b.auth_user_id === lead.corretor_id);
        
        // Fallback: por nome
        if (!found && lead.attended_by_name) {
          found = brokers.find(b => b.name?.toLowerCase() === lead.attended_by_name?.toLowerCase());
        }
        
        if (found) {
          found.leads_count++;
        }
      });
    }

    res.json({
      success: true,
      data: brokers,
      count: brokers.length,
      source: 'acessos_permissoes'
    });
  } catch (error) {
    console.error('❌ Erro ao listar corretores:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/brokers/:id - Buscar corretor por ID, nome ou email
app.get('/api/v1/brokers/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const decodedId = decodeURIComponent(id);
    const effectiveTenantId = req.tenantId;

    // Buscar todos os corretores do ACL
    const allBrokers = await getAllBrokersFromACL(effectiveTenantId);
    
    // Tentar encontrar por ID, nome ou email
    let broker = allBrokers.find(b => 
      b.id === decodedId || 
      b.auth_user_id === decodedId ||
      b.broker_id === decodedId ||
      b.name?.toLowerCase() === decodedId.toLowerCase() ||
      b.email?.toLowerCase() === decodedId.toLowerCase()
    );
    
    // Tentar busca parcial por nome se não encontrou exato
    if (!broker) {
      broker = allBrokers.find(b => 
        b.name?.toLowerCase().includes(decodedId.toLowerCase())
      );
    }

    if (!broker) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Corretor "${decodedId}" não encontrado`
        }
      });
    }

    // Buscar imóveis atribuídos
    let assignQuery = supabase
      .from('imoveis_corretores')
      .select('codigo_imovel');
    
    if (broker.id) {
      assignQuery = assignQuery.or(`corretor_id.eq.${broker.id},corretor_nome.ilike.${broker.name}`);
    } else {
      assignQuery = assignQuery.ilike('corretor_nome', broker.name);
    }
    
    if (effectiveTenantId) assignQuery = assignQuery.eq('tenant_id', effectiveTenantId);
    
    const { data: assignments } = await assignQuery;
    broker.property_codes = (assignments || []).map(a => a.codigo_imovel);

    // Buscar leads atribuídos
    let leadsQuery = supabase
      .from('kenlo_leads')
      .select('id, etapa_funil, temperatura, created_at');
    
    if (broker.id) {
      leadsQuery = leadsQuery.or(`corretor_id.eq.${broker.id},attended_by_name.ilike.${broker.name}`);
    } else {
      leadsQuery = leadsQuery.ilike('attended_by_name', broker.name);
    }
    
    if (effectiveTenantId) leadsQuery = leadsQuery.eq('tenant_id', effectiveTenantId);
    
    const { data: leads } = await leadsQuery;
    
    // Calcular estatísticas
    const stats = {
      total_leads: (leads || []).length,
      by_stage: {},
      by_temperature: { cold: 0, warm: 0, hot: 0 },
      conversions: 0
    };
    
    (leads || []).forEach(lead => {
      const stage = lead.etapa_funil || 1;
      stats.by_stage[stage] = (stats.by_stage[stage] || 0) + 1;
      
      const temp = lead.temperatura || 'cold';
      if (stats.by_temperature[temp] !== undefined) {
        stats.by_temperature[temp]++;
      }
      
      if (stage === 9) stats.conversions++;
    });

    res.json({
      success: true,
      data: {
        ...broker,
        statistics: stats
      },
      source: 'acessos_permissoes'
    });
  } catch (error) {
    console.error('❌ Erro ao buscar corretor:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/brokers/:id/assign - Atribuir leads ao corretor
app.post('/api/v1/brokers/:id/assign', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { lead_ids, broker_name } = req.body;
    
    if (!lead_ids || !Array.isArray(lead_ids)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Array de lead_ids é obrigatório'
        }
      });
    }
    
    // Buscar dados do corretor em raw_data
    const brokerNameToUse = broker_name || id;
    
    const { data, error } = await supabase
      .from('kenlo_leads')
      .update({ 
        raw_data: supabase.raw(`raw_data || '{"attendedBy": [{"id": "${id}", "name": "${brokerNameToUse}"}]}'::jsonb`)
      })
      .in('id', lead_ids)
      .eq('tenant_id', req.tenantId)
      .select();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: `${data?.length || 0} leads atribuídos ao corretor ${brokerNameToUse}`,
      data: {
        broker_id: id,
        broker_name: brokerNameToUse,
        leads_updated: data?.length || 0
      }
    });
  } catch (error) {
    console.error('❌ Erro ao atribuir leads:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// API v1 - LEADS STAGE & TEMPERATURE
// ============================================

// PATCH /api/v1/leads/:id/stage - Alterar etapa do funil
app.patch('/api/v1/leads/:id/stage', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;
    
    if (stage === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'stage é obrigatório'
        }
      });
    }
    
    const { data, error } = await supabase
      .from('kenlo_leads')
      .update({ 
        etapa_funil: stage,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead ${id} não encontrado`
          }
        });
      }
      throw error;
    }
    
    res.json({
      success: true,
      message: 'Etapa atualizada',
      data: { id, stage }
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar etapa:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id/temperature - Alterar temperatura
app.patch('/api/v1/leads/:id/temperature', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    let { temperature } = req.body;
    
    if (!temperature) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'temperature é obrigatório'
        }
      });
    }
    
    // Normalizar temperatura
    const tempMap = { 'frio': 'cold', 'morno': 'warm', 'quente': 'hot' };
    temperature = tempMap[temperature.toLowerCase()] || temperature.toLowerCase();
    
    const { data, error } = await supabase
      .from('kenlo_leads')
      .update({ 
        temperatura: temperature,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead ${id} não encontrado`
          }
        });
      }
      throw error;
    }
    
    res.json({
      success: true,
      message: 'Temperatura atualizada',
      data: { id, temperature }
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar temperatura:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// API v1 - PROPERTY ASSIGNMENTS
// ============================================

// GET /api/v1/property-assignments/broker/:identifier - Buscar atribuições por corretor
app.get('/api/v1/property-assignments/broker/:identifier', validateApiKey, async (req, res) => {
  try {
    const { identifier } = req.params;
    const isPhone = /^\d+$/.test(identifier.replace(/\D/g, ''));
    
    let query = supabase
      .from('imoveis_corretores')
      .select('*')
      .eq('tenant_id', req.tenantId);
    
    if (isPhone) {
      const cleanPhone = identifier.replace(/\D/g, '');
      query = query.or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${identifier}`);
    } else {
      query = query.or(`corretor_id.eq.${identifier},corretor_nome.ilike.%${identifier}%`);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: (data || []).map(row => ({
        property_code: row.codigo_imovel,
        broker_id: row.corretor_id,
        broker_name: row.corretor_nome,
        broker_phone: row.corretor_telefone
      })),
      count: (data || []).length
    });
  } catch (error) {
    console.error('❌ Erro ao buscar atribuições do corretor:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/property-assignments - Listar atribuições de imóveis
app.get('/api/v1/property-assignments', validateApiKey, async (req, res) => {
  try {
    const { broker_id, broker_phone } = req.query;
    
    let query = supabase
      .from('imoveis_corretores')
      .select('*')
      .eq('tenant_id', req.tenantId);
    
    if (broker_id) query = query.eq('corretor_id', broker_id);
    if (broker_phone) {
      const cleanPhone = broker_phone.replace(/\D/g, '');
      query = query.or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${broker_phone}`);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: (data || []).map(row => ({
        id: row.id,
        tenant_id: row.tenant_id,
        property_code: row.codigo_imovel,
        broker_id: row.corretor_id,
        broker_name: row.corretor_nome,
        broker_email: row.corretor_email,
        broker_phone: row.corretor_telefone,
        created_at: row.created_at,
        updated_at: row.updated_at
      })),
      count: (data || []).length
    });
  } catch (error) {
    console.error('❌ Erro ao listar atribuições:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/property-assignments - Criar atribuição de imóvel
app.post('/api/v1/property-assignments', validateApiKey, async (req, res) => {
  try {
    const { property_code, broker_id, broker_name, broker_email, broker_phone } = req.body;
    
    if (!property_code) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'property_code é obrigatório'
        }
      });
    }
    
    // Verificar se já existe
    const { data: existing } = await supabase
      .from('imoveis_corretores')
      .select('id, corretor_nome')
      .eq('tenant_id', req.tenantId)
      .eq('codigo_imovel', property_code.toUpperCase());
    
    if (existing && existing.length > 0) {
      // Atualizar
      const { data, error } = await supabase
        .from('imoveis_corretores')
        .update({
          corretor_id: broker_id || null,
          corretor_nome: broker_name || null,
          corretor_email: broker_email || null,
          corretor_telefone: broker_phone || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing[0].id)
        .select()
        .single();
      
      if (error) throw error;
      
      return res.json({
        success: true,
        message: 'Atribuição atualizada',
        data: {
          id: data.id,
          property_code: data.codigo_imovel,
          broker_name: data.corretor_nome,
          previous_broker: existing[0].corretor_nome
        }
      });
    }
    
    // Criar nova
    const { data, error } = await supabase
      .from('imoveis_corretores')
      .insert({
        tenant_id: req.tenantId,
        codigo_imovel: property_code.toUpperCase(),
        corretor_id: broker_id || null,
        corretor_nome: broker_name || null,
        corretor_email: broker_email || null,
        corretor_telefone: broker_phone || null
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      message: 'Atribuição criada',
      data: {
        id: data.id,
        property_code: data.codigo_imovel,
        broker_name: data.corretor_nome
      }
    });
  } catch (error) {
    console.error('❌ Erro ao criar atribuição:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// DELETE /api/v1/property-assignments/:code - Remover atribuição
app.delete('/api/v1/property-assignments/:code', validateApiKey, async (req, res) => {
  try {
    const { code } = req.params;
    
    const { data, error } = await supabase
      .from('imoveis_corretores')
      .delete()
      .eq('tenant_id', req.tenantId)
      .eq('codigo_imovel', code.toUpperCase())
      .select();
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Atribuição para imóvel ${code} não encontrada`
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Atribuição removida',
      data: {
        property_code: code,
        broker_name: data[0].corretor_nome
      }
    });
  } catch (error) {
    console.error('❌ Erro ao remover atribuição:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// API v1 - WEBHOOKS
// ============================================

const webhooks = new Map();

// GET /api/v1/webhooks - Listar webhooks
app.get('/api/v1/webhooks', validateApiKey, async (req, res) => {
  const userWebhooks = Array.from(webhooks.values())
    .filter(w => w.api_key === req.apiKey);

  res.json({
    success: true,
    data: userWebhooks,
    count: userWebhooks.length
  });
});

// POST /api/v1/webhooks - Criar webhook
app.post('/api/v1/webhooks', validateApiKey, async (req, res) => {
  try {
    const { url, events, name } = req.body;
    
    if (!url || !events || !Array.isArray(events)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'url e events (array) são obrigatórios'
        }
      });
    }
    
    const id = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const webhook = {
      id,
      url,
      events,
      name: name || 'Webhook',
      api_key: req.apiKey,
      created_at: new Date().toISOString(),
      status: 'active'
    };
    
    webhooks.set(id, webhook);
    
    res.status(201).json({
      success: true,
      data: webhook
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// DELETE /api/v1/webhooks/:id - Remover webhook
app.delete('/api/v1/webhooks/:id', validateApiKey, async (req, res) => {
  const { id } = req.params;
  
  if (!webhooks.has(id)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Webhook não encontrado'
      }
    });
  }
  
  const webhook = webhooks.get(id);
  if (webhook.api_key !== req.apiKey) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Sem permissão para remover este webhook'
      }
    });
  }
  
  webhooks.delete(id);
  
  res.json({
    success: true,
    message: 'Webhook removido'
  });
});

// 404 para rotas da API não encontradas
app.use('/api/v1/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} não encontrado`
    }
  });
});

// ===================================
// SERVIR FRONTEND (BUILD)
// ===================================

// Servir arquivos estáticos do build
const buildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(buildPath, {
  maxAge: '1d',
  etag: true
}));

// SPA fallback - todas as rotas não-API retornam index.html
app.get('*', (req, res, next) => {
  // Ignorar rotas de API
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
    return next();
  }
  
  // Retornar index.html para rotas do React Router
  res.sendFile(path.join(buildPath, 'index.html'));
});

// ===================================
// TRATAMENTO DE ERROS
// ===================================

app.use((err, req, res, next) => {
  console.error('❌ Erro no servidor:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// ===================================
// INICIAR SERVIDOR
// ===================================

// =============================================================================
// INICIALIZAÇÃO DO SERVIDOR
// =============================================================================

console.log('🔍 VERIFICANDO ARQUIVOS NECESSÁRIOS...');

// Verificar pasta dist
console.log('   ├─ Verificando pasta dist...');
let hasBuild = true;
if (!fs.existsSync(buildPath)) {
  console.warn('');
  console.warn('╔════════════════════════════════════════════════════════════════════╗');
  console.warn('║  ⚠️  AVISO: PASTA dist NÃO ENCONTRADA                               ║');
  console.warn('╚════════════════════════════════════════════════════════════════════╝');
  console.warn('');
  console.warn('📂 Caminho esperado:', buildPath);
  console.warn('📂 API v1 funcionará normalmente em /api/v1/*');
  console.warn('');
  console.warn('💡 Para servir o frontend, execute "npm run build" primeiro');
  console.warn('');
  hasBuild = false;
} else {
  console.log('   ├─ ✅ Pasta dist encontrada:', buildPath);
}

// Verificar arquivos dentro de dist (apenas se existe)
if (hasBuild) {
  const distFiles = fs.readdirSync(buildPath);
  console.log('   ├─ Arquivos em dist:', distFiles.length, 'arquivo(s)');
  if (distFiles.length === 0) {
    console.error('   └─ ⚠️  AVISO: Pasta dist está vazia!');
  } else {
    console.log('   └─ ✅ Arquivos OK');
  }
}

console.log('');
console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║  🚀 INICIANDO SERVIDOR HTTP                                        ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`🌐 Binding na porta ${PORT}...`);
console.log(`🔌 Interface: 0.0.0.0 (todas as interfaces)`);
console.log('⏳ Aguardando...');
console.log('');

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  serverStarting = false;
  serverReady = true;
  
  const initTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const memoryUsage = process.memoryUsage();
  const memoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║               🎉 SERVIDOR INICIADO COM SUCESSO! 🎉                 ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📊 INFORMAÇÕES DO SERVIDOR:');
  console.log('   ├─ 🌐 Porta:', PORT);
  console.log('   ├─ 📌 PID:', process.pid);
  console.log('   ├─ ⏱️  Tempo de inicialização:', initTime, 'segundos');
  console.log('   ├─ 💾 Memória em uso:', memoryMB, 'MB');
  console.log('   ├─ 🏷️  Ambiente:', process.env.NODE_ENV || 'production');
  console.log('   └─ 📅 Timestamp:', new Date().toISOString());
  console.log('');
  console.log('🔗 ENDPOINTS DISPONÍVEIS:');
  console.log('   ├─ 💚 GET /healthz       → Liveness probe (use este no EasyPanel)');
  console.log('   ├─ 📊 GET /health        → Health check completo');
  console.log('   ├─ ✅ GET /ready         → Readiness probe');
  console.log('   ├─ 📡 ALL /api/kenlo     → Proxy para XML Kenlo');
  console.log('   ├─ ℹ️  GET /api/info      → Informações do servidor');
  console.log('   └─ 🌐 GET /*             → Aplicação React (SPA)');
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ SERVIDOR PRONTO - ACEITANDO CONEXÕES                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('💡 DICAS:');
  console.log('   - Para testar: curl http://localhost:' + PORT + '/healthz');
  console.log('   - Logs importantes serão exibidos abaixo');
  console.log('   - SIGTERM/SIGINT para shutdown gracioso');
  console.log('');
});

// =============================================================================
// CONFIGURAÇÕES AVANÇADAS DO SERVIDOR
// =============================================================================

// Keepalive para conexões longas
server.keepAliveTimeout = 65000; // 65 segundos
server.headersTimeout = 66000; // 66 segundos (deve ser > keepAliveTimeout)

console.log('⚙️  CONFIGURAÇÕES DO SERVIDOR:');
console.log('   ├─ Keep-Alive Timeout:', server.keepAliveTimeout, 'ms');
console.log('   └─ Headers Timeout:', server.headersTimeout, 'ms');
console.log('');

// =============================================================================
// EVENT HANDLERS DO SERVIDOR
// =============================================================================

// Tratamento de erros do servidor
server.on('error', (error) => {
  console.error('');
  console.error('╔════════════════════════════════════════════════════════════════════╗');
  console.error('║  ❌ ERRO CRÍTICO NO SERVIDOR                                       ║');
  console.error('╚════════════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error('❌ Erro:', error.message);
  console.error('❌ Código:', error.code);
  console.error('❌ Stack:', error.stack);
  console.error('');
  
  if (error.code === 'EADDRINUSE') {
    console.error('🚨 PROBLEMA: A porta', PORT, 'já está em uso');
    console.error('');
    console.error('💡 SOLUÇÕES:');
    console.error('   1. Mude a porta usando variável de ambiente: PORT=3000');
    console.error('   2. Encontre o processo usando a porta: lsof -i :' + PORT);
    console.error('   3. Mate o processo: kill -9 <PID>');
  } else if (error.code === 'EACCES') {
    console.error('🚨 PROBLEMA: Sem permissão para usar a porta', PORT);
    console.error('');
    console.error('💡 SOLUÇÕES:');
    console.error('   1. Use porta > 1024 (portas não-privilegiadas)');
    console.error('   2. Ou execute com sudo (não recomendado)');
  }
  
  console.error('');
  process.exit(1);
});

// Log quando servidor está ouvindo
server.on('listening', () => {
  const addr = server.address();
  console.log('✅ [EVENT] Server listening event fired');
  console.log('   ├─ Address:', addr.address);
  console.log('   ├─ Port:', addr.port);
  console.log('   └─ Family:', addr.family);
  console.log('');
});

// ===================================
// SIGNAL HANDLING - EASYPANEL COMPATIBLE
// ===================================
// IMPORTANTE: NÃO fazer shutdown no SIGTERM para EasyPanel
// O EasyPanel envia SIGTERM durante health checks e deploys
// O servidor deve continuar rodando e ignorar esses sinais
// ===================================

console.log('⚙️  SIGNAL HANDLING: Modo EasyPanel ativo');
console.log('   ├─ SIGTERM: Ignorado (EasyPanel compatible)');
console.log('   ├─ SIGINT: Ignorado (EasyPanel compatible)');
console.log('   └─ Servidor permanece ativo indefinidamente');
console.log('');

// Ignorar SIGTERM e SIGINT - NÃO fechar o servidor
// EasyPanel gerencia o ciclo de vida do container
process.on('SIGTERM', () => {
  console.log('📡 SIGTERM recebido - Ignorando (EasyPanel mode)');
  // NÃO fazer shutdown - manter servidor rodando
});

process.on('SIGINT', () => {
  console.log('📡 SIGINT recebido - Ignorando (EasyPanel mode)');
  // NÃO fazer shutdown - manter servidor rodando
});

// Capturar erros não tratados - apenas logar, não fechar
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
  console.error('⚠️  Servidor continua rodando...');
  // NÃO fazer shutdown
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
  console.error('⚠️  Servidor continua rodando...');
  // NÃO fazer shutdown
});

