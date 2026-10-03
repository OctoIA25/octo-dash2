/**
 * Quem abre a Conferência de vendas (decidido em 03/10): quem cuida do dinheiro
 * e o Gerente. O Gerente cria venda, parcela e marca parcela recebida; o resto
 * do dinheiro — folha de repasse, nota anexada, releitura da planilha, trazer
 * assinadas — continua com quem tem o Financeiro, e por isso SOME da tela dele
 * em vez de falhar no clique. O banco confere a mesma regra
 * (`vendas_pode_editar` e `financeiro_pode_ver`); isto aqui é só a tela.
 */
export interface QuemAcessa {
  isOwner?: boolean;
  /** Tem a permissão de menu `financeiro` (cargo Diretoria, admin). */
  podeFinanceiro: boolean;
  systemRole?: string | null;
}

export const podeMexerNoDinheiro = (q: QuemAcessa) => !!q.isOwner || q.podeFinanceiro;

export const podeAbrirConferencia = (q: QuemAcessa) =>
  podeMexerNoDinheiro(q) || q.systemRole === 'team_leader';
