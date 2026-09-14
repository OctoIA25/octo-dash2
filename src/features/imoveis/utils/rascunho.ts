/**
 * Rascunho de imóvel: cadastro salvo incompleto, ainda fora do fluxo de aprovação.
 *
 * Ciclo em `imoveis_locais.status_aprovacao` (migration 20260915_imovel_rascunho):
 *   rascunho → aguardando → aprovado | nao_aprovado
 *
 * Portal, feeds e anon já exigem `aprovado`, então o rascunho nunca sai daqui.
 * Quem lê a tabela internamente (catálogo, KPIs, relatórios) exclui com `ehRascunho`.
 */
export const STATUS_RASCUNHO = 'rascunho';

export type StatusAprovacaoImovel = 'rascunho' | 'aguardando' | 'aprovado' | 'nao_aprovado';

export const ehRascunho = (imovel: { status_aprovacao?: string | null } | null | undefined): boolean =>
  imovel?.status_aprovacao === STATUS_RASCUNHO;
