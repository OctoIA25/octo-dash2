/**
 * Enriquecimento com OpenAI GPT-4.1-mini
 * Extrai localizacao, tipo, diferenciais do texto do imovel
 * Mesmo prompt usado no fluxo n8n
 */

import OpenAI from 'openai';

const SYSTEM_PROMPT = `Analise o texto fornecido e extraia APENAS as informações de localização geográfica (endereço, rua, bairro, cidade, estado, CEP, país, condomínio), tipo do imóvel e os diferenciais do local.
Responda SOMENTE com as informações encontradas, sem explicações ou texto adicional.

Formato da resposta:
Se encontrar tipo: Tipo: [use APENAS uma das categorias padronizadas abaixo]
Se encontrar rua: Rua: [nome da rua]
Se encontrar número: Número: [número]
Se encontrar bairro: Bairro: [nome do bairro]
Se encontrar cidade: Cidade: [nome da cidade]
Se encontrar estado: Estado: [sigla de 2 letras - RJ, SP, MG, etc.]
Se encontrar CEP: CEP: [código postal]
Se encontrar país: País: [nome do país]
Se encontrar condomínio, residencial, edifício ou complexo: Condomínio: Condomínio [nome completo do condomínio]
Se encontrar diferenciais: Diferenciais: [máximo 250 caracteres - inclua APENAS características que realmente agregam valor]
Localização Completa: [endereço completo formatado]

REGRAS DE PADRONIZAÇÃO DO TIPO:
Apartamento: apto, ap, flat, studio, quitinete, kitnet, conjugado
Casa: residência, moradia, imóvel residencial, vivenda
Cobertura: cobertura duplex, cobertura triplex, penthouse
Sobrado: casa sobrado, casa de dois pavimentos
Terreno: lote, terreno urbano, terreno comercial, área
Sala Comercial: conjunto comercial, sala, escritório, loja
Galpão: armazém, depósito, barracão
Chácara: sítio, fazenda pequena, propriedade rural
Loft: loft industrial, espaço tipo loft
Prédio Comercial: edifício comercial, imóvel comercial inteiro

IMPORTANTE:
- O estado SEMPRE deve ser apresentado com a sigla de 2 letras em maiúsculas.
- Diferenciais devem ser concisos e destacar apenas o que torna o local especial.
- Use SEMPRE o tipo padronizado, nunca a palavra original do texto.
- Se não encontrar nenhuma informação, responda: "Nenhuma localização identificada"`;

/**
 * Parseia a resposta textual do GPT em objeto
 */
function parseAiResponse(text) {
  const result = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const [key, ...rest] = line.split(':');
    if (!key || !rest.length) continue;

    const value = rest.join(':').trim();
    const cleanKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    switch (cleanKey) {
      case 'tipo': result.tipo = value; break;
      case 'rua': result.rua = value; break;
      case 'numero': result.numero = value; break;
      case 'bairro': result.bairro = value; break;
      case 'cidade': result.cidade = value; break;
      case 'estado': result.estado = value; break;
      case 'cep': result.cep = value; break;
      case 'pais': result.pais = value; break;
      case 'condominio': result.condominio = value; break;
      case 'diferenciais': result.diferenciais = value; break;
      case 'localizacao completa': result.localizacao_completa = value; break;
    }
  }

  return result;
}

/**
 * Enriquece dados extraidos com OpenAI
 * @param {string} htmlText - Texto limpo da pagina (sem tags HTML)
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<{rua, bairro, cidade, estado, tipo, diferenciais, condominio, localizacao_completa}>}
 */

export async function enrichWithAI(htmlText, apiKey) {
  if (!apiKey) {
    console.warn('⚠️ OpenAI API key nao configurada, pulando enriquecimento AI');
    return {};
  }

  // Limitar texto para nao exceder tokens (primeiros 8000 chars)
  const truncatedText = htmlText.substring(0, 8000);

  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Texto para análise:\n${truncatedText}` }
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices?.[0]?.message?.content || '';
    return parseAiResponse(content);
  } catch (error) {
    console.error('❌ Erro OpenAI enrichment:', error.message);
    return {};
  }
}
