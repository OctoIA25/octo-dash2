/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Dados do Teste MBTI - 10 Perguntas com Escala Likert
 * Baseado no modelo 16personalities.com
 */

/**
 * Estrutura de uma pergunta MBTI
 */
export interface MBTIQuestion {
  numero: number;
  dimensao: 'Mind' | 'Energy' | 'Nature' | 'Tactics' | 'Identity';
  afirmacao: string;
  invertida: boolean; // Se a pontuação deve ser invertida
  dicotomia: string; // Ex: "E/I"
}

/**
 * 10 Perguntas do Teste MBTI
 * 2 perguntas por dimensão
 */
export const MBTI_QUESTIONS: MBTIQuestion[] = [
  {
    numero: 1,
    dimensao: 'Mind',
    afirmacao: "Você se sente energizado e animado depois de passar tempo em eventos sociais com muitas pessoas.",
    invertida: false,
    dicotomia: "E/I"
  },
  {
    numero: 2,
    dimensao: 'Mind',
    afirmacao: "Você geralmente prefere ambientes mais calmos e com poucas pessoas.",
    invertida: true,
    dicotomia: "I/E"
  },
  {
    numero: 3,
    dimensao: 'Energy',
    afirmacao: "Você se interessa mais por ideias abstratas e discussões teóricas do que por fatos concretos e detalhes práticos.",
    invertida: false,
    dicotomia: "N/S"
  },
  {
    numero: 4,
    dimensao: 'Energy',
    afirmacao: "Você se considera uma pessoa mais com os 'pés no chão' do que um sonhador.",
    invertida: true,
    dicotomia: "S/N"
  },
  {
    numero: 5,
    dimensao: 'Nature',
    afirmacao: "Ao tomar decisões, você valoriza mais a lógica e a justiça do que os sentimentos e a empatia.",
    invertida: false,
    dicotomia: "T/F"
  },
  {
    numero: 6,
    dimensao: 'Nature',
    afirmacao: "Você se sente mais confortável em expressar apoio emocional do que em oferecer uma análise crítica de um problema.",
    invertida: true,
    dicotomia: "F/T"
  },
  {
    numero: 7,
    dimensao: 'Tactics',
    afirmacao: "Você prefere ter um plano bem definido e uma lista de tarefas do que agir de forma espontânea.",
    invertida: false,
    dicotomia: "J/P"
  },
  {
    numero: 8,
    dimensao: 'Tactics',
    afirmacao: "Você gosta de manter suas opções em aberto e se adaptar conforme as coisas acontecem.",
    invertida: true,
    dicotomia: "P/J"
  },
  {
    numero: 9,
    dimensao: 'Identity',
    afirmacao: "Você se sente confiante e seguro de si na maioria das situações.",
    invertida: false,
    dicotomia: "A/T"
  },
  {
    numero: 10,
    dimensao: 'Identity',
    afirmacao: "Você se preocupa frequentemente com o que os outros pensam de você.",
    invertida: true,
    dicotomia: "T/A"
  }
];

/**
 * Escala Likert de 7 pontos
 */
export const MBTI_SCALE = [
  { value: -3, label: "Discordo Totalmente", color: "#DC2626" },
  { value: -2, label: "Discordo", color: "#F97316" },
  { value: -1, label: "Discordo um Pouco", color: "#FBBF24" },
  { value: 0, label: "Neutro", color: "#9CA3AF" },
  { value: 1, label: "Concordo um Pouco", color: "#34D399" },
  { value: 2, label: "Concordo", color: "#10B981" },
  { value: 3, label: "Concordo Totalmente", color: "#059669" }
];

/**
 * Perfis dos 16 Tipos MBTI
 */
export interface MBTITipo {
  codigo: string; // Ex: "INTJ"
  nome: string;
  apelido: string;
  grupo: 'Analistas' | 'Diplomatas' | 'Sentinelas' | 'Exploradores';
  emoji: string;
  cor: string;
  descricaoBreve: string;
  caracteristicas: string;
  pontosFortes: string;
  pontosDeAtencao: string;
  carreira: string;
}

export const MBTI_TIPOS: Record<string, MBTITipo> = {
  'INTJ': {
    codigo: 'INTJ',
    nome: 'O Arquiteto',
    apelido: 'Pensadores criativos e estratégicos, com um plano para tudo',
    grupo: 'Analistas',
    emoji: '🏛️',
    cor: '#8B5CF6',
    descricaoBreve: 'Pensadores imaginativos e estratégicos, com um plano para tudo.',
    caracteristicas: 'Os Arquitetos são um dos tipos de personalidade mais raros e capazes. Racionais e perspicazes, orgulham-se de poderem pensar por si mesmos, com talento especial em detectar falsidade e hipocrisia. Questionam tudo, não hesitando em desafiar regras ou enfrentar desaprovação. Altamente independentes, querem se libertar das expectativas de outras pessoas e abraçar suas próprias ideias. Demonstram uma sede insaciável de conhecimento e dominam qualquer assunto que desperte sua atenção.',
    pontosFortes: 'Pensamento estratégico, independência, determinação, visão de longo prazo, agilidade mental, foco e precisão. Capacidade de transformar ideias em realidade através de força de vontade inabalável.',
    pontosDeAtencao: 'Podem ser vistos como insensíveis ou rudes quando estão apenas tentando ser honestos. Dificuldade com expressão de sentimentos, perfeccionismo excessivo. Frustração ao lidar com pessoas que consideram ineficientes ou incompetentes.',
    carreira: 'Cientistas, engenheiros, estrategistas, analistas de sistemas, desenvolvedores, pesquisadores, arquitetos de software, especialistas em codificação.'
  },
  'INTP': {
    codigo: 'INTP',
    nome: 'O Lógico',
    apelido: 'Inventores criativos, com uma sede insaciável de conhecimento',
    grupo: 'Analistas',
    emoji: '🧩',
    cor: '#6366F1',
    descricaoBreve: 'Pensadores inovadores com uma sede insaciável de conhecimento.',
    caracteristicas: 'Os Lógicos se orgulham de ter perspectivas únicas e grandes habilidades intelectuais. Suas mentes estão a todo vapor, repletas de ideias, questionamentos e percepções. Imaginativos e curiosos, têm um fascínio sem limites pelo funcionamento da própria mente. Adoram analisar padrões e detectam discrepâncias como Sherlock Holmes. São criativos e originais, com poucas coisas tão energizantes quanto compartilhar ideias ou engajar em debate animado com outra alma curiosa.',
    pontosFortes: 'Pensamento analítico profundo, criatividade excepcional, originalidade, flexibilidade mental, solução de problemas complexos. Capacidade de detectar padrões e inconsistências rapidamente.',
    pontosDeAtencao: 'Podem pensar demais até sobre decisões menos importantes. Dificuldade em transformar ideias em ações práticas. Paralisia por análise pode deixá-los sentindo-se ineficazes. Desafios em oferecer suporte emocional aos outros.',
    carreira: 'Pesquisadores, programadores, matemáticos, físicos, filósofos, arquitetos de sistemas, cientistas, inventores.'
  },
  'ENTJ': {
    codigo: 'ENTJ',
    nome: 'O Comandante',
    apelido: 'Corajosos, criativos e determinados, sempre dando um jeito para tudo',
    grupo: 'Analistas',
    emoji: '⚔️',
    cor: '#7C3AED',
    descricaoBreve: 'Líderes ousados, imaginativos e determinados, sempre encontrando um caminho.',
    caracteristicas: 'Os Comandantes são líderes natos com o dom do carisma e da confiança, exercendo autoridade para reunir multidões em prol de um objetivo comum. Destacam-se por um nível rigoroso de racionalidade, canalizando motivação, determinação e agilidade mental para alcançar qualquer meta. Adoram um bom desafio e acreditam que, com tempo e recursos adequados, podem alcançar qualquer objetivo. São dominadores, inflexíveis e implacáveis nas negociações, mas têm habilidade especial para reconhecer os talentos dos outros.',
    pontosFortes: 'Liderança natural, pensamento estratégico, decisão rápida, eficiência incomparável, carisma poderoso. Capacidade de inspirar e motivar outros, mantendo foco de longo prazo enquanto executam cada etapa com determinação e precisão.',
    pontosDeAtencao: 'Distância emocional particularmente evidente. Podem pisar na sensibilidade dos que consideram ineficientes, incompetentes ou preguiçosos. Demonstrações emocionais são vistas como fraqueza. Precisam lembrar que dependem de uma equipe funcional.',
    carreira: 'CEOs, executivos, empreendedores, líderes empresariais, gerentes, consultores estratégicos, advogados, presidentes.'
  },
  'ENTP': {
    codigo: 'ENTP',
    nome: 'O Inovador',
    apelido: 'Pensadores curiosos e flexíveis, que não resistem a um desafio intelectual',
    grupo: 'Analistas',
    emoji: '💡',
    cor: '#A855F7',
    descricaoBreve: 'Pensadores inteligentes e curiosos que não resistem a um desafio intelectual.',
    caracteristicas: 'Inteligentes e audaciosos, os Inovadores não têm medo de discordar dos padrões estabelecidos ou de se opor a quase nada ou ninguém. Conhecedores e curiosos, com senso de humor lúdico, podem ser incrivelmente divertidos. São os melhores advogados do diabo, destacando-se em destruir argumentos e expor ideias. Têm grande inclinação à rebeldia, questionando toda crença, examinando toda ideia e desafiando toda regra. Não conseguem evitar reavaliar conceitos amplamente aceitos.',
    pontosFortes: 'Criatividade excepcional, pensamento rápido, habilidade para debate, inovação constante, adaptabilidade mental. Flexibilidade para entender e explorar perspectivas de outras pessoas.',
    pontosDeAtencao: 'Podem fechar portas ao questionar abertamente superiores ou analisar minuciosamente cada palavra de um parceiro. Dificuldade em seguir rotinas e executar ideias práticas. Necessidade de desenvolver sensibilidade para manter relacionamentos significativos.',
    carreira: 'Empreendedores, inventores, consultores, advogados, cientistas, designers, inovadores, estrategistas.'
  },
  'INFJ': {
    codigo: 'INFJ',
    nome: 'O Apoiador',
    apelido: 'Visionários discretos, idealistas inspiradores e incansáveis',
    grupo: 'Diplomatas',
    emoji: '🕊️',
    cor: '#EC4899',
    descricaoBreve: 'Idealistas silenciosos e místicos, mas muito inspiradores e incansáveis.',
    caracteristicas: 'Os Apoiadores podem ser o tipo de personalidade mais raro, mas certamente não passam despercebidos. Idealistas e firmes em seus princípios, não basta viver uma vida sem grandes desafios, querem fazer a diferença. Dão importância à integridade e só ficam satisfeitos quando fazem o que julgam ser certo. Têm vida interior ativa e desejo profundo de encontrar sentido para a existência. Se incomodam com a injustiça e sentem que devem usar seus pontos fortes para ajudar os outros e espalhar compaixão. Valorizam relacionamentos profundos e autênticos.',
    pontosFortes: 'Empatia profunda, visão de futuro excepcional, criatividade singular, dedicação inabalável, integridade inegociável. Habilidade de perceber motivações não expressadas pelos outros. Comunicação afetuosa e sensível.',
    pontosDeAtencao: 'Podem se esgotar por esquecer de si mesmos ao ajudar outros. Sensibilidade a críticas, mesmo construtivas. Frustração quando boas intenções não são reconhecidas. Sensação de serem diferentes ou incompreendidos.',
    carreira: 'Conselheiros, psicólogos, escritores, professores, coaches, profissionais de RH, terapeutas, profissionais de caridade.'
  },
  'INFP': {
    codigo: 'INFP',
    nome: 'O Mediador',
    apelido: 'Poéticos, bondosos e altruístas, sempre prontos para apoiar uma boa causa',
    grupo: 'Diplomatas',
    emoji: '🌸',
    cor: '#F472B6',
    descricaoBreve: 'Pessoas poéticas, bondosas e altruístas, sempre ansiosas para ajudar.',
    caracteristicas: 'Os Mediadores têm uma vida interior ativa e apaixonada. Criativos e imaginativos, perdem-se alegremente em seus pensamentos. São conhecidos pela sensibilidade, tendo respostas emocionais profundas. Genuinamente curiosos sobre as profundezas da natureza humana, estão primorosamente sintonizados com próprios pensamentos e sentimentos. Solidários e não julgam, sempre dispostos a ouvir a história de outra pessoa. Têm talento para se expressar através de metáforas e personagens fictícios.',
    pontosFortes: 'Empatia excepcional, criatividade profunda, idealismo autêntico, autenticidade singular, flexibilidade notável. Dom de fazer outros se sentirem honrados e compreendidos. Habilidade de explorar própria natureza interior.',
    pontosDeAtencao: 'Sensibilidade excessiva ao absorver problemas do mundo. Dificuldade em estabelecer limites. Tendência a fantasiar mais do que agir. Podem se sentir sem rumo até encontrar propósito significativo.',
    carreira: 'Escritores, artistas, terapeutas, professores, profissionais de caridade, designers, poetas, atores.'
  },
  'ENFJ': {
    codigo: 'ENFJ',
    nome: 'O Protagonista',
    apelido: 'Otimistas inspiradores, prontos para agir de acordo com o que consideram correto',
    grupo: 'Diplomatas',
    emoji: '🌟',
    cor: '#D946EF',
    descricaoBreve: 'Líderes carismáticos e inspiradores, capazes de fascinar seus ouvintes.',
    caracteristicas: 'Os Protagonistas sentem que devem servir a um propósito maior na vida. Atenciosos e idealistas, esforçam-se para impactar positivamente os outros e o mundo. Nascidos para ser líderes, inspiram com paixão e carisma. Têm habilidade impressionante para perceber motivações e convicções não expressadas. São comunicadores extremamente persuasivos e inspiradores, motivados por desejo genuíno de fazer a coisa certa. Nada proporciona mais alegria do que incentivar alguém a fazer o que é correto.',
    pontosFortes: 'Liderança carismática excepcional, empatia aguçada, comunicação eloquente, inspiração natural, organização eficaz. Capacidade de guiar pessoas para trabalharem juntas em busca de um bem maior.',
    pontosDeAtencao: 'Envolvimento excessivo nos problemas dos outros pode causar ressentimento. Podem interpretar situações de forma equivocada ou dar conselhos inadequados. Necessidade de equilibrar ajudar outros com cuidar de si mesmos.',
    carreira: 'Professores, coaches, profissionais de RH, políticos, gerentes, conselheiros, treinadores.'
  },
  'ENFP': {
    codigo: 'ENFP',
    nome: 'O Ativista',
    apelido: 'Animados, criativos, sociáveis e de espírito livre, sempre encontrando um motivo para sorrir',
    grupo: 'Diplomatas',
    emoji: '🎨',
    cor: '#C026D3',
    descricaoBreve: 'Espíritos livres entusiastas, criativos e sociáveis, que sempre encontram um motivo para sorrir.',
    caracteristicas: 'Os Ativistas são verdadeiros espíritos livres: extrovertidos e com mente tão aberta quanto o coração. Encaram a vida com entusiasmo e otimismo, destacando-se em qualquer multidão. Mesmo sendo alma da festa, não se preocupam apenas em se divertir. São profundos, com desejo de estabelecer conexões emocionais significativas. Quando algo desperta sua imaginação, seu entusiasmo se torna incrivelmente contagiante. Irradiam energia positiva que atrai os demais. Valorizam conversas genuínas e sinceras.',
    pontosFortes: 'Entusiasmo contagiante, criatividade vibrante, empatia natural, comunicação inspiradora, adaptabilidade impressionante. Capacidade de se transformar de idealistas apaixonados em figuras descontraídas instantaneamente.',
    pontosDeAtencao: 'Podem perder empolgação em projetos antes importantes. Intuição pode levá-los a interpretar demais ações dos outros. Preocupação com possíveis conflitos. Dificuldade com autodisciplina, consistência e rotinas.',
    carreira: 'Artistas, jornalistas, consultores, empreendedores, professores, profissionais de marketing, designers.'
  },
  'ISTJ': {
    codigo: 'ISTJ',
    nome: 'O Logístico',
    apelido: 'Pessoas pragmáticas e focadas em fatos, com uma confiabilidade indiscutível',
    grupo: 'Sentinelas',
    emoji: '📋',
    cor: '#3B82F6',
    descricaoBreve: 'Indivíduos práticos e focados em fatos, cuja confiabilidade é inquestionável.',
    caracteristicas: 'Os Práticos orgulham-se de serem íntegros, dizendo o que realmente pensam e cumprindo sempre o que prometem. Representam uma parcela significativa da população e desempenham papel fundamental em sustentar base sólida e estável para a sociedade. A essência do autorrespeito dos Práticos reside em senso de integridade pessoal. Acreditam que existe maneira correta de agir em qualquer situação. Têm profundo respeito pela estrutura e tradição. São rápidos em reconhecer próprios erros, admitindo a realidade.',
    pontosFortes: 'Confiabilidade incomparável, organização meticulosa, dedicação total, pragmatismo sólido, responsabilidade inabalável. Ética profissional forte, senso de dever. Clareza, lealdade e confiabilidade excepcionais.',
    pontosDeAtencao: 'Podem julgar injustamente quem não tem mesmo autocontrole rigoroso. Tendência a assumir responsabilidades de outras pessoas, levando à exaustão. Para a ausência de estrutura representa caos, não liberdade.',
    carreira: 'Contadores, gerentes, administradores, analistas, auditores, engenheiros, inspetores.'
  },
  'ISFJ': {
    codigo: 'ISFJ',
    nome: 'O Defensor',
    apelido: 'Protetores muito dedicados e acolhedores, sempre prontos para defender quem amam',
    grupo: 'Sentinelas',
    emoji: '🛡️',
    cor: '#0EA5E9',
    descricaoBreve: 'Protetores dedicados e calorosos, sempre prontos para defender seus entes queridos.',
    caracteristicas: 'De maneira despretensiosa e discreta, os Defensores são verdadeiros pilares da sociedade. Trabalhadoras e dedicadas, demonstram profundo senso de responsabilidade. Pode-se contar com eles para cumprir prazos, lembrar aniversários e manter tradições. São autênticos altruístas, irradiando bondade e devoção. Lealdade é uma das características mais marcantes. Dificilmente deixam amizade acabar por falta de esforço. É comum largarem tudo para ajudar amigo ou familiar. Têm talento especial para fazer amigos se sentirem vistos, compreendidos e amados.',
    pontosFortes: 'Dedicação incomparável, empatia profunda, confiabilidade total, atenção aos detalhes, lealdade absoluta. Habilidade de recordar detalhes da vida de outras pessoas. Humildade genuína.',
    pontosDeAtencao: 'Intensidade do compromisso pode levar a exaustão e sobrecarga. Perfeccionismo excessivo. Dificuldade em expressar necessidades próprias. Podem ficar ressentidos quando esforços passam despercebidos.',
    carreira: 'Enfermeiros, professores, administradores, assistentes sociais, profissionais de saúde, cuidadores.'
  },
  'ESTJ': {
    codigo: 'ESTJ',
    nome: 'O Executivo',
    apelido: 'Excelentes organizadores, insuperáveis ao gerenciar tanto coisas quanto pessoas',
    grupo: 'Sentinelas',
    emoji: '🏢',
    cor: '#2563EB',
    descricaoBreve: 'Administradores excelentes, incomparáveis em gerenciar coisas ou pessoas.',
    caracteristicas: 'Os Executivos representam a tradição e a ordem, usando compreensão do que é certo, errado e socialmente aceitável para fortalecer laços familiares e comunitários. Abraçam valores como honestidade, dedicação e dignidade. Destacam-se por dar conselhos e orientações claras. Têm orgulho de reunir pessoas. Lideram através do exemplo, demonstrando compromisso e honestidade com propósito, bem como rejeição total à preguiça e trapaça. Vivem em mundo de fatos claros e verificáveis. Se mantêm firmes aos princípios mesmo diante de alta resistência.',
    pontosFortes: 'Organização exemplar, liderança natural, decisão rápida, eficiência máxima, responsabilidade total. Convicção firme na lei e na autoridade. Capacidade de tornar tarefas complicadas acessíveis.',
    pontosDeAtencao: 'Podem ter reputação de serem inflexíveis. Dificuldade com emoções. Expressam indignação quando parceiros os colocam em risco por incompetência ou desonestidade. Necessidade de reconhecer força individual além da coletiva.',
    carreira: 'Gerentes, executivos, militares, juízes, administradores, consultores empresariais, presidentes.'
  },
  'ESFJ': {
    codigo: 'ESFJ',
    nome: 'O Cônsul',
    apelido: 'Muito atenciosos, sociáveis e engajados com a comunidade, sempre dispostos a ajudar',
    grupo: 'Sentinelas',
    emoji: '🤝',
    cor: '#60A5FA',
    descricaoBreve: 'Pessoas extremamente atenciosas, sociáveis e populares, sempre ansiosas para ajudar.',
    caracteristicas: 'Para os Cônsules, a vida é mais saborosa quando compartilhada. São os pilares de diversas comunidades, acolhendo amigos, familiares e vizinhos não apenas em suas casas, mas também em seus corações. Acreditam no poder da hospitalidade e das boas maneiras. Generosos e confiáveis, assumem responsabilidade de manter família e comunidade unidas. Têm talento de fazer pessoas se sentirem apoiadas, cuidadas e seguras. Raramente esquecem aniversário ou feriado. Guardam na memória até menores detalhes da vida de amigos e familiares.',
    pontosFortes: 'Empatia excepcional, organização impecável, sociabilidade natural, lealdade profunda, senso de dever forte. Habilidade de fazer outros se sentirem especiais e valorizados.',
    pontosDeAtencao: 'Têm bússola moral bem definida, podendo ser perturbador quando ações de outros não coincidem. Dificuldade em aceitar que não podem controlar pensamentos ou comportamento de ninguém. Podem levar para lado pessoal quando esforços não são reconhecidos.',
    carreira: 'Profissionais de eventos, enfermeiros, professores, vendedores, gerentes de RH, organizadores.'
  },
  'ISTP': {
    codigo: 'ISTP',
    nome: 'O Virtuoso',
    apelido: 'Experimentadores ousados e práticos, mestres em todos os tipos de ferramentas',
    grupo: 'Exploradores',
    emoji: '🔧',
    cor: '#10B981',
    descricaoBreve: 'Experimentadores ousados e práticos, mestres em todo tipo de ferramenta.',
    caracteristicas: 'Os Virtuosos adoram explorar através das mãos e dos olhos, tocando e observando o mundo com racionalismo descontraído e curiosidade espirituosa. Têm talento nato para criar, passando de um projeto para outro, construindo tanto o útil quanto o supérfluo por diversão, aprendendo com o ambiente conforme avançam. São enigmáticos: simpáticos mas muito reservados, calmos mas subitamente espontâneos. Baseiam decisões em noção de realismo prático, enraizada em forte senso de justiça direta. Combinam criatividade, senso de humor e abordagem pragmática.',
    pontosFortes: 'Habilidade técnica excepcional, adaptabilidade notável, calma sob pressão, praticidade inata, independência total. Capacidade de aprender fazendo e criar soluções úteis.',
    pontosDeAtencao: 'Podem agir precipitadamente, presumindo que demais têm mesma natureza permissiva. Dificuldade particular em antecipar emoções. Desafios com limites e diretrizes. Preferem liberdade de movimento.',
    carreira: 'Engenheiros, mecânicos, técnicos, pilotos, atletas, profissionais de TI, especialistas práticos.'
  },
  'ISFP': {
    codigo: 'ISFP',
    nome: 'O Aventureiro',
    apelido: 'Flexíveis e encantadores, sempre prontos para explorar e experimentar algo novo',
    grupo: 'Exploradores',
    emoji: '🎭',
    cor: '#34D399',
    descricaoBreve: 'Artistas flexíveis e encantadores, sempre prontos para explorar e experimentar.',
    caracteristicas: 'Os Aventureiros são verdadeiros artistas, mas não necessariamente da forma convencional. Para eles, a vida em si é uma tela para autoexpressão. Cada Aventureiro é indiscutivelmente único. Impulsionados pela curiosidade e ávidos por experiências novas, têm variedade fascinante de paixões e interesses. Adotam postura flexível e adaptável. Vivem um dia depois do outro, de acordo com o que sentem ser certo no momento. São notoriamente tolerantes e de mente aberta. Amam viver em mundo onde encontram todos os tipos de pessoas. Criativos e de espírito livre.',
    pontosFortes: 'Criatividade singular, sensibilidade profunda, flexibilidade excepcional, apreciação estética aguçada, empatia natural. Habilidade de encontrar alegria nas pequenas coisas.',
    pontosDeAtencao: 'Dificuldades em estabelecer planos de longo prazo. Sensibilidade excessiva a críticas. Podem se sentir perdidos na correria da vida se não reservarem tempo para si. Atentos ao que outros pensam deles.',
    carreira: 'Artistas, designers, músicos, fotógrafos, chefs, profissionais de moda, criadores.'
  },
  'ESTP': {
    codigo: 'ESTP',
    nome: 'O Empresário',
    apelido: 'Pessoas habilidosas, ativas e muito perceptivas, que realmente gostam de se arriscar',
    grupo: 'Exploradores',
    emoji: '⚡',
    cor: '#059669',
    descricaoBreve: 'Pessoas inteligentes, energéticas e muito perceptivas, que realmente curtem viver no limite.',
    caracteristicas: 'Os Empreendedores sempre impactam o ambiente de alguma forma. Risonhos, animados e com humor afiado e prático, adoram ser centro das atenções. Vivem o momento e se lançam na ação. Gostam de drama, de paixão e de prazer, não por emoção, mas porque esses elementos são estimulantes para suas mentes lógicas. São forçados a tomar decisões importantes com base na realidade imediata e factual. Demonstram habilidade singular para detectar pequenas mudanças. Têm visão perspicaz e menos filtrada do que qualquer tipo.',
    pontosFortes: 'Ação rápida excepcional, adaptabilidade total, carisma natural, pensamento prático aguçado, coragem notável. Capacidade de observar e agir rapidamente com precisão.',
    pontosDeAtencao: 'Impulsividade marcante. Podem ultrapassar limites e ignorar indivíduos mais sensíveis. Dificuldade com compromissos de longo prazo. Tendência a se envolver excessivamente no momento presente.',
    carreira: 'Empreendedores, vendedores, paramédicos, atletas, policiais, consultores, negociadores.'
  },
  'ESFP': {
    codigo: 'ESFP',
    nome: 'O Animador',
    apelido: 'Espontâneos, ativos e animados, a vida nunca fica entediante perto deles',
    grupo: 'Exploradores',
    emoji: '🎉',
    cor: '#22C55E',
    descricaoBreve: 'Pessoas espontâneas, energéticas e entusiasmadas – a vida nunca é entediante perto delas.',
    caracteristicas: 'Os Animadores normalmente se pegam cantarolando e dançando espontaneamente. Deixam-se levar pela emoção do momento e querem que todos os demais também se sintam assim. Nenhum outro tipo é tão generoso com tempo e energia quanto os Animadores, e nenhum outro faz isso de forma tão irresistível. Adoram os holofotes e o mundo inteiro é um palco. Extremamente sociáveis, apreciam as pequenas coisas da vida. Têm senso estético mais apurado do que qualquer tipo. São naturalmente curiosos, explorando novos designs e estilos com facilidade.',
    pontosFortes: 'Entusiasmo contagiante, sociabilidade natural, espontaneidade genuína, praticidade eficaz, otimismo inspirador. Capacidade de transformar qualquer ocasião em festa e fazer outros rirem.',
    pontosDeAtencao: 'Podem se concentrar tanto nos prazeres imediatos que ignoram deveres e responsabilidades. Dificuldade com análises complexas e planejamento de longo prazo. Padrão de vida pode exceder possibilidades. Não há insatisfação maior do que perceber que estão presos às circunstâncias.',
    carreira: 'Animadores, atores, vendedores, professores, organizadores de eventos, profissionais de hospitalidade, entertainers.'
  }
};

/**
 * Grupos de tipos MBTI
 */
export const MBTI_GRUPOS = {
  'Analistas': {
    nome: 'Analistas',
    emoji: '🧠',
    cor: '#8B5CF6',
    descricao: 'Racionais e imparciais, priorizam lógica sobre emoções.',
    tipos: ['INTJ', 'INTP', 'ENTJ', 'ENTP']
  },
  'Diplomatas': {
    nome: 'Diplomatas',
    emoji: '❤️',
    cor: '#EC4899',
    descricao: 'Empáticos e idealistas, buscam harmonia e crescimento.',
    tipos: ['INFJ', 'INFP', 'ENFJ', 'ENFP']
  },
  'Sentinelas': {
    nome: 'Sentinelas',
    emoji: '🛡️',
    cor: '#3B82F6',
    descricao: 'Práticos e organizados, valorizam estabilidade e ordem.',
    tipos: ['ISTJ', 'ISFJ', 'ESTJ', 'ESFJ']
  },
  'Exploradores': {
    nome: 'Exploradores',
    emoji: '🌍',
    cor: '#10B981',
    descricao: 'Espontâneos e práticos, vivem o momento intensamente.',
    tipos: ['ISTP', 'ISFP', 'ESTP', 'ESFP']
  }
};

/**
 * Descrições das dimensões MBTI
 */
export const MBTI_DIMENSOES = {
  Mind: {
    nome: 'Mente',
    dicotomia: 'Extroversão (E) vs Introversão (I)',
    descricao: 'Como você interage com o mundo e onde encontra energia.',
    poloA: { letra: 'E', nome: 'Extroversão', descricao: 'Energizado por interações sociais' },
    poloB: { letra: 'I', nome: 'Introversão', descricao: 'Energizado por tempo sozinho' }
  },
  Energy: {
    nome: 'Energia',
    dicotomia: 'Intuição (N) vs Sensorial (S)',
    descricao: 'Como você processa informações e o que valoriza.',
    poloA: { letra: 'N', nome: 'Intuição', descricao: 'Foco em possibilidades e ideias abstratas' },
    poloB: { letra: 'S', nome: 'Sensorial', descricao: 'Foco em fatos e detalhes concretos' }
  },
  Nature: {
    nome: 'Natureza',
    dicotomia: 'Pensamento (T) vs Sentimento (F)',
    descricao: 'Como você toma decisões.',
    poloA: { letra: 'T', nome: 'Pensamento', descricao: 'Decisões baseadas em lógica e razão' },
    poloB: { letra: 'F', nome: 'Sentimento', descricao: 'Decisões baseadas em valores e empatia' }
  },
  Tactics: {
    nome: 'Táticas',
    dicotomia: 'Julgamento (J) vs Percepção (P)',
    descricao: 'Como você aborda a vida e o trabalho.',
    poloA: { letra: 'J', nome: 'Julgamento', descricao: 'Prefere estrutura e planejamento' },
    poloB: { letra: 'P', nome: 'Percepção', descricao: 'Prefere flexibilidade e espontaneidade' }
  },
  Identity: {
    nome: 'Identidade',
    dicotomia: 'Assertivo (A) vs Turbulento (T)',
    descricao: 'Como você lida com confiança e estresse.',
    poloA: { letra: 'A', nome: 'Assertivo', descricao: 'Confiante e resistente ao estresse' },
    poloB: { letra: 'T', nome: 'Turbulento', descricao: 'Autocrítico e busca constante melhoria' }
  }
};

