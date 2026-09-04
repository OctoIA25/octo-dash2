/**
 * Normaliza o callback de lead do Imovelweb (OpenNavent / Grupo QuintoAndar)
 * para o mesmo formato que `createIncomingLead` já consome.
 *
 * POR QUE UM MÓDULO PRÓPRIO
 * O payload não tem nada a ver com o do ZAP: lá o imóvel chega como
 * `clientListingId`/`originListingId` (IDs do portal, que precisam de de-para);
 * aqui chega em `referencia`, que é o NOSSO código de anúncio (AP0684, CA054) —
 * o mesmo que publicamos no XML. Por isso não há lookup nenhum neste caminho.
 *
 * DOIS EVENTOS VIRAM LEAD:
 *   CONTACTO_MENSAJE → o interessado escreveu uma mensagem.
 *   CONTACTO         → ele clicou em "ver telefone"/WhatsApp, sem escrever nada.
 * Os demais (AVISO_*, CREDITO) não são lead e a rota os ignora.
 *
 * O corpo depende do `lenguajeCallbackBody` configurado na conta. Configuramos
 * PT, mas ES/EN são aceitos aqui porque a troca é um campo no painel deles e
 * cair para 400 nesse caso custaria leads.
 */

/** `/v1/contatos/acoes` — o que a pessoa fez no anúncio. */
export const IMOVELWEB_TIPOS_CONTATO = {
  1: 'Enviou consulta',
  2: 'Quer ser contatado',
  3: 'Agendou visita',
  6: 'Viu telefone',
  10: 'Contatou por WhatsApp',
  11: 'Contato por Social Ads',
  12: 'Solicitou avaliação',
  13: 'Contraoferta',
  14: 'Cotizar',
  15: 'Agendou visita',
};

export const IMOVELWEB_EVENTOS_DE_LEAD = ['CONTACTO', 'CONTACTO_MENSAJE'];

export const ehEventoDeLead = (payload = {}) =>
  IMOVELWEB_EVENTOS_DE_LEAD.includes(String(payload?.tipoEvento || payload?.eventType || '').toUpperCase());

const texto = (...valores) => {
  for (const valor of valores) {
    if (valor === undefined || valor === null) continue;
    const limpo = String(valor).trim();
    if (limpo && limpo.toLowerCase() !== 'null') return limpo;
  }
  return null;
};

/** PT manda `telefone` inteiro; ES/EN quebram em DDD + número. */
const extrairTelefone = (body) => {
  const direto = texto(body.telefone, body.telefono, body.phone, body.txtTelefone);
  const ddd = texto(body.ddd, body.txtDdd);
  if (direto && ddd && !direto.startsWith(ddd)) return `${ddd}${direto}`;
  return direto || null;
};

export const normalizeImovelwebLeadPayload = (payload) => {
  const body = payload || {};

  const idTipoContato = Number(body.idTipoContacto ?? body.contactTypeId);
  const acao = IMOVELWEB_TIPOS_CONTATO[idTipoContato] || null;

  // `referencia` é o codigoAviso — o nosso próprio código, o mesmo que vai no XML.
  const propertyCode = texto(body.referencia, body.codigoLancamento, body.codigoDesarrollo);

  // Retentativa do mesmo callback repete idMensagem e idEvento; qualquer um dos
  // dois torna o POST idempotente (dedup por source_lead_id em createIncomingLead).
  // idMensagem vem primeiro: se um mesmo contato disparar dois eventos, continua
  // sendo um lead só.
  const leadId = texto(body.idMensagem, body.idMensaje, body.messageId, body.idEvento, body.eventId);

  // Em CONTACTO não existe mensagem — quem informa o corretor é a AÇÃO.
  const mensagem = texto(body.mensagem, body.mensaje, body.message, body.txtMensagem)
    || (acao ? `${acao} (Imovelweb)` : null);

  return {
    name: texto(body.nome, body.nombre, body.name, body.txtNome),
    phone: extrairTelefone(body),
    email: texto(body.email, body.txtEmail, body.mail),
    portal: 'Imovelweb',
    message: mensagem,
    comments: mensagem,
    interest_reference: propertyCode,
    property_code: propertyCode,
    interest_type: propertyCode ? 'property' : null,
    // Lead de lançamento não pode cair na roleta de imóvel pronto — mesma regra
    // que o de-para do ZAP aplica em lancamentoAnuncios.js.
    atuacao: texto(body.codigoLancamento, body.codigoDesarrollo) ? 'lancamentos' : undefined,
    external_id: leadId ? `imovelweb_${leadId}` : null,
    raw_data: {
      source: 'imovelweb_callback',
      imovelweb_evento: texto(body.tipoEvento, body.eventType),
      imovelweb_id_evento: texto(body.idEvento, body.eventId),
      imovelweb_id_mensagem: texto(body.idMensagem, body.idMensaje),
      imovelweb_id_contato: texto(body.idContato, body.idContacto),
      imovelweb_acao: acao,
      imovelweb_plano: texto(body.planoDePublicacao, body.planDePublicacion),
      // O portal manda CPF quando o interessado está logado. Fica no raw_data:
      // a coluna dedicada em leads depende de migration ainda não aplicada.
      cpf: texto(body.cpf),
      original_request: body,
    },
  };
};
