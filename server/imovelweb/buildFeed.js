/**
 * Feed OpenNavent (Imovelweb / Wimoveis) a partir de `imoveis_locais`.
 *
 * NÃO é o VRSync do ZAP: outro grupo, outro schema. As diferenças que importam:
 *   - quartos, banheiros, vagas e área não são tags — são `<caracteristica>` com
 *     ID da tabela deles (CFT2, CFT3, CFT7, CFT100/101), levantada em
 *     /v1/tipopropriedade/{id}/caracteristicas;
 *   - operação vai em espanhol (VENTA/ALQUILER) e o preço é obrigatório: no
 *     Brasil eles rejeitam valor 0;
 *   - localidade pode ir por NOME ("Bairro,Cidade,Estado,Brasil"), o que evita
 *     manter o de-para de 372 bairros de Jundiaí (IDs V1-D-*) sincronizado.
 *
 * Baixa de anúncio = sumir do XML. Quem some daqui sai do ar lá.
 *
 * ponytail: sem idLocalidade e sem lat/long — o endereço vai por nome e o mapa
 * fica em NO. Se a equipe quiser pino exato no mapa, aí sim vale o de-para de
 * ubicaciones + geocoding.
 */

import { extractZapPhotoUrls } from '../zap/index.js';

/** Tipos do Brasil em /v1/tipopropriedade. São só estes cinco. */
export const IMOVELWEB_TIPOS = {
  CASA: '1',
  APARTAMENTO: '2',
  TERRENO: '1003',
  RURAIS: '1004',
  COMERCIAL: '1005',
};

/** Subtipos de Apartamento (/v1/tipopropriedade/2/subtipos). */
const SUBTIPOS_APARTAMENTO = [
  [/cobertura/, '26'],
  [/duplex/, '34'],
  [/flat/, '4'],
  [/garden/, '38'],
  [/kitnet|kitchenette|conjugado|studio|stúdio/, '2'],
  [/loft/, '3'],
  [/triplex/, '35'],
];

const texto = (valor) => {
  const limpo = String(valor ?? '').trim();
  return limpo || null;
};

const numero = (valor) => {
  if (valor === undefined || valor === null || valor === '') return 0;
  const parsed = Number(String(valor).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const cdata = (valor) => `<![CDATA[${String(valor ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const semHtml = (valor) => String(valor ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export const mapImovelwebTipo = (imovel) => {
  const tipo = `${imovel?.tipo || ''} ${imovel?.tipo_simplificado || ''}`.toLowerCase();

  if (/terreno|lote|área|area /.test(tipo)) return { idTipo: IMOVELWEB_TIPOS.TERRENO };
  if (/chácara|chacara|sítio|sitio|fazenda|rural/.test(tipo)) return { idTipo: IMOVELWEB_TIPOS.RURAIS };
  if (/sala|conjunto|loja|galpão|galpao|depósito|deposito|comercial|ponto|prédio|predio/.test(tipo)) {
    return { idTipo: IMOVELWEB_TIPOS.COMERCIAL };
  }
  if (/casa|sobrado/.test(tipo)) return { idTipo: IMOVELWEB_TIPOS.CASA };

  // Apartamento é o default (mesma escolha do feed VRSync) — e é o único tipo
  // cujos subtipos estão mapeados.
  const subtipo = SUBTIPOS_APARTAMENTO.find(([regex]) => regex.test(tipo));
  return { idTipo: IMOVELWEB_TIPOS.APARTAMENTO, idSubTipo: subtipo ? subtipo[1] : null };
};

/** Entre 10 e 100 caracteres, exigência do schema deles. */
export const montarTitulo = (imovel) => {
  const bruto = texto(imovel.titulo)
    || [imovel.tipo, imovel.bairro, imovel.cidade].filter(Boolean).join(' - ');
  const titulo = semHtml(bruto);
  if (titulo.length > 100) {
    // Corta na última palavra inteira: "... Jardim Messina Jundia" fica feio no
    // anúncio. Sem espaço no trecho, corta seco mesmo.
    const cortado = titulo.slice(0, 100);
    const ultimoEspaco = cortado.lastIndexOf(' ');
    return (ultimoEspaco > 60 ? cortado.slice(0, ultimoEspaco) : cortado).replace(/[\s,;-]+$/, '');
  }
  if (titulo.length >= 10) return titulo;
  return `${titulo} - Imóvel ${texto(imovel.codigo_imovel) || 'disponível'}`.slice(0, 100);
};

/**
 * `<precos>` só sai com valor > 0: no Brasil eles recusam preço zerado, e um
 * imóvel sem preço nenhum não entra no feed (ver `imovelPublicavel`).
 */
const montarPrecos = (imovel) => {
  const venda = numero(imovel.valor_venda);
  const locacao = numero(imovel.valor_locacao);
  const precos = [];

  if (venda > 0) {
    precos.push(`        <preco>
          <operacao>VENTA</operacao>
          <quantidade>${venda}</quantidade>
          <moeda>BRL</moeda>
        </preco>`);
  }
  if (locacao > 0) {
    precos.push(`        <preco>
          <operacao>ALQUILER</operacao>
          <quantidade>${locacao}</quantidade>
          <moeda>BRL</moeda>
        </preco>`);
  }

  return precos;
};

const caracteristica = (id, valor) => `        <caracteristica>
          <id>${cdata(id)}</id>
          <valor>${cdata(valor)}</valor>
        </caracteristica>`;

const montarCaracteristicas = (imovel) => {
  const areaTotal = numero(imovel.area_total);
  const areaUtil = numero(imovel.area_util || imovel.metragem_m2);

  const itens = [
    ['CFT2', numero(imovel.quartos)],
    ['CFT3', numero(imovel.banheiros)],
    ['CFT4', numero(imovel.suites)],
    ['CFT7', numero(imovel.vagas)],
    ['CFT6', numero(imovel.valor_condominio)],
    ['CFT400', numero(imovel.valor_iptu)],
    ['CFT100', areaTotal],
    ['CFT101', areaUtil],
  ]
    .filter(([, valor]) => valor > 0)
    .map(([id, valor]) => caracteristica(id, valor));

  // A unidade das áreas é um Select (idValor), não um número.
  if (areaTotal > 0 || areaUtil > 0) {
    itens.push(`        <caracteristica>
          <id>${cdata('CON1')}</id>
          <idValor>${cdata('M2')}</idValor>
        </caracteristica>`);
  }

  return itens;
};

/** Eles esperam o CÓDIGO do vídeo do YouTube, não a URL. */
export const extrairCodigoYoutube = (link) => {
  const url = texto(link);
  if (!url) return null;
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{6,}$/.test(url) ? url : null;
};

const montarMultimidia = (imovel) => {
  const fotos = extractZapPhotoUrls(imovel.fotos);
  const codigoVideo = extrairCodigoYoutube(imovel.link_video);
  const tour = texto(imovel.tour_virtual);
  const blocos = [];

  if (fotos.length > 0) {
    const imagens = fotos.map((url, i) => `          <imagem>
            <urlImagem>${cdata(url)}</urlImagem>
            <titulo>${cdata(`Foto ${i + 1}`)}</titulo>
          </imagem>`).join('\n');
    blocos.push(`        <imagens>\n${imagens}\n        </imagens>`);
  }

  if (codigoVideo) {
    blocos.push(`        <videos>
          <video>
            <codigoVideo>${cdata(codigoVideo)}</codigoVideo>
            <titulo>${cdata('Vídeo')}</titulo>
          </video>
        </videos>`);
  }

  if (tour && /^https?:\/\//i.test(tour)) {
    blocos.push(`        <tours360>
          <tour360>
            <codigoTour360>${cdata(tour)}</codigoTour360>
            <titulo>${cdata('Tour virtual')}</titulo>
          </tour360>
        </tours360>`);
  }

  return blocos.length > 0 ? `      <multimidia>\n${blocos.join('\n')}\n      </multimidia>` : null;
};

/** "Bairro,Cidade,Estado,Brasil" — a ordem e as vírgulas são exigência deles. */
export const montarLocalidade = (imovel) => [
  texto(imovel.bairro),
  texto(imovel.cidade),
  texto(imovel.estado),
  'Brasil',
].filter(Boolean).join(',');

const montarLocalizacao = (imovel, config) => {
  const endereco = [texto(imovel.logradouro), texto(imovel.numero)].filter(Boolean).join(', ');
  const complemento = !config.hideComplement ? texto(imovel.complemento) : null;
  const enderecoCompleto = [endereco, complemento].filter(Boolean).join(' - ');

  return [
    '      <localizacao>',
    enderecoCompleto ? `        <endereco>${cdata(enderecoCompleto)}</endereco>` : null,
    `        <localidade>${cdata(montarLocalidade(imovel))}</localidade>`,
    texto(imovel.cep) ? `        <codigoPostal>${cdata(imovel.cep)}</codigoPostal>` : null,
    // Sem lat/long no cadastro; o mapa fica desligado em vez de apontar errado.
    '        <mostrarMapa>NO</mostrarMapa>',
    '      </localizacao>',
  ].filter(Boolean).join('\n');
};

const montarPublicador = (config) => [
  '      <publicador>',
  config.codigoImobiliaria ? `        <codigoImobiliaria>${cdata(config.codigoImobiliaria)}</codigoImobiliaria>` : null,
  config.emailUsuario ? `        <emailUsuario>${cdata(config.emailUsuario)}</emailUsuario>` : null,
  config.contactEmail ? `        <emailContato>${cdata(config.contactEmail)}</emailContato>` : null,
  config.contactName ? `        <nomeContato>${cdata(config.contactName)}</nomeContato>` : null,
  config.contactPhone ? `        <telefoneContato>${cdata(config.contactPhone)}</telefoneContato>` : null,
  '      </publicador>',
].filter(Boolean).join('\n');

const montarDescricao = (imovel) => {
  const base = semHtml(imovel.descricao);
  if (base) return base.slice(0, 3000);
  return [imovel.titulo, imovel.tipo, imovel.bairro, imovel.cidade]
    .filter(Boolean).join(' - ') || 'Imóvel disponível para negociação.';
};

/** Sem código ou sem preço o anúncio é recusado por eles — filtra antes de gerar. */
export const imovelPublicavel = (imovel) =>
  Boolean(texto(imovel?.codigo_imovel)) && montarPrecos(imovel || {}).length > 0;

export const buildImovelXml = (imovel, config) => {
  const { idTipo, idSubTipo } = mapImovelwebTipo(imovel);
  const multimidia = montarMultimidia(imovel);
  const caracteristicas = montarCaracteristicas(imovel);

  return [
    '    <Imovel>',
    `      <codigoAnuncio>${cdata(imovel.codigo_imovel)}</codigoAnuncio>`,
    `      <titulo>${cdata(montarTitulo(imovel))}</titulo>`,
    `      <descricao>${cdata(montarDescricao(imovel))}</descricao>`,
    '      <tipoPropriedade>',
    `        <idTipo>${cdata(idTipo)}</idTipo>`,
    idSubTipo ? `        <idSubTipo>${cdata(idSubTipo)}</idSubTipo>` : null,
    '      </tipoPropriedade>',
    '      <precos>',
    ...montarPrecos(imovel),
    '      </precos>',
    caracteristicas.length > 0 ? `      <caracteristicas>\n${caracteristicas.join('\n')}\n      </caracteristicas>` : null,
    multimidia,
    montarLocalizacao(imovel, config),
    '      <publicacao>',
    `        <tipoPublicacao>${cdata(config.publicationType || 'SIMPLE')}</tipoPublicacao>`,
    '      </publicacao>',
    montarPublicador(config),
    '    </Imovel>',
  ].filter(Boolean).join('\n');
};

/**
 * `dataModificacao` em unix ms serve pra eles decidirem se o XML é mais novo que
 * uma edição feita pela API — por isso é o instante da geração, não do imóvel.
 */
export const buildImovelwebXml = ({ listings = [], config = {} }) => {
  const publicaveis = listings.filter(imovelPublicavel);
  const imoveis = publicaveis.map((imovel) => buildImovelXml(imovel, config)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenNavent>
  <dataModificacao>${cdata(Date.now())}</dataModificacao>
  <Imoveis>
${imoveis}
  </Imoveis>
</OpenNavent>`;
};
