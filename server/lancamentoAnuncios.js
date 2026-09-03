/**
 * De-para anúncio do portal → código do lançamento (L001, L002, ...).
 *
 * POR QUE EXISTE
 * O ZAP/Grupo OLX manda `clientListingId` ('OFOUFJ') e `originListingId`
 * ('2894694297'). O primeiro é o que ia parar em `property_code` e não casa com
 * nada no nosso catálogo — por isso todo lead de ZAP era classificado como
 * `indefinido`. A equipe numera os anúncios de lançamento como L0NN, e a tabela
 * `lancamento_anuncios` liga um ao outro.
 *
 * A IDEIA ORIGINAL ERA LER O CÓDIGO DA DESCRIÇÃO DO ANÚNCIO — não dá. Medido no
 * lead de teste de 03/set/2026: o payload do Grupo OLX tem 14 campos e nenhum
 * deles carrega descrição ou título; o `message` é um texto que o próprio portal
 * monta com tipo, preço e endereço. `originListingId` é o que chega, é único por
 * anúncio, e é o que a planilha "relacao lancamentos" já traz na URL.
 *
 * Fica fora das rotas de propósito: proxy-production.js e api-server.js têm
 * cópias do normalizador do ZAP, e divergência entre as duas já custou caro
 * neste repo. Mesma razão de existir de leadClassification.js.
 */

/** `originListingId` no topo do body é como o Grupo OLX manda; as outras duas formas são defensivas. */
export const extrairOriginListingId = (body = {}) => {
  const bruto = body?.originListingId ?? body?.origin_listing_id ?? body?.extraData?.originListingId;
  const id = String(bruto ?? '').trim();
  return id || null;
};

/**
 * Um código explícito no body vence o de-para, pela mesma razão que já vence o
 * do portal no normalizador: quem manda `property_code` sabe o que quer. Hoje
 * nenhum payload do ZAP faz isso — a guarda existe para não quebrar o invariante
 * quando alguém chamar a rota à mão.
 */
export const temCodigoExplicito = (body = {}) =>
  Boolean(body?.property_code || body?.interest_reference || body?.codigo_imovel);

/**
 * Devolve o código do lançamento, ou null quando o anúncio não está no de-para.
 *
 * FALHA ABERTA: erro de banco vira null e o lead entra com o código do portal,
 * como entrava antes desta feature. Enriquecimento não pode custar um lead.
 */
export async function resolverCodigoLancamento(supabase, tenantId, body) {
  if (!tenantId || temCodigoExplicito(body)) return null;

  const originListingId = extrairOriginListingId(body);
  if (!originListingId) return null;

  const { data, error } = await supabase
    .from('lancamento_anuncios')
    .select('codigo')
    .eq('tenant_id', tenantId)
    .eq('origin_listing_id', originListingId)
    .maybeSingle();

  if (error) {
    console.error('❌ [lancamentoAnuncios] lookup falhou:', {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    });
    return null;
  }

  return data?.codigo || null;
}

/**
 * Troca o código do portal pelo do lançamento no lead já normalizado. O código
 * original não se perde: `clientListingId` e `originListingId` continuam em
 * `raw_data.original_request`.
 */
export async function enriquecerComCodigoLancamento(supabase, tenantId, rawBody, leadNormalizado) {
  const codigo = await resolverCodigoLancamento(supabase, tenantId, rawBody);
  if (!codigo) return leadNormalizado;

  console.log(`🏗️  Lançamento identificado pelo anúncio: ${extrairOriginListingId(rawBody)} → ${codigo}`);
  return {
    ...leadNormalizado,
    property_code: codigo,
    interest_reference: codigo,
    interest_type: 'property',
  };
}
