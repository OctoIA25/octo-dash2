/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Serviço para gerar análises completas de personalidade
 * Transforma dados brutos dos testes em análises textuais ricas
 */

import { DISC_PROFILES } from '@/data/discQuestions';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';

/**
 * Interface para análise completa de personalidade
 */
export interface AnalisePersonalidadeCompleta {
  disc?: AnaliseDISC;
  eneagrama?: AnaliseEneagrama;
  mbti?: AnaliseMBTI;
  resumoIntegrado?: string;
}

export interface AnaliseDISC {
  perfilPrincipal: string;
  nomePerfil: string;
  descricao: string;
  caracteristicas: string;
  pontosFortes: string;
  percentuais: {
    D: { valor: number; percentual: string };
    I: { valor: number; percentual: string };
    S: { valor: number; percentual: string };
    C: { valor: number; percentual: string };
  };
  perfisDominantes: Array<{
    perfil: string;
    nome: string;
    percentual: string;
  }>;
  interpretacao: string;
}

export interface AnaliseEneagrama {
  tipoPrincipal: number;
  nome: string;
  emoji: string;
  descricaoBreve: string;
  caracteristicas: string;
  motivacaoCentral: string;
  medoBasico: string;
  pontosFortes: string;
  pontosDeAtencao: string;
  direcaoDeCrescimento: string;
  direcaoDeEstresse: string;
  scores: { [key: number]: number };
  interpretacao: string;
}

export interface AnaliseMBTI {
  tipo: string;
  categoria: string;
  descricao: string;
  funcoesCognitivas: string;
  estiloComunicacao: string;
  tomadaDecisao: string;
  gestaoEnergia: string;
  pontosFortes: string;
  desafios: string;
  percentuais: {
    Mind: { valor: number; categoria: string };
    Energy: { valor: number; categoria: string };
    Nature: { valor: number; categoria: string };
    Tactics: { valor: number; categoria: string };
    Identity: { valor: number; categoria: string };
  };
  interpretacao: string;
}

/**
 * Gera análise completa do perfil DISC
 */
export function gerarAnaliseDISC(
  tipoPrincipal: string,
  percentuais: { D: number; I: number; S: number; C: number },
  perfisDominantes?: string[]
): AnaliseDISC {
  const perfil = DISC_PROFILES[tipoPrincipal];
  
  // Calcular perfis dominantes se não fornecidos
  const dominantes = perfisDominantes || Object.entries(percentuais)
    .filter(([_, valor]) => valor >= 0.25)
    .sort((a, b) => b[1] - a[1])
    .map(([perfil]) => perfil);

  // Formatar percentuais
  const percentuaisFormatados = {
    D: {
      valor: percentuais.D,
      percentual: `${(percentuais.D * 100).toFixed(1)}%`
    },
    I: {
      valor: percentuais.I,
      percentual: `${(percentuais.I * 100).toFixed(1)}%`
    },
    S: {
      valor: percentuais.S,
      percentual: `${(percentuais.S * 100).toFixed(1)}%`
    },
    C: {
      valor: percentuais.C,
      percentual: `${(percentuais.C * 100).toFixed(1)}%`
    }
  };

  // Gerar interpretação
  let interpretacao = `Este corretor possui perfil predominante ${perfil.nome} (${perfil.letra}), `;
  
  if (dominantes.length > 1) {
    const outrosDominantes = dominantes.slice(1).map(p => DISC_PROFILES[p].nome).join(' e ');
    interpretacao += `com influência de ${outrosDominantes}. `;
  } else {
    interpretacao += `com características bem definidas deste tipo. `;
  }
  
  // Adicionar implicações práticas
  const perfilInfo = DISC_PROFILES[tipoPrincipal];
  interpretacao += `\n\nIMPLICAÇÕES PARA GESTÃO:\n`;
  interpretacao += `- É ${perfilInfo.descricao.toLowerCase()}\n`;
  interpretacao += `- ${perfilInfo.caracteristicas}\n`;
  interpretacao += `- Pontos fortes: ${perfilInfo.pontos_fortes}`;

  return {
    perfilPrincipal: tipoPrincipal,
    nomePerfil: perfil.nome,
    descricao: perfil.descricao,
    caracteristicas: perfil.caracteristicas,
    pontosFortes: perfil.pontos_fortes,
    percentuais: percentuaisFormatados,
    perfisDominantes: dominantes.map(p => ({
      perfil: p,
      nome: DISC_PROFILES[p].nome,
      percentual: percentuaisFormatados[p as keyof typeof percentuaisFormatados].percentual
    })),
    interpretacao
  };
}

/**
 * Gera análise completa do perfil Eneagrama
 */
export function gerarAnaliseEneagrama(
  tipoPrincipal: number,
  scores: { [key: number]: number }
): AnaliseEneagrama {
  const tipo = ENEAGRAMA_TIPOS[tipoPrincipal];
  
  // Identificar tipos secundários (com pontuação significativa)
  const tiposSecundarios = Object.entries(scores)
    .filter(([num, score]) => parseInt(num) !== tipoPrincipal && score >= 50)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  // Gerar interpretação
  let interpretacao = `Este corretor é do Tipo ${tipoPrincipal} - ${tipo.nome}. `;
  interpretacao += `${tipo.descricaoBreve}\n\n`;
  
  if (tiposSecundarios.length > 0) {
    interpretacao += `INFLUÊNCIAS SECUNDÁRIAS:\n`;
    tiposSecundarios.forEach(([num, score]) => {
      const tipoSec = ENEAGRAMA_TIPOS[parseInt(num)];
      interpretacao += `- Tipo ${num} (${tipoSec.nome}): ${score} pontos - ${tipoSec.descricaoBreve}\n`;
    });
    interpretacao += `\n`;
  }
  
  interpretacao += `COMO GERENCIAR:\n`;
  interpretacao += `- Motivação: ${tipo.motivacaoCentral}\n`;
  interpretacao += `- Evitar despertar: ${tipo.medoBasico}\n`;
  interpretacao += `- Em crescimento: ${tipo.direcaoDeCrescimento}\n`;
  interpretacao += `- Em estresse: ${tipo.direcaoDeEstresse}`;

  return {
    tipoPrincipal,
    nome: tipo.nome,
    emoji: tipo.emoji,
    descricaoBreve: tipo.descricaoBreve,
    caracteristicas: tipo.caracteristicas,
    motivacaoCentral: tipo.motivacaoCentral,
    medoBasico: tipo.medoBasico,
    pontosFortes: tipo.pontosFortes,
    pontosDeAtencao: tipo.pontosDeAtencao,
    direcaoDeCrescimento: tipo.direcaoDeCrescimento,
    direcaoDeEstresse: tipo.direcaoDeEstresse,
    scores,
    interpretacao
  };
}

/**
 * Base de conhecimento MBTI - Descrições dos 16 tipos
 */
const MBTI_TIPOS: Record<string, {
  categoria: string;
  descricao: string;
  funcoesCognitivas: string;
  estiloComunicacao: string;
  tomadaDecisao: string;
  gestaoEnergia: string;
  pontosFortes: string;
  desafios: string;
}> = {
  'INTJ': {
    categoria: 'Arquiteto',
    descricao: 'Estrategista imaginativo e planejador nato. Altamente independente, autoconfiante e determinado.',
    funcoesCognitivas: 'Ni-Te-Fi-Se (Intuição Introvertida dominante, Pensamento Extrovertido auxiliar)',
    estiloComunicacao: 'Direto, focado em ideias e estratégias. Prefere comunicação lógica e eficiente.',
    tomadaDecisao: 'Baseada em análise lógica e visão de longo prazo. Considera sistemas e padrões.',
    gestaoEnergia: 'Introvertido - recarrega sozinho, prefere tempo para reflexão profunda.',
    pontosFortes: 'Pensamento estratégico, independência, determinação, visão de longo prazo.',
    desafios: 'Pode parecer distante, dificuldade com emoções, perfeccionismo, impaciência com ineficiência.'
  },
  'INTP': {
    categoria: 'Lógico',
    descricao: 'Pensador inovador com sede insaciável de conhecimento. Analítico e objetivo.',
    funcoesCognitivas: 'Ti-Ne-Si-Fe (Pensamento Introvertido dominante, Intuição Extrovertida auxiliar)',
    estiloComunicacao: 'Preciso, focado em conceitos abstratos. Gosta de debater ideias.',
    tomadaDecisao: 'Baseada em lógica interna e consistência. Questiona tudo.',
    gestaoEnergia: 'Introvertido - precisa de tempo sozinho para processar ideias.',
    pontosFortes: 'Análise profunda, criatividade teórica, objetividade, resolução de problemas complexos.',
    desafios: 'Procrastinação, dificuldade em expressar emoções, desorganização prática.'
  },
  'ENTJ': {
    categoria: 'Comandante',
    descricao: 'Líder ousado, imaginativo e forte. Sempre encontra um caminho ou cria um.',
    funcoesCognitivas: 'Te-Ni-Se-Fi (Pensamento Extrovertido dominante, Intuição Introvertida auxiliar)',
    estiloComunicacao: 'Assertivo, direto, focado em resultados. Natural em liderar discussões.',
    tomadaDecisao: 'Rápida, baseada em eficiência e lógica. Orientada para objetivos.',
    gestaoEnergia: 'Extrovertido - recarrega com interação social e ação.',
    pontosFortes: 'Liderança natural, pensamento estratégico, decisão, organização.',
    desafios: 'Pode ser dominador, insensível, impaciente com ineficiência.'
  },
  'ENTP': {
    categoria: 'Debatedor',
    descricao: 'Pensador inteligente e curioso que não resiste a um desafio intelectual.',
    funcoesCognitivas: 'Ne-Ti-Fe-Si (Intuição Extrovertida dominante, Pensamento Introvertido auxiliar)',
    estiloComunicacao: 'Engajante, desafiador, gosta de debater. Adora jogar com ideias.',
    tomadaDecisao: 'Explora múltiplas possibilidades antes de decidir. Questiona status quo.',
    gestaoEnergia: 'Extrovertido - energizado por brainstorming e interações estimulantes.',
    pontosFortes: 'Inovação, versatilidade, pensamento rápido, carisma.',
    desafios: 'Dificuldade em focar, pode ser argumentativo, evita rotina.'
  },
  'INFJ': {
    categoria: 'Advogado',
    descricao: 'Idealista quieto e místico, mas inspirador e incansável.',
    funcoesCognitivas: 'Ni-Fe-Ti-Se (Intuição Introvertida dominante, Sentimento Extrovertido auxiliar)',
    estiloComunicacao: 'Empático, profundo, busca significado. Bom ouvinte.',
    tomadaDecisao: 'Baseada em valores e visão de futuro. Considera impacto nas pessoas.',
    gestaoEnergia: 'Introvertido - precisa de tempo sozinho para recarregar.',
    pontosFortes: 'Visão, empatia, idealismo, compreensão profunda de pessoas.',
    desafios: 'Perfeccionismo, sensibilidade a críticas, burnout por ajudar demais.'
  },
  'INFP': {
    categoria: 'Mediador',
    descricao: 'Poetico, bondoso e altruísta, sempre ansioso para ajudar uma boa causa.',
    funcoesCognitivas: 'Fi-Ne-Si-Te (Sentimento Introvertido dominante, Intuição Extrovertida auxiliar)',
    estiloComunicacao: 'Autêntico, empático, focado em valores. Evita conflitos.',
    tomadaDecisao: 'Baseada em valores pessoais profundos. Busca autenticidade.',
    gestaoEnergia: 'Introvertido - recarrega com tempo sozinho e reflexão.',
    pontosFortes: 'Criatividade, empatia, idealismo, autenticidade.',
    desafios: 'Muito sensível, evita conflitos necessários, idealismo irrealista.'
  },
  'ENFJ': {
    categoria: 'Protagonista',
    descricao: 'Líder carismático e inspirador, capaz de hipnotizar seus ouvintes.',
    funcoesCognitivas: 'Fe-Ni-Se-Ti (Sentimento Extrovertido dominante, Intuição Introvertida auxiliar)',
    estiloComunicacao: 'Caloroso, persuasivo, inspirador. Natural em motivar outros.',
    tomadaDecisao: 'Baseada em valores e impacto nas pessoas. Busca harmonia.',
    gestaoEnergia: 'Extrovertido - energizado ao ajudar e conectar pessoas.',
    pontosFortes: 'Liderança inspiradora, empatia, comunicação, visão.',
    desafios: 'Assume problemas dos outros, perfeccionismo, sensível a críticas.'
  },
  'ENFP': {
    categoria: 'Ativista',
    descricao: 'Espírito livre entusiasta, criativo e sociável, que sempre encontra motivo para sorrir.',
    funcoesCognitivas: 'Ne-Fi-Te-Si (Intuição Extrovertida dominante, Sentimento Introvertido auxiliar)',
    estiloComunicacao: 'Entusiasta, expressivo, autêntico. Adora conectar com pessoas.',
    tomadaDecisao: 'Explora possibilidades, guiado por valores. Espontâneo.',
    gestaoEnergia: 'Extrovertido - energizado por novas experiências e pessoas.',
    pontosFortes: 'Entusiasmo, criatividade, empatia, versatilidade.',
    desafios: 'Falta de foco, procrastinação, dificuldade com rotina.'
  },
  'ISTJ': {
    categoria: 'Logístico',
    descricao: 'Prático e factual. Confiável, organizado e tradicional.',
    funcoesCognitivas: 'Si-Te-Fi-Ne (Sensação Introvertida dominante, Pensamento Extrovertido auxiliar)',
    estiloComunicacao: 'Claro, factual, orientado a detalhes. Prefere comunicação direta.',
    tomadaDecisao: 'Baseada em fatos, experiência passada e lógica. Metódico.',
    gestaoEnergia: 'Introvertido - recarrega com rotina e tempo sozinho.',
    pontosFortes: 'Confiabilidade, organização, responsabilidade, atenção a detalhes.',
    desafios: 'Rigidez, resistência a mudanças, dificuldade com emoções.'
  },
  'ISFJ': {
    categoria: 'Defensor',
    descricao: 'Protetor dedicado e caloroso, sempre pronto para defender seus entes queridos.',
    funcoesCognitivas: 'Si-Fe-Ti-Ne (Sensação Introvertida dominante, Sentimento Extrovertido auxiliar)',
    estiloComunicacao: 'Gentil, atencioso, focado em harmonia. Bom ouvinte.',
    tomadaDecisao: 'Baseada em valores, tradição e consideração pelos outros.',
    gestaoEnergia: 'Introvertido - recarrega cuidando de si mesmo.',
    pontosFortes: 'Empatia, confiabilidade, apoio, atenção aos detalhes.',
    desafios: 'Dificuldade em dizer não, negligencia próprias necessidades.'
  },
  'ESTJ': {
    categoria: 'Executivo',
    descricao: 'Excelente administrador, incomparável em gerenciar coisas ou pessoas.',
    funcoesCognitivas: 'Te-Si-Ne-Fi (Pensamento Extrovertido dominante, Sensação Introvertida auxiliar)',
    estiloComunicacao: 'Direto, factual, orientado a ação. Lidera com clareza.',
    tomadaDecisao: 'Rápida, baseada em fatos e eficiência. Pragmático.',
    gestaoEnergia: 'Extrovertido - energizado por organizar e liderar.',
    pontosFortes: 'Organização, liderança prática, responsabilidade, decisão.',
    desafios: 'Inflexibilidade, insensibilidade, dificuldade com mudanças.'
  },
  'ESFJ': {
    categoria: 'Cônsul',
    descricao: 'Extraordinariamente atencioso, sociável e popular, sempre ansioso para ajudar.',
    funcoesCognitivas: 'Fe-Si-Ne-Ti (Sentimento Extrovertido dominante, Sensação Introvertida auxiliar)',
    estiloComunicacao: 'Caloroso, sociável, prestativo. Cria harmonia.',
    tomadaDecisao: 'Baseada em valores e impacto social. Busca aprovação.',
    gestaoEnergia: 'Extrovertido - energizado ao ajudar e socializar.',
    pontosFortes: 'Empatia, organização social, lealdade, praticidade.',
    desafios: 'Sensível a críticas, dependência de aprovação externa.'
  },
  'ISTP': {
    categoria: 'Virtuoso',
    descricao: 'Experimentador ousado e prático, mestre de todos os tipos de ferramentas.',
    funcoesCognitivas: 'Ti-Se-Ni-Fe (Pensamento Introvertido dominante, Sensação Extrovertida auxiliar)',
    estiloComunicacao: 'Direto, prático, focado em ação. Econômico nas palavras.',
    tomadaDecisao: 'Baseada em lógica e experimentação prática. Adaptável.',
    gestaoEnergia: 'Introvertido - recarrega com atividades práticas sozinho.',
    pontosFortes: 'Resolução prática de problemas, adaptabilidade, calma sob pressão.',
    desafios: 'Dificuldade com emoções, pode ser insensível, impulsivo.'
  },
  'ISFP': {
    categoria: 'Aventureiro',
    descricao: 'Artista flexível e charmoso, sempre pronto para explorar e experimentar.',
    funcoesCognitivas: 'Fi-Se-Ni-Te (Sentimento Introvertido dominante, Sensação Extrovertida auxiliar)',
    estiloComunicacao: 'Gentil, autêntico, expressivo. Mostra mais por ações.',
    tomadaDecisao: 'Baseada em valores pessoais e experiência sensorial. Espontâneo.',
    gestaoEnergia: 'Introvertido - recarrega com experiências sensoriais.',
    pontosFortes: 'Criatividade, flexibilidade, sensibilidade, autenticidade.',
    desafios: 'Evita conflitos, sensibilidade excessiva, falta de planejamento.'
  },
  'ESTP': {
    categoria: 'Empreendedor',
    descricao: 'Inteligente, energético e muito perceptivo, que realmente gosta de viver no limite.',
    funcoesCognitivas: 'Se-Ti-Fe-Ni (Sensação Extrovertida dominante, Pensamento Introvertido auxiliar)',
    estiloComunicacao: 'Direto, energético, focado no presente. Persuasivo.',
    tomadaDecisao: 'Rápida, pragmática, baseada em oportunidades imediatas.',
    gestaoEnergia: 'Extrovertido - energizado por ação e experiências.',
    pontosFortes: 'Adaptabilidade, pensamento rápido, carisma, pragmatismo.',
    desafios: 'Impulsividade, dificuldade com planejamento, pode ser insensível.'
  },
  'ESFP': {
    categoria: 'Animador',
    descricao: 'Artista espontâneo, energético e entusiasta. A vida nunca é chata perto deles.',
    funcoesCognitivas: 'Se-Fi-Te-Ni (Sensação Extrovertida dominante, Sentimento Introvertido auxiliar)',
    estiloComunicacao: 'Caloroso, entusiasta, envolvente. Adora entreter.',
    tomadaDecisao: 'Espontânea, baseada em valores e momento presente.',
    gestaoEnergia: 'Extrovertido - energizado por socializar e experiências.',
    pontosFortes: 'Entusiasmo, flexibilidade, carisma, praticidade.',
    desafios: 'Evita conflitos, falta de planejamento, sensível a críticas.'
  }
};

/**
 * Gera análise completa do perfil MBTI
 */
export function gerarAnaliseMBTI(
  tipo: string,
  percentuais: { [key: string]: number }
): AnaliseMBTI {
  // Extrair tipo base (ex: "ENFP-T" -> "ENFP")
  const tipoBase = tipo.split('-')[0];
  const assertividade = tipo.includes('-A') ? 'Assertivo' : tipo.includes('-T') ? 'Turbulento' : '';
  
  const tipoInfo = MBTI_TIPOS[tipoBase] || {
    categoria: 'Desconhecido',
    descricao: 'Tipo não catalogado',
    funcoesCognitivas: 'N/A',
    estiloComunicacao: 'N/A',
    tomadaDecisao: 'N/A',
    gestaoEnergia: 'N/A',
    pontosFortes: 'N/A',
    desafios: 'N/A'
  };

  // Interpretar percentuais
  const interpretarDimensao = (valor: number, dimensao: string): string => {
    if (dimensao === 'Mind') {
      return valor > 50 ? 'Introvertido' : 'Extrovertido';
    } else if (dimensao === 'Energy') {
      return valor > 50 ? 'Intuitivo' : 'Observador';
    } else if (dimensao === 'Nature') {
      return valor > 50 ? 'Pensamento' : 'Sentimento';
    } else if (dimensao === 'Tactics') {
      return valor > 50 ? 'Julgamento' : 'Percepção';
    } else if (dimensao === 'Identity') {
      return valor > 50 ? 'Assertivo' : 'Turbulento';
    }
    return 'N/A';
  };

  const percentuaisFormatados = {
    Mind: {
      valor: percentuais.Mind || 50,
      categoria: interpretarDimensao(percentuais.Mind || 50, 'Mind')
    },
    Energy: {
      valor: percentuais.Energy || 50,
      categoria: interpretarDimensao(percentuais.Energy || 50, 'Energy')
    },
    Nature: {
      valor: percentuais.Nature || 50,
      categoria: interpretarDimensao(percentuais.Nature || 50, 'Nature')
    },
    Tactics: {
      valor: percentuais.Tactics || 50,
      categoria: interpretarDimensao(percentuais.Tactics || 50, 'Tactics')
    },
    Identity: {
      valor: percentuais.Identity || 50,
      categoria: interpretarDimensao(percentuais.Identity || 50, 'Identity')
    }
  };

  // Gerar interpretação
  let interpretacao = `Este corretor é do tipo ${tipo} - ${tipoInfo.categoria}. `;
  if (assertividade) {
    interpretacao += `Variante ${assertividade}. `;
  }
  interpretacao += `\n\n${tipoInfo.descricao}\n\n`;
  
  interpretacao += `CARACTERÍSTICAS COGNITIVAS:\n`;
  interpretacao += `- Funções: ${tipoInfo.funcoesCognitivas}\n`;
  interpretacao += `- Comunicação: ${tipoInfo.estiloComunicacao}\n`;
  interpretacao += `- Decisão: ${tipoInfo.tomadaDecisao}\n`;
  interpretacao += `- Energia: ${tipoInfo.gestaoEnergia}\n\n`;
  
  interpretacao += `IMPLICAÇÕES PARA GESTÃO:\n`;
  interpretacao += `- Pontos fortes: ${tipoInfo.pontosFortes}\n`;
  interpretacao += `- Atenção: ${tipoInfo.desafios}`;

  return {
    tipo,
    categoria: tipoInfo.categoria,
    descricao: tipoInfo.descricao,
    funcoesCognitivas: tipoInfo.funcoesCognitivas,
    estiloComunicacao: tipoInfo.estiloComunicacao,
    tomadaDecisao: tipoInfo.tomadaDecisao,
    gestaoEnergia: tipoInfo.gestaoEnergia,
    pontosFortes: tipoInfo.pontosFortes,
    desafios: tipoInfo.desafios,
    percentuais: percentuaisFormatados,
    interpretacao
  };
}

/**
 * Gera resumo integrado dos 3 modelos
 */
export function gerarResumoIntegrado(
  disc?: AnaliseDISC,
  eneagrama?: AnaliseEneagrama,
  mbti?: AnaliseMBTI
): string {
  let resumo = '=== ANÁLISE COMPORTAMENTAL INTEGRADA 360° ===\n\n';
  
  if (disc) {
    resumo += `🎯 DISC - COMPORTAMENTO OBSERVÁVEL:\n`;
    resumo += `Perfil ${disc.nomePerfil} - ${disc.descricao}\n`;
    resumo += `${disc.interpretacao}\n\n`;
  }
  
  if (eneagrama) {
    resumo += `⭐ ENEAGRAMA - MOTIVAÇÕES PROFUNDAS:\n`;
    resumo += `Tipo ${eneagrama.tipoPrincipal} (${eneagrama.nome}) - ${eneagrama.descricaoBreve}\n`;
    resumo += `${eneagrama.interpretacao}\n\n`;
  }
  
  if (mbti) {
    resumo += `🧠 MBTI - PROCESSAMENTO COGNITIVO:\n`;
    resumo += `${mbti.tipo} (${mbti.categoria}) - ${mbti.descricao}\n`;
    resumo += `${mbti.interpretacao}\n\n`;
  }
  
  // Síntese integrada
  if (disc && eneagrama && mbti) {
    resumo += `📊 SÍNTESE INTEGRADA:\n`;
    resumo += `Este corretor combina ${disc.nomePerfil} (DISC), ${eneagrama.nome} (Eneagrama) e ${mbti.categoria} (MBTI), `;
    resumo += `resultando em um profissional que age com ${disc.caracteristicas.toLowerCase()}, `;
    resumo += `motivado por ${eneagrama.motivacaoCentral.toLowerCase()}, `;
    resumo += `e processa informações através de ${mbti.estiloComunicacao.toLowerCase()}.\n\n`;
    
    resumo += `RECOMENDAÇÕES GERAIS DE GESTÃO:\n`;
    resumo += `1. Aproveite: ${disc.pontosFortes}\n`;
    resumo += `2. Motive através: ${eneagrama.motivacaoCentral}\n`;
    resumo += `3. Comunique-se: ${mbti.estiloComunicacao}\n`;
    resumo += `4. Evite: ${eneagrama.medoBasico}\n`;
    resumo += `5. Desenvolva: ${eneagrama.pontosDeAtencao}`;
  }
  
  return resumo;
}

