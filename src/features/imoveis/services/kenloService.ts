/**
 * 🏠 SERVIÇO DE INTEGRAÇÃO COM KENLO XML
 * Busca e processa imóveis do feed XML da imobiliária
 * 
 * XML Source: https://imob.valuegaia.com.br/integra/midia.ashx?midia=ChaveNaMao&p=pQdBmFcGRFgUiPu6qbT5CB0b4QQUZf5v
 */

export interface Imovel {
  referencia: string;
  titulo: string;
  tipo: string; // "Casa / Sobrado", "Apartamento", "Terreno", etc.
  tipoSimplificado: 'casa' | 'apartamento' | 'terreno' | 'comercial' | 'rural' | 'outro';
  bairro: string;
  cidade: string;
  estado: string;
  corretor_nome?: string;
  corretor_numero?: string;
  corretor_email?: string;
  corretor_foto?: string;
  valor_venda: number;
  valor_locacao: number;
  finalidade: 'venda' | 'locacao' | 'venda_locacao';
  valor_iptu: number;
  valor_condominio: number;
  area_total: number;
  area_util: number;
  quartos: number;
  suites: number;
  garagem: number;
  banheiro: number;
  salas: number;
  descricao: string;
  fotos: string[];
  videos: string[];
  area_comum: string[];
  area_privativa: string[];
  // Geolocalização e endereço (para o Mapa de Imóveis)
  latitude?: number;
  longitude?: number;
  cep?: string;
  endereco?: string;
  numero?: string;
  nome_condominio?: string;
}

/**
 * URL do XML Kenlo - DETECÇÃO AUTOMÁTICA DE AMBIENTE
 * 
 * DESENVOLVIMENTO (localhost):
 * - Usa proxy do Vite configurado em vite.config.ts
 * - Endpoint: /api/kenlo (relativo)
 * 
 * PRODUÇÃO (Docker/Deploy):
 * - Usa servidor Node.js com proxy integrado
 * - Endpoint: /api/kenlo (mesmo endpoint, servidor diferente)
 * 
 * O endpoint é o MESMO em ambos os ambientes (/api/kenlo)
 * A diferença está em QUEM processa a requisição:
 * - Dev: Vite dev server
 * - Prod: Node.js Express server
 */
const KENLO_XML_URL = '/api/kenlo'; // 🔥 ENDPOINT UNIVERSAL

/**
 * Extrai bairro do título se não estiver no campo específico
 */
const extractBairro = (titulo: string): string => {
  const partes = titulo.split(' - ').map(p => p.trim());
  if (partes.length >= 2) {
    return partes[partes.length - 2];
  }
  return 'Sem Bairro';
};

/**
 * Determina o tipo simplificado baseado no código de referência
 */
const getTipoSimplificado = (referencia: string, tipo: string): Imovel['tipoSimplificado'] => {
  const ref = referencia.toUpperCase();
  
  // Por código de referência
  if (ref.startsWith('CA')) return 'casa';
  if (ref.startsWith('AP')) return 'apartamento';
  if (ref.startsWith('TE')) return 'terreno';
  if (ref.startsWith('SA') || ref.startsWith('GA')) return 'comercial';
  if (ref.startsWith('CH') || ref.startsWith('SI')) return 'rural';
  
  // Por tipo descritivo
  const tipoLower = tipo.toLowerCase();
  if (tipoLower.includes('casa') || tipoLower.includes('sobrado')) return 'casa';
  if (tipoLower.includes('apartamento') || tipoLower.includes('cobertura')) return 'apartamento';
  if (tipoLower.includes('terreno') || tipoLower.includes('lote')) return 'terreno';
  if (tipoLower.includes('comercial') || tipoLower.includes('sala') || tipoLower.includes('loja')) return 'comercial';
  if (tipoLower.includes('chácara') || tipoLower.includes('sítio') || tipoLower.includes('fazenda')) return 'rural';
  
  return 'outro';
};

/**
 * Determina a finalidade do imóvel (venda, locação ou ambos)
 * REGRAS CRÍTICAS:
 * - VENDA: valor_venda > 0 E valor_locacao = 0
 * - LOCAÇÃO: valor_locacao > 0 E valor_venda = 0
 * - VENDA E LOCAÇÃO: valor_venda > 0 E valor_locacao > 0
 */
const getFinalidade = (valorVenda: number, valorLocacao: number): Imovel['finalidade'] => {
  const temVenda = valorVenda > 0;
  const temLocacao = valorLocacao > 0;
  
  // VENDA E LOCAÇÃO - Tem ambos os valores
  if (temVenda && temLocacao) return 'venda_locacao';
  
  // APENAS VENDA - Tem valor de venda mas NÃO tem locação
  if (temVenda) return 'venda';
  
  // APENAS LOCAÇÃO - Tem valor de locação mas NÃO tem venda
  if (temLocacao) return 'locacao';
  
  // Fallback: Se não tem nenhum valor, considerar como venda
  return 'venda';
};

/**
 * Extrai valor de uma tag XML
 */
const matchTag = (imovelXML: string, tag: string): string => {
  const regex = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's');
  const match = imovelXML.match(regex);
  return match ? match[1].trim() : '';
};

/**
 * Extrai todas as fotos do imóvel
 */
const getAllFotos = (imovelXML: string): string[] => {
  const fotos: string[] = [];
  
  // Padrão 1: <foto><url>...</url></foto>
  const regex1 = /<foto>\s*<url>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/url>\s*<\/foto>/g;
  let match;
  while ((match = regex1.exec(imovelXML)) !== null) {
    const url = match[1].trim();
    if (url) fotos.push(url);
  }
  
  // Padrão 2: <foto>URL_DIRETA</foto>
  if (fotos.length === 0) {
    const regex2 = /<foto>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/foto>/g;
    while ((match = regex2.exec(imovelXML)) !== null) {
      const content = match[1].trim();
      // Verificar se parece uma URL
      if (content && (content.startsWith('http') || content.startsWith('www'))) {
        fotos.push(content);
      }
    }
  }
  
  // Padrão 3: <imagem> ou <image>
  if (fotos.length === 0) {
    const regex3 = /<(?:imagem|image)>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:imagem|image)>/g;
    while ((match = regex3.exec(imovelXML)) !== null) {
      const url = match[1].trim();
      if (url && (url.startsWith('http') || url.startsWith('www'))) {
        fotos.push(url);
      }
    }
  }
  
  return fotos;
};

/**
 * Extrai todos os vídeos do imóvel
 */
const getAllVideos = (imovelXML: string): string[] => {
  const regex = /<video>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/video>/g;
  const videos: string[] = [];
  let match;
  while ((match = regex.exec(imovelXML)) !== null) {
    const url = match[1].trim();
    if (url) videos.push(url);
  }
  return videos;
};

/**
 * Extrai itens de áreas (comum ou privativa)
 */
const getArea = (imovelXML: string, tag: string): string[] => {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const matches = [...imovelXML.matchAll(regex)];
  const items: string[] = [];
  
  for (const match of matches) {
    const innerContent = match[1];
    const itemRegex = /<item>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/item>/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(innerContent)) !== null) {
      items.push(itemMatch[1].trim());
    }
  }
  
  return items;
};

/**
 * Converte string para número de forma segura
 */
const toNumber = (value: string): number => {
  if (!value || value === '') return 0;
  const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * Decodifica dados base64 do XML
 */
const decodeBase64XML = (base64String: string): string => {
  try {
    // Remover espaços e quebras de linha
    const cleaned = base64String.replace(/\s+/g, '');
    // Decodificar base64
    const decoded = atob(cleaned);
    return decoded;
  } catch (error) {
    console.error('Erro ao decodificar base64:', error);
    return base64String;
  }
};

/**
 * Busca um imóvel específico pelo código de referência
 */
export const fetchImovelByCodigo = async (codigo: string): Promise<Imovel | null> => {
  try {
    
    // Buscar todos os imóveis
    const imoveis = await fetchImoveisFromKenlo();
    
    // Procurar pelo código específico
    const imovel = imoveis.find(i => i.referencia === codigo);
    
    if (imovel) {
      return imovel;
    } else {
      return null;
    }
  } catch (error) {
    console.error('❌ Erro ao buscar imóvel:', error);
    return null;
  }
};

/**
 * Busca e processa todos os imóveis do XML
 */
export const fetchImoveisFromKenlo = async (): Promise<Imovel[]> => {
  
  // TENTAR CARREGAR XML LOCAL PRIMEIRO (fallback imediato enquanto servidor externo está com problemas)
  try {
    const localResponse = await fetch('/temp_kenlo.xml');
    
    if (localResponse.ok) {
      const localXmlText = await localResponse.text();
      const imoveis = processKenloXML(localXmlText);
      
      if (imoveis.length > 0) {
        return imoveis;
      }
    }
  } catch (localError) {
    console.warn('⚠️ Não foi possível carregar XML local:', localError);
  }
  
  // Se o local falhar, tentar o servidor remoto
  try {
    
    // Fazer requisição POST (sem parâmetros no body)
    const response = await fetch(KENLO_XML_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Accept': 'application/xml, text/xml, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    
    if (!response.ok) {
      console.error(`❌ Servidor retornou erro HTTP ${response.status}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const responseText = await response.text();
    
    // Verificar se é base64
    let xmlText = responseText;
    
    // Se começar com caracteres típicos de base64, tentar decodificar
    if (!responseText.trim().startsWith('<')) {
      xmlText = decodeBase64XML(responseText);
    }
    
    // Processar XML
    const imoveis = processKenloXML(xmlText);
    
    if (imoveis.length > 0) {
      return imoveis;
    } else {
      console.error('❌ ERRO: Nenhum imóvel encontrado no XML!');
      console.error('🔍 Verifique o formato do XML recebido');
      console.error('📝 Primeiros 2000 caracteres para debug:');
      console.error(xmlText.substring(0, 2000));
      throw new Error('Nenhum imóvel encontrado no XML do Kenlo');
    }
    
  } catch (error) {
    console.error('═══════════════════════════════════════════════════');
    console.error('❌ ERRO ao buscar imóveis do Kenlo');
    console.error('───────────────────────────────────────────────────');
    console.error('📝 Tipo de Erro:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('📝 Mensagem:', error instanceof Error ? error.message : String(error));
    console.error('📝 Stack:', error instanceof Error ? error.stack : 'N/A');
    
    // Verificar se é erro de CORS ou Network
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      console.error('🚨 ERRO DE REDE/CORS DETECTADO!');
    }
    
    console.error('🔗 URL que falhou:', KENLO_XML_URL);
    console.error('───────────────────────────────────────────────────');
    console.warn('⚠️ USANDO FALLBACK - Carregando XML local (temp_kenlo.xml)');
    console.error('═══════════════════════════════════════════════════');
    
    // FALLBACK: Carregar XML local
    try {
      const localResponse = await fetch('/temp_kenlo.xml');
      if (localResponse.ok) {
        const localXmlText = await localResponse.text();
        const imoveis = processKenloXML(localXmlText);
        
        if (imoveis.length > 0) {
          return imoveis;
        }
      }
    } catch (fallbackError) {
      console.error('❌ Erro ao carregar XML local:', fallbackError);
    }
    
    // Se chegou aqui, propagar o erro
    throw error;
  }
};

/**
 * Processa string codificada do XML (formato especial do Kenlo)
 */
const processEncodedXMLData = (encodedData: string): Imovel[] => {
  
  // Os dados vêm em formato: base64+codigo+tipo+valor_venda+valor_locacao+...
  // Exemplo: ZDI3Ny0xNzE5NTk4NzQ3NDEzLTU4Mjg5LTUxMg==CA0099VRE0Casa...
  
  const imoveis: Imovel[] = [];
  
  // Split por padrão de referência (CA, AP, TE, etc. seguido de números)
  const pattern = /((?:CA|AP|TE|SA|GA|CH|SI)[0-9]+)([A-Z]{3}[0-9])(.*?)(?=(?:CA|AP|TE|SA|GA|CH|SI)[0-9]+|$)/g;
  let match;
  
  while ((match = pattern.exec(encodedData)) !== null) {
    try {
      const referencia = match[1];
      const tipoCode = match[2];
      const resto = match[3];
      
      // Extrair tipo completo
      const tipoMatch = resto.match(/^(.*?)(\d+\.\d+|\d+)/);
      if (!tipoMatch) continue;
      
      const tipo = tipoMatch[1] || 'Imóvel';
      const valores = resto.match(/(\d+(?:\.\d+)?)/g) || [];
      
      const imovel: Imovel = {
        referencia,
        titulo: `${tipo} - Jundiaí`,
        tipo,
        tipoSimplificado: getTipoSimplificado(referencia, tipo),
        bairro: 'Jundiaí',
        cidade: 'Jundiaí',
        estado: 'SP',
        valor_venda: parseFloat(valores[0] || '0'),
        valor_locacao: parseFloat(valores[1] || '0'),
        finalidade: getFinalidade(parseFloat(valores[0] || '0'), parseFloat(valores[1] || '0')),
        valor_iptu: parseFloat(valores[2] || '0'),
        valor_condominio: parseFloat(valores[3] || '0'),
        area_total: parseFloat(valores[4] || '0'),
        area_util: parseFloat(valores[5] || '0'),
        quartos: parseInt(valores[6] || '0'),
        suites: parseInt(valores[7] || '0'),
        garagem: parseInt(valores[8] || '0'),
        banheiro: parseInt(valores[9] || '0'),
        salas: parseInt(valores[10] || '0'),
        descricao: '',
        fotos: [],
        videos: [],
        area_comum: [],
        area_privativa: []
      };
      
      imoveis.push(imovel);
    } catch (error) {
      // Silenciar erros individuais
    }
  }
  
  return imoveis;
};

/**
 * Processa o XML e extrai todos os imóveis
 */
const processKenloXML = (xmlText: string): Imovel[] => {
  const imoveis: Imovel[] = [];
  
  
  // Tentar processar como XML tradicional
  const imoveisMatches = xmlText.match(/<imovel>[\s\S]*?<\/imovel>/g) || [];
  
  
  if (imoveisMatches.length > 0) {
    // Processar XML tradicional
    
    for (let i = 0; i < imoveisMatches.length; i++) {
      const imovelXML = imoveisMatches[i];
      
      try {
        const referencia = matchTag(imovelXML, 'referencia');
        
        // Pular se não tiver referência
        if (!referencia) {
          console.warn(`⚠️ Imóvel ${i + 1} sem referência, pulando...`);
          continue;
        }
        
        const titulo = matchTag(imovelXML, 'titulo');
        const tipo = matchTag(imovelXML, 'tipo');
        const bairroTag = matchTag(imovelXML, 'bairro');
        const bairro = bairroTag || extractBairro(titulo);
        
        // 🔥 CORREÇÃO: Ler transacao para determinar se é venda (V) ou locação (L)
        const transacao = matchTag(imovelXML, 'transacao'); // V = Venda, L = Locação
        const transacao2 = matchTag(imovelXML, 'transacao2'); // Pode ter segunda transação
        const valorTag = toNumber(matchTag(imovelXML, 'valor'));
        
        // Determinar valores de venda e locação baseado nas transações
        let valorVenda = 0;
        let valorLocacao = 0;
        
        if (transacao === 'V' && transacao2 === 'L') {
          // VENDA E LOCAÇÃO - ambos os valores (valor é de venda, precisa buscar locação)
          valorVenda = valorTag;
          valorLocacao = valorTag; // Temporário, seria ideal ter valor separado
        } else if (transacao === 'L' && transacao2 === 'V') {
          // LOCAÇÃO E VENDA - ambos os valores (valor é de locação)
          valorLocacao = valorTag;
          valorVenda = valorTag; // Temporário
        } else if (transacao === 'V') {
          // APENAS VENDA
          valorVenda = valorTag;
          valorLocacao = 0;
        } else if (transacao === 'L') {
          // APENAS LOCAÇÃO
          valorVenda = 0;
          valorLocacao = valorTag;
        } else {
          // Fallback: assumir venda
          valorVenda = valorTag;
          valorLocacao = 0;
        }
        
        const finalidade = getFinalidade(valorVenda, valorLocacao);
        
        // Log detalhado dos primeiros 3 imóveis E dos 3 primeiros com locação
        if (i < 3) {
        }
        
        // Log especial para imóveis de locação (primeiros 5)
        if (valorLocacao > 0 && imoveis.filter(im => im.valor_locacao > 0).length < 5) {
        }
        
        const imovel: Imovel = {
          referencia,
          titulo,
          tipo,
          tipoSimplificado: getTipoSimplificado(referencia, tipo),
          bairro,
          cidade: matchTag(imovelXML, 'cidade') || 'Jundiaí',
          estado: matchTag(imovelXML, 'estado') || 'SP',
          valor_venda: valorVenda,
          valor_locacao: valorLocacao,
          finalidade: finalidade,
          valor_iptu: toNumber(matchTag(imovelXML, 'valor_iptu')),
          valor_condominio: toNumber(matchTag(imovelXML, 'valor_condominio')),
          area_total: toNumber(matchTag(imovelXML, 'area_total')),
          area_util: toNumber(matchTag(imovelXML, 'area_util')),
          quartos: toNumber(matchTag(imovelXML, 'quartos')),
          suites: toNumber(matchTag(imovelXML, 'suites')),
          garagem: toNumber(matchTag(imovelXML, 'garagem')),
          banheiro: toNumber(matchTag(imovelXML, 'banheiro')),
          salas: toNumber(matchTag(imovelXML, 'salas')),
          descricao: matchTag(imovelXML, 'descritivo'),
          fotos: getAllFotos(imovelXML),
          videos: getAllVideos(imovelXML),
          area_comum: getArea(imovelXML, 'area_comum'),
          area_privativa: getArea(imovelXML, 'area_privativa')
        };
        
        imoveis.push(imovel);
        
        // Log a cada 10 imóveis processados
        if ((i + 1) % 10 === 0) {
        }
        
      } catch (error) {
        console.warn(`⚠️ Erro ao processar imóvel ${i + 1}:`, error);
      }
    }
  } else {
    // Tentar processar formato codificado
    const encodedImoveis = processEncodedXMLData(xmlText);
    imoveis.push(...encodedImoveis);
  }
  
  // Estatísticas detalhadas
  if (imoveis.length > 0) {
    const stats = {
      total: imoveis.length,
      casas: imoveis.filter(i => i.tipoSimplificado === 'casa').length,
      apartamentos: imoveis.filter(i => i.tipoSimplificado === 'apartamento').length,
      terrenos: imoveis.filter(i => i.tipoSimplificado === 'terreno').length,
      comerciais: imoveis.filter(i => i.tipoSimplificado === 'comercial').length,
      rurais: imoveis.filter(i => i.tipoSimplificado === 'rural').length,
      outros: imoveis.filter(i => i.tipoSimplificado === 'outro').length,
      // Classificação EXATA por finalidade
      apenasVenda: imoveis.filter(i => i.finalidade === 'venda').length,
      apenasLocacao: imoveis.filter(i => i.finalidade === 'locacao').length,
      vendaELocacao: imoveis.filter(i => i.finalidade === 'venda_locacao').length,
      // Totais incluindo venda_locacao
      totalComVenda: imoveis.filter(i => i.finalidade === 'venda' || i.finalidade === 'venda_locacao').length,
      totalComLocacao: imoveis.filter(i => i.finalidade === 'locacao' || i.finalidade === 'venda_locacao').length,
    };
    
    // 🔥 CONTAGEM DIRETA DO XML - VALORES REAIS
    const comValorVenda = imoveis.filter(i => i.valor_venda > 0).length;
    const comValorLocacao = imoveis.filter(i => i.valor_locacao > 0).length;
    
  } else {
    console.error('❌ NENHUM IMÓVEL PROCESSADO!');
  }
  
  return imoveis;
};
