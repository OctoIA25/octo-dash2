/**
 * Dados do Teste de Eneagrama — 36 pares de escolha forçada.
 *
 * POR QUE 36: são todos os pares possíveis entre os 9 tipos (C(9,2) = 36), o que
 * faz cada tipo aparecer exatamente 8 vezes e disputar cada rival uma vez. Isso
 * não é detalhe de conteúdo, é a correção de um viés estrutural.
 *
 * O questionário anterior tinha 10 perguntas com um mapa desbalanceado: os tipos
 * 1 e 5 apareciam em 3 pares e os demais em 2, e o desempate ia para o menor
 * índice. Enumerando as 1024 respostas possíveis, o Tipo 1 saía em 46,9% delas e
 * o Tipo 9 em 0,2% — e 73% dos resultados eram empate resolvido por ordem de
 * iteração. O resultado descrevia o questionário, não a pessoa.
 *
 * Com o round-robin completo o teto de pontuação é 8 para todo tipo, a soma dos
 * 9 scores é sempre 36, e nenhum tipo tem vantagem de exposição. Os invariantes
 * estão cobertos em eneagramaQuestions.test.ts.
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

const INSTRUCAO = 'Escolha a alternativa que melhor descreve você na maior parte do tempo.';

/**
 * Quatro afirmações por tipo, em primeira pessoa e focadas em comportamento.
 * Cada tipo entra em 8 pares, então cada afirmação é usada duas vezes — variar o
 * texto evita que a pessoa reconheça "a frase do tipo 1" e responda no padrão.
 */
export const AFIRMACOES: Record<number, string[]> = {
  1: [
    'Percebo rápido o que está errado e sinto necessidade de corrigir.',
    'Tenho um padrão alto e cobro de mim antes de cobrar dos outros.',
    'Me incomoda ver algo feito de qualquer jeito.',
    'Procuro agir de forma correta mesmo quando ninguém está vendo.',
  ],
  2: [
    'Percebo o que o outro precisa antes mesmo de ele pedir.',
    'Tenho dificuldade de dizer não para quem precisa de mim.',
    'Me sinto bem sendo a pessoa com quem os outros contam.',
    'Coloco a necessidade dos outros na frente da minha com frequência.',
  ],
  3: [
    'Gosto de me destacar naquilo que faço.',
    'Me organizo em torno de metas e gosto de mostrar resultado.',
    'Me adapto para causar boa impressão no ambiente em que estou.',
    'Tenho dificuldade de parar enquanto ainda há algo a conquistar.',
  ],
  4: [
    'Sinto que sou diferente das outras pessoas.',
    'Minhas emoções são intensas e eu não gosto de escondê-las.',
    'Busco o que é autêntico e recuso o que me parece comum.',
    'Costumo sentir falta de algo que eu não sei nomear.',
  ],
  5: [
    'Preciso entender bem um assunto antes de me envolver.',
    'Meu tempo sozinho é o que me recarrega.',
    'Guardo minha energia e evito demandas que me consomem.',
    'Observo mais do que participo até me sentir seguro.',
  ],
  6: [
    'Antecipo o que pode dar errado para não ser pego de surpresa.',
    'Confiança é algo que se constrói devagar comigo.',
    'Me sinto mais firme quando tenho um grupo em quem confiar.',
    'Costumo testar bem as ideias antes de aderir a elas.',
  ],
  7: [
    'Gosto de manter várias opções abertas ao mesmo tempo.',
    'Me entusiasmo rápido com possibilidades novas.',
    'Prefiro olhar para o lado bom e seguir em frente.',
    'Fico inquieto quando a rotina fica limitada demais.',
  ],
  8: [
    'Falo o que penso de forma direta, sem rodeios.',
    'Não gosto de me sentir controlado por ninguém.',
    'Assumo o comando quando percebo que ninguém está assumindo.',
    'Defendo quem está sendo passado para trás.',
  ],
  9: [
    'Evito conflito e busco o caminho que acomoda todo mundo.',
    'Consigo enxergar o lado de cada um numa discussão.',
    'Tenho dificuldade de decidir o que eu mesmo quero.',
    'Prefiro manter a paz a impor a minha posição.',
  ],
};

/**
 * Gera os 36 pares por escalonamento round-robin (método do círculo), com um
 * "bye" porque 9 é ímpar. Isso dá 9 rodadas de 4 pares e espalha os tipos: em
 * cada bloco de 4 perguntas aparecem 8 tipos distintos, em vez de concentrar
 * todos os pares do tipo 1 no começo.
 */
function gerarPares(): Array<[number, number]> {
  const BYE = 0;
  let circulo = [BYE, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const pares: Array<[number, number]> = [];

  for (let rodada = 0; rodada < circulo.length - 1; rodada++) {
    for (let i = 0; i < circulo.length / 2; i++) {
      const a = circulo[i];
      const b = circulo[circulo.length - 1 - i];
      if (a !== BYE && b !== BYE) pares.push([a, b]);
    }
    // rotaciona mantendo a primeira posição fixa
    circulo = [circulo[0], circulo[circulo.length - 1], ...circulo.slice(1, circulo.length - 1)];
  }

  return pares;
}

function montarQuestoes(): EneagramaQuestion[] {
  const usos: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  const frase = (tipo: number): string => AFIRMACOES[tipo][usos[tipo]++ % AFIRMACOES[tipo].length];

  return gerarPares().map(([x, y], i) => {
    // Alterna qual lado do par vira a opção A: sem isso o tipo de menor índice
    // ficaria sempre em primeiro, e posição influencia escolha.
    const [tipoA, tipoB] = i % 2 === 0 ? [x, y] : [y, x];
    return {
      numero: i + 1,
      instrucao: INSTRUCAO,
      opcaoA: frase(tipoA),
      opcaoB: frase(tipoB),
      tipoA,
      tipoB,
    };
  });
}

export const ENEAGRAMA_QUESTIONS: EneagramaQuestion[] = montarQuestoes();

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
 * De-para pergunta → tipo, derivado das próprias perguntas.
 *
 * Antes o serviço de cálculo mantinha uma cópia manual desta tabela; duas listas
 * que precisavam concordar e ninguém garantia que concordassem.
 */
export const ENEAGRAMA_MAPPING: Record<number, { A: number; B: number }> = Object.fromEntries(
  ENEAGRAMA_QUESTIONS.map((q) => [q.numero, { A: q.tipoA, B: q.tipoB }]),
);
