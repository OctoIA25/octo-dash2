/**
 * Scraper com 2 camadas:
 * 1. Fetch HTTP simples (rapido, para sites sem Cloudflare)
 * 2. Puppeteer headless (para sites com Cloudflare: ZAP, VivaReal, OLX)
 */

// Puppeteer é carregado de forma preguiçosa apenas quando um site Cloudflare
// é solicitado. Isso mantém o boot rápido e permite implantar sem Chromium.
let puppeteer = null;
async function loadPuppeteer() {
  if (puppeteer) return puppeteer;
  try {
    const mod = await import('puppeteer');
    puppeteer = mod.default ?? mod;
    return puppeteer;
  } catch (err) {
    throw new Error(
      `Puppeteer não disponível neste ambiente (${err.message}). ` +
      `Esta rota precisa de Chromium instalado — veja Dockerfile para habilitar.`
    );
  }
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.5',
  'Referer': 'https://www.google.com.br/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'cross-site',
};

// Sites que precisam de Puppeteer (Cloudflare)
const NEEDS_BROWSER = [
  'zapimoveis.com',
  'vivareal.com',
  'olx.com',
  'imovelweb.com',
  'quintoandar.com',
];

function needsBrowser(url) {
  return NEEDS_BROWSER.some(domain => url.includes(domain));
}

/**
 * Fetch HTTP simples com headers anti-bloqueio
 */
async function fetchSimple(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(url, {
    headers: { ...HEADERS, 'User-Agent': randomUA() },
    signal: controller.signal,
    redirect: 'follow',
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.text();
}

/**
 * Fetch com Puppeteer (browser headless) para sites com Cloudflare
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
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(randomUA());
    await page.setExtraHTTPHeaders(HEADERS);
    await page.setViewport({ width: 1920, height: 1080 });

    // Bloquear recursos pesados (imagens, fontes, stylesheets) para acelerar
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'stylesheet', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });

    // Esperar um pouco para JS carregar dados
    await new Promise(r => setTimeout(r, 2000));

    const html = await page.content();
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
      if (!useBrowser && error.message.includes('403') && attempt === 1) {
        console.log('🔄 403 detectado, tentando com Puppeteer...');
        try {
          const html = await fetchWithBrowser(url);
          if (html && html.length >= 500) return html;
        } catch (browserErr) {
          console.warn(`⚠️ Puppeteer tambem falhou: ${browserErr.message}`);
        }
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
  }

  throw lastError || new Error('Falha ao buscar HTML');
}
