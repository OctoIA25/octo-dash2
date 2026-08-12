/**
 * Classifica um lead do Bolsão como sendo de LANÇAMENTO ou de IMÓVEL PRONTO.
 *
 * A regra é decidida pelo PORTAL de origem, com o código do imóvel entrando só
 * onde o portal não basta:
 *
 *  - Santa Ângela é uma integração exclusiva de lançamentos — **decisão de negócio
 *    do Victor, 12/ago/2026**, comunicada diretamente à implementação e ratificada
 *    no review do mesmo dia. É premissa de negócio, não inferência de dado: todo
 *    lead dela é lançamento, tenha código ou não. Medição da época, consistente
 *    com a premissa: 517 leads, 406 com código de empreendimento, 111 sem código,
 *    ZERO com código que não fosse empreendimento.
 *  - ZAP/OLX mandam `clientListingId` (ex.: 'S1KUFJ'), id opaco de anúncio
 *    externo que não identifica nada no nosso catálogo — não dá para afirmar nada.
 *  - Os demais (Kenlo, Manual, site próprio) gravam referência do catálogo
 *    próprio: código presente é imóvel pronto de verdade.
 *
 * `indefinido` é sempre visível para todos — é a direção fail-open desta feature.
 *
 * ⚠️ Se um dia a Santa Ângela passar a trazer imóvel pronto, esta função vira
 * mentira silenciosa para ~70% dos leads do tenant. O sinal de alerta seria
 * `bolsao.codigo` da Santa Ângela deixando de casar com `lancamentos.nome` — o
 * histórico dessa checagem está na spec, junto com a versão que a usava.
 *
 * Ver docs/superpowers/specs/2026-08-12-classificacao-lead-bolsao-design.md
 */

import { ATUACAO_TIPOS, atuacoesDe, type AtuacaoTipo } from '@/types/permissions';

export type TipoLead = 'lancamento' | 'pronto' | 'indefinido';

export { ATUACAO_TIPOS, atuacoesDe, type AtuacaoTipo };

/** Portais cuja integração traz exclusivamente lançamentos. */
const PORTAIS_SO_LANCAMENTO = ['santa angela'];

/**
 * Mesmo idioma de normalização de `stageBridge.ts`, mais o colapso de espaços.
 */
export const normalizar = (valor: string | null | undefined): string =>
  (valor == null ? '' : String(valor))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function classificarLead(
  codigo: string | null | undefined,
  portal: string | null | undefined,
): TipoLead {
  const p = normalizar(portal);

  if (PORTAIS_SO_LANCAMENTO.includes(p)) return 'lancamento';

  // Sem código nenhum não há o que afirmar sobre o assunto do lead.
  if (!normalizar(codigo)) return 'indefinido';

  // Código existe, mas o namespace é opaco: não prova nada.
  if (p.includes('zap') || p.includes('olx')) return 'indefinido';

  return 'pronto';
}

export interface LinhaClassificavel {
  codigo?: string | null;
  portal?: string | null;
}

/**
 * Filtra o que o corretor vê no Bolsão. `indefinido` aparece sempre, para todos.
 *
 * Os curto-circuitos são fail-open de propósito: o pior caso desta feature é
 * esconder lead de quem deveria vê-lo, então qualquer dúvida devolve a lista
 * inteira.
 *
 * ponytail: nenhum lead é classificado como "alugado" ainda — o bolsão não
 * espelha sinal de venda/locação (o candidato é interest_is_rent/interest_type
 * de leads/kenlo_leads). Até lá, quem marca só "Alugados" vê o mesmo que
 * "Imóveis prontos"; quando o sinal existir, classificarLead ganha o tipo
 * 'alugado' e este filtro aperta sozinho.
 */
/**
 * Monta as opções de `filtrarPorAtuacao` a partir de quem está logado.
 *
 * Existe separado do componente para que a decisão "quem é filtrado" tenha teste:
 * só `role = 'corretor'` é filtrado, e só quando a atuação dele restringe alguma
 * coisa. Admin, owner e team_leader veem o Bolsão inteiro — quem gerencia precisa
 * enxergar o que está parado.
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

  const veLancamento = opts.atuacoes.includes('lancamentos');
  const vePronto = opts.atuacoes.includes('prontos') || opts.atuacoes.includes('alugados');

  return linhas.filter((linha) => {
    const tipo = classificarLead(linha.codigo, linha.portal);
    if (tipo === 'indefinido') return true;
    return tipo === 'lancamento' ? veLancamento : vePronto;
  });
}
