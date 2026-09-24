/**
 * Quantos leads PASSARAM por cada etapa — e não quantos estão parados nela.
 *
 * Pedido do chefe em 23/09:
 *
 *   "a ideia é batermos o olho mas não saber somente quantos temos naquele
 *    exato momento naquela etapa, mas sim os que passaram, assim consigo saber
 *    quantas visitas tive no período, e o número continua ali mesmo que o lead
 *    tenha migrado para a etapa de negociação"
 *
 * A fonte é `lead.stage_changed`, que guarda `de` e `para`. Conta-se lead
 * DISTINTO, não evento: um lead que vai e volta da mesma etapa passou por ela
 * uma vez, e contar duas inflaria a taxa de conversão — que é justamente o
 * número que ele quer confiar.
 *
 * ============================================================
 * O QUE ESTE NÚMERO NÃO SABE, E PRECISA DIZER
 * ============================================================
 *
 * O registro de eventos começa em 10/09/2026. Lead que passou por uma etapa
 * antes disso não deixou rastro, e nenhuma conta aqui o inventa. Medido na
 * Lotus em 24/09: "Interação" tem 1039 parados agora e 162 que passaram desde
 * o início do registro — a diferença não é perda, é história anterior.
 *
 * Por isso `inicioDoHistorico` sai junto da contagem: um número de "passaram"
 * sem a data em que a contagem começa é um número que parece menor do que a
 * realidade, e ninguém tem como saber disso olhando.
 */

/** Um lead conta uma vez por etapa, por mais que tenha ido e voltado. */
export function contarPassaramPorEtapa(eventos = [], etapas = []) {
  const porEtapa = new Map(etapas.map((e) => [e, new Set()]));

  for (const ev of eventos) {
    const destino = ev?.para;
    if (!destino) continue;
    const balde = porEtapa.get(destino);
    // Etapa que não está na lista do funil é ignorada em silêncio: o enum de
    // etapas muda, e um evento antigo com nome que não existe mais não pode
    // derrubar a contagem inteira.
    if (!balde) continue;
    if (ev.lead_id) balde.add(ev.lead_id);
  }

  return etapas.map((e) => porEtapa.get(e)?.size ?? 0);
}

/**
 * Desde quando dá para responder "quantos passaram".
 *
 * Devolve `null` quando não há evento nenhum — e aí a tela mostra só o
 * "parados agora", em vez de um zero que pareceria "ninguém passou".
 */
export function inicioDoHistorico(eventos = []) {
  let menor = null;
  for (const ev of eventos) {
    const t = ev?.created_at ? Date.parse(ev.created_at) : NaN;
    if (!Number.isFinite(t)) continue;
    if (menor === null || t < menor) menor = t;
  }
  return menor === null ? null : new Date(menor).toISOString();
}
