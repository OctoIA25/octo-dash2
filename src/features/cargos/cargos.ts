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
/**
 * A MATRIZ: permissão nas linhas, cargo nas colunas — pedido do chefe em
 * 25/09, com a print do CORE ao lado: "assim dá pra ver melhor quem pode fazer
 * o que, sem necessariamente abrir elas".
 *
 * A tela de hoje mostra um cartão por cargo, e responder "quem aprova
 * desconto?" exige abrir os seis e comparar de cabeça. A matriz responde de
 * relance — e, o que importa mais, mostra a LINHA VAZIA: a permissão que
 * ninguém tem salta aos olhos, e é a que costuma ser esquecida.
 *
 * Função pura, fora do componente, porque é a parte que pode errar em
 * silêncio: uma coluna fora de ordem põe o check do Corretor na coluna da
 * Diretoria, e a tela continua bonita.
 */
export interface LinhaDaMatriz {
  permissao: PermissaoDoCatalogo;
  /** Na MESMA ordem de `cargos`. A tela casa por índice. */
  tem: boolean[];
  /** Nenhum cargo tem esta permissão. Falso quando não há cargo nenhum. */
  ninguem: boolean;
}

export interface BlocoDaMatriz {
  modulo: string;
  em_uso: boolean;
  linhas: LinhaDaMatriz[];
}

export function matrizDeCargos(
  catalogo: PermissaoDoCatalogo[],
  cargos: Cargo[],
): BlocoDaMatriz[] {
  const lista = cargos ?? [];
  // `Set` por cargo, e não `includes` dentro do laço: com 33 permissões e 6
  // cargos são 198 buscas, e a lista de permissões de um cargo chega a 20.
  const tidos = lista.map((c) => new Set(c.permissoes ?? []));

  return agruparPorModulo(catalogo).map((g) => ({
    modulo: g.modulo,
    em_uso: g.em_uso,
    linhas: g.permissoes.map((permissao) => {
      const tem = tidos.map((s) => s.has(permissao.codigo));
      return {
        permissao,
        tem,
        ninguem: tem.length > 0 && tem.every((t) => !t),
      };
    }),
  }));
}

/**
 * Quantas permissões ninguém tem. A tela diz o número em vez de deixar quem
 * olha descobrir contando linha por linha — e é o número que costuma revelar
 * um cargo esquecido no meio de uma migração.
 */
/**
 * Quantas permissões nenhum cargo tem — separando as que fariam diferença.
 *
 * Contar as duas juntas seria enganoso no número mais visível da tela: hoje
 * são 20 órfãs, mas 17 delas são as inertes, que ninguém marca porque não
 * fariam nada mesmo. Quem lê "20 permissões ninguém tem" sai procurando um
 * problema que é, quase todo, a lista de inertes já conhecida. As `com_efeito`
 * são as poucas que valem uma olhada: uma tela que existe e ninguém alcança.
 */
export function permissoesSemNinguem(blocos: BlocoDaMatriz[]): { total: number; com_efeito: number } {
  let total = 0;
  let com_efeito = 0;
  for (const b of blocos ?? []) {
    for (const l of b.linhas) {
      if (!l.ninguem) continue;
      total += 1;
      if (l.permissao.em_uso) com_efeito += 1;
    }
  }
  return { total, com_efeito };
}

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
