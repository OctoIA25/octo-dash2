/**
 * Significado fixo das letras/dimensões do MBTI. É conhecimento estável do modelo
 * (não dado do usuário), no mesmo espírito dos metadados estáticos já existentes
 * em MBTI_TIPOS. Serve para decompor "INTJ" em linguagem leiga, como pede o briefing.
 *
 * A 5ª dimensão (Identidade A/T) vem do 16personalities e é mantida aqui para
 * leitura humana das letras -A / -T.
 */

export interface PoloLetra {
  letra: string;
  nome: string;
  resumo: string; // como aparece no dia a dia
}

export interface DimensaoMBTI {
  /**
   * Identificador da dimensão. Deliberadamente em PT-BR e NÃO nos nomes do
   * 16personalities: lá `Mind` é a dimensão I/E e `Energy` é S/N, o inverso do
   * que os nomes sugerem, e essa ambiguidade já causou a exibição trocada.
   * Aqui a chave é só identidade da dimensão — não indexa percentual nenhum.
   */
  chave: 'energia' | 'mente' | 'natureza' | 'abordagem' | 'identidade';
  /** rótulo leigo da dimensão */
  rotulo: string;
  /** as duas pontas da dicotomia */
  polos: [PoloLetra, PoloLetra];
}

// Ordem das letras no código MBTI: [E/I][S/N][T/F][J/P], + Identidade (A/T).
export const DIMENSOES: DimensaoMBTI[] = [
  {
    chave: 'energia',
    rotulo: 'De onde vem sua energia',
    polos: [
      { letra: 'E', nome: 'Extroversão', resumo: 'Recarrega no convívio e pensa em voz alta.' },
      { letra: 'I', nome: 'Introversão', resumo: 'Recarrega na reflexão e processa por dentro.' },
    ],
  },
  {
    chave: 'mente',
    rotulo: 'Como você capta o mundo',
    polos: [
      { letra: 'S', nome: 'Sensação', resumo: 'Foca em fatos concretos e no presente.' },
      { letra: 'N', nome: 'Intuição', resumo: 'Foca em padrões, ideias e possibilidades.' },
    ],
  },
  {
    chave: 'natureza',
    rotulo: 'Como você decide',
    polos: [
      { letra: 'T', nome: 'Razão', resumo: 'Decide pela lógica e pela coerência.' },
      { letra: 'F', nome: 'Sentimento', resumo: 'Decide pelo impacto nas pessoas e valores.' },
    ],
  },
  {
    chave: 'abordagem',
    rotulo: 'Como você se organiza',
    polos: [
      { letra: 'J', nome: 'Julgamento', resumo: 'Prefere planejar e fechar decisões.' },
      { letra: 'P', nome: 'Percepção', resumo: 'Prefere manter opções em aberto e improvisar.' },
    ],
  },
  {
    chave: 'identidade',
    rotulo: 'Como você lida com pressão',
    polos: [
      { letra: 'A', nome: 'Assertivo', resumo: 'Mantém a confiança e a calma sob estresse.' },
      { letra: 'T', nome: 'Turbulento', resumo: 'É mais autocrítico e sensível ao estresse.' },
    ],
  },
];

/**
 * Resolve qual pólo a pessoa expressa a partir do código do tipo (ex.: "INTJ-A").
 *
 * O código é a única fonte: o percentual costumava servir de desempate
 * (`>= 50 ? a : b`), mas ele nunca foi medido de verdade — era constante derivada
 * da própria letra —, e usá-lo já produziu dimensões invertidas na releitura.
 */
export function poloAtivo(dim: DimensaoMBTI, codigo: string): PoloLetra {
  const cod = codigo.toUpperCase();
  const [a, b] = dim.polos;

  // Identidade (A/T) é o sufixo do código (ex.: "INTJ-A"). Tratada à parte porque
  // a letra T também aparece na dimensão Nature, gerando ambiguidade num includes().
  if (dim.chave === 'identidade') return cod.endsWith('-T') ? b : a;

  // As 4 primeiras letras vêm da base do tipo (antes do "-"); cada pólo só pode
  // ocupar sua posição, então checar presença na base é seguro.
  const base = cod.split('-')[0];
  if (base.includes(b.letra)) return b;
  return a;
}
