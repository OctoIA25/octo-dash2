/**
 * Quem pode reler a planilha de vendas (03/10).
 *
 * Desde a ponte planilha → venda (20261027), cada linha que esta função grava
 * vira uma venda e um "a receber" no Financeiro. Até aqui ela aceitava a chave
 * pública do site — e uma planilha de qualquer endereço (`sourceUrl`). Agora:
 * o servidor (chave de serviço) pode tudo; uma pessoa precisa estar logada e
 * ver o Financeiro daquela imobiliária, e só relê a planilha configurada.
 */
export type Acesso = { ok: true } | { ok: false; status: number; error: string };

export function decidirAcesso(p: {
  ehServidor: boolean;
  usuarioLogado: boolean;
  podeVerFinanceiro: boolean;
  pediuOutraOrigem: boolean;
}): Acesso {
  if (p.ehServidor) return { ok: true };
  if (!p.usuarioLogado) return { ok: false, status: 401, error: "Faça login para reler a planilha." };
  if (!p.podeVerFinanceiro) {
    return { ok: false, status: 403, error: "Sem permissão para reler a planilha desta imobiliária." };
  }
  if (p.pediuOutraOrigem) {
    return { ok: false, status: 403, error: "Só o servidor troca a planilha de origem." };
  }
  return { ok: true };
}
