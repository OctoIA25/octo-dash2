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
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { registerScrapeRoute } from './scrapers/index.js';
import { createWatermarkRouter } from './watermark/routes.js';
import { createWorker } from './watermark/worker.js';
import { promises } from 'dns';
import { assertSafeHttpUrl, parseHttpUrl } from './security/ssrfGuard.js';
import { normalizePhone, phonesMatch } from './utils/phone.js';

// Timeout do fetch de webhooks de saída (evita que um endpoint lento trave o loop de polling).
const WEBHOOK_FETCH_TIMEOUT_MS = 10000;

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

// CORS: allowlist via env CORS_ORIGINS (origens separadas por vírgula).
// Em produção o frontend é servido por este mesmo processo (same-origin), então
// CORS quase não é exercido; a allowlist protege chamadas cross-origin à API.
// Requisições sem Origin (webhooks/server-to-server) são permitidas.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 🖼️ Pipeline de marca d'água (upload de master → fila → derivados versionados → CDN).
app.use('/api/v1/watermark', createWatermarkRouter(supabase));
// Worker embarcado opcional (WATERMARK_WORKER=1). Em produção, prefira um
// processo/container dedicado para escalar independente da API.
if (process.env.WATERMARK_WORKER === '1') {
  createWorker(supabase).runLoop();
}

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

async function dispatchWebhookEvent(tenantId, event, data) {
  try {
    const { data: webhooks, error } = await supabase
      .from('webhook_subscriptions')
      .select('id, url, secret, events')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .contains('events', [event]);

    if (error) {
      console.error('Erro ao buscar webhooks:', error);
      return;
    }

    if (!webhooks || webhooks.length === 0) return;

    await Promise.allSettled(webhooks.map(async (webhook) => {
      // Proteção SSRF: nunca disparar para loopback/redes privadas/link-local
      // (ex.: 169.254.169.254 = metadata de cloud). Valida no momento do disparo,
      // resolvendo o host — uma URL pública pode ter mudado de DNS após o cadastro.
      const safe = await assertSafeHttpUrl(webhook.url);
      if (!safe.ok) {
        console.error(`Webhook ${webhook.id} bloqueado por segurança (SSRF: ${safe.reason})`);
        return;
      }

      const payload = {
        event,
        timestamp: new Date().toISOString(),
        webhook_id: webhook.id,
        data
      };

      const body = JSON.stringify(payload);

      const signature = `sha256=${crypto
        .createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex')}`;

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OctoDash-Event': event,
          'X-OctoDash-Signature': signature
        },
        body,
        // Não seguir redirects: impede bypass do guard via 3xx para host interno.
        redirect: 'manual',
        // Timeout: um endpoint lento/pendurado não pode travar o loop de polling.
        signal: AbortSignal.timeout(WEBHOOK_FETCH_TIMEOUT_MS)
      });

      if (!response.ok) {
        console.error(`Webhook ${webhook.id} falhou com status ${response.status}`);
      }
    }));
  } catch (error) {
    console.error('Erro ao disparar webhook:', error);
  }
}

const WEBHOOK_POLL_BASE_MS = 5000;
const WEBHOOK_POLL_MAX_MS = 5 * 60 * 1000; // 5 minutos
let webhookPollFailures = 0;

const summarizeSupabaseError = (error) => {
  if (!error) return 'unknown error';
  const raw = typeof error.message === 'string' ? error.message : String(error);
  // Upstream HTML error pages (Cloudflare 5xx, etc.): extrai status + host em vez de dumpar o HTML
  if (raw.startsWith('<!DOCTYPE') || raw.startsWith('<html')) {
    const statusMatch = raw.match(/Error code (\d+)/i) || raw.match(/(\d{3})\s*[:|]/);
    const hostMatch = raw.match(/<title>([^<]+)<\/title>/i);
    const status = statusMatch ? statusMatch[1] : 'unknown';
    const host = hostMatch ? hostMatch[1].trim() : 'unknown host';

    return `upstream HTML error (status=${status}, host=${host})`;
  }
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
};

async function processWebhookEvents() {
  try {
    const { data: events, error } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) throw error;

    if (events?.length) {
      for (const webhookEvent of events) {
        const eventType = webhookEvent.event_type || webhookEvent.event;
        if (!eventType) {
          console.error('Evento de webhook sem event_type:', webhookEvent);
          continue;
        }

        await dispatchWebhookEvent(webhookEvent.tenant_id, eventType, webhookEvent.payload);

        await supabase
          .from('webhook_events')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString()
          })
          .eq('id', webhookEvent.id);
      }
    }

    if (webhookPollFailures > 0) {
      console.log(`✅ Webhook poll: recuperado após ${webhookPollFailures} falha(s)`);
      webhookPollFailures = 0;
    }
  } catch (error) {
    webhookPollFailures += 1;
    console.error(`Erro ao buscar eventos de webhook (falha ${webhookPollFailures}):`, summarizeSupabaseError(error));
  } finally {
    const delay = webhookPollFailures === 0
      ? WEBHOOK_POLL_BASE_MS
      : Math.min(WEBHOOK_POLL_BASE_MS * 2 ** webhookPollFailures, WEBHOOK_POLL_MAX_MS);
    setTimeout(processWebhookEvents, delay);
  }
}

setTimeout(processWebhookEvents, WEBHOOK_POLL_BASE_MS);

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
// SCRAPER — POST /api/v1/scrape-imovel
// Estudo de mercado: URL do anúncio -> dados extraídos
// ============================================
try {
  registerScrapeRoute(app, supabase);
} catch (err) {
  console.error('❌ Falha ao registrar rota /api/v1/scrape-imovel:', err.message);
}

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
      const s = sanitizeFilterValue(search);
      query = query.or(`client_name.ilike.%${s}%,client_phone.ilike.%${s}%,client_email.ilike.%${s}%`);
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

const extractZapCode = async (message, tenantId) => {
  if (!message || !tenantId) return null;

  const bairro = message.match(/\d+\s*-\s*([^,]+),/)?.[1]?.trim();
  if (!bairro) return null;

  const { data, error } = await supabase
    .from('imoveis_locais')
    .select('codigo_imovel')
    .eq('tenant_id', tenantId)
    .ilike('bairro', `%${bairro}%`)
    .limit(1);

  if (error) {
    console.log('❌ Erro ao buscar código do Zap:', error);
    return null;
  }

  return data?.[0]?.codigo_imovel ?? null;
};

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
          phone: normalizePhone(broker.phone, { withCountryCode: true }),
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
            phone: normalizePhone(profile.phone, { withCountryCode: true }),
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
          phone: normalizePhone(attendedBroker.phone || attendedBroker.cel, { withCountryCode: true }),
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
          phone: normalizePhone(cached.agent_phone, { withCountryCode: true }),
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
          phone: normalizePhone(manual.corretor_telefone, { withCountryCode: true }),
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
        phone: normalizePhone(p.broker_phone, { withCountryCode: true })
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
            phone: normalizePhone(b.corretor_telefone, { withCountryCode: true }),
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

/**
 * Insere um lead no CRM. Se já existir um lead com o mesmo (tenant_id, phone)
 * — constraint unique_phone_per_tenant — em vez de falhar, "revive" o lead
 * existente: atualiza com as novas informações e o traz para o topo da lista
 * (created_at/updated_at = agora). Trata o caso de um lead antigo que voltou a
 * ter interesse.
 *
 * @returns {{ data: object, revived: boolean }}
 */
const insertOrReviveLead = async (crmLeadData) => {
  const { data, error } = await supabase
    .from('leads')
    .insert(crmLeadData)
    .select()
    .single();

  if (!error) return { data, revived: false };
  if (error.code !== '23505') throw error;

  // Conflito de telefone: revive o lead existente desse tenant.
  const now = new Date().toISOString();
  const { tenant_id, phone, created_at, ...rest } = crmLeadData;
  const { data: revived, error: reviveError } = await supabase
    .from('leads')
    .update({ ...rest, created_at: now, updated_at: now })
    .eq('tenant_id', tenant_id)
    .eq('phone', phone)
    .select()
    .single();

  if (reviveError) throw reviveError;
  return { data: revived, revived: true };
};

const safeStringEquals = (left, right) => {
  if (!left || !right) return false;

  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

// Remove metacaracteres do PostgREST (vírgula, parênteses, asterisco, barra) que
// poderiam alterar a estrutura de um filtro .or() ao interpolar input do usuário.
const sanitizeFilterValue = (value) => String(value ?? '').replace(/[,()*\\]/g, ' ').trim();

const firstHeaderValue = (value) => Array.isArray(value) ? value[0] : value;

const getZapFeedConfig = () => ({
  secret: process.env.ZAPIMOVEIS_FEED_SECRET
    || process.env.ZAPIMOVEIS_WEBHOOK_SECRET
    || process.env.OLX_FEED_SECRET,
  tenantId: process.env.ZAPIMOVEIS_TENANT_ID
    || process.env.OLX_TENANT_ID
    || process.env.VITE_SANTA_ANGELA_TENANT_ID,
  provider: process.env.ZAPIMOVEIS_PROVIDER || 'OctoDash',
  contactName: process.env.ZAPIMOVEIS_CONTACT_NAME || 'OctoDash',
  contactEmail: process.env.ZAPIMOVEIS_CONTACT_EMAIL || 'contato@octoia.com',
  contactPhone: process.env.ZAPIMOVEIS_CONTACT_PHONE || '',
  publicationType: process.env.ZAPIMOVEIS_PUBLICATION_TYPE || 'STANDARD',
  detailBaseUrl: process.env.ZAPIMOVEIS_DETAIL_BASE_URL || process.env.PUBLIC_APP_URL || '',
  resyncUrl: process.env.ZAPIMOVEIS_RESYNC_URL || '',
  resyncToken: process.env.ZAPIMOVEIS_RESYNC_TOKEN || ''
});

const validateZapFeedAccess = async (req, res, next) => {
  const config = getZapFeedConfig();
  const providedSecret = firstHeaderValue(req.headers['x-zapimoveis-feed-secret'])
    || firstHeaderValue(req.headers['x-zapimoveis-secret'])
    || firstHeaderValue(req.headers['x-olx-feed-secret'])
    || req.query.token
    || req.query.feed_token
    || req.query.secret;

  if (config.secret && safeStringEquals(providedSecret, config.secret)) {
    const tenantId = req.query.tenant_id || req.query.tenantId || config.tenantId;

    if (!tenantId) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'MISSING_TENANT_ID',
          message: 'Configure ZAPIMOVEIS_TENANT_ID ou envie tenant_id na URL do feed.'
        }
      });
    }

    req.tenantId = tenantId;
    req.integrationAuth = 'zapimoveis_feed_secret';
    return next();
  }

  return validateApiKey(req, res, next);
};

const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const xmlCdata = (value) => `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const toFeedNumber = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPositiveInteger = (value) => Math.max(0, Math.floor(toFeedNumber(value)));

const toMoneyValue = (value) => {
  const parsed = toFeedNumber(value);
  return parsed > 0 ? Math.round(parsed) : null;
};

const normalizeFeedText = (value, fallback = '') => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
};

const getDefaultZapContactInfo = () => {
  const config = getZapFeedConfig();
  return {
    name: normalizeFeedText(config.contactName, 'OctoDash'),
    email: normalizeFeedText(config.contactEmail, 'contato@octoia.com'),
    phone: normalizeFeedText(config.contactPhone)
  };
};

const getListingContactInfo = (imovel) => {
  const fallback = getDefaultZapContactInfo();
  const contact = imovel.zap_contact || {};

  return {
    name: normalizeFeedText(contact.name, fallback.name),
    email: normalizeFeedText(contact.email, fallback.email),
    phone: normalizeFeedText(contact.phone, fallback.phone)
  };
};

const stripHtml = (value) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const buildFeedDescription = (imovel) => {
  const base = stripHtml(imovel.descricao);
  const fallback = [
    imovel.titulo,
    imovel.tipo,
    imovel.bairro,
    imovel.cidade,
    imovel.codigo_imovel ? `Código ${imovel.codigo_imovel}` : null
  ].filter(Boolean).join(' - ');
  const description = base || fallback || 'Imóvel disponível para negociação.';

  if (description.length >= 50) {
    return description.slice(0, 3000);
  }

  const complement = ' Entre em contato para receber mais informações, valores atualizados e detalhes completos deste imóvel.';
  return `${description}${complement}`.slice(0, 3000);
};

const mapZapTransactionType = (imovel) => {
  const finalidade = normalizeFeedText(imovel.finalidade).toLowerCase();
  const hasSale = toMoneyValue(imovel.valor_venda) !== null;
  const hasRent = toMoneyValue(imovel.valor_locacao) !== null;

  if (finalidade.includes('venda_locacao') || finalidade.includes('venda e') || (hasSale && hasRent)) {
    return 'Sale/Rent';
  }

  if (finalidade.includes('locacao') || finalidade.includes('locação') || finalidade.includes('aluguel') || hasRent) {
    return 'For Rent';
  }

  return 'For Sale';
};

const getZapListingEligibility = (imovel) => {
  const reasons = [];
  const transactionType = mapZapTransactionType(imovel);
  const salePrice = toMoneyValue(imovel.valor_venda);
  const rentPrice = toMoneyValue(imovel.valor_locacao);

  if (!normalizeFeedText(imovel.codigo_imovel)) {
    reasons.push('missing_codigo_imovel');
  }

  if (transactionType === 'For Sale' && salePrice === null) {
    reasons.push('missing_sale_price');
  }

  if (transactionType === 'For Rent' && rentPrice === null) {
    reasons.push('missing_rent_price');
  }

  if (transactionType === 'Sale/Rent' && salePrice === null && rentPrice === null) {
    reasons.push('missing_sale_or_rent_price');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    transactionType,
    salePrice,
    rentPrice
  };
};

const mapZapPropertyType = (imovel) => {
  const type = `${imovel.tipo || ''} ${imovel.tipo_simplificado || ''}`.toLowerCase();

  if (type.includes('cobertura')) return 'Residential / Penthouse';
  if (type.includes('flat')) return 'Residential / Flat';
  if (type.includes('kitnet') || type.includes('conjugado')) return 'Residential / Kitnet';
  if (type.includes('studio')) return 'Residential / Studio';
  if (type.includes('loft')) return 'Residential / Loft';
  if (type.includes('condomínio') || type.includes('condominio')) return 'Residential / Condo';
  if (type.includes('sobrado')) return 'Residential / Sobrado';
  if (type.includes('casa')) return 'Residential / Home';
  if (type.includes('apartamento') || type.includes('apto')) return 'Residential / Apartment';
  if (type.includes('chácara') || type.includes('chacara') || type.includes('fazenda') || type.includes('sítio') || type.includes('sitio') || type.includes('rural')) {
    return 'Residential / Agricultural';
  }
  if (type.includes('terreno') || type.includes('lote')) return 'Residential / Land Lot';
  if (type.includes('galpão') || type.includes('galpao') || type.includes('depósito') || type.includes('deposito') || type.includes('armazém') || type.includes('armazem')) {
    return 'Commercial / Industrial';
  }
  if (type.includes('sala') || type.includes('conjunto') || type.includes('office')) return 'Commercial / Office';
  if (type.includes('loja') || type.includes('salão') || type.includes('salao') || type.includes('ponto')) return 'Commercial / Business';
  if (type.includes('comercial')) return 'Commercial / Building';

  return 'Residential / Apartment';
};

const mapZapUsageType = (propertyType) => {
  if (propertyType.startsWith('Commercial /')) return 'Commercial';
  return 'Residential';
};

const normalizeZapPhotoUrl = (photo) => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo.trim();
  if (typeof photo === 'object') {
    return String(photo.url || photo.src || photo.preview || photo.publicUrl || '').trim() || null;
  }
  return null;
};

const extractZapPhotoUrls = (photos) => {
  const rawPhotos = Array.isArray(photos) ? photos : [];
  const seen = new Set();

  return rawPhotos
    .map(normalizeZapPhotoUrl)
    .filter((url) => url && /^https?:\/\//i.test(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 30);
};

const getConfiguredDetailBaseUrl = () => {
  const configuredBase = getZapFeedConfig().detailBaseUrl;
  if (configuredBase) return configuredBase.replace(/\/$/, '');
  return '';
};

const toFeatureList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [text];
    } catch {
      return [text];
    }
  }
  return [];
};

// Aceita só YouTube; normaliza para a URL canônica de watch. Null caso contrário.
const normalizeYouTubeUrl = (url) => {
  const s = String(url || '').trim();
  if (!s) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
  }
  return null;
};

const buildFeaturesXml = (imovel) => {
  const seen = new Set();
  const features = [];
  const pushFeature = (raw) => {
    const feature = normalizeFeedText(raw);
    if (!feature) return;
    const key = feature.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    features.push(feature);
  };

  // VRSync tem uma única lista <Features>: comum + privativa se fundem.
  toFeatureList(imovel.area_comum).forEach(pushFeature);
  toFeatureList(imovel.area_privativa).forEach(pushFeature);
  // VRSync não tem campo nativo de permuta -> vira uma feature.
  if (imovel.aceita_troca === true || imovel.aceita_troca === 'true') {
    pushFeature('Aceita Permuta');
  }
  // VRSync não tem campo nativo de salas -> vira uma feature.
  const salas = toPositiveInteger(imovel.salas);
  if (salas > 0) {
    pushFeature(`${salas} ${salas === 1 ? 'sala' : 'salas'}`);
  }

  if (features.length === 0) return '';
  const items = features
    .map((feature) => `        <Feature>${xmlCdata(feature)}</Feature>`)
    .join('\n');
  return `      <Features>\n${items}\n      </Features>`;
};

const buildZapListingXml = (imovel) => {
  const propertyType = mapZapPropertyType(imovel);
  const transactionType = mapZapTransactionType(imovel);
  const usageType = mapZapUsageType(propertyType);
  const salePrice = toMoneyValue(imovel.valor_venda);
  const rentPrice = toMoneyValue(imovel.valor_locacao);
  const condoFee = toMoneyValue(imovel.valor_condominio);
  const yearlyTax = toMoneyValue(imovel.valor_iptu);
  const lotArea = toFeedNumber(imovel.area_total);
  const livingArea = toFeedNumber(imovel.area_util || imovel.metragem_m2);
  const photos = extractZapPhotoUrls(imovel.fotos);
  const baseUrl = getConfiguredDetailBaseUrl();
  const contact = getListingContactInfo(imovel);
  const detailUrl = baseUrl && imovel.codigo_imovel
    ? `${baseUrl}/imovel/${encodeURIComponent(imovel.codigo_imovel)}`
    : null;

  const priceTags = [
    (transactionType === 'For Sale' || transactionType === 'Sale/Rent') && salePrice
      ? `      <ListPrice currency="BRL">${salePrice}</ListPrice>`
      : null,
    (transactionType === 'For Rent' || transactionType === 'Sale/Rent') && rentPrice
      ? `      <RentalPrice currency="BRL" period="Monthly">${rentPrice}</RentalPrice>`
      : null,
    condoFee ? `      <PropertyAdministrationFee currency="BRL">${condoFee}</PropertyAdministrationFee>` : null,
    yearlyTax ? `      <YearlyTax currency="BRL">${yearlyTax}</YearlyTax>` : null
  ].filter(Boolean).join('\n');

  const videoUrl = normalizeYouTubeUrl(imovel.link_video);
  const tourUrl = normalizeFeedText(imovel.tour_virtual);
  const mediaItems = [
    ...photos.map((url, index) => `      <Item medium="image" caption="img${index + 1}">${xmlEscape(url)}</Item>`),
    videoUrl ? `      <Item medium="video" caption="video">${xmlEscape(videoUrl)}</Item>` : null,
    /^https?:\/\//i.test(tourUrl) ? `      <Item medium="virtual_tour" caption="tour">${xmlEscape(tourUrl)}</Item>` : null
  ].filter(Boolean);
  const mediaXml = mediaItems.length > 0
    ? `    <Media>\n${mediaItems.join('\n')}\n    </Media>`
    : '';

  return `  <Listing>
    <ListingID>${xmlEscape(imovel.codigo_imovel)}</ListingID>
    <Title>${xmlCdata(normalizeFeedText(imovel.titulo, `${imovel.tipo || 'Imóvel'} - ${imovel.bairro || imovel.cidade || ''}`))}</Title>
    <TransactionType>${transactionType}</TransactionType>
    <PublicationType>${xmlEscape(getZapFeedConfig().publicationType)}</PublicationType>
${detailUrl ? `    <DetailViewUrl>${xmlEscape(detailUrl)}</DetailViewUrl>\n` : ''}${mediaXml ? `${mediaXml}\n` : ''}    <Details>
      <UsageType>${usageType}</UsageType>
      <PropertyType>${propertyType}</PropertyType>
      <Description>${xmlCdata(buildFeedDescription(imovel))}</Description>
${priceTags}
${lotArea > 0 ? `      <LotArea unit="square metres">${lotArea}</LotArea>\n` : ''}${livingArea > 0 ? `      <LivingArea unit="square metres">${livingArea}</LivingArea>\n` : ''}      <Bedrooms>${toPositiveInteger(imovel.quartos)}</Bedrooms>
      <Bathrooms>${toPositiveInteger(imovel.banheiros)}</Bathrooms>
      <Suites>${toPositiveInteger(imovel.suites)}</Suites>
      <Garage>${toPositiveInteger(imovel.vagas)}</Garage>
${buildFeaturesXml(imovel) ? `${buildFeaturesXml(imovel)}\n` : ''}    </Details>
    <Location displayAddress="All">
      <Country abbreviation="BR">Brasil</Country>
      <State abbreviation="${xmlEscape(normalizeFeedText(imovel.estado, 'SP').toUpperCase())}">${xmlEscape(normalizeFeedText(imovel.estado, 'SP').toUpperCase())}</State>
      <City>${xmlCdata(normalizeFeedText(imovel.cidade, 'Jundiaí'))}</City>
      <Neighborhood>${xmlCdata(normalizeFeedText(imovel.bairro, 'Não informado'))}</Neighborhood>
${imovel.cep ? `      <PostalCode>${xmlEscape(imovel.cep)}</PostalCode>\n` : ''}${imovel.logradouro ? `      <Address>${xmlCdata(imovel.logradouro)}</Address>\n` : ''}${imovel.numero ? `      <StreetNumber>${xmlEscape(imovel.numero)}</StreetNumber>\n` : ''}${imovel.complemento ? `      <Complement>${xmlCdata(imovel.complemento)}</Complement>\n` : ''}    </Location>
    <ContactInfo>
      <Name>${xmlCdata(contact.name)}</Name>
      <Email>${xmlEscape(contact.email)}</Email>
${contact.phone ? `      <Telephone>${xmlEscape(contact.phone)}</Telephone>\n` : ''}    </ContactInfo>
  </Listing>`;
};

const buildZapVRSyncXml = ({ listings }) => {
  const config = getZapFeedConfig();
  const publishDate = new Date().toISOString().replace(/\.\d{3}Z$/, '');
  const listingsXml = listings.map((imovel) => buildZapListingXml(imovel)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">
  <Header>
    <Provider>${xmlCdata(config.provider)}</Provider>
    <Email>${xmlEscape(config.contactEmail)}</Email>
    <ContactName>${xmlCdata(config.contactName)}</ContactName>
    <PublishDate>${publishDate}</PublishDate>
${config.contactPhone ? `    <Telephone>${xmlEscape(config.contactPhone)}</Telephone>\n` : ''}  </Header>
  <Listings>
${listingsXml}
  </Listings>
</ListingDataFeed>`;
};

const getZapFeedListings = async (tenantId, { includeAllStatuses = false } = {}) => {
  let query = supabase
    .from('imoveis_locais')
    .select(`
      id,
      tenant_id,
      codigo_imovel,
      titulo,
      tipo,
      tipo_simplificado,
      finalidade,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      area_total,
      area_util,
      metragem_m2,
      quartos,
      suites,
      banheiros,
      vagas,
      valor_venda,
      valor_locacao,
      valor_condominio,
      valor_iptu,
      descricao,
      fotos,
      salas,
      area_comum,
      area_privativa,
      aceita_troca,
      link_video,
      tour_virtual,
      criado_por,
      status_aprovacao,
      updated_at
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (!includeAllStatuses) {
    query = query.eq('status_aprovacao', 'aprovado');
  }

  const { data, error } = await query;
  if (error) throw error;

  const listings = data || [];
  const creatorIds = [...new Set(listings.map((imovel) => imovel.criado_por).filter(Boolean))];
  const profilesById = new Map();
  const brokersByUserId = new Map();

  if (creatorIds.length > 0) {
    const [{ data: profiles, error: profilesError }, { data: brokers, error: brokersError }] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('id, email, full_name, phone')
        .in('id', creatorIds),
      supabase
        .from('tenant_brokers')
        .select('auth_user_id, name, email, phone')
        .eq('tenant_id', tenantId)
        .in('auth_user_id', creatorIds)
    ]);

    if (profilesError) {
      console.warn('⚠️ Não foi possível buscar contatos de user_profiles para o feed Zap:', profilesError.message);
    }

    if (brokersError) {
      console.warn('⚠️ Não foi possível buscar contatos de tenant_brokers para o feed Zap:', brokersError.message);
    }

    (profiles || []).forEach((profile) => profilesById.set(profile.id, profile));
    (brokers || []).forEach((broker) => {
      if (broker.auth_user_id) brokersByUserId.set(broker.auth_user_id, broker);
    });
  }

  return listings.map((imovel) => {
    const profile = profilesById.get(imovel.criado_por);
    const broker = brokersByUserId.get(imovel.criado_por);

    return {
      ...imovel,
      zap_contact: {
        name: broker?.name || profile?.full_name || profile?.email?.split('@')[0] || null,
        email: broker?.email || profile?.email || null,
        phone: broker?.phone || profile?.phone || null
      }
    };
  }).filter((imovel) => getZapListingEligibility(imovel).eligible);
};

const getZapFeedDebugInfo = async (tenantId) => {
  const { data, error } = await supabase
    .from('imoveis_locais')
    .select(`
      id,
      tenant_id,
      codigo_imovel,
      titulo,
      finalidade,
      valor_venda,
      valor_locacao,
      criado_por,
      fotos,
      status_aprovacao,
      updated_at
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const listings = data || [];
  const statusCounts = {};
  const skipReasonCounts = {};
  let approvedRows = 0;
  let publishableRows = 0;

  const samples = listings.slice(0, 30).map((imovel) => {
    const eligibility = getZapListingEligibility(imovel);
    const status = imovel.status_aprovacao || 'sem_status';

    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'aprovado') approvedRows += 1;
    if (eligibility.eligible) publishableRows += 1;

    eligibility.reasons.forEach((reason) => {
      skipReasonCounts[reason] = (skipReasonCounts[reason] || 0) + 1;
    });

    return {
      id: imovel.id,
      codigo_imovel: imovel.codigo_imovel,
      titulo: imovel.titulo,
      status_aprovacao: imovel.status_aprovacao,
      finalidade: imovel.finalidade,
      valor_venda: imovel.valor_venda,
      valor_locacao: imovel.valor_locacao,
      criado_por: imovel.criado_por,
      updated_at: imovel.updated_at,
      transaction_type: eligibility.transactionType,
      can_publish: eligibility.eligible,
      skipped_reasons: eligibility.reasons
    };
  });

  listings.slice(30).forEach((imovel) => {
    const eligibility = getZapListingEligibility(imovel);
    const status = imovel.status_aprovacao || 'sem_status';

    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'aprovado') approvedRows += 1;
    if (eligibility.eligible) publishableRows += 1;

    eligibility.reasons.forEach((reason) => {
      skipReasonCounts[reason] = (skipReasonCounts[reason] || 0) + 1;
    });
  });

  return {
    total_rows: listings.length,
    approved_rows: approvedRows,
    publishable_rows: publishableRows,
    skipped_rows: listings.length - publishableRows,
    status_counts: statusCounts,
    skip_reason_counts: skipReasonCounts,
    sample_rows: samples
  };
};

const createZapVRSyncFeed = async (req, res) => {
  try {
    const includeAllStatuses = req.query.status === 'all' || req.query.include_pending === 'true';
    const listings = await getZapFeedListings(req.tenantId, { includeAllStatuses });
    const xml = buildZapVRSyncXml({ listings, req });
    const requesterIp = firstHeaderValue(req.headers['x-forwarded-for']) || req.ip;
    const requesterAgent = firstHeaderValue(req.headers['user-agent']) || 'unknown';

    console.log('🧾 Feed VRSync Zap/OLX gerado:', {
      tenant_id: req.tenantId,
      listings_count: listings.length,
      include_all_statuses: includeAllStatuses,
      requester_ip: requesterIp,
      user_agent: requesterAgent
    });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Zap-Listings-Count', String(listings.length));
    res.status(200).send(xml);
  } catch (error) {
    console.error('❌ Erro ao gerar feed VRSync Zap/OLX:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const nested = pickFirstNonEmpty(...value);
      if (nested) return nested;
      continue;
    }
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
};

const getNestedValue = (source, path) => {
  if (!source || !path) return undefined;
  return path.split('.').reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, source);
};

const pickNestedText = (source, paths) => pickFirstNonEmpty(
  ...paths.map((path) => getNestedValue(source, path))
);

const extractZapPhone = (payload) => {
  const rawPhone = pickNestedText(payload, [
    'phone',
    'telefone',
    'lead.phone',
    'lead.telefone',
    'lead.client.phone',
    'lead.customer.phone',
    'customer.phone',
    'customer.telefone',
    'contact.phone',
    'contact.telefone',
    'client.phone',
    'client.telefone',
    'person.phone',
    'person.telefone',
    'buyer.phone',
    'buyer.telefone',
    'phoneNumber',
    'lead.phoneNumber',
    'customer.phoneNumber',
  ]);

  if (rawPhone) return rawPhone;

  const phoneCollections = [
    payload?.phones,
    payload?.telefones,
    payload?.lead?.phones,
    payload?.lead?.telefones,
    payload?.customer?.phones,
    payload?.customer?.telefones,
    payload?.contact?.phones,
    payload?.contact?.telefones,
  ];

  for (const collection of phoneCollections) {
    if (!Array.isArray(collection)) continue;
    for (const entry of collection) {
      const phone = typeof entry === 'object'
        ? pickFirstNonEmpty(entry.number, entry.phone, entry.value, entry.telefone)
        : pickFirstNonEmpty(entry);
      if (phone) return phone;
    }
  }

  return null;
};

const getZapTransactionHints = (payload) => {
  const raw = normalizeFeedText(pickNestedText(payload, [
    'transactionType',
    'transaction_type',
    'lead.transactionType',
    'listing.transactionType',
    'listing.transaction_type',
    'property.transactionType',
    'property.transaction_type',
    'imovel.finalidade',
  ])).toLowerCase();

  return {
    interest_is_sale: raw ? raw.includes('sale') || raw.includes('venda') : undefined,
    interest_is_rent: raw ? raw.includes('rent') || raw.includes('loca') || raw.includes('aluguel') : undefined,
  };
};

const normalizeZapLeadPayload = (payload) => {
  const body = payload || {};
  const lead = body.lead || body.data?.lead || body.payload?.lead || {};
  const customer = body.customer || body.client || body.contact || lead.customer || lead.client || lead.contact || {};
  const listing = body.listing || body.property || body.imovel || lead.listing || lead.property || lead.imovel || {};
  const transactionHints = getZapTransactionHints(body);
  const zapLeadId = pickNestedText(body, [
    'id',
    'leadId',
    'lead_id',
    'lead.id',
    'lead.leadId',
    'data.id',
    'data.leadId',
    'payload.id',
    'payload.leadId',
  ]);
  const propertyCode = pickFirstNonEmpty(
    body.interest_reference,
    body.property_code,
    body.codigo_imovel,
    body.listingId,
    body.listing_id,
    body.externalListingId,
    body.external_listing_id,
    body.propertyId,
    body.property_id,
    listing.externalId,
    listing.external_id,
    listing.externalCode,
    listing.code,
    listing.id,
    lead.listingId,
    lead.propertyId
  );
  const name = pickFirstNonEmpty(
    body.name,
    body.nome,
    lead.name,
    lead.nome,
    customer.name,
    customer.nome,
    customer.fullName,
    customer.full_name
  );
  const email = pickFirstNonEmpty(
    body.email,
    lead.email,
    customer.email,
    customer.mail,
    body.contactEmail,
    lead.contactEmail
  );
  const phone = extractZapPhone({ ...body, lead, customer });
  const message = pickFirstNonEmpty(
    body.message,
    body.mensagem,
    body.comments,
    body.observacoes,
    lead.message,
    lead.mensagem,
    lead.comments,
    customer.message,
    body.description,
    body.text
  );
  const brokerName = pickFirstNonEmpty(
    body.attended_by,
    body.assigned_agent,
    body.corretor,
    listing.brokerName,
    listing.agentName,
    listing.contactName,
    lead.attended_by,
    lead.assigned_agent
  );

  return {
    name,
    phone,
    email,
    portal: pickFirstNonEmpty(body.portal, body.source, body.origin, body.origem) || 'ZAP Imóveis',
    message,
    comments: message,
    interest_reference: propertyCode,
    property_code: propertyCode,
    interest_type: propertyCode ? 'property' : null,
    interest_is_sale: transactionHints.interest_is_sale,
    interest_is_rent: transactionHints.interest_is_rent,
    interest_image: pickFirstNonEmpty(
      body.interest_image,
      body.image,
      body.imageUrl,
      listing.image,
      listing.imageUrl,
      listing.thumbnail
    ),
    attended_by: brokerName,
    external_id: zapLeadId ? `zap_${zapLeadId}` : null,
    raw_data: {
      source: 'zapimoveis_webhook',
      zap_lead_id: zapLeadId,
      original_request: body,
    },
  };
};

const createIncomingLead = async ({ tenantId, body, source = 'API' }) => {
  const {
    name, phone, email, portal, message, comments,
    interest_reference, property_code, codigo_imovel,
    is_exclusive, exclusivo, imovel_exclusivo,
    interest_type, interest_is_sale, interest_is_rent, interest_image,
    attended_by, assigned_agent, corretor, broker_id,
    stage, etapa_funil, temperature, temperatura,
    lead_type, tipo_lead,
    raw_data, auto_assign = true, external_id
  } = body;

  const normalizedLeadType = (() => {
    const rawType = lead_type || tipo_lead;
    if (rawType === 2 || rawType === '2' || String(rawType).toLowerCase() === 'proprietario' || String(rawType).toLowerCase() === 'proprietário') {
      return 2;
    }
    return 1;
  })();

  const propertyCode = interest_reference || property_code || codigo_imovel;
  const explicitBroker = attended_by || assigned_agent || corretor;
  const leadStage = normalizeStage(stage || etapa_funil);
  const leadTemperature = normalizeTemperature(temperature || temperatura);
  const leadMessage = message || comments;
  const explicitExclusiveValue = is_exclusive ?? exclusivo ?? imovel_exclusivo;
  const normalizedExclusive = explicitExclusiveValue === undefined || explicitExclusiveValue === null
    ? null
    : explicitExclusiveValue === true || explicitExclusiveValue === 'true' || explicitExclusiveValue === '1' || explicitExclusiveValue === 1 || String(explicitExclusiveValue).toLowerCase() === 'sim';
  const normalizedExternalId = external_id || `${source.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!name && !phone) {
    const error = new Error('Nome ou telefone é obrigatório');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (external_id) {
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, tenant_id, source_lead_id, name, phone, email, source, property_code, created_at')
      .eq('tenant_id', tenantId)
      .eq('source_lead_id', external_id)
      .maybeSingle();

    if (existingLead) {
      return {
        statusCode: 200,
        response: {
          success: true,
          duplicate: true,
          data: {
            id: existingLead.id,
            crm_id: existingLead.id,
            tenant_id: existingLead.tenant_id,
            external_id: existingLead.source_lead_id,
            name: existingLead.name,
            phone: existingLead.phone,
            email: existingLead.email,
            portal: existingLead.source,
            property_code: existingLead.property_code,
            created_at: existingLead.created_at,
          },
          message: 'Lead já recebido anteriormente.'
        }
      };
    }
  }

  let assignedBroker = null;
  let assignedBrokerId = broker_id || null;
  let assignmentMethod = null;
  let propertyImage = interest_image;
  const resolvedIsExclusive = normalizedExclusive !== null
    ? normalizedExclusive
    : await resolvePropertyExclusivity(tenantId, propertyCode);

  if (!explicitBroker && auto_assign !== false) {
    const { broker, method } = await resolveBrokerForLead(propertyCode, tenantId, raw_data);
    if (broker) {
      assignedBroker = broker.name;
      assignedBrokerId = broker.id || broker.auth_user_id || null;
      assignmentMethod = method;
    }
  } else if (explicitBroker) {
    assignedBroker = explicitBroker;
    assignmentMethod = 'explicit';
    if (!assignedBrokerId) {
      const foundBroker = await findBrokerByIdentifier(tenantId, { name: explicitBroker });
      if (foundBroker) {
        assignedBrokerId = foundBroker.id || foundBroker.auth_user_id;
      }
    }
  }

  if (!propertyImage && propertyCode) {
    const { data: cached } = await supabase
      .from('properties_cache')
      .select('main_photo')
      .eq('tenant_id', tenantId)
      .eq('property_code', propertyCode.trim().toUpperCase())
      .single();
    propertyImage = cached?.main_photo || null;
  }

  const now = new Date().toISOString();
  const kanbanStatus = mapStageToKanbanStatus(stage || etapa_funil || 1);
  const kanbanTemperature = mapTemperatureToCRM(temperature || temperatura || 'cold');
  const crmLeadData = {
    tenant_id: tenantId,
    name: name || 'Lead sem nome',
    phone,
    email,
    source: portal || source,
    source_lead_id: normalizedExternalId,
    status: kanbanStatus,
    temperature: kanbanTemperature,
    property_code: propertyCode?.trim().toUpperCase() || null,
    is_exclusive: resolvedIsExclusive,
    assigned_agent_id: assignedBrokerId,
    assigned_agent_name: assignedBroker,
    comments: leadMessage,
    lead_type: normalizedLeadType,
    custom_fields: {
      source,
      external_id: normalizedExternalId,
      interest_type: interest_type || (propertyCode ? 'property' : null),
      interest_is_sale,
      interest_is_rent,
      interest_image: propertyImage,
      raw_data: raw_data || null,
      auto_assigned: assignmentMethod !== 'explicit' && assignedBroker ? { broker: assignedBroker, method: assignmentMethod } : null
    },
    created_at: now,
    updated_at: now
  };

  let crmData;
  try {
    const result = await insertOrReviveLead(crmLeadData);
    crmData = result.data;
    const action = result.revived ? 'reativado (topo da lista)' : 'criado';
    console.log(`✅ Lead ${action} no Kanban: ${crmData.id} → ${assignedBroker || 'Sem corretor'} (${kanbanStatus})`);
  } catch (crmError) {
    console.error('❌ Erro ao inserir em leads (CRM):', crmError);
    throw crmError;
  }

  const mappedLead = {
    id: crmData.id,
    crm_id: crmData.id,
    tenant_id: crmData.tenant_id,
    external_id: crmData.source_lead_id,
    name: crmData.name,
    phone: crmData.phone,
    email: crmData.email,
    portal: crmData.source,
    message: crmData.comments,
    property_code: crmData.property_code,
    interest_reference: crmData.property_code,
    is_exclusive: resolvedIsExclusive,
    interest_image: propertyImage,
    interest_type: interest_type || (propertyCode ? 'property' : null),
    interest_is_sale,
    interest_is_rent,
    assigned_agent: crmData.assigned_agent_name,
    assigned_agent_id: assignedBrokerId,
    attended_by: crmData.assigned_agent_name,
    stage: leadStage,
    kanban_status: kanbanStatus,
    temperature: leadTemperature,
    lead_timestamp: crmData.created_at,
    created_at: crmData.created_at
  };

  const response = {
    success: true,
    data: mappedLead,
    message: assignedBroker
      ? `Lead criado e atribuído a ${assignedBroker} (via ${assignmentMethod})`
      : 'Lead criado com sucesso no CRM'
  };

  if (assignedBroker && assignmentMethod !== 'explicit') {
    response.auto_assigned = {
      broker_name: assignedBroker,
      broker_id: assignedBrokerId,
      method: assignmentMethod
    };
  }

  return { statusCode: 201, response };
};

app.get('/api/v1/integrations/zapimoveis/health', validateZapFeedAccess, async (req, res) => {
  try {
    const listings = await getZapFeedListings(req.tenantId);
    res.json({
      success: true,
      integration: 'zapimoveis-vrsync',
      status: 'ready',
      tenant_id: req.tenantId,
      approved_listings_count: listings.length,
      routes: [
        'GET /api/v1/integrations/zapimoveis/vrsync.xml',
        'GET /api/v1/integrations/zapimoveis/feed.xml',
        'GET /api/v1/integrations/zapimoveis/debug',
        'POST /api/v1/integrations/zapimoveis/webhook',
        'POST /api/v1/integrations/zapimoveis/notify-update',
        'POST /api/v1/integrations/grupo-olx/webhook',
        'GET /api/v1/integrations/grupo-olx/vrsync.xml'
      ],
      auth: {
        feed_secret_configured: Boolean(getZapFeedConfig().secret),
        tenant_id_configured: Boolean(getZapFeedConfig().tenantId),
        supabase_using_service_role: usingServiceRole
      },
      timestamp: new Date().toISOString()
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

app.get('/api/v1/integrations/zapimoveis/debug', validateZapFeedAccess, async (req, res) => {
  try {
    const debugInfo = await getZapFeedDebugInfo(req.tenantId);

    res.json({
      success: true,
      integration: 'zapimoveis-vrsync',
      tenant_id: req.tenantId,
      supabase_using_service_role: usingServiceRole,
      ...debugInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao diagnosticar feed VRSync Zap/OLX:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

app.get('/api/v1/integrations/zapimoveis/vrsync.xml', validateZapFeedAccess, createZapVRSyncFeed);
app.get('/api/v1/integrations/zapimoveis/feed.xml', validateZapFeedAccess, createZapVRSyncFeed);
app.get('/api/v1/integrations/grupo-olx/vrsync.xml', validateZapFeedAccess, createZapVRSyncFeed);

app.post('/api/v1/integrations/zapimoveis/webhook', validateZapFeedAccess, async (req, res) => {
  try {
    const normalizedLead = normalizeZapLeadPayload(req.body);

    const zapCode = await extractZapCode(normalizedLead.message, req.tenantId);
    if (zapCode) {
      normalizedLead.interest_reference = zapCode;
      normalizedLead.property_code = zapCode;
      normalizedLead.codigo_imovel = zapCode;
      normalizedLead.interest_type = 'property';
    }

    const result = await createIncomingLead({
      tenantId: req.tenantId,
      body: normalizedLead,
      source: 'ZAP Imóveis'
    });

    console.log('📥 Webhook ZAP recebido e salvo:', {
      tenant_id: req.tenantId,
      lead_id: result.response?.data?.id,
      external_id: result.response?.data?.external_id,
      property_code: result.response?.data?.property_code,
      duplicate: Boolean(result.response?.duplicate)
    });

    res.status(result.statusCode).json({
      ...result.response,
      integration: 'zapimoveis-webhook'
    });
  } catch (error) {
    console.error('❌ Erro no webhook ZAP:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      integration: 'zapimoveis-webhook',
      error: {
        code: error.code || 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

app.post('/api/v1/integrations/grupo-olx/webhook', validateZapFeedAccess, async (req, res) => {
  try {
    const normalizedLead = {
      ...normalizeZapLeadPayload(req.body),
      portal: 'Grupo OLX',
    };
    const result = await createIncomingLead({
      tenantId: req.tenantId,
      body: normalizedLead,
      source: 'Grupo OLX'
    });

    res.status(result.statusCode).json({
      ...result.response,
      integration: 'grupo-olx-webhook'
    });
  } catch (error) {
    console.error('❌ Erro no webhook Grupo OLX:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      integration: 'grupo-olx-webhook',
      error: {
        code: error.code || 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

const buildPublicFeedUrl = (req, tenantId) => {
  const baseFromHeader = firstHeaderValue(req.headers['x-forwarded-host']) || req.headers.host;
  const proto = firstHeaderValue(req.headers['x-forwarded-proto']) || (req.secure ? 'https' : 'http');
  if (!baseFromHeader) return null;
  return `${proto}://${baseFromHeader}/api/v1/integrations/zapimoveis/vrsync.xml?tenant_id=${encodeURIComponent(tenantId)}`;
};

const notifyZapResync = async ({ tenantId, propertyCodes = [], action = 'update', feedUrl }) => {
  const config = getZapFeedConfig();
  const payload = {
    tenant_id: tenantId,
    action,
    property_codes: propertyCodes,
    feed_url: feedUrl,
    timestamp: new Date().toISOString()
  };

  if (!config.resyncUrl) {
    return { notified: false, reason: 'ZAPIMOVEIS_RESYNC_URL not configured' };
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.resyncToken) {
      headers['Authorization'] = `Bearer ${config.resyncToken}`;
    }

    const response = await fetch(config.resyncUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    return {
      notified: response.ok,
      status: response.status,
      reason: response.ok ? 'sent' : `upstream returned ${response.status}`
    };
  } catch (error) {
    return { notified: false, reason: `upstream error: ${error.message}` };
  }
};

// POST /api/v1/integrations/zapimoveis/notify-update
// Webhook outbound: dispara quando um imóvel é criado/editado/excluído no CRM
// Loga o evento e (se ZAPIMOVEIS_RESYNC_URL estiver configurada) avisa o ZAP para re-puxar o feed.
app.post('/api/v1/integrations/zapimoveis/notify-update', validateZapFeedAccess, async (req, res) => {
  try {
    const rawCodes = req.body?.property_code ?? req.body?.codigo_imovel ?? req.body?.property_codes ?? [];
    const propertyCodes = (Array.isArray(rawCodes) ? rawCodes : [rawCodes])
      .map((code) => normalizeFeedText(code).toUpperCase())
      .filter(Boolean);
    const action = ['create', 'update', 'delete'].includes(req.body?.action) ? req.body.action : 'update';

    const listings = await getZapFeedListings(req.tenantId);
    const eligibleCodes = new Set(listings.map((l) => normalizeFeedText(l.codigo_imovel).toUpperCase()));
    const missing = propertyCodes.filter((code) => !eligibleCodes.has(code));

    const feedUrl = buildPublicFeedUrl(req, req.tenantId);
    const notifyResult = await notifyZapResync({
      tenantId: req.tenantId,
      propertyCodes,
      action,
      feedUrl
    });

    console.log('📤 Webhook ZAP notify-update:', {
      tenant_id: req.tenantId,
      action,
      property_codes: propertyCodes,
      eligible_count: listings.length,
      missing_from_feed: missing,
      notified: notifyResult.notified,
      reason: notifyResult.reason
    });

    res.json({
      success: true,
      integration: 'zapimoveis-notify-update',
      tenant_id: req.tenantId,
      action,
      property_codes: propertyCodes,
      eligible_listings_count: listings.length,
      missing_from_feed: missing,
      feed_url: feedUrl,
      zap_resync: notifyResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro no notify-update do ZAP:', error);
    res.status(500).json({
      success: false,
      integration: 'zapimoveis-notify-update',
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/leads - Criar lead com atribuição automática
// Pipeline: attendedBy → XML/cache → Meus Imóveis → Roleta
// INSERE EM: leads (CRM/Kanban do Corretor)
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
    // INSERIR EM leads (CRM/Kanban do Corretor)
    // ============================================
    const now = new Date().toISOString();
    const sourceLeadId = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const kanbanStatus = mapStageToKanbanStatus(stage || etapa_funil || 1);
    const kanbanTemperature = mapTemperatureToCRM(temperature || temperatura || 'cold');

    const crmLeadData = {
      tenant_id: req.tenantId,
      name: name || 'Lead sem nome',
      phone: phone,
      email: email,
      source: portal || 'API',
      source_lead_id: sourceLeadId,
      status: kanbanStatus,
      temperature: kanbanTemperature,
      property_code: propertyCode?.trim().toUpperCase() || null,
      is_exclusive: resolvedIsExclusive,
      assigned_agent_id: assignedBrokerId,
      assigned_agent_name: assignedBroker,
      comments: leadMessage,
      lead_type: normalizedLeadType, // 1 = Interessado (default), 2 = Proprietário
      custom_fields: {
        source: 'API',
        external_id: sourceLeadId,
        interest_type: interest_type || (propertyCode ? 'property' : null),
        interest_is_sale,
        interest_is_rent,
        interest_image: propertyImage,
        raw_data: raw_data || req.body,
        auto_assigned: assignmentMethod !== 'explicit' && assignedBroker ? { broker: assignedBroker, method: assignmentMethod } : null
      },
      created_at: now,
      updated_at: now
    };

    let crmData;
    try {
      const result = await insertOrReviveLead(crmLeadData);
      crmData = result.data;
      const action = result.revived ? 'reativado (topo da lista)' : 'criado';
      console.log(`✅ Lead ${action} no Kanban: ${crmData.id} → ${assignedBroker || 'Sem corretor'} (${kanbanStatus})`);
    } catch (crmError) {
      console.error('❌ Erro ao inserir em leads (CRM):', crmError);
      throw crmError;
    }

    // Mapear resposta
    const mappedLead = {
      id: crmData.id,
      crm_id: crmData.id,
      tenant_id: crmData.tenant_id,
      external_id: crmData.source_lead_id,
      name: crmData.name,
      phone: crmData.phone,
      email: crmData.email,
      portal: crmData.source,
      message: crmData.comments,
      property_code: crmData.property_code,
      interest_reference: crmData.property_code,
      is_exclusive: resolvedIsExclusive,
      interest_image: propertyImage,
      interest_type: interest_type || (propertyCode ? 'property' : null),
      interest_is_sale,
      interest_is_rent,
      assigned_agent: crmData.assigned_agent_name,
      assigned_agent_id: assignedBrokerId,
      attended_by: crmData.assigned_agent_name,
      stage: leadStage,
      kanban_status: kanbanStatus,
      temperature: leadTemperature,
      lead_timestamp: crmData.created_at,
      created_at: crmData.created_at
    };

    const response = {
      success: true,
      data: mappedLead,
      message: assignedBroker 
        ? `Lead criado e atribuído a ${assignedBroker} (via ${assignmentMethod})`
        : 'Lead criado com sucesso no CRM'
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
          phone: normalizePhone(p.phone, { withCountryCode: true }),
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

    // INSERIR EM leads (CRM/Kanban do Corretor)
    const now = new Date().toISOString();
    const sourceLeadId = `api_roleta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const kanbanStatus = mapStageToKanbanStatus(stage || etapa_funil || 1);
    const kanbanTemperature = mapTemperatureToCRM(temperature || temperatura || 'cold');

    const crmLeadData = {
      tenant_id: req.tenantId,
      name: name || 'Lead sem nome',
      phone: phone,
      email: email,
      source: portal || 'API',
      source_lead_id: sourceLeadId,
      status: kanbanStatus,
      temperature: kanbanTemperature,
      property_code: propertyCode?.trim().toUpperCase() || null,
      assigned_agent_id: assignedBrokerId,
      assigned_agent_name: assignedBroker,
      comments: leadMessage,
      lead_type: normalizedLeadType,
      custom_fields: {
        source: 'API_ROLETA',
        external_id: sourceLeadId,
        interest_type: interest_type || (propertyCode ? 'property' : null),
        interest_is_sale,
        interest_is_rent,
        interest_image: propertyImage,
        raw_data: req.body,
        auto_assigned: { broker: assignedBroker, method: 'roleta_forced' }
      },
      created_at: now,
      updated_at: now
    };

    let crmData;
    try {
      const result = await insertOrReviveLead(crmLeadData);
      crmData = result.data;
      const action = result.revived ? 'reativado (topo da lista)' : 'criado';
      console.log(`✅ Lead roleta ${action} no Kanban: ${crmData.id} → ${assignedBroker} (${kanbanStatus})`);
    } catch (crmError) {
      console.error('❌ Erro ao inserir em leads/Kanban (roleta):', crmError);
      throw crmError;
    }

    // Mapear resposta
    const mappedLead = {
      id: crmData.id,
      crm_id: crmData.id,
      tenant_id: crmData.tenant_id,
      external_id: crmData.source_lead_id,
      name: crmData.name,
      phone: crmData.phone,
      email: crmData.email,
      portal: crmData.source,
      message: crmData.comments,
      property_code: crmData.property_code,
      assigned_agent: assignedBroker,
      assigned_agent_id: assignedBrokerId,
      stage: leadStage,
      kanban_status: kanbanStatus,
      temperature: leadTemperature,
      lead_timestamp: crmData.created_at,
      created_at: crmData.created_at
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
    // Escopo obrigatório por tenant: prioriza o tenant da API key; só usa o
    // tenant_id da query quando a key não está vinculada a um tenant (ex.: 'demo').
    const effectiveTenantId = req.tenantId || tenant_id;
    if (!effectiveTenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT_ID', message: 'tenant_id é obrigatório' }
      });
    }

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

// GET /api/v1/brokers/active - Listar APENAS corretores ativos (payload enxuto)
// Endpoint otimizado para consumo por IA: retorna apenas o necessário (id, nome,
// email, telefone, foto) sem joins pesados de imóveis/leads.
app.get('/api/v1/brokers/active', validateApiKey, async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id não identificado na API Key' }
      });
    }

    const { data, error } = await supabase
      .from('tenant_brokers')
      .select('id, auth_user_id, name, email, phone, photo_url, source')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) throw error;

    const brokers = (data || []).map((b) => ({
      id: b.auth_user_id || b.id,
      broker_id: b.id,
      auth_user_id: b.auth_user_id,
      name: b.name,
      email: b.email,
      phone: b.phone,
      photo_url: b.photo_url,
      source: b.source || 'manual',
    }));

    res.json({
      success: true,
      data: brokers,
      count: brokers.length,
    });
  } catch (error) {
    console.error('❌ Erro ao listar corretores ativos:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
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

    // Atribuição = setar raw_data.attendedBy preservando as demais chaves do payload.
    // Feito via RPC parametrizada (assign_broker_to_leads): 1 statement, atômico e sem
    // interpolar SQL. O helper SQL cru do código antigo não existe no supabase-js v2
    // (sempre lançava TypeError) e a interpolação abria injeção. A função mescla na
    // raiz do JSONB substituindo só a chave attendedBy, escopada por tenant_id no
    // WHERE. Retorna o nº de linhas atualizadas.
    const { data: updatedCount, error } = await supabase.rpc('assign_broker_to_leads', {
      p_tenant_id: req.tenantId,
      p_lead_ids: lead_ids,
      p_broker_id: String(id),
      p_broker_name: brokerNameToUse,
    });
    if (error) throw error;

    const leadsUpdated = updatedCount || 0;
    res.json({
      success: true,
      message: `${leadsUpdated} leads atribuídos ao corretor ${brokerNameToUse}`,
      data: {
        broker_id: id,
        broker_name: brokerNameToUse,
        leads_updated: leadsUpdated
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
// API v1 - AI KANBAN (endpoint unificado p/ agentes de IA)
// Opera sobre public.leads (não kenlo_leads).
// ============================================

const INTERESSADO_STATUSES = [
  'Novos Leads', 'Em Atendimento', 'Interação', 'Visita Agendada', 'Visita Realizada',
  'Negociação', 'Proposta Criada', 'Proposta Enviada', 'Proposta Assinada'
];
const PROPRIETARIO_STATUSES = [
  'Novos Proprietários', 'Primeira Visita', 'Criação do Estudo de Mercado',
  'Apresentação do Estudo de Mercado', 'Não Exclusivo', 'Exclusivo', 'Cadastro',
  'Plano de Marketing', 'Propostas Respondidas', 'Feitura de Contrato'
];
const ARCHIVED_STATUS = 'Arquivado';
const ALLOWED_STATUSES = [...INTERESSADO_STATUSES, ...PROPRIETARIO_STATUSES, ARCHIVED_STATUS];

const STAGE_NUM_TO_STATUS = {
  1: 'Novos Leads', 2: 'Em Atendimento', 3: 'Interação',
  4: 'Visita Agendada', 5: 'Visita Realizada', 6: 'Negociação',
  7: 'Proposta Criada', 8: 'Proposta Enviada', 9: 'Proposta Assinada', 10: 'Arquivado',
};

const aiKanbanNormalizeStr = (s) => String(s ?? '').trim().toLowerCase();
const aiKanbanStripAccents = (s) => aiKanbanNormalizeStr(s).normalize('NFD').replace(/\p{Diacritic}/gu, '');

const STATUS_BY_NORMALIZED = ALLOWED_STATUSES.reduce((acc, status) => {
  acc[aiKanbanStripAccents(status)] = status;
  return acc;
}, {});

const STATUS_SYNONYMS = {
  'novo': 'Novos Leads', 'novos': 'Novos Leads',
  'atendimento': 'Em Atendimento',
  'qualificado': 'Interação', 'qualificacao': 'Interação',
  'agendada': 'Visita Agendada', 'realizada': 'Visita Realizada',
  'negociacao': 'Negociação', 'em negociacao': 'Negociação',
  'fechado': 'Proposta Assinada', 'ganho': 'Proposta Assinada',
  'perdido': 'Arquivado',
};

const resolveStatusForAI = (input) => {
  if (input === undefined || input === null || input === '') return { ok: true, value: undefined };
  if (typeof input === 'number' && STAGE_NUM_TO_STATUS[input]) {
    return { ok: true, value: STAGE_NUM_TO_STATUS[input] };
  }
  const asNum = parseInt(input, 10);
  if (!Number.isNaN(asNum) && STAGE_NUM_TO_STATUS[asNum]) {
    return { ok: true, value: STAGE_NUM_TO_STATUS[asNum] };
  }
  const norm = aiKanbanStripAccents(input);
  if (STATUS_BY_NORMALIZED[norm]) return { ok: true, value: STATUS_BY_NORMALIZED[norm] };
  if (STATUS_SYNONYMS[norm]) return { ok: true, value: STATUS_SYNONYMS[norm] };
  return {
    ok: false,
    error: `status inválido: "${input}". Use 1-10 ou um dos nomes: ${ALLOWED_STATUSES.join(', ')}`,
  };
};

const TEMP_BY_INPUT = {
  1: 'Frio', 2: 'Morno', 3: 'Quente',
  cold: 'Frio', warm: 'Morno', hot: 'Quente',
  frio: 'Frio', morno: 'Morno', quente: 'Quente',
};

const resolveTemperatureForAI = (input) => {
  if (input === undefined || input === null || input === '') return { ok: true, value: undefined };
  const key = typeof input === 'number' ? input : aiKanbanNormalizeStr(input);
  const value = TEMP_BY_INPUT[key];
  if (!value) return { ok: false, error: `temperature inválida: "${input}". Use Frio/Morno/Quente, cold/warm/hot ou 1/2/3` };
  return { ok: true, value };
};

const resolveBrokerForAssignment = async (tenantId, input) => {
  if (!input || typeof input !== 'object') return { ok: false, error: 'broker deve ser objeto com id, name ou phone' };
  const { id, name, phone } = input;

  if (!id && !name && !phone) {
    return { ok: false, error: 'broker precisa de id, name ou phone' };
  }

  let query = supabase
    .from('tenant_brokers')
    .select('id, auth_user_id, name, email, phone, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (id) {
    query = query.or(`id.eq.${id},auth_user_id.eq.${id}`);
  } else if (phone) {
    const clean = normalizePhone(phone);
    query = query.or(`phone.eq.${clean},phone.eq.${phone}`);
  } else if (name) {
    query = query.ilike('name', name);
  }

  const { data, error } = await query.limit(1);
  if (error) return { ok: false, error: `Erro ao buscar corretor: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, error: `Corretor não encontrado/ativo (id=${id || '-'}, name=${name || '-'}, phone=${phone || '-'})` };
  }

  const broker = data[0];
  return {
    ok: true,
    broker: {
      name: broker.name,
      id: broker.auth_user_id || broker.id,
      auth_user_id: broker.auth_user_id,
      phone: broker.phone,
      email: broker.email,
    }
  };
};

const AI_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/v1/ai/kanban/leads/:id
// Endpoint unificado para a IA mover leads no kanban em uma única chamada.
// Opera sobre public.leads. :id aceita UUID (leads.id) ou string (source_lead_id).
// Body (todos opcionais, ao menos um obrigatório):
//   status (ou stage): number 1..10 | nome (ex.: "Interação", "Negociação")
//   temperature:       "Frio"|"Morno"|"Quente" | "cold"|"warm"|"hot" | 1|2|3
//   broker:            { id?, name?, phone? } — corretor precisa estar ativo no tenant
//   archive:           true (arquiva) | false (desarquiva)
//   archive_reason:    string (usado quando archive=true)
app.post('/api/v1/ai/kanban/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id não identificado na API Key' }
      });
    }

    const { stage, status, temperature, broker, archive, archive_reason } = req.body || {};
    const statusInput = status !== undefined ? status : stage;

    if (statusInput === undefined && temperature === undefined && broker === undefined && archive === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Forneça ao menos um dos campos: status (ou stage), temperature, broker, archive'
        }
      });
    }

    let selectQuery = supabase.from('leads').select('*').eq('tenant_id', tenantId);
    selectQuery = AI_UUID_REGEX.test(id)
      ? selectQuery.eq('id', id)
      : selectQuery.eq('source_lead_id', id);
    const { data: currentLead, error: selectError } = await selectQuery.maybeSingle();

    if (selectError) throw selectError;
    if (!currentLead) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Lead ${id} não encontrado no tenant` }
      });
    }

    const update = { updated_at: new Date().toISOString() };
    const changes = {};
    const errors = [];

    const statusResolved = resolveStatusForAI(statusInput);
    if (!statusResolved.ok) errors.push(statusResolved.error);
    else if (statusResolved.value !== undefined) {
      update.status = statusResolved.value;
      changes.status = { from: currentLead.status ?? null, to: statusResolved.value };
    }

    const tempResolved = resolveTemperatureForAI(temperature);
    if (!tempResolved.ok) errors.push(tempResolved.error);
    else if (tempResolved.value !== undefined) {
      update.temperature = tempResolved.value;
      changes.temperature = { from: currentLead.temperature ?? null, to: tempResolved.value };
    }

    if (broker !== undefined && broker !== null) {
      const brokerResolved = await resolveBrokerForAssignment(tenantId, broker);
      if (!brokerResolved.ok) errors.push(brokerResolved.error);
      else {
        update.assigned_agent_name = brokerResolved.broker.name;
        update.assigned_agent_id = brokerResolved.broker.id;
        if (!currentLead.assigned_at) update.assigned_at = new Date().toISOString();
        changes.broker = {
          from: currentLead.assigned_agent_name ?? null,
          to: brokerResolved.broker.name,
          id: brokerResolved.broker.id,
        };
      }
    }

    if (archive === true) {
      const reason = archive_reason || 'Arquivado via IA';
      update.archived_at = new Date().toISOString();
      update.archive_reason = reason;
      changes.archived = { from: !!currentLead.archived_at, to: true, reason };
    } else if (archive === false) {
      update.archived_at = null;
      update.archive_reason = null;
      changes.archived = { from: !!currentLead.archived_at, to: false };
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Falha na validação', details: errors }
      });
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_OP', message: 'Nenhuma alteração aplicável foi fornecida' }
      });
    }

    let updateQuery = supabase.from('leads').update(update).eq('tenant_id', tenantId);
    updateQuery = AI_UUID_REGEX.test(id)
      ? updateQuery.eq('id', id)
      : updateQuery.eq('source_lead_id', id);
    const { data, error } = await updateQuery.select().single();
    if (error) throw error;

    res.json({
      success: true,
      data,
      changes,
      message: `Lead ${id} atualizado: ${Object.keys(changes).join(', ')}`
    });
  } catch (error) {
    console.error('❌ Erro no AI kanban:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
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
    
    const safeId = sanitizeFilterValue(identifier);
    if (isPhone) {
      const cleanPhone = identifier.replace(/\D/g, '');
      query = query.or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${safeId}`);
    } else {
      query = query.or(`corretor_id.eq.${safeId},corretor_nome.ilike.%${safeId}%`);
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

// GET /api/v1/webhooks - Listar webhooks
app.get('/api/v1/webhooks', validateApiKey, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('webhook_subscriptions')
      .select('id, name, url, events, status, created_at, updated_at')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('❌ Erro ao listar webhooks:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/webhooks - Criar webhook
app.post('/api/v1/webhooks', validateApiKey, async (req, res) => {
  try {
    const { url, events = ['lead.created'], name, active = true } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'url é obrigatório'
        }
      });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL do webhook inválida'
        }
      });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL do webhook deve usar http ou https'
        }
      });
    }

    // Proteção SSRF (cadastro): rejeita já na criação URLs com credenciais embutidas,
    // localhost ou IP literal de rede interna/privada. A verificação completa com
    // resolução DNS ocorre no momento do disparo (assertSafeHttpUrl em dispatchWebhookEvent).
    const urlGuard = parseHttpUrl(url);
    if (!urlGuard.ok) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL do webhook não permitida (rede interna/privada, localhost ou credenciais na URL).'
        }
      });
    }

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'events deve ser um array com pelo menos um evento'
        }
      });
    }

    const validEvents = ['lead.created'];
    const webhookEvents = events.filter(event => validEvents.includes(event));

    if (webhookEvents.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `events deve conter pelo menos um evento válido: ${validEvents.join(', ')}`
        }
      });
    }

    const { data: webhook, error } = await supabase
      .from('webhook_subscriptions')
      .insert({
        tenant_id: req.tenantId,
        name: name || 'Webhook',
        url,
        events: webhookEvents,
        status: active ? 'active' : 'inactive',
        updated_at: new Date().toISOString()
      })
      .select('id, name, url, events, secret, status, created_at, updated_at')
      .single();

    if (error) throw error;

    const responseWebhook = {
      ...webhook,
      secret_note: 'Guarde este secret para validar a assinatura X-OctoDash-Signature.'
    };

    res.status(201).json({
      success: true,
      data: responseWebhook,
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

// DELETE /api/v1/webhooks/:id - Remover webhook
app.delete('/api/v1/webhooks/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('webhook_subscriptions')
      .delete()
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .select('id, name, url')
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Webhook não encontrado'
        }
      });
    }

    res.json({
      success: true,
      message: 'Webhook removido',
      data
    });
  } catch (error) {
    console.error('❌ Erro ao remover webhook:', error);
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
// ROUTES - LANÇAMENTOS (consumo por agentes de IA)
// ============================================

const mapLancamentoFromDB = (row) => ({
  id: row.id,
  nome: row.nome,
  descricao: row.descricao || null,
  book_pdf_url: row.book_pdf || null,
  book_pdf_filename: row.book_pdf_filename || null,
  fotos: (Array.isArray(row.fotos) ? row.fotos : []).map((f) => ({
    url: f?.url || null,
    legenda: f?.legenda || null,
    is_capa: !!f?.isCapa,
  })),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// GET /api/v1/lancamentos - Listar lançamentos do tenant (resumido)
app.get('/api/v1/lancamentos', validateApiKey, async (req, res) => {
  try {
    const { search } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('lancamentos')
      .select('id, nome, descricao, book_pdf, book_pdf_filename, fotos, created_at, updated_at', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search && String(search).trim()) {
      query = query.ilike('nome', `%${String(search).trim()}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Erro ao listar lançamentos:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Falha ao listar lançamentos' },
      });
    }

    const items = (data || []).map((row) => {
      const fotos = Array.isArray(row.fotos) ? row.fotos : [];
      const capa = fotos.find((f) => f?.isCapa) || fotos[0] || null;
      return {
        id: row.id,
        nome: row.nome,
        capa_url: capa?.url || null,
        total_fotos: fotos.length,
        tem_book: !!row.book_pdf,
        updated_at: row.updated_at,
      };
    });

    res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (err) {
    console.error('Erro inesperado em /lancamentos:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erro inesperado' },
    });
  }
});

// GET /api/v1/lancamentos/:id - Detalhe completo de um lançamento
app.get('/api/v1/lancamentos/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('lancamentos')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar lançamento:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Falha ao buscar lançamento' },
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lançamento não encontrado' },
      });
    }

    res.json({ success: true, data: mapLancamentoFromDB(data) });
  } catch (err) {
    console.error('Erro inesperado em /lancamentos/:id:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erro inesperado' },
    });
  }
});

// ============================================
// RECOMENDAÇÕES DE IMÓVEIS — envio por e-mail + histórico
// ============================================
import { registerRecommendationRoutes, startRecommendationScheduler } from './recommendations/index.js';
registerRecommendationRoutes(app, supabase);

// Worker de agendamento (Fase 2). Flag-gated (RECOMMENDATION_SCHEDULER=1) para
// rodar em apenas UM processo e evitar execuções duplicadas.
if (process.env.RECOMMENDATION_SCHEDULER === '1') {
  startRecommendationScheduler(supabase);
}

// ============================================
// KPIs — indicadores do dashboard (cálculo no servidor, isolado por tenant)
// Registrar ANTES do 404 catch-all de /api/v1/*.
// ============================================
import { registerKpisRoutes } from './kpis/index.js';
registerKpisRoutes(app, supabase);

// ============================================
// KENLO — sincronização nativa de leads (substitui automação N8N)
// Registrar ANTES do 404 catch-all de /api/v1/*.
// ============================================
import { registerKenloRoutes, startKenloScheduler } from './kenlo/index.js';
registerKenloRoutes(app, supabase);

// Worker de sync. Flag-gated (KENLO_SYNC_SCHEDULER=1) para rodar em UM processo.
if (process.env.KENLO_SYNC_SCHEDULER === '1') {
  startKenloScheduler(supabase);
}

// ============================================
// MÓDULO COMUNICAÇÃO — Agente Disparador + Campanhas + Templates
// Espelha o api-server.js: registra os handlers de /api/v1/agent-actions/* e
// o alias /api/v1/communication/dispatch/*. Sem isto, o módulo inteiro
// (Disparador, Campanhas, Templates) responde 404 em produção.
// Registrar ANTES do 404 catch-all de /api/v1/*.
// ============================================
import { registerAgentActionRoutes } from './agent-actions/routes.js';
registerAgentActionRoutes(app, supabase);

import { registerCommunicationRoutes } from './communication/index.js';
registerCommunicationRoutes(app, supabase);

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
const assetsDir = path.join(buildPath, 'assets');
const indexHtmlPath = path.join(buildPath, 'index.html');
app.use(express.static(buildPath, {
  etag: true,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath === indexHtmlPath) {
      // index.html NUNCA pode ser cacheado: ele aponta para os chunks com hash.
      // Se cachear, o browser fica preso em chunks antigos após um deploy e quebra
      // com "MIME type text/html" ao tentar carregar um .js que não existe mais.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.startsWith(assetsDir)) {
      // Assets têm hash no nome (immutable): pode cachear agressivamente.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// SPA fallback - rotas de navegação do React Router retornam index.html
app.get('*', (req, res, next) => {
  // Ignorar rotas de API
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
    return next();
  }

  // NÃO servir index.html para requisições de arquivo (ex.: /assets/*.js que não
  // existe mais após um deploy). Devolver 404 limpo evita o erro de MIME type
  // text/html no carregamento de módulos dinâmicos.
  if (req.path.startsWith('/assets/') || path.extname(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }

  // Retornar index.html para rotas do React Router (sem cache)
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(indexHtmlPath);
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
  console.log('   ├─ 🏠 GET /api/v1/integrations/zapimoveis/health → Diagnóstico feed Zap/OLX');
  console.log('   ├─ 🔎 GET /api/v1/integrations/zapimoveis/debug  → Motivos de imóveis fora do feed');
  console.log('   ├─ 🧾 GET /api/v1/integrations/zapimoveis/vrsync.xml → Feed VRSync Zap');
  console.log('   ├─ 🧾 GET /api/v1/integrations/grupo-olx/vrsync.xml  → Feed VRSync OLX');
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
