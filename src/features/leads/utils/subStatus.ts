/**
 * De quem é a bola: o sub-status do atendimento (P1.5).
 *
 * Decidido pelo chefe em 20/09/2026: os três estados do plano falam da
 * PASSAGEM do lead, não de esforço. "Com corretor" significa que o corretor
 * TEM o lead; se ele trabalhou ou não, quem responde é o selo de dias parado.
 *
 * A leitura descartada exigia prova de trabalho, e hoje poria 1.557 dos 1.680
 * cards em "Aguardando corretor" — a tela afirmando que a equipe não toca em
 * lead nenhum, quando o que falta é registro de ligação e de WhatsApp pessoal.
 */

export type SubStatus = 'com_lia' | 'aguardando_corretor' | 'com_corretor' | 'sem_ninguem';

export interface SeloDeSubStatus {
  estado: SubStatus;
  texto: string;
  explicacao: string;
  classe: string;
}

/**
 * O texto que o sistema grava quando NÃO há corretor.
 *
 * O campo nunca chega vazio: quando ninguém foi atribuído, vem esta frase.
 * Foi assim que o card "Encaminhados Aos Corretores" anunciou 2.553 leads
 * encaminhados numa imobiliária onde nenhum lead tem corretor.
 */
const SEM_CORRETOR = 'não atribuído';

export function temCorretor(nome: string | null | undefined): boolean {
  const n = String(nome ?? '').trim();
  return n !== '' && n.toLowerCase() !== SEM_CORRETOR;
}

const SELOS: Record<SubStatus, Omit<SeloDeSubStatus, 'estado'>> = {
  com_lia: {
    texto: 'Com a Lia',
    explicacao: 'A Lia está atendendo este lead e ainda não passou para um corretor.',
    classe: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  },
  aguardando_corretor: {
    texto: 'Aguardando corretor',
    explicacao: 'A Lia já passou este lead, mas ele ainda não tem corretor.',
    classe: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  com_corretor: {
    texto: 'Com o corretor',
    explicacao: 'O lead está com um corretor. Se ele foi trabalhado é outra pergunta — quem responde é o selo de dias parado.',
    classe: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  sem_ninguem: {
    texto: 'Sem ninguém',
    explicacao: 'Não tem corretor e a Lia não encostou. É um lead que ninguém está atendendo.',
    classe: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  },
};

/**
 * Em que estado o lead está.
 *
 * A ordem das perguntas é a decisão: ter corretor vence tudo. Um lead que a
 * Lia passou E que já tem corretor está COM O CORRETOR — chamá-lo de
 * "aguardando" faria o gestor cobrar uma entrega que já aconteceu.
 */
export function subStatusDoLead(
  corretor: string | null | undefined,
  liaPassou?: boolean | null,
  liaAtendeu?: boolean | null
): SubStatus {
  if (temCorretor(corretor)) return 'com_corretor';
  if (liaPassou) return 'aguardando_corretor';
  if (liaAtendeu) return 'com_lia';
  return 'sem_ninguem';
}

/**
 * O selo a desenhar, ou `null` quando não há o que dizer.
 *
 * "Com o corretor" não ganha selo no card: o nome do corretor já está ali,
 * duas linhas abaixo, e repetir a mesma informação em 98% dos cards é o que
 * transforma selo em paisagem. O selo aparece quando a bola NÃO está com
 * quem o card já mostra.
 */
export function seloDeSubStatus(
  corretor: string | null | undefined,
  liaPassou?: boolean | null,
  liaAtendeu?: boolean | null
): SeloDeSubStatus | null {
  const estado = subStatusDoLead(corretor, liaPassou, liaAtendeu);
  if (estado === 'com_corretor') return null;
  return { estado, ...SELOS[estado] };
}
