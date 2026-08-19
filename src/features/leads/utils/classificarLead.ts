/**
 * Filtro do Bolsão por atuação do corretor.
 *
 * A CLASSIFICAÇÃO NÃO É MAIS DERIVADA AQUI. Ela é gravada na entrada do lead
 * pelo trigger `classificar_lead` (migration 20260815) e chega pronta em
 * `bolsao.classification`. Este arquivo só traduz atuação → classificações
 * visíveis. Se aparecer uma regra de negócio aqui de novo, ela está no lugar
 * errado — existe fonte única no banco.
 *
 * Direção fail-open preservada: `null` (lead ainda não classificado) e
 * `indefinido` aparecem para todo mundo. O pior caso desta feature é esconder
 * lead de quem deveria vê-lo.
 *
 * Ver docs/superpowers/specs/2026-08-15-classificacao-lead-badges-design.md
 */

import { ATUACAO_TIPOS, atuacoesDe, type AtuacaoTipo } from '@/types/permissions';

export type TipoLead = 'lancamento' | 'pronto' | 'locacao' | 'indefinido';

export { ATUACAO_TIPOS, atuacoesDe, type AtuacaoTipo };

/** O que cada marcação de atuação habilita o corretor a ver. */
const VISIVEL_POR_ATUACAO: Record<AtuacaoTipo, TipoLead> = {
  lancamentos: 'lancamento',
  prontos: 'pronto',
  alugados: 'locacao',
};

/**
 * O que chega do banco na coluna `classification`. Desde a migration
 * 20260818 é `text[]` (um lead pode ser Lançamento E Locação), mas string
 * única continua no tipo: é o que devolvem as linhas ainda não migradas e os
 * payloads antigos da Lia. Todo consumidor lê por `classificacoesDe`.
 */
export type ValorClassificacao = string | string[] | null | undefined;

export interface LinhaClassificavel {
  classification?: ValorClassificacao;
}

/** Ordem canônica de gravação e exibição — a mesma de `SECOES_BOLSAO`. */
const ORDEM_CANONICA: readonly string[] = ['lancamento', 'pronto', 'locacao', 'indefinido'];

/**
 * Normaliza o valor cru em lista. Vazio (null, `[]`, string em branco) vira
 * `['indefinido']`: nenhum lead fica sem badge nem some de uma seção.
 * Valor desconhecido por este build é PRESERVADO — quem filtra depende disso
 * para continuar fail-open.
 */
export function classificacoesDe(valor: ValorClassificacao): string[] {
  const bruto = Array.isArray(valor) ? valor : [valor];
  const limpo = [...new Set(bruto.filter((v): v is string => typeof v === 'string' && v !== ''))];
  return limpo.length > 0 ? limpo : ['indefinido'];
}

/**
 * Liga/desliga uma classificação, devolvendo o array pronto para gravar.
 *
 * Duas regras, ambas do usuário: combinações são livres (Lançamento + Locação
 * é caso real), e 'indefinido' é exclusiva — é a AUSÊNCIA de classificação, e
 * desmarcar tudo volta para ela. A ordem canônica não é cosmética: o guard e o
 * espelho do bolsão comparam `NEW.classification IS DISTINCT FROM OLD`, e
 * arrays com a mesma marcação em ordens diferentes disparariam os dois à toa.
 */
export function toggleClassificacao(atual: ValorClassificacao, tipo: string): string[] {
  const marcadas = new Set(classificacoesDe(atual));
  if (tipo === 'indefinido') return ['indefinido'];

  marcadas.delete('indefinido');
  if (marcadas.has(tipo)) marcadas.delete(tipo);
  else marcadas.add(tipo);

  if (marcadas.size === 0) return ['indefinido'];
  return [...marcadas].sort((a, b) => ORDEM_CANONICA.indexOf(a) - ORDEM_CANONICA.indexOf(b));
}

/**
 * Monta as opções de `filtrarPorAtuacao` a partir de quem está logado.
 *
 * Existe separado do componente para que a decisão "quem é filtrado" tenha
 * teste: só `role = 'corretor'` é filtrado, e só quando a atuação dele
 * restringe alguma coisa. Admin, owner e team_leader veem o Bolsão inteiro —
 * quem gerencia precisa enxergar o que está parado.
 */
export function opcoesFiltroBolsao({
  isCorretor,
  permissions,
}: {
  isCorretor: boolean;
  permissions?: Record<string, unknown> | null;
}): { ativo: boolean; atuacoes: AtuacaoTipo[] } {
  const atuacoes = atuacoesDe(permissions);
  const atendeTudo = ATUACAO_TIPOS.every((t) => atuacoes.includes(t));
  return { ativo: isCorretor && !atendeTudo, atuacoes };
}

/**
 * Seções do Bolsão, na ordem de exibição. São as mesmas quatro classificações —
 * o Bolsão não tem vocabulário próprio, só rótulos comerciais.
 * `indefinido` por último: é a sobra (inclui `classification = null`).
 */
export const SECOES_BOLSAO: ReadonlyArray<{ tipo: TipoLead; titulo: string }> = [
  { tipo: 'lancamento', titulo: 'Venda de Lançamentos' },
  { tipo: 'pronto', titulo: 'Venda de Prontos' },
  { tipo: 'locacao', titulo: 'Locação' },
  { tipo: 'indefinido', titulo: 'Sem classificação' },
];

/**
 * Agrupa as linhas nas seções acima. Quem já passou por `filtrarPorAtuacao` só
 * tem grupo cheio no que a atuação dele permite ver — a UI renderiza apenas os
 * grupos não vazios, então o corretor de prontos nunca vê a seção de lançamentos.
 * Classificação nula ou desconhecida cai em `indefinido` (mesma direção fail-open).
 *
 * Lead com duas classificações aparece nas DUAS seções (decisão do Victor,
 * 18/ago/2026): é o que faz o corretor de locação enxergar no Bolsão dele o
 * lead marcado como Lançamento + Locação. Consequência aceita: a soma das
 * contagens por seção passa a ser maior que o total de leads.
 */
export function agruparPorSecao<T extends LinhaClassificavel>(
  linhas: ReadonlyArray<T>,
): Record<TipoLead, T[]> {
  const grupos: Record<TipoLead, T[]> = { lancamento: [], pronto: [], locacao: [], indefinido: [] };
  for (const linha of linhas) {
    const tipos = classificacoesDe(linha.classification);
    const conhecidos = tipos.filter((t) => t in grupos);
    // Só valores desconhecidos deste build: cai na sobra em vez de sumir.
    for (const tipo of conhecidos.length > 0 ? conhecidos : ['indefinido']) {
      grupos[tipo as TipoLead].push(linha);
    }
  }
  return grupos;
}

export interface LinhaComImovel {
  /** Referência do imóvel — na prática, o nome do condomínio em vários portais. */
  codigo?: string | null;
}

/**
 * Quem enxerga qual imóvel o lead procurou. Com o condomínio à mostra, o Bolsão
 * vira garimpo (corretor só pega lead de empreendimento de luxo) em vez de fila
 * por ordem de chegada. Owner, admin e team_leader continuam vendo — são eles
 * que precisam auditar o que está parado.
 */
export const podeVerImovelBolsao = (
  { isAdmin, systemRole }: { isAdmin: boolean; systemRole?: string | null },
): boolean => isAdmin || systemRole === 'team_leader';

/**
 * Apaga a referência do imóvel das linhas quando o usuário não pode vê-la.
 * Feito na LISTA, não em cada componente: card, modal de detalhes e formulário
 * de atividade leem todos o mesmo `codigo`, então esconder na origem cobre os
 * três de uma vez — e qualquer tela nova que apareça depois.
 */
export function ocultarImovelDoBolsao<T extends LinhaComImovel>(
  linhas: ReadonlyArray<T>,
  podeVer: boolean,
): T[] {
  return podeVer ? [...linhas] : linhas.map((linha) => ({ ...linha, codigo: null }));
}

export function filtrarPorAtuacao<T extends LinhaClassificavel>(
  linhas: ReadonlyArray<T>,
  opts: {
    /** false para admin/owner/team_leader: veem o Bolsão inteiro. */
    ativo: boolean;
    atuacoes: ReadonlyArray<AtuacaoTipo>;
  },
): T[] {
  if (!opts.ativo) return [...linhas];
  if (ATUACAO_TIPOS.every((t) => opts.atuacoes.includes(t))) return [...linhas];

  const visiveis = new Set<string>(['indefinido']);
  for (const atuacao of opts.atuacoes) visiveis.add(VISIVEL_POR_ATUACAO[atuacao]);

  // Basta UMA classificação visível: o lead marcado como Lançamento + Locação
  // é do corretor de lançamentos E do de locação, não de nenhum dos dois.
  return linhas.filter((linha) =>
    classificacoesDe(linha.classification).some((tipo) => {
      // Valor que este build não conhece: mostra. Fail-open.
      if (!ATUACAO_TIPOS.some((t) => VISIVEL_POR_ATUACAO[t] === tipo)) return true;
      return visiveis.has(tipo);
    }),
  );
}
