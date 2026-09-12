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
 *
 * Este é também o único funil por onde ZAP, Grupo OLX e Meta Lead Ads passam, e
 * por isso é aqui que se decide o que NÃO é código nosso — ver
 * `semCodigoDoCatalogo` no fim do arquivo.
 */
import { notificarUmaVez } from './notificacoes.js';

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
 * O de-para diz QUAL é o código do anúncio — não diz que ele é lançamento.
 * Desde 20260911 um anúncio pode ser amarrado a um imóvel pronto do cadastro
 * (o 2886878809 é o AP001), e quem decide o estágio é o código.
 *
 * Reusa a função do banco em vez de repetir a consulta: a mesma
 * `eh_codigo_catalogo` que a classificação usa, para não existirem duas noções
 * de "está no catálogo" divergindo em silêncio.
 *
 * Três respostas, não duas: `true`, `false` e `null` para "não deu para saber".
 * Quem chama escolhe o lado seguro, e os dois lados são opostos — a `atuacao`
 * erra para lançamento (status quo), o descarte do código erra para manter o
 * código (nunca apagar por causa de um erro de banco).
 */
async function ehCodigoDoCatalogo(supabase, tenantId, codigo) {
  const { data, error } = await supabase.rpc('eh_codigo_catalogo', {
    p_tenant: tenantId,
    p_codigo: codigo,
  });

  if (error) {
    console.error('❌ [lancamentoAnuncios] eh_codigo_catalogo falhou:', {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    });
    return null;
  }

  return data === true;
}

/**
 * Troca o código do portal pelo do anúncio no lead já normalizado. O código
 * original não se perde: `clientListingId` e `originListingId` continuam em
 * `raw_data.original_request`.
 *
 * `atuacao` só é marcada quando o código NÃO é do catálogo: lead de lançamento
 * não pode cair na roleta de imóvel pronto, e lead de imóvel pronto não pode
 * cair na de lançamento. O sinal antigo (`lancamento_id`) não serve aqui — o
 * de-para liga o anúncio a um CÓDIGO, não a uma linha de `lancamentos` —, então
 * a atuação vem explícita. Ela é sempre escrita pelo servidor: o normalizador
 * do ZAP monta um objeto de chaves fixas, nada do payload do portal chega aqui.
 */
export async function enriquecerComCodigoLancamento(supabase, tenantId, rawBody, leadNormalizado) {
  const codigo = await resolverCodigoLancamento(supabase, tenantId, rawBody);
  if (!codigo) return semCodigoDoCatalogo(supabase, tenantId, rawBody, leadNormalizado);

  const doCatalogo = await ehCodigoDoCatalogo(supabase, tenantId, codigo);
  console.log(
    `🏗️  Anúncio identificado: ${extrairOriginListingId(rawBody)} → ${codigo}`
    + ` (${doCatalogo === true ? 'imóvel do catálogo' : 'lançamento'})`,
  );

  return {
    ...leadNormalizado,
    property_code: codigo,
    interest_reference: codigo,
    interest_type: 'property',
    ...(doCatalogo === true ? {} : { atuacao: 'lancamentos' }),
  };
}

/**
 * O de-para não conhece o anúncio. Aqui se decide o que fazer com o código que o
 * PORTAL mandou — e a resposta é: só vale se for código nosso.
 *
 * POR QUE
 * `clientListingId` é o id do anúncio no publicador. Quando o anúncio saiu do
 * nosso feed VRSync ele É o `codigo_imovel` (AP679, CA0056). Quando foi publicado
 * por fora, o portal inventa um id ('I7V1GD') que não é imóvel nenhum — e ele ia
 * para `leads.property_code` como se fosse. O corretor via um código que não
 * existe, clicava e caía numa página em branco; o termo de comissão imprimia a
 * "unidade"; o relatório contava um imóvel fantasma.
 *
 * Sem código, o lead diz a verdade — "não sabemos qual imóvel é" — e a tela de
 * pendência do Bolsão continua sabendo qual anúncio é, porque lê o id do anúncio
 * de `raw_data`, não daqui.
 *
 * NÃO ADIVINHA NADA (mesma regra da 78b153b): não há tentativa de casar endereço
 * nem bairro. Ou o código é do catálogo, ou o lead entra sem código.
 *
 * FALHA ABERTA em tudo: erro de banco mantém o código como estava, e o aviso ao
 * admin nunca derruba a entrada do lead.
 */
async function semCodigoDoCatalogo(supabase, tenantId, rawBody, leadNormalizado) {
  // Código explícito no body vence, pela mesma razão que já vence o de-para:
  // quem manda `property_code` sabe o que quer.
  if (!tenantId || temCodigoExplicito(rawBody)) return leadNormalizado;

  const doPortal = String(leadNormalizado?.property_code ?? '').trim();
  let lead = leadNormalizado;

  if (doPortal) {
    // `false` explícito, não `!doCatalogo`: `null` é "não deu para saber", e um
    // erro de banco não pode apagar o código de um imóvel que existe.
    if ((await ehCodigoDoCatalogo(supabase, tenantId, doPortal)) !== false) return leadNormalizado;
    console.log(`🚫 Código do portal descartado: '${doPortal}' não é imóvel deste tenant`);
    lead = { ...leadNormalizado, property_code: null, interest_reference: null, interest_type: null };
  }

  await avisarAnuncioDesconhecido(supabase, tenantId, rawBody, lead);
  return lead;
}

/**
 * Um sino para o admin quando aparece anúncio que ninguém identificou.
 *
 * Uma vez por (tenant, anúncio) — os 8 anúncios abertos da Lótus somam 21 leads,
 * e 21 sinos seriam ruído, não aviso. A dedupe é a `chave` em metadata, a mesma
 * mecânica dos jobs de recrutamento (server/notificacoes.js).
 *
 * Sem o id do anúncio não há o que avisar nem como deduplicar: lead de portal
 * sem anúncio nenhum é outro problema, e um sino por lead seria exatamente o
 * ruído que a chave existe para evitar.
 */
async function avisarAnuncioDesconhecido(supabase, tenantId, rawBody, lead) {
  const anuncio = extrairOriginListingId(rawBody);
  if (!anuncio) return;

  const portal = lead?.portal || lead?.source || 'portal';
  try {
    const avisou = await notificarUmaVez(supabase, {
      tenantId,
      chave: `anuncio_desconhecido:${anuncio}`,
      titulo: 'Anúncio sem imóvel identificado',
      corpo: `O anúncio ${anuncio} (${portal}) mandou lead e não bate com nenhum imóvel do cadastro.`
        + ' Identifique em Leads › Bolsão para os próximos já entrarem certos.',
      linkType: 'bolsao',
      linkId: anuncio,
      extras: { origin_listing_id: anuncio, portal },
    });
    if (avisou) console.log(`🔔 Anúncio desconhecido avisado ao admin: ${anuncio} (${portal})`);
  } catch (err) {
    // Aviso não pode custar um lead. Mesma regra do lookup do de-para.
    console.error('❌ [lancamentoAnuncios] aviso de anúncio desconhecido falhou:', err?.message);
  }
}
