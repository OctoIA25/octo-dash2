/**
 * Utilitários para extração e validação de códigos de imóveis
 * Patterns suportados: CA0123, AP0123, CS1234, etc.
 */

/**
 * Extrai código de imóvel de uma string
 * Patterns aceitos:
 * - CA0123, CA123, CA-0123
 * - AP0123, AP123, AP-0123  
 * - CS0123, CS123, CS-0123
 * - Qualquer combinação de 2-3 letras + números
 */
export function extractCodigoImovel(text: string | null | undefined): string | undefined {
  if (!text || typeof text !== 'string') {
    return undefined;
  }

  const trimmed = text.trim();
  
  // Se já está no formato limpo, retornar
  if (/^[A-Z]{2,3}[-]?\d{3,6}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // Tentar extrair padrão de código de imóvel
  // Pattern: 2-3 letras + opcional hífen/espaço + 3-6 dígitos
  const patterns = [
    /([A-Z]{2,3})[-\s]?(\d{3,6})/gi,  // CA-0123, CA 0123, CA0123
    /\b([A-Z]{2,3}\d{3,6})\b/gi,      // CA0123 como palavra completa
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[0]) {
      // Limpar e formatar
      const codigo = match[0].replace(/[-\s]/g, '').toUpperCase();
      return codigo;
    }
  }

  // Se não encontrou pattern, retornar o texto original se parecer um código
  if (trimmed.length >= 5 && trimmed.length <= 10 && /[A-Z]/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return undefined;
}

/**
 * Valida se um código de imóvel está no formato correto
 */
export function isValidCodigoImovel(codigo: string | null | undefined): boolean {
  if (!codigo || typeof codigo !== 'string') {
    return false;
  }

  const trimmed = codigo.trim();
  
  // Formato básico: Letras + Números
  return /^[A-Z]{2,3}[-]?\d{3,6}$/i.test(trimmed);
}

/**
 * Formata um código de imóvel para padrão consistente
 * Ex: ca0123 -> CA0123, ap-123 -> AP123
 */
export function formatCodigoImovel(codigo: string | null | undefined): string | undefined {
  const extracted = extractCodigoImovel(codigo);
  
  if (!extracted) {
    return undefined;
  }

  // Remover hífens e converter para maiúsculas
  return extracted.replace(/[-\s]/g, '').toUpperCase();
}

/**
 * Extrai código de imóvel de uma conversa ou texto longo
 * Procura por patterns comuns de código de imóvel
 */
export function extractCodigoFromConversation(conversa: string | null | undefined): string | undefined {
  if (!conversa || typeof conversa !== 'string') {
    return undefined;
  }

  // Procurar por patterns de código
  const patterns = [
    /(?:código|codigo|cod\.?|ref\.?|referência|referencia)[\s:]*([A-Z]{2,3}[-\s]?\d{3,6})/gi,
    /\b([A-Z]{2,3}[-\s]?\d{3,6})\b/g,
  ];

  for (const pattern of patterns) {
    const matches = conversa.matchAll(pattern);
    for (const match of matches) {
      const possibleCode = match[1] || match[0];
      if (isValidCodigoImovel(possibleCode)) {
        return formatCodigoImovel(possibleCode);
      }
    }
  }

  return undefined;
}

/**
 * Normaliza e valida código de imóvel para uso no sistema
 * Retorna undefined se inválido
 */
export function normalizeCodigoImovel(
  codigo: string | null | undefined,
  conversa?: string | null
): string | undefined {
  // Primeiro, tentar extrair do campo direto
  const direct = extractCodigoImovel(codigo);
  if (direct && isValidCodigoImovel(direct)) {
    return formatCodigoImovel(direct);
  }

  // Se não encontrou e tem conversa, tentar extrair da conversa
  if (conversa) {
    const fromConv = extractCodigoFromConversation(conversa);
    if (fromConv) {
      return fromConv;
    }
  }

  return undefined;
}

