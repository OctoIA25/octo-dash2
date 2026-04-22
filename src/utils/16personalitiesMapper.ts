/**
 * Mapeamentos de tipos, grupos e nomes do 16Personalities
 * Baseado na taxonomia oficial do 16personalities.com
 */

export interface Tipo16P {
  codigo: string;
  nome: string;
  grupo: string;
}

// Mapeamento de grupos por tipo
export const GRUPOS_16P: Record<string, string> = {
  'INTJ': 'Analistas',
  'INTP': 'Analistas',
  'ENTJ': 'Analistas',
  'ENTP': 'Analistas',
  
  'INFJ': 'Diplomatas',
  'INFP': 'Diplomatas',
  'ENFJ': 'Diplomatas',
  'ENFP': 'Diplomatas',
  
  'ISTJ': 'Sentinelas',
  'ISFJ': 'Sentinelas',
  'ESTJ': 'Sentinelas',
  'ESFJ': 'Sentinelas',
  
  'ISTP': 'Exploradores',
  'ISFP': 'Exploradores',
  'ESTP': 'Exploradores',
  'ESFP': 'Exploradores'
};

// Nomes dos tipos em português (16personalities)
export const NOMES_TIPOS_16P: Record<string, string> = {
  'INTJ': 'Arquiteto',
  'INTP': 'Lógico',
  'ENTJ': 'Comandante',
  'ENTP': 'Inovador',
  'INFJ': 'Advogado',
  'INFP': 'Mediador',
  'ENFJ': 'Protagonista',
  'ENFP': 'Ativista',
  'ISTJ': 'Logístico',
  'ISFJ': 'Defensor',
  'ESTJ': 'Executivo',
  'ESFJ': 'Cônsul',
  'ISTP': 'Virtuoso',
  'ISFP': 'Aventureiro',
  'ESTP': 'Empreendedor',
  'ESFP': 'Animador'
};

// Mapeamento de letras para lados (em português)
export const LADOS_ENERGIA: Record<string, string> = {
  'I': 'Introvertido',
  'E': 'Extrovertido'
};

export const LADOS_MENTE: Record<string, string> = {
  'S': 'Observador',
  'N': 'Intuitivo'
};

export const LADOS_NATUREZA: Record<string, string> = {
  'T': 'Pensador',
  'F': 'Sentimento'
};

export const LADOS_ABORDAGEM: Record<string, string> = {
  'J': 'Julgador',
  'P': 'Prospector'
};

export const LADOS_IDENTIDADE: Record<string, string> = {
  'A': 'Assertivo',
  'T': 'Turbulento'
};

/**
 * Valida se a URL é do formato correto do 16personalities
 * Aceita tanto /profiles/ quanto /resultados/ (inglês e português)
 */
export function validarUrl16Personalities(url: string): boolean {
  // Aceitar tanto /profiles/ (inglês) quanto /resultados/ (português)
  const regex = /^https:\/\/www\.16personalities\.com\/(br\/)?(profiles|resultados)\/([a-z]{4}-[at])\/(m|f)\/([a-z0-9]+)$/i;
  return regex.test(url);
}

/**
 * Extrai informações básicas da URL do 16personalities
 * Aceita tanto /profiles/ quanto /resultados/
 */
export function parseUrl16Personalities(url: string) {
  // Aceitar tanto /profiles/ quanto /resultados/
  const regex = /\/(profiles|resultados)\/([a-z]{4}-[at])\/(m|f)\/([a-z0-9]+)/i;
  const match = url.match(regex);
  
  if (!match) {
    throw new Error('URL inválida do 16personalities');
  }
  
  const tipoCodigo = match[2].toUpperCase(); // ISTP-A (agora é match[2] porque match[1] é profiles/resultados)
  const genero = match[3]; // m ou f
  const codigoTeste = match[4]; // 4m75a3ldv
  
  // Separar tipo base e identidade
  const [tipoBase, identidade] = tipoCodigo.split('-'); // ['ISTP', 'A']
  
  // Extrair letras individuais
  const letras = {
    energia: tipoBase[0] as 'I' | 'E',
    mente: tipoBase[1] as 'S' | 'N',
    natureza: tipoBase[2] as 'T' | 'F',
    abordagem: tipoBase[3] as 'J' | 'P',
    identidade: identidade as 'A' | 'T'
  };
  
  // Obter nome e grupo
  const tipoNome = NOMES_TIPOS_16P[tipoBase] || tipoBase;
  const tipoGrupo = GRUPOS_16P[tipoBase] || 'Desconhecido';
  
  return {
    url,
    tipoCodigo,
    tipoBase,
    genero,
    codigoTeste,
    tipoNome,
    tipoGrupo,
    letras
  };
}

/**
 * Obtém o lado (nome) a partir da letra
 */
export function obterLadoPorLetra(dimensao: 'energia' | 'mente' | 'natureza' | 'abordagem' | 'identidade', letra: string): string {
  switch (dimensao) {
    case 'energia':
      return LADOS_ENERGIA[letra] || letra;
    case 'mente':
      return LADOS_MENTE[letra] || letra;
    case 'natureza':
      return LADOS_NATUREZA[letra] || letra;
    case 'abordagem':
      return LADOS_ABORDAGEM[letra] || letra;
    case 'identidade':
      return LADOS_IDENTIDADE[letra] || letra;
    default:
      return letra;
  }
}

/**
 * Obtém descrição padrão do tipo
 */
export function obterDescricaoTipo(tipoBase: string): string {
  const descricoes: Record<string, string> = {
    'INTJ': 'Pensadores imaginativos e estratégicos, com planos para tudo.',
    'INTP': 'Inventores inovadores com uma sede insaciável de conhecimento.',
    'ENTJ': 'Líderes ousados, imaginativos e de força de vontade, sempre encontrando um caminho ou abrindo um.',
    'ENTP': 'Pensadores inteligentes e curiosos, que não conseguem resistir a um desafio intelectual.',
    'INFJ': 'Idealistas quietos e místicos, mas inspiradores e incansáveis.',
    'INFP': 'Pessoas poéticas, gentis e altruístas, sempre ansiosas para ajudar uma boa causa.',
    'ENFJ': 'Líderes carismáticos e inspiradores, capazes de cativar seu público.',
    'ENFP': 'Espíritos livres entusiastas, criativos e sociáveis, que sempre conseguem encontrar um motivo para sorrir.',
    'ISTJ': 'Indivíduos práticos e factualistas, cuja confiabilidade não pode ser duvidada.',
    'ISFJ': 'Protetores dedicados e calorosos, sempre prontos a defender as pessoas amadas.',
    'ESTJ': 'Administradores excelentes, incomparáveis em gerenciar coisas ou pessoas.',
    'ESFJ': 'Pessoas extremamente atenciosas, sociáveis e populares, sempre ansiosas para ajudar.',
    'ISTP': 'Experimentadores ousados e práticos, mestres em todos os tipos de ferramentas.',
    'ISFP': 'Artistas flexíveis e charmosos, sempre prontos para explorar e experimentar algo novo.',
    'ESTP': 'Pessoas inteligentes, energéticas e muito perceptivas, que realmente gostam de viver no limite.',
    'ESFP': 'Artistas espontâneos, energéticos e entusiastas - a vida nunca é entediante perto deles.'
  };
  
  return descricoes[tipoBase] || `Tipo ${tipoBase} do 16 Personalities.`;
}

