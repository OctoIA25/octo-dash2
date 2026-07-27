/**
 * Enriquecimento com OpenAI GPT-4.1-mini
 * Extrai localizacao, tipo, diferenciais do texto do imovel
 * Mesmo prompt usado no fluxo n8n
 */

import OpenAI from 'openai';
import { emitAgentEvent } from '../agent-telemetry/emit.js';

const MODEL = 'gpt-4.1-mini';

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
 * Mapeia o `usage` da resposta da OpenAI para os campos de tokens do evento
 * de telemetria. Puro (testável). `usage` ausente → tudo null ("não
 * informado" ≠ 0 — só gravamos consumo real).
 */
export function openAiUsageToTokens(usage) {
  return {
    input_tokens: usage?.prompt_tokens ?? null,
    output_tokens: usage?.completion_tokens ?? null,
    cached_tokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
    total_tokens: usage?.total_tokens ?? null,
  };
}

/**
 * Enriquece dados extraidos com OpenAI
 * @param {string} htmlText - Texto limpo da pagina (sem tags HTML)
 * @param {string} apiKey - OpenAI API key
 * @param {object|null} [telemetry] - { supabase, tenantId } para emitir o
 *   evento llm_call com o usage real. Sem contexto (ou sem tenant), nada é
 *   emitido — telemetria nunca muda o comportamento do enriquecimento.
 * @returns {Promise<{rua, bairro, cidade, estado, tipo, diferenciais, condominio, localizacao_completa}>}
 */

export async function enrichWithAI(htmlText, apiKey, telemetry = null) {
  if (!apiKey) {
    console.warn('⚠️ OpenAI API key nao configurada, pulando enriquecimento AI');
    return {};
  }

  // Limitar texto para nao exceder tokens (primeiros 8000 chars)
  const truncatedText = htmlText.substring(0, 8000);

  const startedMs = Date.now();
  // Fire-and-forget: emitAgentEvent nunca lança (ver agent-telemetry/emit.js).
  const report = (status, usage, errorMessage) => {
    if (!telemetry?.supabase || !telemetry?.tenantId) return;
    emitAgentEvent(telemetry.supabase, {
      tenant_id: telemetry.tenantId,
      agent_slug: 'estudo-mercado',
      event_type: 'llm_call',
      status,
      model: MODEL,
      provider: 'openai',
      duration_ms: Date.now() - startedMs,
      error_message: errorMessage || null,
      ...openAiUsageToTokens(usage),
    });
  };

  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Texto para análise:\n${truncatedText}` }
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices?.[0]?.message?.content || '';
    report(content ? 'ok' : 'empty_response', response.usage, null);
    return parseAiResponse(content);
  } catch (error) {
    report('error', null, error.message);
    console.error('❌ Erro OpenAI enrichment:', error.message);
    return {};
  }
}
