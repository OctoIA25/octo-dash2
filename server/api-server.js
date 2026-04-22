/**
 * 🚀 OctoDash CRM API Server
 * API RESTful completa para o CRM Imobiliário
 * Base URL: /api/v1
 */

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ [api-server] Missing Supabase env vars: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Usar service_role key se disponível (bypassa RLS), senão usar anon key
const supabaseKey = supabaseServiceKey || supabaseAnonKey;
const usingServiceRole = !!supabaseServiceKey;

if (supabaseKey.startsWith('sb_') || !supabaseKey.startsWith('eyJ')) {
  console.error('❌ [api-server] Invalid Supabase key. Use JWT key (eyJ...), not publishable (sb_...).');
  process.exit(1);
}

if (!usingServiceRole) {
  console.warn('⚠️ [api-server] SUPABASE_SERVICE_ROLE_KEY não definida. Usando anon key (sujeito a RLS).');
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('🔌 [api-server] Supabase conectado:', usingServiceRole ? '(service_role)' : '(anon)');

// Tabelas do CRM
const LEADS_TABLE = 'kenlo_leads';
const BOLSAO_TABLE = 'bolsao';

// ============================================
// MIDDLEWARE - API Key Validation
// ============================================
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
  
  // Aceitar keys que começam com octo_ ou octo_sk_
  if (!apiKey.startsWith('octo_') && apiKey !== 'demo') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'API Key inválida. Keys devem começar com octo_'
      }
    });
  }
  
  // Validar API Key contra banco de dados
  if (apiKey !== 'demo') {
    try {
      const { data: keyData, error: keyError } = await supabase
        .from('tenant_api_keys')
        .select('id, tenant_id, status')
        .eq('api_key', apiKey)
        .eq('provider', 'crm')
        .eq('status', 'active')
        .single();
      
      if (keyError || !keyData) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'API Key não encontrada ou inativa'
          }
        });
      }
      
      req.tenantId = keyData.tenant_id;
      req.apiKeyId = keyData.id;
    } catch (err) {
      console.error('Erro ao validar API Key:', err);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro ao validar API Key'
        }
      });
    }
  }
  
  req.apiKey = apiKey;
  next();
};

// ============================================
// HELPERS - kenlo_leads table structure
// ============================================
const mapLeadFromDB = (row) => ({
  id: row.id || row.external_id,
  external_id: row.external_id,
  name: row.client_name || '',
  phone: row.client_phone || '',
  email: row.client_email || '',
  source: row.portal || 'API',
  portal: row.portal,
  lead_timestamp: row.lead_timestamp,
  tenant_id: row.tenant_id,
  created_at: row.created_at,
  updated_at: row.updated_at,
  // Mensagem
  message: row.message || null,
  // Imóvel de interesse
  property_code: row.interest_reference || null,
  interest_reference: row.interest_reference || null,
  interest_image: row.interest_image || null,
  interest_type: row.interest_type || null,
  interest_is_sale: row.interest_is_sale || null,
  interest_is_rent: row.interest_is_rent || null,
  // Funil e temperatura
  stage: row.stage || 1,
  temperature: row.temperature || 'cold',
  // Corretor
  assigned_agent: row.attended_by_name || null,
  status: row.status || 'novo',
  // Arquivamento
  archived_at: row.archived_at || null,
  archive_reason: row.archive_reason || null,
  is_archived: !!row.archived_at,
  // Raw data (opcional, pode ser grande)
  raw_data: row.raw_data
});

const mapLeadToDB = (lead) => {
  const mapped = {};
  
  // Campos básicos do cliente
  if (lead.name !== undefined) mapped.client_name = lead.name;
  if (lead.phone !== undefined) mapped.client_phone = lead.phone;
  if (lead.email !== undefined) mapped.client_email = lead.email;
  
  // Portal/Origem
  if (lead.source !== undefined) mapped.portal = lead.source;
  if (lead.portal !== undefined) mapped.portal = lead.portal;
  
  // Tenant e IDs
  if (lead.tenant_id !== undefined) mapped.tenant_id = lead.tenant_id;
  if (lead.external_id !== undefined) mapped.external_id = lead.external_id;
  
  // Timestamp
  if (lead.timestamp !== undefined) mapped.lead_timestamp = lead.timestamp;
  if (lead.lead_timestamp !== undefined) mapped.lead_timestamp = lead.lead_timestamp;
  
  // Mensagem do lead
  if (lead.message !== undefined) mapped.message = lead.message;
  if (lead.comments !== undefined) mapped.message = lead.comments;
  
  // Imóvel de interesse - aceita múltiplos nomes de campo
  if (lead.property_code !== undefined) mapped.interest_reference = lead.property_code;
  if (lead.interest_reference !== undefined) mapped.interest_reference = lead.interest_reference;
  if (lead.codigo_imovel !== undefined) mapped.interest_reference = lead.codigo_imovel;
  
  // Detalhes do imóvel
  if (lead.interest_image !== undefined) mapped.interest_image = lead.interest_image;
  if (lead.interest_type !== undefined) mapped.interest_type = lead.interest_type;
  if (lead.interest_is_sale !== undefined) mapped.interest_is_sale = lead.interest_is_sale;
  if (lead.interest_is_rent !== undefined) mapped.interest_is_rent = lead.interest_is_rent;
  if (lead.is_exclusive !== undefined) mapped.is_exclusive = lead.is_exclusive;
  if (lead.exclusivo !== undefined) mapped.is_exclusive = lead.exclusivo;
  if (lead.imovel_exclusivo !== undefined) mapped.is_exclusive = lead.imovel_exclusivo;
  
  // Corretor responsável - aceita múltiplos nomes
  if (lead.assigned_agent !== undefined) mapped.attended_by_name = lead.assigned_agent;
  if (lead.attended_by !== undefined) mapped.attended_by_name = lead.attended_by;
  if (lead.corretor !== undefined) mapped.attended_by_name = lead.corretor;
  
  // Etapa do funil (stage) — coluna real é 'stage'
  if (lead.stage !== undefined) mapped.stage = lead.stage;
  if (lead.etapa_funil !== undefined) mapped.stage = lead.etapa_funil;
  
  // Temperatura — coluna real é 'temperature'
  if (lead.temperature !== undefined) mapped.temperature = lead.temperature;
  if (lead.temperatura !== undefined) mapped.temperature = lead.temperatura;
  
  // Arquivamento
  if (lead.archive_reason !== undefined) mapped.archive_reason = lead.archive_reason;
  if (lead.archived !== undefined && lead.archived) {
    mapped.archived_at = new Date().toISOString();
    mapped.archive_reason = lead.archive_reason || lead.motivo || 'Arquivado via API';
  }
  if (lead.archived === false) {
    mapped.archived_at = null;
    mapped.archive_reason = null;
  }
  
  // Raw data
  if (lead.raw_data !== undefined) mapped.raw_data = lead.raw_data;
  
  return mapped;
};

const resolvePropertyExclusivity = async (tenantId, propertyCode) => {
  if (!tenantId || !propertyCode) return false;

  const normalizedCode = String(propertyCode).trim().toUpperCase();

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
    console.warn('⚠️ Erro ao resolver exclusividade do imóvel:', error.message);
  }

  return false;
};

// Mappers para tabela bolsao
const mapBolsaoLeadFromDB = (row) => ({
  id: row.id,
  name: row.nome || row.client_name || '',
  phone: row.telefone || row.client_phone || '',
  email: row.email || '',
  source: row.portal || row.origem || '',
  stage: row.status === 'bolsao' ? 1 : (row.status === 'atribuido' ? 2 : 3),
  status: row.status,
  assigned_agent: row.corretor_responsavel || null,
  assigned_agent_phone: row.numero_corretor_responsavel || null,
  assigned_at: row.data_atribuicao,
  attended: row.atendido || false,
  created_at: row.created_at,
  updated_at: row.updated_at
});

// ============================================
// ROUTES - LEADS
// ============================================

// GET /api/v1/leads - Listar leads
app.get('/api/v1/leads', validateApiKey, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      stage, 
      temperature, 
      source, 
      portal,
      tenant_id,
      search,
      start_date,
      end_date,
      archived = 'false'
    } = req.query;

    let query = supabase
      .from(LEADS_TABLE)
      .select('*', { count: 'exact' });

    // Filtro de arquivamento: por padrão retorna apenas ativos
    if (archived === 'true') {
      query = query.not('archived_at', 'is', null);
    } else if (archived !== 'all') {
      query = query.is('archived_at', null);
    }

    // Escopo por tenant (via API Key)
    if (req.tenantId) query = query.eq('tenant_id', req.tenantId);

    // Filtros adicionais
    if (portal) query = query.eq('portal', portal);
    if (source) query = query.eq('portal', source);
    if (tenant_id && !req.tenantId) query = query.eq('tenant_id', tenant_id);
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

    const leads = (data || []).map(mapLeadFromDB);

    res.json({
      success: true,
      data: leads,
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

// GET /api/v1/leads/archived - Listar leads arquivados do tenant
app.get('/api/v1/leads/archived', validateApiKey, async (req, res) => {
  try {
    const { 
      page = 1,
      limit = 50,
      search,
      assigned_agent
    } = req.query;

    let query = supabase
      .from(LEADS_TABLE)
      .select('*', { count: 'exact' })
      .not('archived_at', 'is', null);

    if (req.tenantId) query = query.eq('tenant_id', req.tenantId);
    if (search) {
      query = query.or(`client_name.ilike.%${search}%,client_phone.ilike.%${search}%,client_email.ilike.%${search}%`);
    }
    if (assigned_agent) query = query.eq('attended_by_name', assigned_agent);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    query = query.order('archived_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: (data || []).map(mapLeadFromDB),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        total_pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Erro ao listar leads arquivados:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// GET /api/v1/leads/:id - Buscar lead por ID ou external_id
app.get('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    // Tentar buscar por id numérico ou external_id
    let query = supabase.from(LEADS_TABLE).select('*');
    
    // Se for numérico, buscar por id; senão, buscar por external_id
    if (!isNaN(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('external_id', id);
    }
    
    const { data, error } = await query.single();

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
      data: mapLeadFromDB(data)
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

// GET /api/v1/leads/phone/:phone - Buscar lead por telefone
app.get('/api/v1/leads/phone/:phone', validateApiKey, async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = phone.replace(/\D/g, '');

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .select('*')
      .or(`client_phone.eq.${cleanPhone},client_phone.eq.${phone}`)
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

    res.json({
      success: true,
      data: mapLeadFromDB(data[0]),
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

// ============================================
// ROLETA DE CORRETORES - Estado em memória por tenant
// ============================================
const tenantRoletaState = new Map(); // { tenant_id: { lastIndex: number, brokers: string[] } }

/**
 * Normaliza telefone para comparação (remove máscaras, DDD duplicado, etc)
 */
const normalizePhone = (phone) => {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');
  // Remover código do país se presente (55)
  if (clean.length > 11 && clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  // Se tiver 11 dígitos, está ok (DDD + 9 dígitos)
  // Se tiver 10 dígitos, adicionar 9 após DDD para celular
  if (clean.length === 10) {
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
  }
  return clean;
};

/**
 * Busca corretor responsável pelo imóvel usando pipeline:
 * 1. raw_data.attendedBy (leads Kenlo)
 * 2. properties_cache (XML sincronizado)  
 * 3. imoveis_corretores (Meus Imóveis - atribuição manual)
 * 4. Roleta (fallback)
 */
const resolveBrokerForLead = async (leadData, tenantId, rawData = null) => {
  let broker = null;
  let method = null;
  
  // 1. Verificar se já veio com attendedBy do Kenlo (raw_data)
  if (rawData?.attendedBy && Array.isArray(rawData.attendedBy) && rawData.attendedBy.length > 0) {
    const attendedBroker = rawData.attendedBy[0];
    if (attendedBroker?.name) {
      broker = {
        name: attendedBroker.name,
        id: attendedBroker.id?.toString() || null,
        phone: null
      };
      method = 'kenlo_attended_by';
      console.log(`✅ Corretor encontrado via Kenlo attendedBy: ${broker.name}`);
      return { broker, method };
    }
  }
  
  // 2. Buscar no cache de imóveis (XML sincronizado) por código
  const propertyCode = leadData.interest_reference?.trim().toUpperCase();
  if (propertyCode) {
    // 2a. Primeiro tentar properties_cache (dados do XML)
    const { data: cachedProperty } = await supabase
      .from('properties_cache')
      .select('agent_name, agent_phone, agent_email')
      .eq('tenant_id', tenantId)
      .eq('property_code', propertyCode)
      .single();
    
    if (cachedProperty?.agent_name) {
      broker = {
        name: cachedProperty.agent_name,
        phone: normalizePhone(cachedProperty.agent_phone),
        email: cachedProperty.agent_email
      };
      method = 'xml_property_cache';
      console.log(`✅ Corretor encontrado via XML/cache: ${broker.name}`);
      return { broker, method };
    }
    
    // 2b. Fallback: buscar em imoveis_corretores (Meus Imóveis - atribuição manual)
    const { data: manualAssignment } = await supabase
      .from('imoveis_corretores')
      .select('corretor_nome, corretor_id, corretor_telefone, corretor_email')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', propertyCode)
      .single();
    
    if (manualAssignment?.corretor_nome) {
      broker = {
        name: manualAssignment.corretor_nome,
        id: manualAssignment.corretor_id,
        phone: normalizePhone(manualAssignment.corretor_telefone),
        email: manualAssignment.corretor_email
      };
      method = 'meus_imoveis';
      console.log(`✅ Corretor encontrado via Meus Imóveis: ${broker.name}`);
      return { broker, method };
    }
  }
  
  // 3. Nenhum corretor encontrado - usar ROLETA
  console.log(`⚙️ Nenhum corretor encontrado para código ${propertyCode}, usando roleta...`);
  const roletaBroker = await getNextBrokerFromRoleta(tenantId);
  
  if (roletaBroker) {
    broker = roletaBroker;
    method = 'roleta';
    console.log(`🎰 Corretor atribuído via roleta: ${broker.name}`);
    return { broker, method };
  }
  
  // Nenhum corretor disponível
  console.log('⚠️ Nenhum corretor disponível para atribuição');
  return { broker: null, method: null };
};

/**
 * Obtém próximo corretor da roleta para o tenant (Multi-tenant)
 * Fonte primária: roleta_participantes (corretores selecionados pelo admin)
 * Fallback 1: tenant_memberships (todos os corretores do tenant)
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
    
    // 2. FALLBACK 1: Se não houver participantes configurados, usar tenant_memberships
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor configurado na roleta, usando memberships...');
      const { data: members } = await supabase
        .from('tenant_memberships')
        .select(`
          user_id,
          role,
          users:user_id (
            id,
            raw_user_meta_data
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('role', 'corretor');
      
      if (members && members.length > 0) {
        brokerList = members
          .filter(m => m.users?.raw_user_meta_data?.name)
          .map(m => ({
            name: m.users.raw_user_meta_data.name,
            id: m.user_id,
            phone: m.users.raw_user_meta_data.phone || null
          }));
      }
    }
    
    // 3. FALLBACK 2: Se não houver memberships, tentar imoveis_corretores
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor em memberships, tentando imoveis_corretores...');
      const { data: brokers } = await supabase
        .from('imoveis_corretores')
        .select('corretor_nome, corretor_id, corretor_telefone')
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
            name: b.corretor_nome,
            id: b.corretor_id,
            phone: b.corretor_telefone
          }));
      }
    }
    
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor disponível para roleta');
      return null;
    }
    
    // Estado da roleta por tenant (round-robin)
    if (!tenantRoletaState.has(tenantId)) {
      tenantRoletaState.set(tenantId, { lastIndex: -1 });
    }
    
    const state = tenantRoletaState.get(tenantId);
    const nextIndex = (state.lastIndex + 1) % brokerList.length;
    state.lastIndex = nextIndex;
    
    console.log(`🎰 Roleta: ${nextIndex + 1}/${brokerList.length} - ${brokerList[nextIndex].name}`);
    return brokerList[nextIndex];
  } catch (error) {
    console.error('❌ Erro na roleta:', error);
    return null;
  }
};

// POST /api/v1/leads - Criar lead com atribuição automática
// Pipeline: 1) attendedBy → 2) XML/cache → 3) Meus Imóveis → 4) Roleta
app.post('/api/v1/leads', validateApiKey, async (req, res) => {
  try {
    const leadData = mapLeadToDB(req.body);
    const { auto_assign = true, broker_id, broker_phone, raw_data, is_exclusive, exclusivo, imovel_exclusivo } = req.body;
    const tenantId = req.tenantId || leadData.tenant_id;
    
    // Definir tenant_id
    if (tenantId && !leadData.tenant_id) {
      leadData.tenant_id = tenantId;
    }
    
    // Definir timestamp se não fornecido
    if (!leadData.lead_timestamp) {
      leadData.lead_timestamp = new Date().toISOString();
    }

    // Validação: nome ou telefone é obrigatório
    if (!leadData.client_name && !leadData.client_phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Nome ou telefone é obrigatório'
        }
      });
    }
    
    // Gerar external_id se não fornecido
    if (!leadData.external_id) {
      leadData.external_id = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    const explicitExclusiveValue = is_exclusive ?? exclusivo ?? imovel_exclusivo;
    const normalizedExclusive = explicitExclusiveValue === undefined || explicitExclusiveValue === null
      ? null
      : explicitExclusiveValue === true || explicitExclusiveValue === 'true' || explicitExclusiveValue === '1' || explicitExclusiveValue === 1 || String(explicitExclusiveValue).toLowerCase() === 'sim';

    leadData.interest_reference = leadData.interest_reference ? String(leadData.interest_reference).trim().toUpperCase() : null;
    leadData.is_exclusive = normalizedExclusive !== null
      ? normalizedExclusive
      : await resolvePropertyExclusivity(tenantId, leadData.interest_reference);

    let assignedBroker = null;
    let assignmentMethod = null;

    // Auto-atribuição de corretor
    if (auto_assign !== false) {
      // Prioridade 0: broker_id ou broker_phone explícito
      if (broker_id) {
        const { data: brokerData } = await supabase
          .from('imoveis_corretores')
          .select('corretor_nome, corretor_id')
          .eq('corretor_id', broker_id)
          .limit(1);
        
        if (brokerData && brokerData.length > 0) {
          leadData.attended_by_name = brokerData[0].corretor_nome;
          assignedBroker = brokerData[0].corretor_nome;
          assignmentMethod = 'broker_id_explicit';
        }
      } else if (broker_phone) {
        const cleanPhone = normalizePhone(broker_phone);
        const { data: brokerData } = await supabase
          .from('imoveis_corretores')
          .select('corretor_nome, corretor_id, corretor_telefone')
          .or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${broker_phone}`)
          .limit(1);
        
        if (brokerData && brokerData.length > 0) {
          leadData.attended_by_name = brokerData[0].corretor_nome;
          assignedBroker = brokerData[0].corretor_nome;
          assignmentMethod = 'broker_phone_explicit';
        }
      }
      
      // Se não encontrou por ID/phone explícito, usar pipeline completo
      if (!assignedBroker && tenantId) {
        const { broker, method } = await resolveBrokerForLead(leadData, tenantId, raw_data || leadData.raw_data);
        
        if (broker) {
          leadData.attended_by_name = broker.name;
          if (broker.id) leadData.corretor_id = broker.id;
          assignedBroker = broker.name;
          assignmentMethod = method;
        }
      }
    }

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .insert(leadData)
      .select()
      .single();

    if (error) throw error;

    const response = {
      success: true,
      data: mapLeadFromDB(data),
      message: 'Lead criado com sucesso'
    };

    if (assignedBroker) {
      response.auto_assigned = {
        broker_name: assignedBroker,
        broker_id: leadData.corretor_id || null,
        method: assignmentMethod
      };
      response.message = `Lead criado e atribuído a ${assignedBroker} (via ${assignmentMethod})`;
    } else {
      response.message = 'Lead criado sem atribuição de corretor';
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

// PUT /api/v1/leads/:id - Atualizar lead (completo)
app.put('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const leadData = mapLeadToDB(req.body);
    leadData.updated_at = new Date().toISOString();

    // Buscar por id numérico ou external_id
    let query = supabase.from(LEADS_TABLE).update(leadData);
    if (!isNaN(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('external_id', id);
    }
    
    const { data, error } = await query.select().single();

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
      data: mapLeadFromDB(data),
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

// PATCH /api/v1/leads/:id - Atualizar lead (parcial)
app.patch('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const leadData = mapLeadToDB(req.body);
    leadData.updated_at = new Date().toISOString();

    // Buscar por id numérico ou external_id
    let query = supabase.from(LEADS_TABLE).update(leadData);
    if (!isNaN(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('external_id', id);
    }
    
    const { data, error } = await query.select().single();

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
      data: mapLeadFromDB(data),
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

// PATCH /api/v1/leads/:id/stage - Alterar etapa do funil
app.patch('/api/v1/leads/:id/stage', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;

    if (!stage || stage < 1 || stage > 10) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Etapa deve ser um número entre 1 e 10'
        }
      });
    }

    // Buscar lead atual para pegar etapa anterior
    let selectQuery = supabase.from(LEADS_TABLE).select('etapa_funil');
    if (!isNaN(id)) {
      selectQuery = selectQuery.eq('id', id);
    } else {
      selectQuery = selectQuery.eq('external_id', id);
    }
    const { data: currentLead } = await selectQuery.single();

    const previousStage = currentLead?.etapa_funil || 1;

    let updateQuery = supabase.from(LEADS_TABLE).update({ 
      etapa_funil: stage,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    const stageNames = {
      1: 'Novos Leads', 2: 'Em Atendimento', 3: 'Qualificado',
      4: 'Visita Agendada', 5: 'Visita Realizada', 6: 'Em Negociação',
      7: 'Proposta Criada', 8: 'Proposta Enviada', 9: 'Proposta Assinada', 10: 'Arquivado'
    };

    res.json({
      success: true,
      data: {
        ...mapLeadFromDB(data),
        stage_name: stageNames[stage],
        previous_stage: previousStage
      }
    });
  } catch (error) {
    console.error('❌ Erro ao alterar etapa:', error);
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

    // Aceitar número ou string
    const tempMap = { 1: 'cold', 2: 'warm', 3: 'hot', cold: 'cold', warm: 'warm', hot: 'hot' };
    temperature = tempMap[temperature];

    if (!temperature) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Temperatura deve ser 1 (cold), 2 (warm), 3 (hot) ou cold/warm/hot'
        }
      });
    }

    let selectQuery = supabase.from(LEADS_TABLE).select('temperatura');
    if (!isNaN(id)) {
      selectQuery = selectQuery.eq('id', id);
    } else {
      selectQuery = selectQuery.eq('external_id', id);
    }
    const { data: currentLead } = await selectQuery.single();

    const previousTemp = currentLead?.temperatura || 'cold';

    let updateQuery = supabase.from(LEADS_TABLE).update({ 
      temperatura: temperature,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    const tempNames = { cold: 'Frio', warm: 'Morno', hot: 'Quente' };

    res.json({
      success: true,
      data: {
        ...mapLeadFromDB(data),
        temperature_name: tempNames[temperature],
        previous_temperature: previousTemp
      }
    });
  } catch (error) {
    console.error('❌ Erro ao alterar temperatura:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id/agent - Atribuir corretor
app.patch('/api/v1/leads/:id/agent', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_agent, assigned_agent_id } = req.body;

    let updateQuery = supabase.from(LEADS_TABLE).update({ 
      attended_by_name: assigned_agent,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: `Lead atribuído a ${assigned_agent}`
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

// DELETE /api/v1/leads/:id - Arquivar lead (soft delete)
app.delete('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, motivo } = req.body || {};
    const archiveReason = reason || motivo || 'Arquivado via API';

    let updateQuery = supabase.from(LEADS_TABLE).update({ 
      archived_at: new Date().toISOString(),
      archive_reason: archiveReason,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    if (req.tenantId) updateQuery = updateQuery.eq('tenant_id', req.tenantId);
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: 'Lead arquivado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao arquivar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id/archive - Arquivar lead com motivo
app.patch('/api/v1/leads/:id/archive', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, motivo } = req.body || {};
    const archiveReason = reason || motivo || 'Arquivado via API';

    let updateQuery = supabase.from(LEADS_TABLE).update({
      archived_at: new Date().toISOString(),
      archive_reason: archiveReason,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    if (req.tenantId) updateQuery = updateQuery.eq('tenant_id', req.tenantId);
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: `Lead arquivado: ${archiveReason}`
    });
  } catch (error) {
    console.error('❌ Erro ao arquivar lead:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// PATCH /api/v1/leads/:id/unarchive - Desarquivar lead
app.patch('/api/v1/leads/:id/unarchive', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    let updateQuery = supabase.from(LEADS_TABLE).update({
      archived_at: null,
      archive_reason: null,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    if (req.tenantId) updateQuery = updateQuery.eq('tenant_id', req.tenantId);
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: 'Lead desarquivado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao desarquivar lead:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// POST /api/v1/leads/batch - Criar leads em lote
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

    const leadsToInsert = leads.map(lead => {
      const mapped = mapLeadToDB(lead);
      // Definir timestamp se não fornecido
      if (!mapped.lead_timestamp) {
        mapped.lead_timestamp = new Date().toISOString();
      }
      // Gerar external_id se não fornecido
      if (!mapped.external_id) {
        mapped.external_id = `api-batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      return mapped;
    });

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .insert(leadsToInsert)
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data: (data || []).map(mapLeadFromDB),
      count: data?.length || 0,
      message: `${data?.length || 0} leads criados com sucesso`
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

// POST /api/v1/leads/upsert - Criar ou atualizar lead por telefone
app.post('/api/v1/leads/upsert', validateApiKey, async (req, res) => {
  try {
    const { phone, ...leadData } = req.body;

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

    // Verificar se existe (usando client_phone que é o nome correto da coluna)
    const { data: existing } = await supabase
      .from(LEADS_TABLE)
      .select('id, external_id')
      .or(`client_phone.eq.${cleanPhone},client_phone.eq.${phone}`)
      .limit(1);

    let result;
    let isNew = false;

    if (existing && existing.length > 0) {
      // Atualizar
      const { data, error } = await supabase
        .from(LEADS_TABLE)
        .update({
          ...mapLeadToDB(leadData),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing[0].id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Criar
      const mapped = mapLeadToDB({ phone, ...leadData });
      if (!mapped.lead_timestamp) {
        mapped.lead_timestamp = new Date().toISOString();
      }
      if (!mapped.external_id) {
        mapped.external_id = `api-upsert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const { data, error } = await supabase
        .from(LEADS_TABLE)
        .insert(mapped)
        .select()
        .single();

      if (error) throw error;
      result = data;
      isNew = true;
    }

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: mapLeadFromDB(result),
      created: isNew,
      message: isNew ? 'Lead criado com sucesso' : 'Lead atualizado com sucesso'
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
// ROUTES - ROLETA
// ============================================

// GET /api/v1/roleta - Consultar estado da roleta da imobiliária
// Retorna todos os participantes ativos e quem será o próximo a receber um lead
app.get('/api/v1/roleta', validateApiKey, async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id não identificado na API Key' }
      });
    }

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
      // Fallback: tenant_memberships (corretores com acesso ao sistema)
      source = 'tenant_memberships';
      const { data: members } = await supabase
        .from('tenant_memberships')
        .select('user_id, role')
        .eq('tenant_id', tenantId)
        .eq('role', 'corretor');

      if (members && members.length > 0) {
        brokerList = members.map((m, index) => ({
          position: index + 1,
          broker_id: m.user_id,
          name: null,
          email: null,
          phone: null,
          added_at: null
        }));
      }
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

// POST /api/v1/leads/roleta - Cadastrar lead com distribuição FORÇADA via roleta
// Atribui o lead diretamente ao próximo corretor da roleta (sem pipeline de imóvel)
app.post('/api/v1/leads/roleta', validateApiKey, async (req, res) => {
  try {
    const leadData = mapLeadToDB(req.body);
    const tenantId = req.tenantId || leadData.tenant_id;

    if (tenantId && !leadData.tenant_id) {
      leadData.tenant_id = tenantId;
    }

    if (!leadData.lead_timestamp) {
      leadData.lead_timestamp = new Date().toISOString();
    }

    if (!leadData.client_name && !leadData.client_phone) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Nome ou telefone é obrigatório' }
      });
    }

    if (!leadData.external_id) {
      leadData.external_id = `api-roleta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Distribuição FORÇADA via roleta (ignora imóvel/pipeline)
    const broker = await getNextBrokerFromRoleta(tenantId);

    if (!broker) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'NO_BROKER_AVAILABLE',
          message: 'Nenhum corretor disponível na roleta. Configure participantes em Configurações > Roleta.'
        }
      });
    }

    leadData.attended_by_name = broker.name;
    if (broker.id) leadData.corretor_id = broker.id;

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .insert(leadData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: `Lead cadastrado com sucesso. Distribuído na roleta para o corretor ${broker.name}.`,
      assigned_broker: {
        name: broker.name,
        id: broker.id || null,
        phone: broker.phone || null,
        email: broker.email || null
      },
      data: mapLeadFromDB(data)
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
// ROUTES - BROKERS
// ============================================

// GET /api/v1/brokers - Listar corretores
// Busca corretores de tenant_memberships e tenant_brokers (Gestão de Equipe)
// Suporta filtros: phone, tenant_id, include_assignments
app.get('/api/v1/brokers', validateApiKey, async (req, res) => {
  try {
    const { phone, tenant_id, include_assignments } = req.query;
    const effectiveTenantId = tenant_id || req.tenantId;

    // Se busca por telefone específico
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      
      // 1. Buscar em tenant_brokers por telefone
      let brokerQuery = supabase
        .from('tenant_brokers')
        .select('id, name, email, phone, photo_url, auth_user_id, status');
      
      if (effectiveTenantId) brokerQuery = brokerQuery.eq('tenant_id', effectiveTenantId);
      brokerQuery = brokerQuery.or(`phone.eq.${cleanPhone},phone.eq.${phone}`);
      
      const { data: brokerData } = await brokerQuery;
      
      if (brokerData && brokerData.length > 0) {
        const broker = brokerData[0];
        
        // Buscar imóveis atribuídos
        let assignQuery = supabase
          .from('imoveis_corretores')
          .select('codigo_imovel')
          .eq('corretor_id', broker.auth_user_id || broker.id);
        
        if (effectiveTenantId) assignQuery = assignQuery.eq('tenant_id', effectiveTenantId);
        
        const { data: assignments } = await assignQuery;
        
        return res.json({
          success: true,
          data: [{
            id: broker.auth_user_id || broker.id,
            name: broker.name,
            email: broker.email,
            phone: broker.phone,
            photo_url: broker.photo_url,
            status: broker.status,
            property_codes: (assignments || []).map(a => a.codigo_imovel)
          }],
          count: 1,
          found_by: 'phone'
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
    // BUSCAR CORRETORES DE TENANT_BROKERS (principal)
    // Esta é a fonte correta: Gestão de Equipe / Acessos e Permissões
    // ============================================
    
    const brokerMap = new Map();
    
    // 1. Buscar de tenant_brokers (corretores cadastrados via XML ou manualmente)
    let brokersQuery = supabase
      .from('tenant_brokers')
      .select('id, name, email, phone, photo_url, auth_user_id, status, source, created_at');
    
    if (effectiveTenantId) brokersQuery = brokersQuery.eq('tenant_id', effectiveTenantId);
    brokersQuery = brokersQuery.eq('status', 'active');
    
    const { data: tenantBrokers, error: brokersError } = await brokersQuery;
    
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
          phone: broker.phone,
          photo_url: broker.photo_url,
          status: broker.status,
          source: broker.source || 'manual',
          created_at: broker.created_at,
          property_codes: [],
          leads_count: 0
        });
      }
    });
    
    // 2. Também buscar de tenant_memberships (usuários com acesso ao sistema)
    let membersQuery = supabase
      .from('tenant_memberships')
      .select('user_id, role');
    
    if (effectiveTenantId) membersQuery = membersQuery.eq('tenant_id', effectiveTenantId);
    membersQuery = membersQuery.in('role', ['corretor', 'team_leader']);
    
    const { data: members, error: membersError } = await membersQuery;
    
    if (membersError) {
      console.error('❌ Erro ao buscar tenant_memberships:', membersError);
    }
    
    // Buscar dados dos usuários via auth.users metadata (se houver membros não em tenant_brokers)
    const memberUserIds = (members || []).map(m => m.user_id).filter(id => !brokerMap.has(id));
    
    if (memberUserIds.length > 0) {
      // Buscar user metadata para membros que não estão em tenant_brokers
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone, avatar_url')
        .in('id', memberUserIds);
      
      (profiles || []).forEach(profile => {
        if (!brokerMap.has(profile.id)) {
          const memberRole = members?.find(m => m.user_id === profile.id)?.role || 'corretor';
          brokerMap.set(profile.id, {
            id: profile.id,
            auth_user_id: profile.id,
            name: profile.full_name || profile.email?.split('@')[0] || 'Usuário',
            email: profile.email,
            phone: profile.phone,
            photo_url: profile.avatar_url,
            status: 'active',
            source: 'membership',
            role: memberRole,
            property_codes: [],
            leads_count: 0
          });
        }
      });
    }

    // 3. Buscar atribuições de imóveis para todos os corretores
    if (include_assignments === 'true' || brokerMap.size > 0) {
      let assignQuery = supabase
        .from('imoveis_corretores')
        .select('corretor_id, corretor_nome, codigo_imovel');
      
      if (effectiveTenantId) assignQuery = assignQuery.eq('tenant_id', effectiveTenantId);
      
      const { data: assignments } = await assignQuery;
      
      (assignments || []).forEach(a => {
        // Tentar associar por corretor_id primeiro
        if (a.corretor_id && brokerMap.has(a.corretor_id)) {
          brokerMap.get(a.corretor_id).property_codes.push(a.codigo_imovel);
        } else {
          // Fallback: associar por nome
          for (const [key, broker] of brokerMap) {
            if (broker.name?.toLowerCase() === a.corretor_nome?.toLowerCase()) {
              broker.property_codes.push(a.codigo_imovel);
              break;
            }
          }
        }
      });
    }

    // 4. Contar leads atribuídos a cada corretor
    if (brokerMap.size > 0) {
      let leadsQuery = supabase
        .from(LEADS_TABLE)
        .select('attended_by_name, corretor_id');
      
      if (effectiveTenantId) leadsQuery = leadsQuery.eq('tenant_id', effectiveTenantId);
      
      const { data: leads } = await leadsQuery;
      
      (leads || []).forEach(lead => {
        // Por corretor_id
        if (lead.corretor_id && brokerMap.has(lead.corretor_id)) {
          brokerMap.get(lead.corretor_id).leads_count++;
        } else if (lead.attended_by_name) {
          // Por nome
          for (const [key, broker] of brokerMap) {
            if (broker.name?.toLowerCase() === lead.attended_by_name?.toLowerCase()) {
              broker.leads_count++;
              break;
            }
          }
        }
      });
    }

    const brokers = Array.from(brokerMap.values());

    res.json({
      success: true,
      data: brokers,
      count: brokers.length,
      source: 'tenant_brokers_and_memberships'
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

// GET /api/v1/brokers/:id - Buscar corretor por ID ou nome
app.get('/api/v1/brokers/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const decodedId = decodeURIComponent(id);

    // Buscar todos os leads e filtrar pelo corretor
    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .select('*');

    if (error) throw error;

    // Filtrar leads onde o corretor corresponde ao ID ou nome
    const matchedLeads = (data || []).filter(row => {
      const attendedBy = row.raw_data?.attendedBy;
      if (attendedBy && Array.isArray(attendedBy) && attendedBy.length > 0) {
        const broker = attendedBy[0];
        return broker?.id?.toString() === decodedId || broker?.name === decodedId;
      }
      return false;
    });

    if (matchedLeads.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Corretor ${decodedId} não encontrado`
        }
      });
    }

    const brokerInfo = matchedLeads[0].raw_data?.attendedBy?.[0];
    const brokerName = brokerInfo?.name || decodedId;
    const leads = matchedLeads.map(mapLeadFromDB);

    // Calcular estatísticas
    const stats = {
      total_leads: leads.length,
      by_stage: {},
      by_temperature: { cold: 0, warm: 0, hot: 0 },
      conversions: leads.filter(l => l.stage === 9).length
    };

    leads.forEach(lead => {
      stats.by_stage[lead.stage] = (stats.by_stage[lead.stage] || 0) + 1;
      if (lead.temperature) {
        stats.by_temperature[lead.temperature] = (stats.by_temperature[lead.temperature] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: {
        id: id,
        name: brokerName,
        statistics: stats,
        leads: leads.slice(0, 10) // Últimos 10 leads
      }
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

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .update({ 
        corretor_id: id,
        corretor: broker_name || id,
        updated_at: new Date().toISOString()
      })
      .in('id_lead', lead_ids)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      data: (data || []).map(mapLeadFromDB),
      count: data?.length || 0,
      message: `${data?.length || 0} leads atribuídos ao corretor ${broker_name || id}`
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
// ROUTES - PROPERTY ASSIGNMENTS (Imóveis → Corretores)
// ============================================

const IMOVEIS_CORRETORES_TABLE = 'imoveis_corretores';

// GET /api/v1/property-assignments - Listar atribuições de imóveis
app.get('/api/v1/property-assignments', validateApiKey, async (req, res) => {
  try {
    const { tenant_id, broker_id, broker_phone } = req.query;

    let query = supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .select('*');

    if (tenant_id) query = query.eq('tenant_id', tenant_id);
    if (broker_id) query = query.eq('corretor_id', broker_id);
    if (broker_phone) {
      const cleanPhone = broker_phone.replace(/\D/g, '');
      query = query.or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${broker_phone}`);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

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
      count: data?.length || 0
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

// POST /api/v1/property-assignments - Atribuir imóvel a corretor
// Regras: Corretor só atribui para si; gestão/admin pode atribuir para qualquer um
// Se código já tem dono, só gestão pode transferir
app.post('/api/v1/property-assignments', validateApiKey, async (req, res) => {
  try {
    const { 
      tenant_id, 
      property_code, 
      broker_id, 
      broker_name, 
      broker_email, 
      broker_phone,
      requester_id,
      requester_role 
    } = req.body;

    if (!tenant_id || !property_code) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tenant_id e property_code são obrigatórios'
        }
      });
    }

    if (!broker_name && !broker_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'broker_name ou broker_id é obrigatório'
        }
      });
    }

    const codigoNormalizado = property_code.trim().toUpperCase();

    // Verificar se código já está atribuído
    const { data: existing } = await supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('codigo_imovel', codigoNormalizado)
      .limit(1);

    const isManager = ['admin', 'owner', 'gestao', 'gerente'].includes(requester_role?.toLowerCase());

    if (existing && existing.length > 0) {
      // Código já tem dono
      const currentOwner = existing[0];
      
      // Corretor tentando pegar código de outro - bloqueado
      if (!isManager && currentOwner.corretor_id !== requester_id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Código ${codigoNormalizado} já está atribuído a ${currentOwner.corretor_nome}. Somente gestão pode transferir.`
          }
        });
      }

      // Gestão pode transferir - atualizar
      const { data, error } = await supabase
        .from(IMOVEIS_CORRETORES_TABLE)
        .update({
          corretor_id: broker_id || null,
          corretor_nome: broker_name || currentOwner.corretor_nome,
          corretor_email: broker_email || currentOwner.corretor_email,
          corretor_telefone: broker_phone || currentOwner.corretor_telefone,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentOwner.id)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        data: {
          id: data.id,
          property_code: data.codigo_imovel,
          broker_id: data.corretor_id,
          broker_name: data.corretor_nome,
          broker_phone: data.corretor_telefone,
          transferred: true,
          previous_broker: currentOwner.corretor_nome
        },
        message: `Imóvel ${codigoNormalizado} transferido para ${broker_name}`
      });
    }

    // Código livre - criar atribuição
    const { data, error } = await supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .insert({
        tenant_id,
        codigo_imovel: codigoNormalizado,
        corretor_id: broker_id || null,
        corretor_nome: broker_name,
        corretor_email: broker_email || null,
        corretor_telefone: broker_phone || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data: {
        id: data.id,
        property_code: data.codigo_imovel,
        broker_id: data.corretor_id,
        broker_name: data.corretor_nome,
        broker_phone: data.corretor_telefone
      },
      message: `Imóvel ${codigoNormalizado} atribuído a ${broker_name}`
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

// DELETE /api/v1/property-assignments/:codigo - Remover atribuição
app.delete('/api/v1/property-assignments/:codigo', validateApiKey, async (req, res) => {
  try {
    const { codigo } = req.params;
    const { tenant_id, requester_id, requester_role } = req.query;

    if (!tenant_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tenant_id é obrigatório'
        }
      });
    }

    const codigoNormalizado = codigo.trim().toUpperCase();

    // Buscar atribuição existente
    const { data: existing } = await supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('codigo_imovel', codigoNormalizado)
      .limit(1);

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Atribuição para código ${codigoNormalizado} não encontrada`
        }
      });
    }

    const assignment = existing[0];
    const isManager = ['admin', 'owner', 'gestao', 'gerente'].includes(requester_role?.toLowerCase());

    // Corretor só pode remover suas próprias atribuições
    if (!isManager && assignment.corretor_id !== requester_id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Você só pode remover suas próprias atribuições'
        }
      });
    }

    const { error } = await supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .delete()
      .eq('id', assignment.id);

    if (error) throw error;

    res.json({
      success: true,
      message: `Atribuição do código ${codigoNormalizado} removida com sucesso`
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

// GET /api/v1/property-assignments/broker/:identifier - Buscar atribuições por corretor (ID ou telefone)
app.get('/api/v1/property-assignments/broker/:identifier', validateApiKey, async (req, res) => {
  try {
    const { identifier } = req.params;
    const { tenant_id } = req.query;

    let query = supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .select('*');

    if (tenant_id) query = query.eq('tenant_id', tenant_id);

    // Verificar se é UUID (broker_id) ou telefone
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    
    if (isUUID) {
      query = query.eq('corretor_id', identifier);
    } else {
      // Tratar como telefone
      const cleanPhone = identifier.replace(/\D/g, '');
      query = query.or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${identifier}`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: (data || []).map(row => ({
        property_code: row.codigo_imovel,
        broker_name: row.corretor_nome,
        broker_id: row.corretor_id,
        created_at: row.created_at
      })),
      count: data?.length || 0
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

// ============================================
// ROUTES - WEBHOOKS
// ============================================

// Armazenamento temporário de webhooks (em produção, usar banco de dados)
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
    const { url, events, active = true } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL do webhook é obrigatória'
        }
      });
    }

    const validEvents = ['lead.created', 'lead.updated', 'lead.stage_changed', 'lead.assigned', 'lead.archived'];
    const webhookEvents = events?.filter(e => validEvents.includes(e)) || validEvents;

    const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const webhook = {
      id: webhookId,
      url,
      events: webhookEvents,
      active,
      api_key: req.apiKey,
      created_at: new Date().toISOString()
    };

    webhooks.set(webhookId, webhook);

    res.status(201).json({
      success: true,
      data: webhook,
      message: 'Webhook criado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao criar webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// DELETE /api/v1/webhooks/:id - Deletar webhook
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

  webhooks.delete(id);

  res.json({
    success: true,
    message: 'Webhook deletado com sucesso'
  });
});

// ============================================
// ROUTES - REFERENCE DATA
// ============================================

// GET /api/v1/reference/stages - Etapas do funil
app.get('/api/v1/reference/stages', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'Novos Leads', color: '#6366f1' },
      { id: 2, name: 'Em Atendimento', color: '#8b5cf6' },
      { id: 3, name: 'Qualificado', color: '#a855f7' },
      { id: 4, name: 'Visita Agendada', color: '#d946ef' },
      { id: 5, name: 'Visita Realizada', color: '#ec4899' },
      { id: 6, name: 'Em Negociação', color: '#f43f5e' },
      { id: 7, name: 'Proposta Criada', color: '#f97316' },
      { id: 8, name: 'Proposta Enviada', color: '#eab308' },
      { id: 9, name: 'Proposta Assinada', color: '#22c55e' },
      { id: 10, name: 'Arquivado', color: '#64748b' }
    ]
  });
});

// GET /api/v1/reference/temperatures - Temperaturas
app.get('/api/v1/reference/temperatures', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, value: 'cold', name: 'Frio', color: '#3b82f6' },
      { id: 2, value: 'warm', name: 'Morno', color: '#f59e0b' },
      { id: 3, value: 'hot', name: 'Quente', color: '#ef4444' }
    ]
  });
});

// GET /api/v1/reference/sources - Origens
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
      { id: 13, name: 'OLX', category: 'portal' }
    ]
  });
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    version: 'v1',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// SCRAPER - Estudo de Mercado (substitui n8n)
// ============================================
import { registerScrapeRoute } from './scrapers/index.js';
registerScrapeRoute(app, supabase);

// 404 Handler (DEVE ficar DEPOIS de todas as rotas)
app.use('/api/v1/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} não encontrado`
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OctoDash API Server running on port ${PORT}`);
  console.log(`📍 Base URL: http://localhost:${PORT}/api/v1`);
  console.log(`📚 Documentation: /apidocs`);
});

export default app;
