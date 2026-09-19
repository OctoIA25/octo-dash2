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

/**
 * O que a Lia recebe de um lançamento — LISTA FECHADA, de propósito.
 *
 * O endpoint de detalhe consulta a linha inteira (`select('*')`), então é esta
 * função que decide o que sai. Coluna nova no banco NÃO entra sozinha no
 * payload: é preciso acrescentá-la aqui, de forma deliberada.
 *
 * Isso é o terceiro critério de pronto do item "construtora como cadastro":
 * "o payload que vai para a Lia não contém a comissão". A comissão padrão da
 * construtora é dado comercial interno — não vai para o agente, nem para o
 * site, nem para o corretor sem permissão.
 *
 * Estava DUPLICADA nos dois entrypoints (api-server e proxy-production), sem
 * teste nenhum, exatamente o risco contra o qual o cabeçalho deste arquivo já
 * avisava. Uma cópia só, com teste que trava a lista de campos.
 */
export const mapLancamentoFromDB = (row) => ({
  id: row.id,
  nome: row.nome,
  descricao: row.descricao || null,
  // Endereço do plantão (estande de vendas). null = não cadastrado:
  // nesse caso a Lia deve dizer que o corretor entrará em contato para
  // informar o endereço e combinar a melhor data.
  endereco_plantao: row.endereco_plantao || null,
  // Valor mínimo ("a partir de R$ ..."), não o preço da unidade. Sempre que
  // informar o valor, a Lia deve repetir `aviso_valor` junto — é o texto pronto
  // com a ressalva e a data dos dados. null = valor não cadastrado.
  valor_minimo: row.preco_texto || null,
  aviso_valor: avisoValorLancamento(row.preco_texto, row.updated_at),
  // Landing page do empreendimento. null = não cadastrado; a Lia não oferece link.
  site_url: row.site_url || null,
  book_pdf_url: row.book_pdf || null,
  book_pdf_filename: row.book_pdf_filename || null,
  fotos: (Array.isArray(row.fotos) ? row.fotos : []).map((f) => ({
    url: f?.url || null,
    legenda: f?.legenda || null,
    is_capa: !!f?.isCapa,
  })),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/** Os campos que `mapLancamentoFromDB` devolve. O teste trava esta lista. */
export const CAMPOS_DO_LANCAMENTO_PARA_A_LIA = [
  'id', 'nome', 'descricao', 'endereco_plantao', 'valor_minimo', 'aviso_valor',
  'site_url', 'book_pdf_url', 'book_pdf_filename', 'fotos', 'created_at', 'updated_at',
];
