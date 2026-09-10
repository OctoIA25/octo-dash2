/**
 * Serviço de extração de dados do 16Personalities
 * Estratégia: Parse da URL + tentativa de scraping via proxy
 */

import {
  validarUrl16Personalities,
  parseUrl16Personalities,
  derivarDimensoesMBTI,
  obterDescricaoTipo,
  type DimensoesMBTI
} from '@/utils/16personalitiesMapper';

export interface DadosExtraidos16P {
  url: string;
  codigoTeste: string;
  tipoCodigo: string;
  tipoBase: string;
  tipoNome: string;
  tipoGrupo: string;
  tipoDescricao: string;
  genero: string;
  /** letra e lado de cada dimensão, derivados do código do tipo */
  dimensoes: DimensoesMBTI;
}

/**
 * Função principal de extração de dados
 */
export async function extrairDados16Personalities(url: string): Promise<DadosExtraidos16P> {
  
  // Validar URL
  if (!validarUrl16Personalities(url)) {
    throw new Error('URL inválida. Por favor, cole o link completo do seu resultado do 16personalities.com');
  }
  
  // Parse básico da URL (sempre funciona)
  const dadosBasicos = parseUrl16Personalities(url);

  // A URL entrega o TIPO, e só. O scraping da página foi descontinuado por ser
  // não-confiável (M9), e o "percentual estimado" que o substituía era constante
  // derivada da própria letra (55/45) — número inventado com cara de medição,
  // então deixou de existir. Letra/lado saem do código do tipo, a MESMA fonte
  // usada ao reabrir o resultado salvo, para preview e releitura coincidirem (N6).
  const dims = derivarDimensoesMBTI(dadosBasicos.tipoCodigo);

  // Montar objeto de resposta completo
  const dadosCompletos: DadosExtraidos16P = {
    url: dadosBasicos.url,
    codigoTeste: dadosBasicos.codigoTeste,
    tipoCodigo: dadosBasicos.tipoCodigo,
    tipoBase: dadosBasicos.tipoBase,
    tipoNome: dadosBasicos.tipoNome,
    tipoGrupo: dadosBasicos.tipoGrupo,
    tipoDescricao: obterDescricaoTipo(dadosBasicos.tipoBase),
    genero: dadosBasicos.genero,
    dimensoes: dims
  };

  return dadosCompletos;
}

/**
 * Validação rápida de URL sem extração completa
 */
export function validarUrlRapida(url: string): { valida: boolean; mensagem: string } {
  if (!url || url.trim() === '') {
    return { valida: false, mensagem: 'Por favor, cole a URL do seu resultado' };
  }
  
  if (!validarUrl16Personalities(url)) {
    return { 
      valida: false, 
      mensagem: 'URL inválida. Cole o link completo do resultado (ex: https://www.16personalities.com/profiles/intj-a/m/4lzt8dg47)' 
    };
  }
  
  return { valida: true, mensagem: 'URL válida!' };
}

