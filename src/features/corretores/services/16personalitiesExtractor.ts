/**
 * Serviço de extração de dados do 16Personalities
 * Estratégia: Parse da URL + tentativa de scraping via proxy
 */

import {
  validarUrl16Personalities,
  parseUrl16Personalities,
  obterLadoPorLetra,
  obterDescricaoTipo
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
  percentuais: {
    energia: { percentual: number; lado: string; letra: string };
    mente: { percentual: number; lado: string; letra: string };
    natureza: { percentual: number; lado: string; letra: string };
    abordagem: { percentual: number; lado: string; letra: string };
    identidade: { percentual: number; lado: string; letra: string };
  };
}

/**
 * Extrai percentuais da página HTML (quando disponível)
 */
function extrairPercentuaisDoHTML(html: string): number[] | null {
  try {
    // Procurar por padrões de percentuais no HTML
    // O 16personalities usa spans com classes específicas
    const percentualRegex = /data-value["\s]*[:=]["\s]*(\d+)/gi;
    const matches = [...html.matchAll(percentualRegex)];
    
    if (matches.length >= 5) {
      return matches.slice(0, 5).map(m => parseInt(m[1]));
    }
    
    // Tentar padrão alternativo
    const altRegex = /(\d+)%/g;
    const altMatches = [...html.matchAll(altRegex)];
    
    if (altMatches.length >= 5) {
      const percentuais = altMatches
        .map(m => parseInt(m[1]))
        .filter(p => p >= 0 && p <= 100);
      
      if (percentuais.length >= 5) {
        return percentuais.slice(0, 5);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao extrair percentuais do HTML:', error);
    return null;
  }
}

/**
 * Gera percentuais estimados baseados nas letras do tipo
 * Usado como fallback quando não conseguimos fazer scraping
 */
function gerarPercentuaisEstimados(letras: {
  energia: string;
  mente: string;
  natureza: string;
  abordagem: string;
  identidade: string;
}): number[] {
  // Percentuais padrão baseados na letra dominante
  // Letras no início do alfabeto = valores mais baixos (tendência para o primeiro lado)
  // Letras no fim = valores mais altos (tendência para o segundo lado)
  
  const calcularPercentual = (letra: string, primeiraLetra: string): number => {
    // Se é a primeira letra da dimensão, retorna um valor entre 40-60 (levemente para aquele lado)
    return letra === primeiraLetra ? 55 : 45;
  };
  
  return [
    calcularPercentual(letras.energia, 'I') * 100 / 100,      // Energia: I=Intro, E=Extro
    calcularPercentual(letras.mente, 'S') * 100 / 100,        // Mente: S=Sensing, N=Intuition
    calcularPercentual(letras.natureza, 'T') * 100 / 100,     // Natureza: T=Thinking, F=Feeling
    calcularPercentual(letras.abordagem, 'J') * 100 / 100,    // Abordagem: J=Judging, P=Perceiving
    letras.identidade === 'A' ? 60 : 40                       // Identidade: A=Assertive, T=Turbulent
  ];
}

/**
 * Tenta fazer scraping da página via proxy CORS (com timeout rápido)
 * OTIMIZADO: Timeout de 2 segundos para não deixar o usuário esperando
 */
async function tentarScrapingComProxy(url: string): Promise<number[] | null> {
  try {
    
    // Tentar com CORS proxy - apenas o mais rápido
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    
    // Promise com timeout de 2 segundos
    const fetchWithTimeout = Promise.race([
      fetch(proxyUrl, {
        headers: {
          'Accept': 'text/html',
        }
      }),
      new Promise<Response>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      )
    ]);
    
    try {
      const response = await fetchWithTimeout;
      
      if (response.ok) {
        const html = await response.text();
        const percentuais = extrairPercentuaisDoHTML(html);
        
        if (percentuais && percentuais.length === 5) {
          return percentuais;
        }
      }
    } catch (fetchError) {
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao tentar scraping:', error);
    return null;
  }
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
  
  // Tentar extrair percentuais da página
  let percentuais = await tentarScrapingComProxy(url);
  
  // Se não conseguiu, usar percentuais estimados
  if (!percentuais) {
    percentuais = gerarPercentuaisEstimados(dadosBasicos.letras);
  }
  
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
    percentuais: {
      energia: {
        percentual: percentuais[0],
        lado: obterLadoPorLetra('energia', dadosBasicos.letras.energia),
        letra: dadosBasicos.letras.energia
      },
      mente: {
        percentual: percentuais[1],
        lado: obterLadoPorLetra('mente', dadosBasicos.letras.mente),
        letra: dadosBasicos.letras.mente
      },
      natureza: {
        percentual: percentuais[2],
        lado: obterLadoPorLetra('natureza', dadosBasicos.letras.natureza),
        letra: dadosBasicos.letras.natureza
      },
      abordagem: {
        percentual: percentuais[3],
        lado: obterLadoPorLetra('abordagem', dadosBasicos.letras.abordagem),
        letra: dadosBasicos.letras.abordagem
      },
      identidade: {
        percentual: percentuais[4],
        lado: obterLadoPorLetra('identidade', dadosBasicos.letras.identidade),
        letra: dadosBasicos.letras.identidade
      }
    }
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

