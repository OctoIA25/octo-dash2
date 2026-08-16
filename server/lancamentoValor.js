/**
 * Aviso de valor do lançamento — texto pronto para a Lia repetir.
 *
 * Fica fora das rotas porque os dois entrypoints (api-server e proxy-production)
 * expõem /api/v1/lancamentos com o mesmo mapper; módulo compartilhado evita as
 * duas versões divergirem (já custou caro neste repo).
 *
 * `preco_texto` é o valor MÍNIMO do empreendimento ("a partir de R$ ..."), não o
 * preço da unidade — a Lia precisa dizer isso junto, senão o lead entende como
 * preço fechado. A data vem de `updated_at` do lançamento.
 *
 * ponytail: a data é a do último save do lançamento (foto, book, qualquer campo),
 * não a do último reajuste de preço. Se precisar da validade do preço em si,
 * criar uma coluna `preco_atualizado_em` e trocar a origem aqui.
 */

/** DD/MM no fuso de Brasília. null quando a data não existe ou é inválida. */
export const formatDiaMes = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
};

/**
 * Frase que a Lia repete ao informar o valor. null quando não há valor cadastrado
 * (sem valor não há o que ressalvar).
 */
export const avisoValorLancamento = (precoTexto, updatedAt) => {
  if (!precoTexto || !String(precoTexto).trim()) return null;
  const dia = formatDiaMes(updatedAt);
  const base = 'Este é o valor mínimo do empreendimento e pode variar conforme o imóvel escolhido.';
  return dia ? `${base} Dados atualizados em ${dia}.` : base;
};
