/**
 * Serviço de extração de dados do 16Personalities
 * Estratégia: Parse da URL + tentativa de scraping via proxy
 */

import {
  validarUrl16Personalities,
  parseUrl16Personalities,
  derivarDimensoesMBTI,
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
 * Gera percentuais estimados baseados nas letras do tipo.
 * É a única fonte de percentuais hoje (o scraping foi descontinuado — ver M9).
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
 * Função principal de extração de dados
 */
export async function extrairDados16Personalities(url: string): Promise<DadosExtraidos16P> {
  
  // Validar URL
  if (!validarUrl16Personalities(url)) {
    throw new Error('URL inválida. Por favor, cole o link completo do seu resultado do 16personalities.com');
  }
  
  // Parse básico da URL (sempre funciona)
  const dadosBasicos = parseUrl16Personalities(url);

  // Percentuais: usamos os ESTIMADOS (derivados das letras do tipo). O scraping
  // via proxy CORS público era removido por ser não-confiável (M9): pegava os 5
  // primeiros "%"/"data-value" do HTML sem garantir que fossem as dimensões nem
  // a ordem, gravando valores errados de forma silenciosa. Como não há como
  // mapear com segurança os % raspados às dimensões, preferimos o estimado
  // previsível — a letra/lado já vêm do código do tipo (ver derivarDimensoesMBTI).
  const percentuais = gerarPercentuaisEstimados(dadosBasicos.letras);

  // Letra/lado vêm de derivarDimensoesMBTI — a MESMA fonte usada ao reabrir o
  // resultado salvo —, para que o texto do preview e o da releitura coincidam
  // (antes o preview usava obterLadoPorLetra com vocabulário diferente) — N6.
  const dims = derivarDimensoesMBTI(dadosBasicos.tipoCodigo, {
    mind: percentuais[0],
    energy: percentuais[1],
    nature: percentuais[2],
    tactics: percentuais[3],
    identity: percentuais[4],
  });

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
      energia: dims.energia,
      mente: dims.mente,
      natureza: dims.natureza,
      abordagem: dims.abordagem,
      identidade: dims.identidade,
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

