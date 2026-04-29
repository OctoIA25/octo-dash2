/**
 * Scraper nativo para Estudo de Mercado
 * Substitui o webhook n8n (puppeter.octoia.org)
 *
 * Pipeline: URL -> Cheerio (HTML) -> Regex (preco/area/fotos) -> OpenAI (localizacao) -> JSON
 *
 * Features:
 * - Cache in-memory 24h
 * - Fila com limite de concorrencia
 * - Anti-bloqueio (UA rotation, headers pt-BR, session pool)
 * - Retry com backoff
 */

import { createHash } from 'crypto';
import { fetchHtml } from './cheerioCrawler.js';
import { extractFromHtml } from './dataExtractor.js';
import { enrichWithAI } from './aiEnricher.js';
import { smartScraper } from './smartScraper.js';

// ═══ CACHE ═══
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function getCacheKey(url) {
  const normalized = url.trim().toLowerCase().replace(/\/+$/, '').replace(/\?.*$/, '');
  return createHash('sha256').update(normalized).digest('hex');
}

function getFromCache(url) {
  const key = getCacheKey(url);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(url, data) {
  const key = getCacheKey(url);
  cache.set(key, { data, timestamp: Date.now() });
}

// Limpar cache expirado a cada hora
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL) cache.delete(key);
  }
}, 60 * 60 * 1000);

// ═══ FILA DE CONCORRENCIA ═══
let activeRequests = 0;
const MAX_CONCURRENT = 5;
const queue = [];

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    const task = { fn, resolve, reject };
    if (activeRequests < MAX_CONCURRENT) {
      runTask(task);
    } else {
      queue.push(task);
    }
  });
}

async function runTask(task) {
  activeRequests++;
  try {
    const result = await task.fn();
    task.resolve(result);
  } catch (err) {
    task.reject(err);
  } finally {
    activeRequests--;
    if (queue.length > 0) {
      runTask(queue.shift());
    }
  }
}

// ═══ DETECÇÃO DE BLOQUEIO ═══
function isCloudflarePage(html) {
  const blockedIndicators = [
    'cloudflare',
    'cf-browser-verification',
    'turnstile',
    'challenges.cloudflare.com',
    'Executando verificação de segurança',
    'Um momento…',
    'Incompatibilidade da extensão do navegador',
    'ray-id',
    'cf_chl_opt'
  ];
  
  const htmlLower = html.toLowerCase();
  return blockedIndicators.some(indicator => htmlLower.includes(indicator.toLowerCase()));
}

// ═══ OPENAI KEY ═══
function getOpenAIKey(supabaseClient, tenantId) {
  return supabaseClient
    .from('tenant_api_keys')
    .select('api_key')
    .eq('tenant_id', tenantId)
    .eq('provider', 'openai')
    .eq('status', 'active')
    .limit(1)
    .single()
    .then(({ data }) => data?.api_key || process.env.OPENAI_API_KEY || null);
}

// ═══ VERIFICAÇÃO RÁPIDA ═══
function isBlockedSite(url) {
  const BLOCKED_SITES = [
    'imovelweb.com',
    'zapimoveis.com',
    'vivareal.com',
    'quintoandar.com',
  ];
  return BLOCKED_SITES.some(domain => url.includes(domain));
}

// ═══ PIPELINE PRINCIPAL ═══
async function scrapeImovel(url, openaiKey) {

  // PIPELINE COM SMART SCRAPER
  try {
    const data = await smartScraper.scrape(url);
    return data;
    
  } catch (error) {
    // Retorno mockado final
    return {
      'Valor Total (R$)': null,
      'Metragem (m²)': null,
      rua: null,
      bairro: null,
      cidade: null,
      estado: null,
      condominio: null,
      tipo: null,
      diferenciais: null,
      localizacao_completa: null,
      imagem: null,
      imagemzapimoveis: null
    };
  }
}

// ═══ ENDPOINT EXPRESS ═══

/**
 * Registra a rota POST /api/v1/scrape-imovel no Express
 * @param {import('express').Express} app - Instancia do Express
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient - Cliente Supabase com service role
 */
export function registerScrapeRoute(app, supabaseClient) {
  app.post('/api/v1/scrape-imovel', async (req, res) => {
    const { url } = req.body;

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return res.status(400).json({ error: 'URL invalida. Envie { "url": "https://..." }' });
    }
    // Verificar cache
    const cached = getFromCache(url);
    if (cached) {
      console.log(`✅ Cache hit para ${url.substring(0, 60)}...`);
      // Se cache tem blocked=true, não retornar - tentar novamente
      if (cached.blocked) {
      } else {
        return res.json(cached);
      }
    }

    // Verificar fila
    if (activeRequests >= MAX_CONCURRENT && queue.length >= 20) {
      return res.status(429).json({
        error: 'Servidor ocupado. Tente novamente em alguns segundos.',
        retryAfter: 5,
      });
    }

    try {
      // Buscar OpenAI key do tenant (ou env var)
      const tenantId = req.tenantId || null;
      let openaiKey = process.env.OPENAI_API_KEY || null;

      if (tenantId && supabaseClient) {
        const tenantKey = await getOpenAIKey(supabaseClient, tenantId);
        if (tenantKey) openaiKey = tenantKey;
      }

      // Executar scraping na fila
      const result = await enqueue(() => scrapeImovel(url, openaiKey));

      // Cachear resultado (só se não for bloqueado)
      if (!result.blocked) {
        setCache(url, result);
      }
      // Formatar resposta para frontend
      const response = {
        success: true,
        url,
        source: new URL(url).hostname,
        method: result.method || 'unknown',
        blocked: result.blocked || false,
        blockedReason: result.blockedReason || null,
        ...result,
        cached: false,
        enriched: result.enriched || false
      };
      
      return res.json(response);
    } catch (error) {
      console.error(`❌ Scrape falhou: ${url.substring(0, 60)}... | ${error.message}`);

      // Tentar retornar cache stale se existir
      const stale = getFromCache(url);
      if (stale) {
        return res.json({ ...stale, _stale: true });
      }

      return res.status(500).json({
        error: 'Falha ao extrair dados do imovel',
        details: error.message,
      });
    }
  });

  console.log('✅ Rota POST /api/v1/scrape-imovel registrada');
}
