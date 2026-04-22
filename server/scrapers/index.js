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

// ═══ PIPELINE PRINCIPAL ═══
async function scrapeImovel(url, openaiKey) {
  // 1. Buscar HTML com Cheerio + anti-bloqueio
  const html = await fetchHtml(url);

  if (!html || html.length < 500) {
    throw new Error('Pagina retornou conteudo vazio ou muito curto');
  }

  // 2. Extrair dados com regex (preco, area, fotos)
  const regexData = extractFromHtml(html);

  // 3. Limpar texto para o AI
  const cleanText = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 4. Enriquecer com OpenAI (localizacao, tipo, diferenciais)
  const aiData = await enrichWithAI(cleanText, openaiKey);

  // 5. Montar resposta no formato esperado pelo frontend
  const fotos = regexData.fotos || [];

  return {
    'Valor Total (R$)': regexData.valorTotal || null,
    'Metragem (m²)': regexData.metragem || null,
    rua: aiData.rua || null,
    bairro: aiData.bairro || regexData.bairro || null,
    cidade: aiData.cidade || regexData.cidade || null,
    estado: aiData.estado || regexData.estado || null,
    condominio: aiData.condominio || regexData.condominio || null,
    tipo: aiData.tipo || null,
    diferenciais: aiData.diferenciais || null,
    localizacao_completa: aiData.localizacao_completa || null,
    imagem: fotos[0] || null,
    imagemzapimoveis: fotos[6] || fotos[1] || null,
  };
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
      return res.json(cached);
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

      // Cachear resultado
      setCache(url, result);

      console.log(`✅ Scrape OK: ${url.substring(0, 60)}... | Valor: ${result['Valor Total (R$)']} | Area: ${result['Metragem (m²)']}`);
      return res.json(result);
    } catch (error) {
      console.error(`❌ Scrape falhou: ${url.substring(0, 60)}... | ${error.message}`);

      // Tentar retornar cache stale se existir
      const stale = getFromCache(url);
      if (stale) {
        console.log('⚠️ Retornando cache stale');
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
