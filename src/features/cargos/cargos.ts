/**
 * Cargos com pacote de permissões (P4.1) — as contas, fora do componente.
 *
 * O item existe porque hoje a permissão é individual: medido em produção em
 * 21/09, são 13 combinações diferentes para 19 pessoas na Lotus. Cada pessoa
 * tem a sua, e contratar um corretor obriga a marcar catorze caixas à mão.
 *
 * A regra que atravessa o arquivo: CARGO É O PADRÃO, EXCEÇÃO É O DESVIO. Um
 * cargo por pessoa não é cargo — é a bagunça de hoje com nome novo. Por isso o
 * planejador abaixo escolhe poucos cargos e joga a diferença em exceções
 * individuais, que é o que o plano pede no passo 4.
 */

import type { SidebarPermission } from '@/types/permissions';

export interface PermissaoDoCatalogo {
  codigo: string;
  modulo: string;
  descricao: string;
  ordem: number;
  /** `false` = gravada e nunca lida pelo app. A tela precisa dizer isso. */
  em_uso: boolean;
}

export interface Cargo {
  id: string;
  nome: string;
  descricao: string;
  nivel_acesso: number;
  role: 'admin' | 'team_leader' | 'corretor';
  ativo: boolean;
  pessoas: number;
  permissoes: string[];
}

export interface QuadroDeCargos {
  cargos: Cargo[];
  sem_cargo: number;
  membros: number;
}

export const ROTULO_DO_PAPEL: Record<Cargo['role'], string> = {
  admin: 'Administrador',
  team_leader: 'Líder de equipe',
  corretor: 'Corretor',
};

/** O que cada papel pode, em uma linha. É o que a tela mostra ao escolher. */
export const O_QUE_O_PAPEL_PODE: Record<Cargo['role'], string> = {
  admin: 'Vê e edita os dados de toda a imobiliária, inclusive equipe e permissões.',
  team_leader: 'Vê os leads e os números da própria equipe, e gerencia a roleta.',
  corretor: 'Vê os próprios leads e imóveis.',
};

/** Os módulos na ordem em que a tela os mostra, com os em uso primeiro. */
export function agruparPorModulo(
  catalogo: PermissaoDoCatalogo[]
): Array<{ modulo: string; em_uso: boolean; permissoes: PermissaoDoCatalogo[] }> {
  const mapa = new Map<string, PermissaoDoCatalogo[]>();
  for (const p of catalogo ?? []) {
    const atual = mapa.get(p.modulo);
    if (atual) atual.push(p);
    else mapa.set(p.modulo, [p]);
  }
  return [...mapa.entries()]
    .map(([modulo, permissoes]) => ({
      modulo,
      // Um módulo é "em uso" quando ao menos uma permissão dele faz algo.
      em_uso: permissoes.some((p) => p.em_uso),
      permissoes: [...permissoes].sort((a, b) => a.ordem - b.ordem),
    }))
    .sort((a, b) => {
      if (a.em_uso !== b.em_uso) return a.em_uso ? -1 : 1;
      return (a.permissoes[0]?.ordem ?? 0) - (b.permissoes[0]?.ordem ?? 0);
    });
}

/**
 * Quantas permissões do cargo não fazem nada ainda.
 *
 * Marcar uma chave que nenhuma tela lê é pior que não ter a chave: quem a
 * desmarca acredita ter restringido. Medido em 21/09: das 33 permissões do
 * catálogo, 17 são gravadas e nunca lidas.
 */
export function semEfeito(cargo: Pick<Cargo, 'permissoes'>, catalogo: PermissaoDoCatalogo[]): number {
  const inertes = new Set((catalogo ?? []).filter((p) => !p.em_uso).map((p) => p.codigo));
  return (cargo?.permissoes ?? []).filter((c) => inertes.has(c)).length;
}

/** "6 abas · 2 pessoas" — o resumo da linha na lista. */
export function resumoDoCargo(c: Cargo): string {
  const p = c.permissoes?.length ?? 0;
  const n = c.pessoas ?? 0;
  return `${p} permiss${p === 1 ? 'ão' : 'ões'} · ${n} pessoa${n === 1 ? '' : 's'}`;
}

export interface MembroParaMigrar {
  user_id: string;
  nome: string;
  role: string;
  /** O que esta pessoa ALCANÇA HOJE, já pela regra em vigor. */
  abasHoje: SidebarPermission[];
}

export interface CargoSugerido {
  nome: string;
  role: 'admin' | 'team_leader' | 'corretor';
  nivel_acesso: number;
  permissoes: string[];
  membros: Array<{
    user_id: string;
    nome: string;
    /** O que precisa ser dado a mais para esta pessoa não perder nada. */
    da: string[];
    /** O que precisa ser tirado para ela não ganhar nada. */
    tira: string[];
  }>;
}

const PAPEIS: Array<{ role: 'admin' | 'team_leader' | 'corretor'; nome: string; nivel: number }> = [
  { role: 'admin', nome: 'Administrador', nivel: 30 },
  { role: 'team_leader', nome: 'Líder de equipe', nivel: 20 },
  { role: 'corretor', nome: 'Corretor', nivel: 10 },
];

/**
 * Propõe os cargos a partir de quem já existe.
 *
 * UM CARGO POR PAPEL, com o conjunto de abas MAIS COMUM daquele papel. Quem
 * não bate exato ganha exceção individual — dar e tirar.
 *
 * Por que o mais comum, e não a interseção ou a união: a interseção cria um
 * cargo pobre e enche todo mundo de exceções "dá"; a união cria um cargo rico
 * e enche todo mundo de exceções "tira". O mais comum é o que gera menos
 * exceção, que é a medida de um cargo bem escolhido.
 *
 * NINGUÉM PERDE E NINGUÉM GANHA ACESSO: as exceções são calculadas exatamente
 * para reproduzir o que cada pessoa alcança hoje.
 */
export function sugerirCargos(membros: MembroParaMigrar[]): CargoSugerido[] {
  const saida: CargoSugerido[] = [];

  for (const { role, nome, nivel } of PAPEIS) {
    const doPapel = (membros ?? []).filter((m) => m.role === role);
    if (doPapel.length === 0) continue;

    // A assinatura de cada pessoa, para achar a mais repetida.
    const contagem = new Map<string, number>();
    for (const m of doPapel) {
      const chave = [...new Set(m.abasHoje ?? [])].sort().join(',');
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    let melhor = '';
    let melhorN = -1;
    for (const [chave, n] of contagem) {
      // Empate: fica com o conjunto MAIOR. Entre dois igualmente comuns, o
      // maior produz exceções "tira", que são mais fáceis de conferir do que
      // descobrir que faltou dar uma aba a alguém.
      const ganha = n > melhorN || (n === melhorN && chave.length > melhor.length);
      if (ganha) { melhor = chave; melhorN = n; }
    }
    const doCargo = melhor ? melhor.split(',') : [];

    saida.push({
      nome, role, nivel_acesso: nivel, permissoes: doCargo,
      membros: doPapel.map((m) => {
        const tem = new Set(m.abasHoje ?? []);
        return {
          user_id: m.user_id,
          nome: m.nome,
          da: doCargo.length ? [...tem].filter((p) => !doCargo.includes(p)).sort() : [...tem].sort(),
          tira: doCargo.filter((p) => !tem.has(p as SidebarPermission)).sort(),
        };
      }),
    });
  }

  return saida;
}

/** Quantas exceções o plano de migração vai criar, ao todo. */
export function totalDeExcecoes(sugeridos: CargoSugerido[]): number {
  return (sugeridos ?? []).reduce(
    (s, c) => s + c.membros.reduce((x, m) => x + m.da.length + m.tira.length, 0),
    0
  );
}

/** Quantas pessoas ficam sem exceção nenhuma — a medida de um cargo bem escolhido. */
export function encaixamExato(sugeridos: CargoSugerido[]): { encaixam: number; total: number } {
  let encaixam = 0;
  let total = 0;
  for (const c of sugeridos ?? []) {
    for (const m of c.membros) {
      total += 1;
      if (m.da.length === 0 && m.tira.length === 0) encaixam += 1;
    }
  }
  return { encaixam, total };
}
