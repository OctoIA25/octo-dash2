/**
 * Scraper Avançado para Sites de Imóveis com Anti-Bloqueio
 * 1. Fetch HTTP simples (rápido, para sites sem Cloudflare)
 * 2. Puppeteer Stealth (para sites com Cloudflare: ZAP, VivaReal, OLX, ImovelWeb)
 */

import puppeteer from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createHash } from 'crypto';

// Adicionar stealth plugin para melhor camuflagem
puppeteerExtra.use(StealthPlugin());

// Puppeteer é carregado de forma preguiçosa apenas quando um site Cloudflare
// é solicitado. Isso mantém o boot rápido e permite implantar sem Chromium.
let puppeteerInstance = null;
async function loadPuppeteer() {
  if (puppeteerInstance) return puppeteerInstance;
  try {
    puppeteerInstance = puppeteerExtra;
    return puppeteerInstance;
  } catch (err) {
    throw new Error(
      `Puppeteer não disponível neste ambiente (${err.message}). ` +
      `Esta rota precisa de Chromium instalado — veja Dockerfile para habilitar.`
    );
  }
}

const USER_AGENTS = [
  // Chrome 131 (Windows) - Mais recente
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Chrome 130 (Windows) - Versão anterior
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  // Chrome 131 (macOS) - Diferente OS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Chrome 131 (Linux) - Diferente OS
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Firefox 132 (Windows) - Browser diferente
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  // Firefox 132 (macOS) - Browser diferente + OS diferente
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  // Safari 17 (macOS) - Browser nativo
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/604.1',
  // Edge 131 (Windows) - Baseado em Chromium
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomReferer() {
  const referers = [
    'https://www.google.com.br/',
    'https://www.imovelweb.com.br/',
  ];
  return referers[Math.floor(Math.random() * referers.length)];
}

/**
 * Gera delay humano usando distribuição gaussiana (normal)
 * @param {number} mean - Média do delay em segundos
 * @param {number} std - Desvio padrão
 * @param {number} min - Delay mínimo em segundos
 */
function humanDelay(mean = 3.0, std = 1.2, min = 1.0) {
  // Box-Muller transform para distribuição normal
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  
  const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const delay = normal * std + mean;
  
  return Math.max(delay, min) * 1000; // Convert para ms
}

/**
 * Backoff exponencial para rate limiting
 * @param {number} attempt - Número da tentativa
 * @param {number} baseDelay - Delay base em ms
 */
function exponentialBackoff(attempt, baseDelay = 2000) {
  return Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, 30000);
}

/**
 * Simula comportamento humano realista no navegador
 * @param {import('puppeteer').Page} page
 */
async function simulateHumanBehavior(page) {
  try {
    // 1. Scroll gradual e natural
    await page.evaluate(() => {
      window.scrollTo(0, 200);
    });
    await new Promise(r => setTimeout(r, humanDelay(0.8, 0.3, 0.5)));

    await page.evaluate(() => {
      window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.4));
    });
    await new Promise(r => setTimeout(r, humanDelay(1.2, 0.4, 0.8)));

    await page.evaluate(() => {
      window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.7));
    });
    await new Promise(r => setTimeout(r, humanDelay(0.6, 0.2, 0.4)));

    // 2. Movimento do mouse aleatório
    await page.evaluate(() => {
      const moveMouse = (x, y) => {
        const event = new MouseEvent('mousemove', {
          clientX: x,
          clientY: y,
          bubbles: true
        });
        document.dispatchEvent(event);
      };

      // Movimentos aleatórios do mouse
      const positions = [
        [100, 150], [200, 180], [350, 220], [450, 160], [300, 300]
      ];
      
      positions.forEach(([x, y], i) => {
        setTimeout(() => moveMouse(x + Math.random() * 50, y + Math.random() * 50), i * 200);
      });
    });

    await new Promise(r => setTimeout(r, humanDelay(1.0, 0.3, 0.6)));

    // 3. Scroll final para o topo (comportamento de leitura)
    await page.evaluate(() => {
      window.scrollTo(0, 100);
    });
    await new Promise(r => setTimeout(r, humanDelay(0.5, 0.2, 0.3)));

  } catch (error) {
    console.warn('⚠️ Erro na simulação humana:', error.message);
  }
}

const HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// Sites que funcionam bem (menos proteção)
const WORKING_SITES = [
  'olx.com.br',
  'webmotors.com.br',
  'autotrader.com',
  'casa.sap.com.br',
  'cavalo.com.br',
];

// Sites que precisam de Puppeteer (Cloudflare)
const NEEDS_BROWSER = [
  'zapimoveis.com',
  'vivareal.com',
  'olx.com',
  'imovelweb.com',
  'quintoandar.com',
];

// Sites muito bloqueados (evitar)
const BLOCKED_SITES = [
  'imovelweb.com',
  'zapimoveis.com',
  'vivareal.com',
  'quintoandar.com',
];

function needsBrowser(url) {
  return NEEDS_BROWSER.some(domain => url.includes(domain));
}

/**
 * Detecta se o HTML é uma página de bloqueio (Cloudflare, etc.)
 * @param {string} html - HTML recebido
 * @returns {boolean}
 */
function isBlockedPage(html) {
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

/**
 * Fetch HTTP simples com headers anti-bloqueio
 */
async function fetchSimple(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  // Headers dinâmicos para cada requisição
  const dynamicHeaders = {
    ...HEADERS,
    'User-Agent': randomUA(),
    'Referer': getRandomReferer(),
    'DNT': '1',
    'Connection': 'keep-alive',
  };

  const response = await fetch(url, {
    headers: dynamicHeaders,
    signal: controller.signal,
    redirect: 'follow',
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  
  // Verificar se recebeu página de bloqueio
  if (isBlockedPage(html)) {
    console.warn(' Página de bloqueio detectada (Cloudflare)');
    throw new Error('CLOUDFLARE_BLOCKED');
  }
}

/**
 * Fetch com Puppeteer Stealth avançado para sites com Cloudflare
 */
async function fetchWithBrowser(url) {
  const pptr = await loadPuppeteer();
  let browser = null;
  try {
    browser = await pptr.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,VizDisplayCompositor',
        '--disable-ipc-flooding-protection',
        '--window-size=1920,1080',
        '--user-data-dir=C:/temp/puppeteer-user-data',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const page = await browser.newPage();
    
    // Remover detecção de automação
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Sobrescrever plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Sobrescrever languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['pt-BR', 'pt', 'en-US', 'en'],
      });
    });
    
    // Headers mais realistas
    const browserHeaders = {
      ...HEADERS,
      'User-Agent': randomUA(),
      'Referer': getRandomReferer(),
    };
    
    await page.setExtraHTTPHeaders(browserHeaders);

    // Bloquear recursos pesados
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'csp_report'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navegar com mais opções
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Esperar muito mais tempo para Cloudflare resolver (10-15s)
    console.log('⏳ Esperando Cloudflare resolver (10-15s)...');
    await new Promise(r => setTimeout(r, humanDelay(12.0, 2.0, 3.0)));

    // Simular comportamento humano realista
    await simulateHumanBehavior(page);

    // Verificar se ainda está na página de Cloudflare
    const currentUrl = page.url();
    if (currentUrl.includes('challenges.cloudflare.com') || currentUrl.includes('cf-challenge')) {
      console.warn('🚫 Ainda na página Cloudflare após espera');
      throw new Error('CLOUDFLARE_BLOCKED');
    }

    const html = await page.content();
    
    // Verificar se o Puppeteer também recebeu página de bloqueio
    if (isBlockedPage(html)) {
      console.warn('🚫 Puppeteer também recebeu página de bloqueio (Cloudflare)');
      throw new Error('CLOUDFLARE_BLOCKED');
    }
    
    return html;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Busca o HTML de uma URL com retry e fallback automatico
 * @param {string} url - URL do imovel
 * @param {number} maxRetries - Numero maximo de tentativas
 * @returns {Promise<string>} HTML da pagina
 */
export async function fetchHtml(url, maxRetries = 2) {
  const useBrowser = needsBrowser(url);
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let html;

      if (useBrowser) {
        console.log(`🌐 [Puppeteer] Tentativa ${attempt}/${maxRetries}: ${url.substring(0, 60)}...`);
        try {
          html = await fetchWithBrowser(url);
        } catch (browserErr) {
          console.warn(`⚠️ Puppeteer falhou (${browserErr.message}), caindo para fetch simples...`);
          html = await fetchSimple(url);
        }
      } else {
        console.log(`⚡ [Fetch] Tentativa ${attempt}/${maxRetries}: ${url.substring(0, 60)}...`);
        html = await fetchSimple(url);
      }

      if (!html || html.length < 500) {
        throw new Error('Pagina retornou conteudo muito curto');
      }

      // Se fetch simples retornou pagina de Cloudflare, tentar com browser
      if (!useBrowser && html.includes('cf-browser-verification')) {
        console.log('⚠️ Cloudflare detectado, tentando com Puppeteer...');
        html = await fetchWithBrowser(url);
      }

      return html;
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Tentativa ${attempt}/${maxRetries} falhou: ${error.message}`);

      // Se fetch simples falhou com 403, tentar com browser
      if (!useBrowser && (error.message.includes('403') || error.message.includes('CLOUDFLARE_BLOCKED')) && attempt === 1) {
        console.log('🔄 Bloqueio detectado, tentando com Puppeteer...');
        try {
          const html = await fetchWithBrowser(url);
          if (html && html.length >= 500) return html;
        } catch (browserErr) {
          console.warn(`⚠️ Puppeteer tambem falhou: ${browserErr.message}`);
          // Se Puppeteer também detectou Cloudflare, propagar o erro
          if (browserErr.message.includes('CLOUDFLARE_BLOCKED')) {
            throw browserErr;
          }
        }
      }

      if (attempt < maxRetries) {
        const backoffDelay = exponentialBackoff(attempt - 1);
        console.log(`⏳ Backoff: esperando ${Math.round(backoffDelay/1000)}s antes da tentativa ${attempt + 1}`);
        await new Promise(r => setTimeout(r, backoffDelay));
      }
    }
  }

  throw lastError || new Error('Falha ao buscar HTML');
}
