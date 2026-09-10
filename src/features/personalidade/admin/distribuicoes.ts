/**
 * Mapeia os stats agregados (shape do testesEstatisticasService) para itens de
 * distribuição com nomes humanos — sem jargão cru. Só apresentação.
 */

import { DISC_PROFILES } from '@/data/discQuestions';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import { MBTI_TIPOS } from '@/data/mbtiQuestions';
import type { DISCStats, EneagramaStats, MBTIStats } from '@/services/testesEstatisticasService';
import type { ItemDistribuicao } from './components/DistribuicaoBarras';
import type { PessoaDoRelatorio } from './montarUniverso';

const ORDEM_DISC = ['D', 'I', 'S', 'C'] as const;

/**
 * Chave do tipo a destacar como "mais comum".
 *
 * Devolve undefined quando o destaque seria mentira: ninguém fez o teste (todos
 * zerados) ou há empate no topo — nesses casos o "vencedor" seria apenas o
 * primeiro da ordenação, não um fato sobre a equipe.
 */
function maisComum(itens: ItemDistribuicao[]): string | undefined {
  const ordenados = [...itens].sort((a, b) => b.count - a.count);
  const topo = ordenados[0];
  if (!topo || topo.count === 0) return undefined;
  if (ordenados[1]?.count === topo.count) return undefined;
  return topo.chave;
}

function nomeDisc(letra: string): string {
  const n = DISC_PROFILES[letra]?.nome ?? letra;
  return n.charAt(0) + n.slice(1).toLowerCase();
}

export function distDisc(stats: DISCStats): { itens: ItemDistribuicao[]; destaque?: string } {
  const itens = ORDEM_DISC.map((l) => ({ chave: l, rotulo: nomeDisc(l), count: stats.distribuicao[l]?.count ?? 0 }));
  return { itens, destaque: maisComum(itens) };
}

export function distEneagrama(stats: EneagramaStats): { itens: ItemDistribuicao[]; destaque?: string } {
  const itens: ItemDistribuicao[] = [];
  for (let t = 1; t <= 9; t++) {
    const count = (stats.distribuicao as Record<number, { count: number }>)[t]?.count ?? 0;
    itens.push({ chave: String(t), rotulo: ENEAGRAMA_TIPOS[t]?.nome ?? `Tipo ${t}`, count });
  }
  return { itens, destaque: maisComum(itens) };
}

export function distMbti(stats: MBTIStats): { itens: ItemDistribuicao[]; destaque?: string } {
  // Só os tipos com ao menos 1 pessoa, ordenados por frequência (16 itens vazios
  // numa lista seria ruído — mostramos quem a equipe realmente tem).
  const itens = Object.entries(stats.distribuicao)
    .map(([cod, v]) => ({ chave: cod, rotulo: MBTI_TIPOS[cod]?.nome ?? cod, count: (v as { count: number }).count ?? 0 }))
    .filter((i) => i.count > 0)
    .sort((a, b) => b.count - a.count);
  return { itens, destaque: maisComum(itens) };
}

export interface CorretorEquipe {
  /** null quando a pessoa é membro do tenant mas não tem linha em `Corretores` */
  id: number | null;
  nome: string;
  discTipo?: string;       // 'D'|'I'|'S'|'C'
  eneagramaTipo?: number;  // 1-9
  mbtiTipo?: string;       // 'INTJ-A'
  chips: string[];         // nomes humanos dos perfis que tem
  totalFeitos: number;
  /** tem resultado mas não é mais membro do tenant */
  foraDaEquipe?: boolean;
  /** é membro mas não tem cadastro em `Corretores` — não consegue fazer os testes */
  semCadastro?: boolean;
}

/**
 * Funde os 3 `corretoresPorTipo` num único mapa por corretor, com chips humanos.
 * Cada corretor aparece sob seu tipo em cada metodologia que fez.
 *
 * O `universo` (ver montarUniverso) semeia a lista com todo mundo que o
 * relatório cobre, inclusive quem não fez nenhum teste: sem ele o card dizia
 * "faltam 15" e a lista abaixo mostrava só os 5 que fizeram, então o gestor não
 * conseguia ver de quem cobrar.
 */
export function unirCorretores(
  disc: DISCStats | null,
  eneagrama: EneagramaStats | null,
  mbti: MBTIStats | null,
  universo: PessoaDoRelatorio[] = [],
): CorretorEquipe[] {
  const mapa = new Map<number, CorretorEquipe>();
  const semCadastro: CorretorEquipe[] = [];

  // Com universo definido, ele é a lista fechada: criar entrada para um id que
  // ficou de fora (duplicata deduplicada, cadastro morto) faria a lista mostrar
  // mais gente do que o denominador conta — o card chegava a "2 de 1 fizeram".
  const listaFechada = universo.length > 0;

  const get = (id: number, nome: string): CorretorEquipe | undefined => {
    let c = mapa.get(id);
    if (!c) {
      if (listaFechada) return undefined;
      c = { id, nome, chips: [], totalFeitos: 0 };
      mapa.set(id, c);
    }
    return c;
  };

  for (const p of universo) {
    // Sem id não há como casar com resultado nenhum (o fluxo de teste indexa por
    // `Corretores.id`); essas pessoas entram direto, fora do mapa.
    if (p.id === null) {
      semCadastro.push({ id: null, nome: p.nome, chips: [], totalFeitos: 0, semCadastro: true });
      continue;
    }
    const c = mapa.get(p.id) ?? { id: p.id, nome: p.nome, chips: [], totalFeitos: 0 };
    if (p.foraDaEquipe) c.foraDaEquipe = true;
    mapa.set(p.id, c);
  }

  if (disc) {
    for (const [tipo, lista] of Object.entries(disc.corretoresPorTipo)) {
      for (const cor of lista) {
        const c = get(cor.id, cor.nome);
        if (!c) continue;
        c.discTipo = tipo;
        c.chips.push(nomeDisc(tipo));
        c.totalFeitos++;
      }
    }
  }
  if (eneagrama) {
    for (const [tipo, lista] of Object.entries(eneagrama.corretoresPorTipo)) {
      for (const cor of lista) {
        const c = get(cor.id, cor.nome);
        if (!c) continue;
        c.eneagramaTipo = Number(tipo);
        c.chips.push(ENEAGRAMA_TIPOS[Number(tipo)]?.nome ?? `Tipo ${tipo}`);
        c.totalFeitos++;
      }
    }
  }
  if (mbti) {
    for (const [tipo, lista] of Object.entries(mbti.corretoresPorTipo)) {
      for (const cor of lista) {
        const c = get(cor.id, cor.nome);
        if (!c) continue;
        c.mbtiTipo = (cor as { tipo?: string }).tipo ?? tipo;
        const base = (c.mbtiTipo ?? tipo).split('-')[0];
        c.chips.push(MBTI_TIPOS[base]?.nome ?? base);
        c.totalFeitos++;
      }
    }
  }

  // Quem fez aparece primeiro: com a lista completa, ordenar só por nome
  // enterraria os poucos resultados no meio de quem ainda não fez.
  return [...mapa.values(), ...semCadastro].sort(
    (a, b) => b.totalFeitos - a.totalFeitos || a.nome.localeCompare(b.nome),
  );
}
