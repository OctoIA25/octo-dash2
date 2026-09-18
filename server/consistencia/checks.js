/**
 * P0.6 — o teste diário que compara os totais.
 *
 * Módulo PURO: recebe contagens e devolve vereditos. Quem busca é index.js.
 * A separação é a mesma de tenantHealthLogic.js — a regra precisa ser testável
 * sem rede, porque é ela que decide se um número da Dash está mentindo.
 *
 * O QUE ESTAS CHECAGENS EXISTEM PARA PEGAR. Toda a leva de defeitos de 17 e
 * 18/09 tinha a mesma assinatura: um contador somava uma coluna vazia, ou
 * filtrava por um valor que a base nunca gravou, e devolvia um número
 * plausível — zero, quase sempre. Ninguém percebe um zero. As checagens abaixo
 * são as perguntas que teriam pego cada um deles no dia seguinte:
 *
 *   soma das etapas == total ............. funil que perde lead pelo caminho
 *   encaminhados <= total ................ contador que virou o total
 *   contatados <= total .................. taxa de atendimento acima de 100%
 *   venda: view == tabela ................ a fonte única divergindo da origem
 *   colunas vazias ....................... a causa raiz de todos os outros
 */

/**
 * As colunas que a Dash LÊ para produzir número e que PODEM ficar vazias.
 *
 * A lista não é genérica de propósito: são exatamente as colunas que quebraram
 * contadores em 17 e 18/09, mais as duas de que tudo o mais depende. Coluna
 * NOT NULL não entra — vigiar `proposals.value`, por exemplo, seria inútil: o
 * banco não a deixa vazia, e o problema real dela é outro (valor zero, que é
 * preenchimento, não defeito de código).
 */
export const COLUNAS_QUE_VIRAM_NUMERO = [
  { tabela: 'leads', coluna: 'status', porque: 'etapa do funil — base de quase todo contador' },
  { tabela: 'leads', coluna: 'assigned_agent_id', porque: 'quem é o corretor; vazia = "encaminhados" vira o total' },
  { tabela: 'leads', coluna: 'final_sale_value', porque: 'alimentava vendas e VGV — encontrada 100% vazia em 18/09' },
  { tabela: 'leads', coluna: 'property_value', porque: 'alimenta pipeline e valor médio — 100% vazia em 18/09' },
  { tabela: 'leads', coluna: 'property_type', porque: 'separa venda de locação — 100% vazia, a aba Locação zerava' },
  { tabela: 'leads', coluna: 'visit_date', porque: 'contava visitas — 100% vazia desde sempre' },
  { tabela: 'proposals', coluna: 'signed_at', porque: 'data da venda — VGV, VGC e ticket' },
];

const verdict = (nome, ok, esperado, obtido, detalhe) => ({ nome, ok, esperado, obtido, detalhe });

/**
 * O funil é exclusivo: cada lead está em exatamente uma etapa. Se a soma das
 * etapas não bate com o total, ou uma etapa some ou um lead é contado duas
 * vezes — os dois aparecem como número errado na tela, nunca como erro.
 */
export function checaSomaDoFunil({ porEtapa, totalLeads }) {
  const soma = Object.values(porEtapa || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  return verdict(
    'soma das etapas do funil bate com o total de leads',
    soma === totalLeads, totalLeads, soma,
    soma === totalLeads ? '' : `diferença de ${Math.abs(soma - totalLeads)} lead(s)`,
  );
}

/**
 * "Encaminhados aos corretores" era literalmente o total — na Imobiliária Japi
 * anunciava 2.553 com ZERO leads tendo corretor. Igualdade aqui é suspeita,
 * não erro: pode ser real numa imobiliária que atribui tudo.
 */
export function checaEncaminhados({ comCorretor, totalLeads }) {
  const ok = comCorretor <= totalLeads;
  const suspeito = totalLeads > 0 && comCorretor === totalLeads;
  return verdict(
    'leads com corretor não passam do total',
    ok, `<= ${totalLeads}`, comCorretor,
    !ok ? 'contador maior que a base' : suspeito ? 'igual ao total — confira se todo lead tem mesmo corretor' : '',
  );
}

/** Taxa de atendimento acima de 100% é o sintoma de numerador e denominador
 *  virem de recortes diferentes (ex.: arquivado num e não no outro). */
export function checaContatados({ contatados, totalLeads }) {
  const ok = contatados <= totalLeads;
  return verdict(
    'leads contatados não passam do total',
    ok, `<= ${totalLeads}`, contatados,
    ok ? '' : 'taxa de atendimento passaria de 100%',
  );
}

/**
 * A view de venda tem que continuar sendo a mesma coisa que a origem. Se
 * divergir, alguém mexeu num dos dois lados e as telas voltaram a discordar.
 * `null` em qualquer lado = não dá para verificar (a view pode não existir
 * ainda num ambiente), e isso NÃO é falha.
 */
export function checaVendaFonteUnica({ naView, naOrigem }) {
  if (naView == null || naOrigem == null) {
    return verdict('venda: a view bate com a origem', true, naOrigem, naView, 'não verificável neste ambiente');
  }
  return verdict(
    'venda: a view bate com a origem',
    naView === naOrigem, naOrigem, naView,
    naView === naOrigem ? '' : 'a fonte única divergiu de proposals',
  );
}

/**
 * A causa raiz de quase todos os defeitos desta leva. Uma coluna 100% vazia
 * que alimenta contador não quebra nada: o número simplesmente vira zero, e
 * zero passa por resposta.
 */
export function checaColunasVazias(preenchimento) {
  const vazias = (preenchimento || []).filter((c) => c.preenchidas === 0 && c.total > 0);
  return verdict(
    'nenhuma coluna que vira número está 100% vazia',
    vazias.length === 0, 0, vazias.length,
    vazias.map((c) => `${c.tabela}.${c.coluna} (${c.porque})`).join(' · '),
  );
}

/** Junta tudo. `ok` só é verdadeiro quando TODAS passam. */
export function montaRelatorio(entradas) {
  const checagens = [
    checaSomaDoFunil(entradas),
    checaEncaminhados(entradas),
    checaContatados(entradas),
    checaVendaFonteUnica(entradas),
    checaColunasVazias(entradas.preenchimento),
  ];
  return { ok: checagens.every((c) => c.ok), checagens };
}
