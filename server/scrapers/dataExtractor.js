/**
 * Extrator de dados de imoveis a partir de HTML/texto
 * Portado do codigo Super Code do n8n
 */

function cleanText(raw) {
  return raw
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detecta links honeypot (invisíveis para humanos)
 * @param {string} html - HTML bruto
 * @returns {Array} - Array de links seguros
 */
function extractSafeLinks(html) {
  const safeLinks = [];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const links = tempDiv.querySelectorAll('a[href]');
  
  for (const link of links) {
    if (isHoneypot(link)) {
      console.warn('🐝 Honeypot detectado e ignorado:', link.href);
      continue;
    }
    safeLinks.push(link.href);
  }
  
  return safeLinks;
}

/**
 * Verifica se um elemento é um honeypot
 * @param {Element} element - Elemento DOM
 * @returns {boolean}
 */
function isHoneypot(element) {
  const style = element.style || {};
  const computedStyle = window.getComputedStyle ? window.getComputedStyle(element) : {};
  
  // Verificar estilo CSS
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    computedStyle.display === 'none' ||
    computedStyle.visibility === 'hidden' ||
    computedStyle.opacity === '0'
  ) {
    return true;
  }
  
  // Verificar classes suspeitas
  const honeypotClasses = ['hidden', 'invisible', 'honeypot', 'trap', 'bot-trap'];
  const elementClasses = (element.className || '').split(' ');
  
  if (honeypotClasses.some(cls => elementClasses.includes(cls))) {
    return true;
  }
  
  // Verificar atributos suspeitos
  const honeypotAttrs = ['aria-hidden', 'data-honeypot', 'data-bot'];
  for (const attr of honeypotAttrs) {
    if (element.hasAttribute && element.hasAttribute(attr)) {
      return true;
    }
  }
  
  return false;
}

function normalizeNumberString(raw) {
  if (!raw) return null;
  raw = raw.replace(/\s+/g, '');
  if (raw.includes(',') && !raw.includes('.')) {
    raw = raw.replace(/,/g, '.');
  }
  raw = raw.replace(/[^0-9.\-]/g, '');
  if (!raw || raw === '.' || raw === '-') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function extractPreco(text) {
  const patterns = [
    /R\$\s*([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{2})?)/i,
    /R\$\s*([\d]{1,3}(?:,[\d]{3})*(?:\.[\d]{2})?)/i,
    /R\$\s*([\d]+(?:[,.]\d+)?)/i,
    /(?:valor|preço).*?R\$\s*([\d.,]+)/i,
    /R\$\s*([\d.,\s]+)/i
  ];

  for (const rx of patterns) {
    const m = rx.exec(text);
    if (m) {
      let valor = m[1].trim().replace(/\s/g, '');
      if (valor.includes('.') && valor.includes(',')) {
        valor = valor.replace(/\./g, '').replace(',', '.');
      } else if (valor.match(/,\d{2}$/)) {
        valor = valor.replace(',', '.');
      } else if (valor.match(/\.\d{3}$/)) {
        valor = valor.replace(/\./g, '');
      } else if ((valor.match(/\./g) || []).length > 1) {
        valor = valor.replace(/\./g, '');
      }
      const num = parseFloat(valor);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}

function extractArea(text) {
  const rx = /(\d{1,4}(?:[,\.]\d{1,2})?)\s*m[²2]/i;
  const m = rx.exec(text);
  return m ? normalizeNumberString(m[1]) : null;
}

function extractCondominioNome(text) {
  const rx = /Condom[ií]nio\s+([A-Z][\w\s\-]+)/i;
  const m = rx.exec(text);
  if (m) return m[1].replace(/[,.].*$/, '').trim();
  return null;
}

function extractBairro(text) {
  const patterns = [
    /Bairro\s*:\s*([A-ZÁ-Ú][A-Za-zÀ-ú\s']+?)(?:\s*[,\-.]|\s*$)/i,
    /(?:no|do)\s+bairro\s+([A-ZÁ-Ú][A-Za-zÀ-ú\s']+?)(?:\s*[,\-.]|\s*$)/i,
    /\d+m[²2]\s*-\s*([A-ZÁ-Ú][A-Za-zÀ-ú\s']+?)\s*,/i,
    /Localização\s*:\s*([A-ZÁ-Ú][A-Za-zÀ-ú\s']+?)(?:\s*[,\-.]|\s*$)/i,
    /,\s*([A-ZÁ-Ú][A-Za-zÀ-ú\s']+?)\s*,\s*(?:Porto Alegre|São Paulo|Rio de Janeiro|Curitiba|Belo Horizonte|Campinas|Jundiaí|Sorocaba)/i
  ];

  for (const rx of patterns) {
    const m = rx.exec(text);
    if (m) {
      const bairro = m[1].trim();
      if (!bairro.match(/^(perfeito|ideal|ótimo|excelente|localizado|situado|próximo)/i) && bairro.length <= 30) {
        return bairro;
      }
    }
  }
  return null;
}

function extractCidadeEstado(text) {
  let rx = /([A-ZÁ-Ú][A-Za-zÀ-ú\s]+)\s*-\s*([A-Z]{2})\b/;
  let m = rx.exec(text);
  if (m) return { cidade: m[1].trim(), estado: m[2].trim() };

  rx = /,\s*(Porto Alegre|São Paulo|Rio de Janeiro|Curitiba|Belo Horizonte|Brasília|Salvador|Fortaleza|Recife|Campinas|Jundiaí|Sorocaba)\b/i;
  m = rx.exec(text);
  if (m) return { cidade: m[1].trim(), estado: null };

  return { cidade: null, estado: null };
}

function extractFotos(raw) {
  const urls = new Set();
  let rx, m;

  rx = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
  while ((m = rx.exec(raw)) !== null) urls.add(m[1]);

  rx = /(https?:\/\/[^\s'")>]+?\.(?:jpg|jpeg|png|gif|webp))/gi;
  while ((m = rx.exec(raw)) !== null) urls.add(m[1]);

  rx = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = rx.exec(raw)) !== null) urls.add(m[1]);

  // OG image
  rx = /<meta[^>]+property=["']og:image["'][^>]+content=["'](https?:\/\/[^"']+)["']/gi;
  while ((m = rx.exec(raw)) !== null) urls.add(m[1]);

  return Array.from(urls);
}

/**
 * Extrai dados estruturados do HTML bruto
 * @param {string} html - HTML da pagina do imovel
 * @returns {{ valorTotal, metragem, bairro, cidade, estado, condominio, fotos }}
 */
export function extractFromHtml(html) {
  const text = cleanText(html);
  const fotos = extractFotos(html);

  return {
    valorTotal: extractPreco(text),
    metragem: extractArea(text),
    bairro: extractBairro(text),
    condominio: extractCondominioNome(text),
    ...extractCidadeEstado(text),
    fotos,
  };
}
