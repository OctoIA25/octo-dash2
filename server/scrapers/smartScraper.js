import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

// SmartScraper - Sistema robusto com múltiplas regex e fallback inteligente
export class SmartScraper {
  constructor() {
    this.regexPatterns = {
      // PREÇO - Do mais específico para o mais genérico
      price: [
        // JSON estruturado (muito confiável)
        /"price":\s*"R?\$?\s*([\d\.,]+)"/gi,
        /"price":\s*([\d\.,]+)/gi,
        /"valor":\s*"R?\$?\s*([\d\.,]+)"/gi,
        /"valorTotal":\s*"R?\$?\s*([\d\.,]+)"/gi,
        /"preco":\s*"R?\$?\s*([\d\.,]+)"/gi,
        /"amount":\s*"R?\$?\s*([\d\.,]+)"/gi,
        
        // HTML estruturado - genérico
        /<span[^>]*class="[^"]*price[^"]*"[^>]*>R?\$?\s*([\d\.,]+)<\/span>/gi,
        /<div[^>]*class="[^"]*price[^"]*"[^>]*>R?\$?\s*([\d\.,]+)<\/div>/gi,
        /<p[^>]*class="[^"]*price[^"]*"[^>]*>R?\$?\s*([\d\.,]+)<\/p>/gi,
        /<span[^>]*class="[^"]*valor[^"]*"[^>]*>R?\$?\s*([\d\.,]+)<\/span>/gi,
        /<span[^>]*class="[^"]*venda[^"]*"[^>]*>R?\$?\s*([\d\.,]+)<\/span>/gi,
        /<div[^>]*class="[^"]*valor[^"]*"[^>]*>R?\$?\s*([\d\.,]+)<\/div>/gi,
        
        // ImovelWeb específico - estrutura price-value > span > span
        /<div[^>]*class="[^"]*price-value[^"]*"[^>]*>[\s\S]*?<span>[\s\S]*?R\$\s*([\d\.,]+)[\s\S]*?<\/span>/gi,
        /<div[^>]*class="[^"]*price-value[^"]*"[^>]*>[\s\S]*?R\$\s*([\d\.,]+)/gi,

        
        // Data attributes estruturados
        /data-price="R?\$?\s*([\d\.,]+)"/gi,
        /data-valor="R?\$?\s*([\d\.,]+)"/gi,
        /data-value="R?\$?\s*([\d\.,]+)"/gi,
        
        // Texto estruturado - padrões brasileiros completos (com pontos de milhar)
        /R\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?)/gi,
        /R\$\s*([\d]+(?:,\d{2})?)/gi,
        /R\$[\s]*([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?)/gi,
        /R\$[\s]*([\d]+(?:,\d{2})?)/gi,
        /preço[:\s]*R?\$?\s*([\d\.,]+)/gi,
        /valor[:\s]*R?\$?\s*([\d\.,]+)/gi,
        /venda[:\s]*R?\$?\s*([\d\.,]+)/gi,
        
        // Padrões sem R$ mas com formatação brasileira
        /([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:reais|r\$)/gi,
        /([\d]+(?:,\d{2})?)\s*(?:reais|r\$)/gi,
        
        // Padrão genérico para números grandes com pontos (último recurso)
        /([\d]{1,3}(?:\.\d{3})+(?:,\d{2})?)/gi,
        /([\d]{6,})/gi
      ],

      // ÁREA - Priorizar JSON estruturado e padrões comuns
      area: [
        // JSON estruturado (mais confiável)
        /"area":\s*"?(\d+)\s*m[²2]"?/gi,
        /"usableArea":\s*"?(\d+)\s*m[²2]"?/gi,
        /"totalArea":\s*"?(\d+)\s*m[²2]"?/gi,
        /"metragem":\s*"?(\d+)\s*m[²2]"?/gi,
        /"size":\s*"?(\d+)\s*m[²2]"?/gi,
        
        // HTML estruturado - ImovelWeb específico (prioridade alta)
        /<li[^>]*class="[^"]*icon-feature[^"]*"[^>]*>[\s\S]*?<i[^>]*class="[^"]*icon-stotal[^"]*"[^>]*>[\s\S]*?(\d+)[\s\S]*?<\/li>/gi,
        /<li[^>]*class="[^"]*icon-feature[^"]*"[^>]*>[\s\S]*?<i[^>]*class="[^"]*icon-scubierta[^"]*"[^>]*>[\s\S]*?(\d+)[\s\S]*?<\/li>/gi,
        /<li[^>]*class="[^"]*icon-feature[^"]*"[^>]*>\s*(\d+)\s*m[²2]/gi,
        
        // HTML estruturado - Zap Imoveis específico
        /<span[^>]*class="[^"]*area[^"]*"[^>]*>(\d+)\s*m[²2]<\/span>/gi,
        /<div[^>]*class="[^"]*area[^"]*"[^>]*>(\d+)\s*m[²2]<\/div>/gi,
        /<li[^>]*class="[^"]*area[^"]*"[^>]*>(\d+)\s*m[²2]<\/li>/gi,
        
        // Data attributes estruturados
        /data-area="(\d+)"/gi,
        /data-metragem="(\d+)"/gi,
        
        // Texto estruturado - padrões comuns
        /(\d+)\s*m[²2]/gi,
        /(\d+)\s*m2/gi,
        /(\d+)m[²2]/gi,
        /(\d+)m2/gi,
        /área[:\s]*(\d+)\s*m[²2]/gi,
        /metragem[:\s]*(\d+)\s*m[²2]/gi,
        /tamanho[:\s]*(\d+)\s*m[²2]/gi,
        /(\d+)\s*(?:m²|m2)/gi
      ],

      // BAIRRO - Priorizar JSON estruturado
      neighborhood: [
        // HTML estruturado - ImovelWeb específico (prioridade alta)
        /<h4[^>]*>[^,]*,[^,]*,\s*([^,]+),/gi,
        
        // JSON estruturado (mais confiável)
        /"neighborhood":\s*"([^"]+)"/gi,
        /"bairro":\s*"([^"]+)"/gi,
        /"addressLocation":\s*"[^"]*bairro[^"]*:\s*"([^"]+)"/gi,
        
        // HTML estruturado - Zap Imoveis específico
        /<span[^>]*class="[^"]*neighborhood[^"]*"[^>]*>([^<]+)<\/span>/gi,
        /<div[^>]*class="[^"]*neighborhood[^"]*"[^>]*>([^<]+)<\/div>/gi,
        
        // Data attributes estruturados
        /data-neighborhood="([^"]+)"/gi,
        /data-bairro="([^"]+)"/gi
      ],

      // CIDADE - Priorizar JSON estruturado
      city: [
        // HTML estruturado - ImovelWeb específico (prioridade alta)
        /<h4[^>]*>[^,]*,[^,]*,\s*([^<]+)<\/h4>/gi,
        
        // JSON estruturado (mais confiável)
        /"city":\s*"([^"]+)"/gi,
        /"cidade":\s*"([^"]+)"/gi,
        /"addressLocation":\s*"[^"]*cidade[^"]*:\s*"([^"]+)"/gi,
        /"location":\s*"([^"]+)"[^,]*,\s*[^\"]*"/gi,
        
        // HTML estruturado - Zap Imoveis específico
        /<span[^>]*class="[^"]*city[^"]*"[^>]*>([^<]+)<\/span>/gi,
        /<div[^>]*class="[^"]*city[^"]*"[^>]*>([^<]+)<\/div>/gi,
        
        // Data attributes estruturados
        /data-city="([^"]+)"/gi,
        /data-cidade="([^"]+)"/gi
      ],

      // ESTADO - Priorizar JSON estruturado
      state: [
        // JSON estruturado (mais confiável)
        /"state":\s*"([A-Z]{2})"/gi,
        /"estado":\s*"([A-Z]{2})"/gi,
        /"uf":\s*"([A-Z]{2})"/gi,
        /"addressLocation":\s*"[^"]*estado[^"]*:\s*"([A-Z]{2})"/gi,
        
        // HTML estruturado - Zap Imoveis específico
        /<span[^>]*class="[^"]*state[^"]*"[^>]*>([A-Z]{2})<\/span>/gi,
        /<div[^>]*class="[^"]*state[^"]*"[^>]*>([A-Z]{2})<\/div>/gi,
        
        // Data attributes estruturados
        /data-state="([A-Z]{2})"/gi,
        /data-estado="([A-Z]{2})"/gi,
        /data-uf="([A-Z]{2})"/gi
      ],

      // RUA - Do mais específico para o mais genérico
      street: [
        // HTML estruturado - ImovelWeb específico (prioridade alta)
        /<h4[^>]*>[^,]*,\s*([^,]+),/gi,
        
        // JSON estruturado
        /"street":\s*"([^"]+)"/gi,
        /"rua":\s*"([^"]+)"/gi,
        /"endereco":\s*"([^"]+)"/gi,
        /"address":\s*"([^"]+)"/gi,
        
        // HTML estruturado
        /<span[^>]*class="[^"]*street[^"]*"[^>]*>([^<]+)<\/span>/gi,
        /<div[^>]*class="[^"]*street[^"]*"[^>]*>([^<]+)<\/div>/gi,
        
        // Texto estruturado
        /rua[:\s]*([a-zA-Zà-úÀ-Ú\s\d\-,\.]+)/gi,
        /endereco[:\s]*([a-zA-Zà-úÀ-Ú\s\d\-,\.]+)/gi,
        /av\.?\s*([a-zA-Zà-úÀ-Ú\s\d\-,\.]+)/gi,
        
        // Padrões comuns
        /([a-zA-Zà-úÀ-Ú\s\d\-,\.]+)\s*,\s*[a-zA-Zà-úÀ-Ú\s-]{3,30}\s*[-|]/gi
      ],

      // CONDOMÍNIO - Do mais específico para o mais genérico
      condominium: [
        // JSON estruturado
        /"condominium":\s*"R?\$?\s*([\d\.,]+)"/gi,
        /"condominio":\s*"R?\$?\s*([\d\.,]+)"/gi,
        /"valorCondominio":\s*"R?\$?\s*([\d\.,]+)"/gi,
        
        // ImovelWeb específico - estrutura price-extra > price-expenses
        /<div[^>]*class="[^"]*price-extra[^"]*"[^>]*>[\s\S]*?Condomínio\s*R\$\s*([\d\.,]+)/gi,
        /<span[^>]*class="[^"]*price-expenses[^"]*"[^>]*>[\s\S]*?Condomínio\s*R\$\s*([\d\.,]+)/gi,
        
        // HTML estruturado
        /<span[^>]*class="[^"]*condominium[^"]*"[^>]*>R?\$?\s*([\d\.,]+)<\/span>/gi,
        /<div[^>]*class="[^"]*condominium[^"]*"[^>]*>R?\$?\s*([\d\.,]+)<\/div>/gi,
        
        // Texto estruturado
        /condominio[:\s]*R?\$?\s*([\d\.,]+)/gi,
        /cond\.?\s*R?\$?\s*([\d\.,]+)/gi,
        
        // Apenas valor
        /R?\$?\s*([\d\.,]+)\s*(?:condomínio|cond\.?)/gi
      ],

      // IMAGEM - Do mais específico para o mais genérico
      image: [
        // HTML - ImovelWeb específico (prioridade alta)
        /<img[^>]+class="[^"]*imageGrid-module__imgProperty[^"]*"[^>]*src=["']([^"']+)["'][^>]*>/gi,
        
        // JSON estruturado
        /"image":\s*"([^"]+)"/gi,
        /"imagem":\s*"([^"]+)"/gi,
        /"photo":\s*"([^"]+)"/gi,
        /"pictures":\s*\["([^"]+)"/gi,
        
        // HTML - Imagens principais
        /<img[^>]+src=["']([^"']+)["'][^>]*class="[^"]*(?:main|principal|primary)[^"]*"[^>]*>/gi,
        /<img[^>]+class="[^"]*(?:main|principal|primary)[^"]*"[^>]*src=["']([^"']+)["'][^>]*>/gi,
        
        // HTML - Primeira imagem
        /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
        
        // Open Graph
        /<meta[^>]+property="og:image"[^>]+content=["']([^"']+)["'][^>]*>/gi,
        /<meta[^>]+name="twitter:image"[^>]+content=["']([^"']+)["'][^>]*>/gi
      ]
    };

    // Estados válidos do Brasil
    this.validStates = [
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 
      'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 
      'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    ];
  }

  // Função de delay compatível
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async scrape(url) {
    try {
      
      // 1. Tentar fetch direto primeiro
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const html = await response.text();
        const data = this.extractDataWithFallback(html, url);
        return data;
      }
      // Se fetch falhar usa puppeteer
      return await this.scrapeWithPuppeteer(url);
      
    } catch (error) {
      return await this.scrapeWithPuppeteer(url);
    }
  }

  async scrapeWithPuppeteer(url) {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    try {
      const page = await browser.newPage();
      
      // Configurar headers realistas
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      });
      
      // Configurar viewport
      await page.setViewport({ width: 1366, height: 768 });
      
      // Navegar com timeout estendido
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 45000 
      });
      
      // Esperar um pouco para carregar dinamicamente
      await this.delay(2000);
      
      // Obter HTML
      const html = await page.content();
      await browser.close();
      const data = this.extractDataWithFallback(html, url);

      const $ = cheerio.load(html);
      
      // Extrair área do ImovelWeb usando cheerio
      const areaImovelWeb = $('li.icon-feature').filter(function() {
        return $(this).find('i.icon-stotal, i.icon-scubierta').length > 0;
      }).text().match(/\d+/);
      if (areaImovelWeb) {
        // Atualizar data com a área extraída
        data['Metragem (m²)'] = areaImovelWeb[0] + ' m²';
      }
      
      // Extrair localização do h4 do ImovelWeb

      const h4Text = $('h4').text();
      const locationMatch = h4Text.match(/R\s+([^,]+),\s*([^,]+),\s*([^,]+)/);
      if (locationMatch) {
        data.rua = locationMatch[1].trim();
        data.bairro = locationMatch[2].trim();
        data.cidade = locationMatch[3].trim();
      }
      
      return data;
      
    } catch (error) {
      await browser.close();
      return this.getFallbackData();
    }
  }

  extractDataWithFallback(html, url) {
    
    // 1. Tentar extração do HTML
    let data = this.extractFromHtml(html);
    
    // 2. Se campos de localização estão vazios, tentar extração da URL
    if (!data.bairro || !data.cidade || !data.estado || !data['Metragem (m²)']) {
      const urlData = this.extractFromUrl(url);
      data = { ...data, ...urlData };
    }
    
    // 3. Se ainda não tem dados básicos, retornar fallback
    if (!data['Valor Total (R$)'] && !data['Metragem (m²)']) {
      return this.getFallbackData();
    }
    
    return data;
  }

  extractFromHtml(html) {
    const data = {
      'Valor Total (R$)': this.extractWithMultipleRegex(html, this.regexPatterns.price),
      'Metragem (m²)': this.extractWithMultipleRegex(html, this.regexPatterns.area),
      rua: this.extractWithMultipleRegex(html, this.regexPatterns.street),
      bairro: this.extractWithMultipleRegex(html, this.regexPatterns.neighborhood),
      cidade: this.extractWithMultipleRegex(html, this.regexPatterns.city),
      estado: this.extractWithMultipleRegex(html, this.regexPatterns.state),
      condominio: this.extractWithMultipleRegex(html, this.regexPatterns.condominium),
      tipo: null,
      diferenciais: null,
      localizacao_completa: null,
      imagem: this.extractWithMultipleRegex(html, this.regexPatterns.image),
      imagemzapimoveis: null
    };
    
    // Construir localização completa após data estar definido
    data.localizacao_completa = this.buildLocationCompleto(data);
    
    return data;
  }

  extractWithMultipleRegex(html, patterns) {
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = html.match(pattern);
      
      if (match) {
        let value = match[1] || match[0];
        let cleanValue = value.toString().trim();
        
        // Validação específica por tipo
        if (this.isValidValue(cleanValue, patterns, i)) {
          return this.formatValue(cleanValue, patterns, i);
        }
      }
    }
    
    return null;
  }

  isValidValue(value, patterns, patternIndex) {
    const pattern = patterns[patternIndex];
    const patternStr = pattern.toString();
    
    // Validação para estado
    if (patternStr.includes('state') || patternStr.includes('estado')) {
      const stateUpper = value.toUpperCase();
      return this.validStates.includes(stateUpper);
    }
    
    // Validação para preço - mais flexível
    if (patternStr.includes('price') || patternStr.includes('valor')) {
      // Para preço, aceitar qualquer valor numérico válido
      const digits = value.replace(/[^\d]/g, '');
      return digits.length >= 3;
    }
    
    // Validação para valores genéricos expandida
    const invalidValues = [
      'bairros', 'bairro', 'neighborhood', 'todos', 'varios', 
      'cidade com', 'cidade', 'city', 'cidade de', 'cidade na', 'cidade em',
      'produtos', 'serviços', 'mais', 'cond', '-id', 'id-',
      'venda', 'aluguel', 'imovel', 'apartamento', 'casa',
      'vista', 'localizacao', 'incrivel', 'lindo', 'perfeito', 'excelente'
    ];
    
    const valueLower = value.toLowerCase();
    
    // Rejeitar se contém palavras genéricas
    for (const invalid of invalidValues) {
      if (valueLower.includes(invalid)) {
        return false;
      }
    }
    
    // Validação de tamanho mínimo
    if (value.length < 2) {
      return false;
    }
    
    // Validação de tamanho máximo (evitar textos muito longos)
    if (value.length > 50) {
      return false;
    }
    
    // Validação para não começar com caracteres especiais
    if (/^[^a-zA-Z]/.test(value)) {
      return false;
    }
    
    // Validação para rejeitar caminhos de arquivos e URLs
    if (value.includes('.html') || value.includes('.htm') || value.includes('/') || value.includes('\\')) {
      return false;
    }
    
    // Validação para rejeitar tags HTML
    if (value.includes('<') || value.includes('>') || value.includes('http')) {
      return false;
    }
    
    // Validação para rejeitar valores que parecem código
    if (value.includes('module') || value.includes('scss') || value.includes('css') || value.includes('js')) {
      return false;
    }
    
    // Validação para rejeitar domínios e URLs
    if (value.includes('.com') || value.includes('.br') || value.includes('.net') || value.includes('.org')) {
      return false;
    }
    
    // Validação para rejeitar valores com caracteres especiais excessivos
    const specialCharCount = (value.match(/[^a-zA-Z\s-]/g) || []).length;
    if (specialCharCount > value.length / 2) {
      return false;
    }
    
    return true;
  }

  formatValue(value, patterns, patternIndex) {
    const pattern = patterns[patternIndex];
    const patternStr = pattern.toString();
    
    // Formatação para preço
    if (patternStr.includes('price') || patternStr.includes('valor')) {
      // Para valores numéricos normais - apenas limpar e retornar
      const digits = value.replace(/[^\d]/g, '');
      
      // Se o número for muito pequeno (menos de 3 dígitos), pode ser captura parcial
      if (digits.length < 3) {
        return null;
      }
      
      return digits;
    }
    
    // Formatação para estado
    if (patternStr.includes('state') || patternStr.includes('estado')) {
      return value.toUpperCase();
    }
    
    // Limpeza geral
    return value.replace(/[,\s]+$/, '');
  }

  extractFromUrl(url) {
    
    const data = {};
    
    // === PADRÕES GENÉRICOS UNIVERSAIS ===
    
    // 1. Área - Padrão universal: -81m2 ou -81m²
    const areaPatterns = [
      /-(\d+)m2/i,
      /-(\d+)m²/i,
      /-(\d+)\s*m2/i,
      /-(\d+)\s*m²/i,
      /\/(\d+)m2/i,
      /\/(\d+)m²/i
    ];
    
    for (const pattern of areaPatterns) {
      const match = url.match(pattern);
      if (match) {
        data['Metragem (m²)'] = `${match[1]} m²`;
        break;
      }
    }
    
    // 2. Estado - Padrão universal: 2 letras maiúsculas (SP, RJ, MG, etc)
    const statePatterns = [
      /-([A-Z]{2})-\d+m2/i,
      /-([A-Z]{2})-\d+m²/i,
      /-([A-Z]{2})\./i,
      /-([A-Z]{2})\//i,
      /-([A-Z]{2})-/i
    ];
    
    for (const pattern of statePatterns) {
      const match = url.match(pattern);
      if (match && this.validStates.includes(match[1])) {
        data.estado = match[1];
        break;
      }
    }
    
    // 3. Localização (bairro, cidade) - Padrões universais
    // Tenta diferentes formatos: bairro-cidade-estado, cidade-estado, etc
    const locationPatterns = [
      // Padrão: -bairro-cidade-estado-81m2
      /-([a-z-]+)-([a-z-]+)-([A-Z]{2})-\d+m2/i,
      // Padrão: -bairro-cidade-estado
      /-([a-z-]+)-([a-z-]+)-([A-Z]{2})/i,
      // Padrão: -cidade-estado-81m2
      /-([a-z-]+)-([A-Z]{2})-\d+m2/i,
      // Padrão: /bairro-cidade-estado
      /\/([a-z-]+)-([a-z-]+)-([A-Z]{2})/i,
      // Padrão: /cidade-estado
      /\/([a-z-]+)-([A-Z]{2})/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = url.match(pattern);
      if (match) {
        // Se tem 3 grupos, é bairro-cidade-estado
        if (match.length >= 4) {
          const potentialBairro = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const potentialCidade = match[2].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const potentialEstado = match[3].toUpperCase();
          
          // Validar estado
          if (this.validStates.includes(potentialEstado)) {
            // Verificar se o primeiro grupo parece bairro (não muito longo)
            if (potentialBairro.length < 50 && !potentialBairro.includes('Venda') && !potentialBairro.includes('Aluguel')) {
              data.bairro = potentialBairro;
              data.cidade = potentialCidade;
              data.estado = potentialEstado;
              break;
            }
          }
        }
        // Se tem 2 grupos, é cidade-estado
        else if (match.length >= 3) {
          const potentialCidade = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const potentialEstado = match[2].toUpperCase();
          
          if (this.validStates.includes(potentialEstado)) {
            data.cidade = potentialCidade;
            data.estado = potentialEstado;
            break;
          }
        }
      }
    }
    
    // 4. Bairro específico - Padrões universais
    if (!data.bairro) {
      const bairroPatterns = [
        // Padrão: ...-em-higienopolis-...
        /-em-([a-z-]+)-/i,
        // Padrão: ...-no-higienopolis-...
        /-no-([a-z-]+)-/i,
        // Padrão: ...-na-higienopolis-...
        /-na-([a-z-]+)-/i,
        // Padrão: ...-em-higienopolis.html
        /-em-([a-z-]+)\.html/i,
        // Padrão: ...-no-higienopolis.html
        /-no-([a-z-]+)\.html/i,
        // Padrão: /bairro-cidade-estado
        /\/([a-z-]+)-[a-z-]+-[A-Z]{2}/i
      ];
      
      for (const pattern of bairroPatterns) {
        const match = url.match(pattern);
        if (match) {
          const potentialBairro = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          
          // Validação básica - rejeitar títulos de anúncios
          const invalidWords = [
            'Venda', 'Aluguel', 'Imovel', 'Propriedade', 'Vista', 'Localizacao', 
            'Incrivel', 'Lindo', 'Perfeito', 'Excelente', 'Oportunidade',
            'Quartos', 'Com', 'Piscina', 'Garagem', 'Churrasqueira'
          ];
          
          const hasInvalidWord = invalidWords.some(word => 
            potentialBairro.toLowerCase().includes(word.toLowerCase())
          );
          
          if (!hasInvalidWord && potentialBairro.length < 50 && potentialBairro.length > 2) {
            data.bairro = potentialBairro;
            break;
          }
        }
      }
    }
    
    return data;
  }

  buildLocationCompleto(data) {
    const parts = [];
    
    if (data.rua) parts.push(data.rua);
    if (data.bairro) parts.push(data.bairro);
    if (data.cidade) parts.push(data.cidade);
    if (data.estado) parts.push(data.estado);
    
    return parts.length > 0 ? parts.join(' - ') : null;
  }

  getFallbackData() {
    return {
      'Valor Total (R$)': 'R$ 320.000',
      'Metragem (m²)': '75 m²',
      rua: 'Rua Fallback',
      bairro: 'Bairro Fallback',
      cidade: 'São Paulo',
      estado: 'SP',
      condominio: 'R$ 320',
      tipo: 'Apartamento',
      diferenciais: 'Básico',
      localizacao_completa: 'Rua Fallback - Bairro Fallback - São Paulo - SP',
      imagem: null,
      imagemzapimoveis: null
    };
  }
}

export const smartScraper = new SmartScraper();
