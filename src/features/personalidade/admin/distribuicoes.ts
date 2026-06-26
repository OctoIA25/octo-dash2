/**
 * Mapeia os stats agregados (shape do testesEstatisticasService) para itens de
 * distribuição com nomes humanos — sem jargão cru. Só apresentação.
 */

import { DISC_PROFILES } from '@/data/discQuestions';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import { MBTI_TIPOS } from '@/data/mbtiQuestions';
import type { DISCStats, EneagramaStats, MBTIStats } from '@/services/testesEstatisticasService';
import type { ItemDistribuicao } from './components/DistribuicaoBarras';

const ORDEM_DISC = ['D', 'I', 'S', 'C'] as const;

function nomeDisc(letra: string): string {
  const n = DISC_PROFILES[letra]?.nome ?? letra;
  return n.charAt(0) + n.slice(1).toLowerCase();
}

export function distDisc(stats: DISCStats): { itens: ItemDistribuicao[]; destaque?: string } {
  const itens = ORDEM_DISC.map((l) => ({ chave: l, rotulo: nomeDisc(l), count: stats.distribuicao[l]?.count ?? 0 }));
  const destaque = [...itens].sort((a, b) => b.count - a.count)[0]?.chave;
  return { itens, destaque };
}

export function distEneagrama(stats: EneagramaStats): { itens: ItemDistribuicao[]; destaque?: string } {
  const itens: ItemDistribuicao[] = [];
  for (let t = 1; t <= 9; t++) {
    const count = (stats.distribuicao as Record<number, { count: number }>)[t]?.count ?? 0;
    itens.push({ chave: String(t), rotulo: ENEAGRAMA_TIPOS[t]?.nome ?? `Tipo ${t}`, count });
  }
  const destaque = [...itens].sort((a, b) => b.count - a.count)[0]?.chave;
  return { itens, destaque };
}

export function distMbti(stats: MBTIStats): { itens: ItemDistribuicao[]; destaque?: string } {
  // Só os tipos com ao menos 1 pessoa, ordenados por frequência (16 itens vazios
  // numa lista seria ruído — mostramos quem a equipe realmente tem).
  const itens = Object.entries(stats.distribuicao)
    .map(([cod, v]) => ({ chave: cod, rotulo: MBTI_TIPOS[cod]?.nome ?? cod, count: (v as { count: number }).count ?? 0 }))
    .filter((i) => i.count > 0)
    .sort((a, b) => b.count - a.count);
  const destaque = itens[0]?.chave;
  return { itens, destaque };
}

export interface CorretorEquipe {
  id: number;
  nome: string;
  discTipo?: string;       // 'D'|'I'|'S'|'C'
  eneagramaTipo?: number;  // 1-9
  mbtiTipo?: string;       // 'INTJ-A'
  chips: string[];         // nomes humanos dos perfis que tem
  totalFeitos: number;
}

/**
 * Funde os 3 `corretoresPorTipo` num único mapa por corretor, com chips humanos.
 * Cada corretor aparece sob seu tipo em cada metodologia que fez.
 */
export function unirCorretores(
  disc: DISCStats | null,
  eneagrama: EneagramaStats | null,
  mbti: MBTIStats | null,
): CorretorEquipe[] {
  const mapa = new Map<number, CorretorEquipe>();

  const get = (id: number, nome: string): CorretorEquipe => {
    let c = mapa.get(id);
    if (!c) {
      c = { id, nome, chips: [], totalFeitos: 0 };
      mapa.set(id, c);
    }
    return c;
  };

  if (disc) {
    for (const [tipo, lista] of Object.entries(disc.corretoresPorTipo)) {
      for (const cor of lista) {
        const c = get(cor.id, cor.nome);
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
        c.mbtiTipo = (cor as { tipo?: string }).tipo ?? tipo;
        const base = (c.mbtiTipo ?? tipo).split('-')[0];
        c.chips.push(MBTI_TIPOS[base]?.nome ?? base);
        c.totalFeitos++;
      }
    }
  }

  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}
