/**
 * Resolução do nome do captador exibido no catálogo.
 *
 * Três fontes convivem hoje e precisam de ordem explícita:
 *   1. captador_id  — atribuição manual de owner/admin (imoveis_locais, condominios)
 *   2. imoveis_corretores — mapa código → corretor, derivado do XML Kenlo
 *   3. corretor_nome — o que veio direto no <corretor> do XML
 *
 * O passo 3 existe porque o merge antigo sobrescrevia corretor_nome
 * incondicionalmente e apagava o nome do XML em tenants sem imoveis_corretores.
 */

export const CAPTADOR_FILTRO_TODOS = 'todos';
export const CAPTADOR_FILTRO_SEM = '__sem_captador__';

export interface ResolverCaptadorParams {
  captadorId?: string | null;
  /** user_id → nome, vindo de useCaptadores */
  captadoresPorId: Record<string, string>;
  /** código do imóvel (maiúsculo) → nome, vindo de imoveis_corretores */
  corretorPorCodigo: Record<string, string>;
  codigo?: string | null;
  corretorNomeXml?: string | null;
}

export function resolverCaptador({
  captadorId,
  captadoresPorId,
  corretorPorCodigo,
  codigo,
  corretorNomeXml,
}: ResolverCaptadorParams): string | null {
  if (captadorId && captadoresPorId[captadorId]) {
    return captadoresPorId[captadorId];
  }

  const codigoNormalizado = codigo?.trim().toUpperCase();
  if (codigoNormalizado && corretorPorCodigo[codigoNormalizado]) {
    return corretorPorCodigo[codigoNormalizado];
  }

  return corretorNomeXml?.trim() || null;
}

export function matchCaptadorFilter(nome: string | null, filtro: string): boolean {
  if (filtro === CAPTADOR_FILTRO_TODOS) return true;
  if (filtro === CAPTADOR_FILTRO_SEM) return nome === null;
  return nome === filtro;
}
