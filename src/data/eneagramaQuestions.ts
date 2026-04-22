/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Dados do Teste de Eneagrama - 10 Perguntas de Escolha Forçada
 */

/**
 * Estrutura de uma pergunta de Eneagrama
 */
export interface EneagramaQuestion {
  numero: number;
  instrucao: string;
  opcaoA: string;
  opcaoB: string;
  tipoA: number; // 1-9
  tipoB: number; // 1-9
}

/**
 * 10 Perguntas do Teste de Eneagrama
 * Cada resposta mapeia para um tipo específico
 */
export const ENEAGRAMA_QUESTIONS: EneagramaQuestion[] = [
  {
    numero: 1,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Eu me esforço para ser correto, fazer a coisa certa e evitar erros.",
    opcaoB: "Eu busco novas experiências, me mantenho otimista e evito dor.",
    tipoA: 1,
    tipoB: 7
  },
  {
    numero: 2,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Ajudar os outros e ser amado é uma das coisas mais importantes para mim.",
    opcaoB: "Eu gosto de entender como as coisas funcionam e preciso do meu espaço privado para recarregar.",
    tipoA: 2,
    tipoB: 5
  },
  {
    numero: 3,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Eu sou altamente motivado pelo sucesso e por alcançar meus objetivos.",
    opcaoB: "Eu busco paz e harmonia, evitando conflitos sempre que possível.",
    tipoA: 3,
    tipoB: 9
  },
  {
    numero: 4,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Eu sinto que sou único e diferente, e busco formas de expressar minha individualidade.",
    opcaoB: "Eu gosto de estar no controle da situação e de proteger as pessoas que considero minhas.",
    tipoA: 4,
    tipoB: 8
  },
  {
    numero: 5,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Eu sou cauteloso e estou sempre pensando nos piores cenários para estar preparado.",
    opcaoB: "Eu tenho um forte senso de certo e errado e me sinto responsável por melhorar as coisas.",
    tipoA: 6,
    tipoB: 1
  },
  {
    numero: 6,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Eu me sinto bem quando sou necessário e consigo atender às necessidades dos outros.",
    opcaoB: "Eu evito sentimentos negativos, preferindo focar em atividades prazerosas e divertidas.",
    tipoA: 2,
    tipoB: 7
  },
  {
    numero: 7,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Eu prefiro observar e acumular conhecimento antes de me envolver em uma situação.",
    opcaoB: "Eu sou muito focado na minha imagem pública e em ser visto como bem-sucedido.",
    tipoA: 5,
    tipoB: 3
  },
  {
    numero: 8,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Frequentemente me fundo com os desejos dos outros para manter a paz.",
    opcaoB: "Eu sinto minhas emoções de forma muito intensa e posso ser um pouco melancólico.",
    tipoA: 9,
    tipoB: 4
  },
  {
    numero: 9,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Eu sou direto, assertivo e não tenho medo de confrontos para conseguir o que quero.",
    opcaoB: "Eu valorizo a lealdade e busco apoio e segurança em pessoas e sistemas que confio.",
    tipoA: 8,
    tipoB: 6
  },
  {
    numero: 10,
    instrucao: "Para cada alternativa, escolha aquela que melhor descreve você na maior parte do tempo.",
    opcaoA: "Eu tenho um crítico interno muito forte que me cobra organização e perfeição.",
    opcaoB: "Eu me sinto mais confortável com dados e conhecimento do que com emoções intensas.",
    tipoA: 1,
    tipoB: 5
  }
];

/**
 * Perfis dos 9 Tipos de Eneagrama
 */
export interface EneagramaTipo {
  numero: number;
  nome: string;
  emoji: string;
  cor: string;
  descricaoBreve: string;
  caracteristicas: string;
  motivacaoCentral: string;
  medoBasico: string;
  pontosFortes: string;
  pontosDeAtencao: string;
  direcaoDeCrescimento: string;
  direcaoDeEstresse: string;
}

export const ENEAGRAMA_TIPOS: Record<number, EneagramaTipo> = {
  1: {
    numero: 1,
    nome: "O Reformador",
    emoji: "1",
    cor: "#3B82F6", // Azul
    descricaoBreve: "Perfeccionista, responsável, ético. Quer fazer a coisa certa.",
    caracteristicas: "Pessoas do Tipo 1 são éticas, dedicadas e confiáveis. Têm forte senso de certo e errado, com um crítico interno rigoroso. Buscam perfeição e melhorias constantes em si mesmos e no mundo ao redor.",
    motivacaoCentral: "Fazer o que é certo, ser bom, equilibrado e ter integridade.",
    medoBasico: "Ser corrupto, mau, imperfeito ou defeituoso.",
    pontosFortes: "Organização, disciplina, senso de justiça, confiabilidade, alto padrão moral.",
    pontosDeAtencao: "Perfeccionismo excessivo, autocrítica severa, rigidez, dificuldade em relaxar.",
    direcaoDeCrescimento: "Quando saudáveis, tornam-se mais tolerantes, pacientes e aceitam imperfeições.",
    direcaoDeEstresse: "Sob estresse, podem ficar irritados, críticos e controladores."
  },
  2: {
    numero: 2,
    nome: "O Ajudador",
    emoji: "2",
    cor: "#EF4444", // Vermelho
    descricaoBreve: "Generoso, prestativo, possessivo. Quer ser amado e necessário.",
    caracteristicas: "Pessoas do Tipo 2 são calorosas, empáticas e genuinamente preocupadas com os outros. Frequentemente colocam as necessidades dos outros antes das próprias e buscam ser indispensáveis.",
    motivacaoCentral: "Ser amado, necessário e apreciado pelos outros.",
    medoBasico: "Ser indesejado, sem valor ou dispensável.",
    pontosFortes: "Empatia, generosidade, habilidade de conexão emocional, apoio genuíno.",
    pontosDeAtencao: "Dificuldade em reconhecer próprias necessidades, possessividade, manipulação emocional.",
    direcaoDeCrescimento: "Quando saudáveis, cuidam de si mesmos e oferecem amor incondicional.",
    direcaoDeEstresse: "Sob estresse, tornam-se orgulhosos, manipuladores e dependentes emocionalmente."
  },
  3: {
    numero: 3,
    nome: "O Realizador",
    emoji: "3",
    cor: "#F59E0B", // Laranja
    descricaoBreve: "Adaptável, focado no sucesso, consciente da imagem. Quer ser valioso.",
    caracteristicas: "Pessoas do Tipo 3 são motivadas, ambiciosas e focadas em resultados. Orientadas para o sucesso, são excelentes em atingir metas e se adaptar às expectativas dos outros.",
    motivacaoCentral: "Ser valioso, bem-sucedido e admirado.",
    medoBasico: "Ser sem valor, fracassado ou insignificante.",
    pontosFortes: "Alta produtividade, carisma, capacidade de inspirar, orientação para resultados.",
    pontosDeAtencao: "Workaholismo, identificação excessiva com imagem, dificuldade em contatar emoções.",
    direcaoDeCrescimento: "Quando saudáveis, são autênticos, conectados com seus sentimentos e valores.",
    direcaoDeEstresse: "Sob estresse, tornam-se competitivos, vaidosos e desonestos."
  },
  4: {
    numero: 4,
    nome: "O Individualista",
    emoji: "4",
    cor: "#8B5CF6", // Roxo
    descricaoBreve: "Expressivo, dramático, único. Quer criar uma identidade.",
    caracteristicas: "Pessoas do Tipo 4 são sensíveis, expressivas e conscientes de si mesmas. Buscam autenticidade e significado, sentindo-se diferentes e únicos. Têm vida emocional rica e profunda.",
    motivacaoCentral: "Ser autêntico, único e encontrar significado profundo.",
    medoBasico: "Não ter identidade própria ou significado pessoal.",
    pontosFortes: "Criatividade, profundidade emocional, autenticidade, sensibilidade artística.",
    pontosDeAtencao: "Melancolia, auto-absorção, inveja, sentimento de inadequação.",
    direcaoDeCrescimento: "Quando saudáveis, são criativos, inspiradores e equilibrados emocionalmente.",
    direcaoDeEstresse: "Sob estresse, tornam-se depressivos, auto-destrutivos e distantes."
  },
  5: {
    numero: 5,
    nome: "O Investigador",
    emoji: "5",
    cor: "#10B981", // Verde
    descricaoBreve: "Perceptivo, inovador, reservado. Quer ser competente e capaz.",
    caracteristicas: "Pessoas do Tipo 5 são analíticas, perspicazes e curiosas. Buscam conhecimento e compreensão, preferindo observar antes de agir. Valorizam privacidade e independência.",
    motivacaoCentral: "Ser competente, capaz e entender o mundo.",
    medoBasico: "Ser inútil, incompetente ou invadido.",
    pontosFortes: "Pensamento analítico, objetividade, conhecimento profundo, inovação.",
    pontosDeAtencao: "Isolamento excessivo, dificuldade emocional, acúmulo de conhecimento sem ação.",
    direcaoDeCrescimento: "Quando saudáveis, são visionários, sábios e conectados com o mundo.",
    direcaoDeEstresse: "Sob estresse, tornam-se mais isolados, avarentos e desconectados."
  },
  6: {
    numero: 6,
    nome: "O Leal",
    emoji: "6",
    cor: "#0EA5E9", // Azul Claro
    descricaoBreve: "Comprometido, ansioso, responsável. Quer ter segurança e apoio.",
    caracteristicas: "Pessoas do Tipo 6 são confiáveis, trabalhadoras e leais. Orientadas pela busca de segurança, tendem a antecipar problemas e preparar-se para o pior. Valorizam muito a confiança.",
    motivacaoCentral: "Ter segurança, apoio e orientação.",
    medoBasico: "Ficar sem apoio ou orientação, estar sozinho.",
    pontosFortes: "Lealdade, responsabilidade, previsão de problemas, senso de comunidade.",
    pontosDeAtencao: "Ansiedade, desconfiança, procrastinação por medo, questionamento excessivo.",
    direcaoDeCrescimento: "Quando saudáveis, tornam-se corajosos, confiantes e estáveis.",
    direcaoDeEstresse: "Sob estresse, ficam mais ansiosos, reativos e dependentes."
  },
  7: {
    numero: 7,
    nome: "O Entusiasta",
    emoji: "7",
    cor: "#FBBF24", // Amarelo
    descricaoBreve: "Espontâneo, versátil, otimista. Quer evitar a dor e se manter feliz.",
    caracteristicas: "Pessoas do Tipo 7 são entusiasmadas, versáteis e otimistas. Buscam experiências prazerosas e evitam dor ou limitações. São aventureiras e cheias de ideias.",
    motivacaoCentral: "Estar feliz, satisfeito e experimentar tudo que a vida oferece.",
    medoBasico: "Ser privado, limitado ou sentir dor emocional.",
    pontosFortes: "Otimismo, versatilidade, energia, criatividade, capacidade de inspirar alegria.",
    pontosDeAtencao: "Fuga da dor, superficialidade, impulsividade, dificuldade em comprometer-se.",
    direcaoDeCrescimento: "Quando saudáveis, são alegres, satisfeitos e presentes no momento.",
    direcaoDeEstresse: "Sob estresse, tornam-se dispersos, impacientes e escapistas."
  },
  8: {
    numero: 8,
    nome: "O Desafiador",
    emoji: "8",
    cor: "#DC2626", // Vermelho Escuro
    descricaoBreve: "Autoconfiante, decisivo, protetor. Quer proteger a si mesmo e controlar sua vida.",
    caracteristicas: "Pessoas do Tipo 8 são fortes, assertivas e protetoras. Assumem controle de situações e defendem causas com paixão. Valorizam força, honestidade e independência.",
    motivacaoCentral: "Ser forte, autossuficiente e proteger-se de vulnerabilidade.",
    medoBasico: "Ser controlado, vulnerável ou fraco.",
    pontosFortes: "Liderança natural, coragem, proteção dos outros, decisão rápida.",
    pontosDeAtencao: "Confrontação excessiva, dificuldade com vulnerabilidade, dominância, impaciência.",
    direcaoDeCrescimento: "Quando saudáveis, são magnânimos, protetores e vulneráveis quando apropriado.",
    direcaoDeEstresse: "Sob estresse, tornam-se mais agressivos, dominadores e insensíveis."
  },
  9: {
    numero: 9,
    nome: "O Pacificador",
    emoji: "9",
    cor: "#6366F1", // Índigo
    descricaoBreve: "Receptivo, tranquilizador, complacente. Quer manter a paz interior e exterior.",
    caracteristicas: "Pessoas do Tipo 9 são pacíficas, receptivas e harmoniosas. Buscam evitar conflitos e manter estabilidade. São bons ouvintes e mediadores naturais.",
    motivacaoCentral: "Ter paz interior e exterior, harmonia e conexão.",
    medoBasico: "Perda, separação e fragmentação.",
    pontosFortes: "Capacidade de mediação, aceitação, paciência, estabilidade emocional.",
    pontosDeAtencao: "Complacência excessiva, evitação de conflitos necessários, inércia, negligência própria.",
    direcaoDeCrescimento: "Quando saudáveis, são assertivos, engajados e dinâmicos.",
    direcaoDeEstresse: "Sob estresse, tornam-se apáticos, teimosos e desconectados."
  }
};

/**
 * Mapeamento de respostas para tipos
 * Estrutura: { pergunta: { opcao: tipo } }
 */
export const ENEAGRAMA_MAPPING: Record<number, { A: number; B: number }> = {
  1: { A: 1, B: 7 },
  2: { A: 2, B: 5 },
  3: { A: 3, B: 9 },
  4: { A: 4, B: 8 },
  5: { A: 6, B: 1 },
  6: { A: 2, B: 7 },
  7: { A: 5, B: 3 },
  8: { A: 9, B: 4 },
  9: { A: 8, B: 6 },
  10: { A: 1, B: 5 }
};

