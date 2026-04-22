/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Dados das 15 Perguntas do Teste DISC
 */

export interface DISCQuestion {
  numero: number;
  opcoes: {
    D: string;
    I: string;
    S: string;
    C: string;
  };
}

export const DISC_QUESTIONS: DISCQuestion[] = [
  {
    numero: 1,
    opcoes: {
      D: "FOCADO",
      I: "ARTICULADO",
      S: "COMPREENSIVO",
      C: "CUIDADOSO"
    }
  },
  {
    numero: 2,
    opcoes: {
      D: "COMPETITIVO",
      I: "AMIGÁVEL",
      S: "COLABORADOR",
      C: "PRECAVIDO"
    }
  },
  {
    numero: 3,
    opcoes: {
      D: "DIRETO",
      I: "VISIONÁRIO",
      S: "PACIENTE",
      C: "LÓGICO"
    }
  },
  {
    numero: 4,
    opcoes: {
      D: "OBJETIVO",
      I: "EXPRESSIVO",
      S: "SENSÍVEL",
      C: "ATENTO"
    }
  },
  {
    numero: 5,
    opcoes: {
      D: "ASSERTIVO",
      I: "SOCIÁVEL",
      S: "CONFIÁVEL",
      C: "CAUTELOSO"
    }
  },
  {
    numero: 6,
    opcoes: {
      D: "AMBICIOSO",
      I: "CARISMÁTICO",
      S: "HARMONIOSO",
      C: "OBSERVADOR"
    }
  },
  {
    numero: 7,
    opcoes: {
      D: "INDEPENDENTE",
      I: "ALEGRE",
      S: "CONSERVADOR",
      C: "CRITERIOSO"
    }
  },
  {
    numero: 8,
    opcoes: {
      D: "DETERMINADO",
      I: "EXTROVERTIDO",
      S: "GENEROSO",
      C: "DESCONFIADO"
    }
  },
  {
    numero: 9,
    opcoes: {
      D: "ENERGÉTICO",
      I: "ENVOLVENTE",
      S: "COMPANHEIRO",
      C: "TÉCNICO"
    }
  },
  {
    numero: 10,
    opcoes: {
      D: "PIONEIRO",
      I: "MOTIVADOR",
      S: "ESTÁVEL",
      C: "SISTEMÁTICO"
    }
  }
];

/**
 * Descrições dos perfis DISC
 */
export interface DISCProfile {
  letra: 'D' | 'I' | 'S' | 'C';
  nome: string;
  cor: string;
  descricao: string;
  caracteristicas: string;
  pontos_fortes: string;
}

export const DISC_PROFILES: Record<string, DISCProfile> = {
  D: {
    letra: 'D',
    nome: 'DOMINÂNCIA',
    cor: '#E74C3C', // Vermelho
    descricao: 'Pessoas orientadas para resultados, diretas e competitivas.',
    caracteristicas: 'Direto, assertivo, focado em resultados, competitivo, determinado, toma decisões rápidas, gosta de desafios.',
    pontos_fortes: 'Liderança natural, orientado para metas, resolve problemas rapidamente, não tem medo de conflitos.'
  },
  I: {
    letra: 'I',
    nome: 'INFLUÊNCIA',
    cor: '#F39C12', // Amarelo/Dourado
    descricao: 'Pessoas comunicativas, entusiasmadas e persuasivas.',
    caracteristicas: 'Comunicativo, entusiasmado, otimista, persuasivo, sociável, criativo, gosta de trabalhar em equipe.',
    pontos_fortes: 'Excelente comunicador, motivador, carismático, cria bom ambiente de trabalho.'
  },
  S: {
    letra: 'S',
    nome: 'ESTABILIDADE',
    cor: '#27AE60', // Verde
    descricao: 'Pessoas pacientes, confiáveis e colaborativas.',
    caracteristicas: 'Paciente, calmo, leal, bom ouvinte, confiável, consistente, prefere rotina, evita conflitos.',
    pontos_fortes: 'Trabalha bem em equipe, confiável, mantém harmonia, persistente, apoiador.'
  },
  C: {
    letra: 'C',
    nome: 'CONFORMIDADE',
    cor: '#3498DB', // Azul
    descricao: 'Pessoas analíticas, precisas e detalhistas.',
    caracteristicas: 'Analítico, preciso, detalhista, sistemático, cauteloso, segue regras, busca qualidade.',
    pontos_fortes: 'Atenção aos detalhes, organizado, produz trabalho de alta qualidade, pensamento crítico.'
  }
};

