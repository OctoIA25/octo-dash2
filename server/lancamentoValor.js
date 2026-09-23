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
 * A NOTA ACIMA FOI RESOLVIDA EM 23/09. Ela dizia: "a data é a do último save do
 * lançamento (foto, book, qualquer campo), não a do último reajuste de preço;
 * se precisar da validade do preço em si, criar uma coluna
 * `preco_atualizado_em` e trocar a origem aqui".
 *
 * A coluna nasceu com as tipologias (P2.1). Agora, quando o lançamento tem
 * tipologia cadastrada, a data do aviso é a do PREÇO — e não a do dia em que
 * alguém trocou uma foto. Sem tipologia, continua caindo no `updated_at`, que
 * é o que existia.
 */

/**
 * DD/MM no fuso de Brasília. null quando a data não existe ou é inválida.
 *
 * DATA PURA (`2026-09-20`) É ANCORADA AO MEIO-DIA. `new Date('2026-09-20')` é
 * meia-noite em UTC, que em Brasília é 21h do DIA 19 — e a conversão jogava a
 * data um dia para trás: um `preco_atualizado_em` de 20/09 saía como "valores
 * de 19/09" na boca da Lia. Meio-dia UTC é 09h em Brasília, mesmo dia, com
 * folga de 12 horas para qualquer fuso do país.
 *
 * O instante COMPLETO (`updated_at`) segue como estava: ali o fuso é a
 * diferença real entre "hoje à noite" e "amanhã de manhã".
 */
export const formatDiaMes = (iso) => {
  if (!iso) return null;
  const texto = String(iso);
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(texto);
  const d = new Date(soData ? `${texto}T12:00:00Z` : texto);
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

/** Dias corridos desde uma data. null quando a data não existe ou é inválida. */
export const diasDesde = (iso, agora = Date.now()) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((agora - t) / 86400000);
};

/** Acima disto, o preço é velho o bastante para a Lia ressalvar. */
export const DIAS_PARA_PRECO_ENVELHECER = 30;

/**
 * O aviso de valor quando existem TIPOLOGIAS — é o que o plano pede no P2.1:
 * "sempre dizer 'a partir de' e citar a data; se `preco_atualizado_em` tiver
 * mais de 30 dias, acrescentar 'sujeito a confirmação com o corretor'".
 *
 * A data usada é a MAIS ANTIGA entre as tipologias disponíveis, não a mais
 * recente: se uma das três foi reajustada ontem e as outras há seis meses, o
 * conjunto que a Lia vai citar tem seis meses. Pegar a mais nova faria a
 * ressalva sumir justamente quando ela é mais necessária.
 */
export const avisoValorDasTipologias = (tipologias, agora = Date.now()) => {
  const comPreco = (tipologias || []).filter((t) => t?.disponivel && Number(t?.preco_a_partir) > 0);
  if (comPreco.length === 0) return null;

  const datas = comPreco.map((t) => t.preco_atualizado_em).filter(Boolean);
  // Sem data nenhuma não se afirma atualidade: a ressalva entra igual, porque
  // "não sabemos de quando é" é pior que "é de seis meses atrás".
  const maisAntiga = datas.length === comPreco.length
    ? datas.slice().sort()[0]
    : null;

  const base = 'Estes são os valores iniciais de cada tipologia e podem variar conforme a unidade escolhida.';
  const dia = formatDiaMes(maisAntiga);
  const idade = diasDesde(maisAntiga, agora);

  if (!dia) return `${base} Sujeito a confirmação com o corretor.`;
  const frase = `${base} Valores de ${dia}.`;
  return idade !== null && idade > DIAS_PARA_PRECO_ENVELHECER
    ? `${frase} Sujeito a confirmação com o corretor.`
    : frase;
};

/**
 * Uma tipologia como a Lia a recebe. LISTA FECHADA, pelo mesmo motivo do
 * lançamento: coluna nova no banco não entra sozinha.
 *
 * `unidades_disponiveis` fica de FORA de propósito. É número que envelhece em
 * horas, e a Lia falando "restam 2 unidades" para um cliente cria uma promessa
 * que a corretora não controla.
 */
export const mapTipologiaParaLia = (t) => ({
  nome: t.nome,
  dormitorios: t.dormitorios ?? null,
  suites: t.suites ?? null,
  banheiros: t.banheiros ?? null,
  vagas: t.vagas ?? null,
  area_privativa_m2: t.area_privativa_m2 ?? null,
  preco_a_partir: t.preco_a_partir ?? null,
  preco_atualizado_em: t.preco_atualizado_em ?? null,
  disponivel: t.disponivel !== false,
  planta_url: t.planta_url || null,
  observacao: t.observacao || null,
});

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
export const mapLancamentoFromDB = (row, tipologias = null) => ({
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
  /**
   * As tipologias (P2.1). `null` = o chamador não as buscou; `[]` = buscou e
   * não há nenhuma. A Lia precisa distinguir: com `null` ela não deve afirmar
   * que o empreendimento não tem tipologia.
   *
   * ANTES DISTO, a Lia não recebia dormitório, metragem nem tipologia de lugar
   * NENHUM — os campos não estavam no payload. Ela respondia a partir do texto
   * livre de `descricao` e `valor_minimo`.
   */
  tipologias: tipologias === null ? null : tipologias.map(mapTipologiaParaLia),
  /**
   * O aviso de preço das tipologias, quando elas existem. Traz a ressalva de
   * "sujeito a confirmação" quando o preço passou de 30 dias, que é a regra
   * que o plano define para a Lia.
   */
  aviso_valor_tipologias: tipologias && tipologias.length
    ? avisoValorDasTipologias(tipologias)
    : null,
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
  'tipologias', 'aviso_valor_tipologias',
  'site_url', 'book_pdf_url', 'book_pdf_filename', 'fotos', 'created_at', 'updated_at',
];

/** Os campos de CADA tipologia. O teste trava esta lista também. */
export const CAMPOS_DA_TIPOLOGIA_PARA_A_LIA = [
  'nome', 'dormitorios', 'suites', 'banheiros', 'vagas', 'area_privativa_m2',
  'preco_a_partir', 'preco_atualizado_em', 'disponivel', 'planta_url', 'observacao',
];
