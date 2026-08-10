/**
 * 🚀 OctoDash CRM API Server
 * API RESTful completa para o CRM Imobiliário
 * Base URL: /api/v1
 */

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { createWatermarkRouter } from './watermark/routes.js';
import { countLeadsPerBroker } from './brokerLeadStats.js';
import { createWorker } from './watermark/worker.js';
import { createZapConfigResolver, registerZapRoutes } from './zap/index.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

// CORS: allowlist via env CORS_ORIGINS (origens separadas por vírgula).
// Default: dev local. Em produção, defina CORS_ORIGINS com o(s) domínio(s) do app.
// Requisições sem Origin (webhooks/server-to-server/curl) são permitidas — CORS
// é uma proteção de navegador e não se aplica a elas.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
};

// Middleware
app.use(cors(corsOptions));
// verify: ver comentário em proxy-production.js — necessário para validar a
// assinatura do webhook da Meta.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ [api-server] Missing Supabase env vars: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Usar service_role key se disponível (bypassa RLS), senão usar anon key
const supabaseKey = supabaseServiceKey || supabaseAnonKey;
const usingServiceRole = !!supabaseServiceKey;

if (supabaseKey.startsWith('sb_') || !supabaseKey.startsWith('eyJ')) {
  console.error('❌ [api-server] Invalid Supabase key. Use JWT key (eyJ...), not publishable (sb_...).');
  process.exit(1);
}

if (!usingServiceRole) {
  console.warn('⚠️ [api-server] SUPABASE_SERVICE_ROLE_KEY não definida. Usando anon key (sujeito a RLS).');
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('🔌 [api-server] Supabase conectado:', usingServiceRole ? '(service_role)' : '(anon)');

// 🖼️ Pipeline de marca d'água (upload de master → fila → derivados versionados → CDN).
// Montado antes do express.json não interferir: multer trata o multipart internamente.
app.use('/api/v1/watermark', createWatermarkRouter(supabase));

// Worker embarcado opcional. Em produção prefira um processo/container dedicado
// (escala independente da API); aqui é conveniência para dev e cargas pequenas.
if (process.env.WATERMARK_WORKER === '1') {
  createWorker(supabase).runLoop();
}

// Tabelas do CRM
const LEADS_TABLE = 'kenlo_leads';
const BOLSAO_TABLE = 'bolsao';

// ============================================
// MIDDLEWARE - API Key Validation
// ============================================
const validateApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API Key ausente. Use: Authorization: Bearer <api_key>'
      }
    });
  }
  
  const apiKey = authHeader.split(' ')[1];
  
  // Aceitar keys que começam com octo_ ou octo_sk_
  if (!apiKey.startsWith('octo_') && apiKey !== 'demo') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'API Key inválida. Keys devem começar com octo_'
      }
    });
  }
  
  // Chave 'demo': acesso restrito a um tenant de demonstração FIXO.
  // SEGURANÇA: a key demo NUNCA pode escolher tenant via ?tenant_id= — isso
  // permitiria ler PII (nome/telefone/email) de qualquer imobiliária. Ela fica
  // amarrada a DEMO_TENANT_ID; sem essa env, o modo demo falha fechado.
  if (apiKey === 'demo') {
    const demoTenantId = process.env.DEMO_TENANT_ID;
    if (!demoTenantId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'DEMO_DISABLED',
          message: 'Modo demo desabilitado. Configure DEMO_TENANT_ID para habilitá-lo.'
        }
      });
    }
    req.tenantId = demoTenantId;
    req.apiKey = apiKey;
    return next();
  }

  // Validar API Key contra banco de dados
  try {
    const { data: keyData, error: keyError } = await supabase
      .from('tenant_api_keys')
      .select('id, tenant_id, status')
      .eq('api_key', apiKey)
      .eq('provider', 'crm')
      .eq('status', 'active')
      .single();

    if (keyError || !keyData) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'API Key não encontrada ou inativa'
        }
      });
    }

    req.tenantId = keyData.tenant_id;
    req.apiKeyId = keyData.id;
  } catch (err) {
    console.error('Erro ao validar API Key:', err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro ao validar API Key'
      }
    });
  }

  req.apiKey = apiKey;
  next();
};

// Remove metacaracteres do PostgREST (vírgula, parênteses, asterisco, barra) que
// poderiam alterar a estrutura de um filtro .or() ao interpolar input do usuário.
const sanitizeFilterValue = (value) => String(value ?? '').replace(/[,()*\\]/g, ' ').trim();

const firstHeaderValue = (value) => Array.isArray(value) ? value[0] : value;

const getZapFeedConfig = () => ({
  secret: process.env.ZAPIMOVEIS_FEED_SECRET
    || process.env.ZAPIMOVEIS_WEBHOOK_SECRET
    || process.env.OLX_FEED_SECRET,
  tenantId: process.env.ZAPIMOVEIS_TENANT_ID
    || process.env.OLX_TENANT_ID
    || process.env.VITE_SANTA_ANGELA_TENANT_ID,
  provider: process.env.ZAPIMOVEIS_PROVIDER || 'OctoDash',
  contactName: process.env.ZAPIMOVEIS_CONTACT_NAME || 'OctoDash',
  contactEmail: process.env.ZAPIMOVEIS_CONTACT_EMAIL || 'contato@octoia.com',
  contactPhone: process.env.ZAPIMOVEIS_CONTACT_PHONE || '',
  publicationType: process.env.ZAPIMOVEIS_PUBLICATION_TYPE || 'STANDARD',
  detailBaseUrl: process.env.ZAPIMOVEIS_DETAIL_BASE_URL || process.env.PUBLIC_APP_URL || '',
  resyncUrl: process.env.ZAPIMOVEIS_RESYNC_URL || '',
  resyncToken: process.env.ZAPIMOVEIS_RESYNC_TOKEN || ''
});

// ============================================
// MIDDLEWARE - ZAP/OLX Feed (VRSync)
// ============================================
// Resolver multi-tenant da config ZAP (tenant_zap_config). Resolve o tenant PELO
// secret apresentado, com fallback ao .env enquanto tenants legados não tiverem
// linha no banco. Espelha proxy-production.js.
const zapConfigResolver = createZapConfigResolver({ supabase });

const effectiveZapConfig = (tenantConfig) => {
  const env = getZapFeedConfig();
  if (!tenantConfig) return env;
  return {
    secret: tenantConfig.feedSecret ?? env.secret,
    tenantId: tenantConfig.tenantId ?? env.tenantId,
    provider: tenantConfig.provider ?? env.provider,
    contactName: tenantConfig.contactName ?? env.contactName,
    contactEmail: tenantConfig.contactEmail ?? env.contactEmail,
    contactPhone: tenantConfig.contactPhone ?? env.contactPhone,
    publicationType: tenantConfig.publicationType ?? env.publicationType,
    detailBaseUrl: tenantConfig.detailBaseUrl ?? env.detailBaseUrl,
    resyncUrl: tenantConfig.resyncUrl ?? env.resyncUrl,
    resyncToken: tenantConfig.resyncToken ?? env.resyncToken,
  };
};

const validateZapFeedAccess = async (req, res, next) => {
  const providedSecret = firstHeaderValue(req.headers['x-zapimoveis-feed-secret'])
    || firstHeaderValue(req.headers['x-zapimoveis-webhook-secret'])
    || firstHeaderValue(req.headers['x-zapimoveis-secret'])
    || firstHeaderValue(req.headers['x-olx-feed-secret'])
    || firstHeaderValue(req.headers['x-olx-webhook-secret'])
    || req.query.token
    || req.query.feed_token
    || req.query.secret;

  // Multi-tenant: o secret IDENTIFICA o tenant (a URL não escolhe). Cada tenant tem
  // a sua linha em tenant_zap_config (sem fallback global por .env).
  const tenantConfig = await zapConfigResolver.resolveBySecret(providedSecret).catch(() => null);
  if (tenantConfig && tenantConfig.status === 'active') {
    req.tenantId = tenantConfig.tenantId;
    req.zapConfig = effectiveZapConfig(tenantConfig);
    req.integrationAuth = 'zapimoveis_tenant_secret';
    return next();
  }

  return validateApiKey(req, res, next);
};

// ============================================
// HELPERS - ZAP/OLX VRSync feed
// ============================================
const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const xmlCdata = (value) => `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const toFeedNumber = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPositiveInteger = (value) => Math.max(0, Math.floor(toFeedNumber(value)));

const toMoneyValue = (value) => {
  const parsed = toFeedNumber(value);
  return parsed > 0 ? Math.round(parsed) : null;
};

const normalizeFeedText = (value, fallback = '') => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
};

const getDefaultZapContactInfo = (cfg = getZapFeedConfig()) => {
  return {
    name: normalizeFeedText(cfg.contactName, 'OctoDash'),
    email: normalizeFeedText(cfg.contactEmail, 'contato@octoia.com'),
    phone: normalizeFeedText(cfg.contactPhone)
  };
};

const getListingContactInfo = (imovel, cfg = getZapFeedConfig()) => {
  const fallback = getDefaultZapContactInfo(cfg);
  const contact = imovel.zap_contact || {};
  return {
    name: normalizeFeedText(contact.name, fallback.name),
    email: normalizeFeedText(contact.email, fallback.email),
    phone: normalizeFeedText(contact.phone, fallback.phone)
  };
};

const stripHtml = (value) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const buildFeedDescription = (imovel) => {
  const base = stripHtml(imovel.descricao);
  const fallback = [
    imovel.titulo,
    imovel.tipo,
    imovel.bairro,
    imovel.cidade,
    imovel.codigo_imovel ? `Código ${imovel.codigo_imovel}` : null
  ].filter(Boolean).join(' - ');
  const description = base || fallback || 'Imóvel disponível para negociação.';

  if (description.length >= 50) {
    return description.slice(0, 3000);
  }

  const complement = ' Entre em contato para receber mais informações, valores atualizados e detalhes completos deste imóvel.';
  return `${description}${complement}`.slice(0, 3000);
};

const mapZapTransactionType = (imovel) => {
  const finalidade = normalizeFeedText(imovel.finalidade).toLowerCase();
  const hasSale = toMoneyValue(imovel.valor_venda) !== null;
  const hasRent = toMoneyValue(imovel.valor_locacao) !== null;

  if (finalidade.includes('venda_locacao') || finalidade.includes('venda e') || (hasSale && hasRent)) {
    return 'Sale/Rent';
  }
  if (finalidade.includes('locacao') || finalidade.includes('locação') || finalidade.includes('aluguel') || hasRent) {
    return 'For Rent';
  }
  return 'For Sale';
};

const getZapListingEligibility = (imovel) => {
  const reasons = [];
  const transactionType = mapZapTransactionType(imovel);
  const salePrice = toMoneyValue(imovel.valor_venda);
  const rentPrice = toMoneyValue(imovel.valor_locacao);

  if (!normalizeFeedText(imovel.codigo_imovel)) reasons.push('missing_codigo_imovel');
  if (transactionType === 'For Sale' && salePrice === null) reasons.push('missing_sale_price');
  if (transactionType === 'For Rent' && rentPrice === null) reasons.push('missing_rent_price');
  if (transactionType === 'Sale/Rent' && salePrice === null && rentPrice === null) {
    reasons.push('missing_sale_or_rent_price');
  }

  return { eligible: reasons.length === 0, reasons, transactionType, salePrice, rentPrice };
};

const mapZapPropertyType = (imovel) => {
  const type = `${imovel.tipo || ''} ${imovel.tipo_simplificado || ''}`.toLowerCase();

  if (type.includes('cobertura')) return 'Residential / Penthouse';
  if (type.includes('flat')) return 'Residential / Flat';
  if (type.includes('kitnet') || type.includes('conjugado')) return 'Residential / Kitnet';
  if (type.includes('studio')) return 'Residential / Studio';
  if (type.includes('loft')) return 'Residential / Loft';
  if (type.includes('condomínio') || type.includes('condominio')) return 'Residential / Condo';
  if (type.includes('sobrado')) return 'Residential / Sobrado';
  if (type.includes('casa')) return 'Residential / Home';
  if (type.includes('apartamento') || type.includes('apto')) return 'Residential / Apartment';
  if (type.includes('chácara') || type.includes('chacara') || type.includes('fazenda') || type.includes('sítio') || type.includes('sitio') || type.includes('rural')) {
    return 'Residential / Agricultural';
  }
  if (type.includes('terreno') || type.includes('lote')) return 'Residential / Land Lot';
  if (type.includes('galpão') || type.includes('galpao') || type.includes('depósito') || type.includes('deposito') || type.includes('armazém') || type.includes('armazem')) {
    return 'Commercial / Industrial';
  }
  if (type.includes('sala') || type.includes('conjunto') || type.includes('office')) return 'Commercial / Office';
  if (type.includes('loja') || type.includes('salão') || type.includes('salao') || type.includes('ponto')) return 'Commercial / Business';
  if (type.includes('comercial')) return 'Commercial / Building';

  return 'Residential / Apartment';
};

const mapZapUsageType = (propertyType) => {
  if (propertyType.startsWith('Commercial /')) return 'Commercial';
  return 'Residential';
};

const normalizeZapPhotoUrl = (photo) => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo.trim();
  if (typeof photo === 'object') {
    return String(photo.url || photo.src || photo.preview || photo.publicUrl || '').trim() || null;
  }
  return null;
};

const extractZapPhotoUrls = (photos) => {
  const rawPhotos = Array.isArray(photos) ? photos : [];
  const seen = new Set();
  return rawPhotos
    .map(normalizeZapPhotoUrl)
    .filter((url) => url && /^https?:\/\//i.test(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 30);
};

const getConfiguredDetailBaseUrl = (cfg = getZapFeedConfig()) => {
  const configuredBase = cfg.detailBaseUrl;
  if (configuredBase) return configuredBase.replace(/\/$/, '');
  return '';
};

const toFeatureList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [text];
    } catch {
      return [text];
    }
  }
  return [];
};

// Aceita só YouTube; normaliza para a URL canônica de watch. Null caso contrário.
const normalizeYouTubeUrl = (url) => {
  const s = String(url || '').trim();
  if (!s) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
  }
  return null;
};

const buildFeaturesXml = (imovel) => {
  const seen = new Set();
  const features = [];
  const pushFeature = (raw) => {
    const feature = normalizeFeedText(raw);
    if (!feature) return;
    const key = feature.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    features.push(feature);
  };

  // VRSync tem uma única lista <Features>: comum + privativa se fundem.
  toFeatureList(imovel.area_comum).forEach(pushFeature);
  toFeatureList(imovel.area_privativa).forEach(pushFeature);
  // VRSync não tem campo nativo de permuta -> vira uma feature.
  if (imovel.aceita_troca === true || imovel.aceita_troca === 'true') {
    pushFeature('Aceita Permuta');
  }
  // VRSync não tem campo nativo de salas -> vira uma feature.
  const salas = toPositiveInteger(imovel.salas);
  if (salas > 0) {
    pushFeature(`${salas} ${salas === 1 ? 'sala' : 'salas'}`);
  }

  if (features.length === 0) return '';
  const items = features
    .map((feature) => `        <Feature>${xmlCdata(feature)}</Feature>`)
    .join('\n');
  return `      <Features>\n${items}\n      </Features>`;
};

const buildZapListingXml = (imovel, cfg = getZapFeedConfig()) => {
  const propertyType = mapZapPropertyType(imovel);
  const transactionType = mapZapTransactionType(imovel);
  const usageType = mapZapUsageType(propertyType);
  const salePrice = toMoneyValue(imovel.valor_venda);
  const rentPrice = toMoneyValue(imovel.valor_locacao);
  const condoFee = toMoneyValue(imovel.valor_condominio);
  const yearlyTax = toMoneyValue(imovel.valor_iptu);
  const lotArea = toFeedNumber(imovel.area_total);
  const livingArea = toFeedNumber(imovel.area_util || imovel.metragem_m2);
  const photos = extractZapPhotoUrls(imovel.fotos);
  const baseUrl = getConfiguredDetailBaseUrl(cfg);
  const contact = getListingContactInfo(imovel, cfg);
  const detailUrl = baseUrl && imovel.codigo_imovel
    ? `${baseUrl}/imovel/${encodeURIComponent(imovel.codigo_imovel)}`
    : null;

  const priceTags = [
    (transactionType === 'For Sale' || transactionType === 'Sale/Rent') && salePrice
      ? `      <ListPrice currency="BRL">${salePrice}</ListPrice>`
      : null,
    (transactionType === 'For Rent' || transactionType === 'Sale/Rent') && rentPrice
      ? `      <RentalPrice currency="BRL" period="Monthly">${rentPrice}</RentalPrice>`
      : null,
    condoFee ? `      <PropertyAdministrationFee currency="BRL">${condoFee}</PropertyAdministrationFee>` : null,
    yearlyTax ? `      <YearlyTax currency="BRL">${yearlyTax}</YearlyTax>` : null
  ].filter(Boolean).join('\n');

  const videoUrl = normalizeYouTubeUrl(imovel.link_video);
  const tourUrl = normalizeFeedText(imovel.tour_virtual);
  const mediaItems = [
    ...photos.map((url, index) => `      <Item medium="image" caption="img${index + 1}">${xmlEscape(url)}</Item>`),
    videoUrl ? `      <Item medium="video" caption="video">${xmlEscape(videoUrl)}</Item>` : null,
    /^https?:\/\//i.test(tourUrl) ? `      <Item medium="virtual_tour" caption="tour">${xmlEscape(tourUrl)}</Item>` : null
  ].filter(Boolean);
  const mediaXml = mediaItems.length > 0
    ? `    <Media>\n${mediaItems.join('\n')}\n    </Media>`
    : '';

  return `  <Listing>
    <ListingID>${xmlEscape(imovel.codigo_imovel)}</ListingID>
    <Title>${xmlCdata(normalizeFeedText(imovel.titulo, `${imovel.tipo || 'Imóvel'} - ${imovel.bairro || imovel.cidade || ''}`))}</Title>
    <TransactionType>${transactionType}</TransactionType>
    <PublicationType>${xmlEscape(cfg.publicationType)}</PublicationType>
${detailUrl ? `    <DetailViewUrl>${xmlEscape(detailUrl)}</DetailViewUrl>\n` : ''}${mediaXml ? `${mediaXml}\n` : ''}    <Details>
      <UsageType>${usageType}</UsageType>
      <PropertyType>${propertyType}</PropertyType>
      <Description>${xmlCdata(buildFeedDescription(imovel))}</Description>
${priceTags}
${lotArea > 0 ? `      <LotArea unit="square metres">${lotArea}</LotArea>\n` : ''}${livingArea > 0 ? `      <LivingArea unit="square metres">${livingArea}</LivingArea>\n` : ''}      <Bedrooms>${toPositiveInteger(imovel.quartos)}</Bedrooms>
      <Bathrooms>${toPositiveInteger(imovel.banheiros)}</Bathrooms>
      <Suites>${toPositiveInteger(imovel.suites)}</Suites>
      <Garage>${toPositiveInteger(imovel.vagas)}</Garage>
${buildFeaturesXml(imovel) ? `${buildFeaturesXml(imovel)}\n` : ''}    </Details>
    <Location displayAddress="All">
      <Country abbreviation="BR">Brasil</Country>
      <State abbreviation="${xmlEscape(normalizeFeedText(imovel.estado, 'SP').toUpperCase())}">${xmlEscape(normalizeFeedText(imovel.estado, 'SP').toUpperCase())}</State>
      <City>${xmlCdata(normalizeFeedText(imovel.cidade, 'Jundiaí'))}</City>
      <Neighborhood>${xmlCdata(normalizeFeedText(imovel.bairro, 'Não informado'))}</Neighborhood>
${imovel.cep ? `      <PostalCode>${xmlEscape(imovel.cep)}</PostalCode>\n` : ''}${imovel.logradouro ? `      <Address>${xmlCdata(imovel.logradouro)}</Address>\n` : ''}${imovel.numero ? `      <StreetNumber>${xmlEscape(imovel.numero)}</StreetNumber>\n` : ''}${imovel.complemento ? `      <Complement>${xmlCdata(imovel.complemento)}</Complement>\n` : ''}    </Location>
    <ContactInfo>
      <Name>${xmlCdata(contact.name)}</Name>
      <Email>${xmlEscape(contact.email)}</Email>
${contact.phone ? `      <Telephone>${xmlEscape(contact.phone)}</Telephone>\n` : ''}    </ContactInfo>
  </Listing>`;
};

const buildZapVRSyncXml = ({ listings, config = getZapFeedConfig() }) => {
  const publishDate = new Date().toISOString().replace(/\.\d{3}Z$/, '');
  const listingsXml = listings.map((imovel) => buildZapListingXml(imovel, config)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">
  <Header>
    <Provider>${xmlCdata(config.provider)}</Provider>
    <Email>${xmlEscape(config.contactEmail)}</Email>
    <ContactName>${xmlCdata(config.contactName)}</ContactName>
    <PublishDate>${publishDate}</PublishDate>
${config.contactPhone ? `    <Telephone>${xmlEscape(config.contactPhone)}</Telephone>\n` : ''}  </Header>
  <Listings>
${listingsXml}
  </Listings>
</ListingDataFeed>`;
};

const getZapFeedListings = async (tenantId, { includeAllStatuses = false } = {}) => {
  let query = supabase
    .from('imoveis_locais')
    .select(`
      id,
      tenant_id,
      codigo_imovel,
      titulo,
      tipo,
      tipo_simplificado,
      finalidade,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      area_total,
      area_util,
      metragem_m2,
      quartos,
      suites,
      banheiros,
      vagas,
      valor_venda,
      valor_locacao,
      valor_condominio,
      valor_iptu,
      descricao,
      fotos,
      salas,
      area_comum,
      area_privativa,
      aceita_troca,
      link_video,
      tour_virtual,
      criado_por,
      status_aprovacao,
      updated_at
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (!includeAllStatuses) {
    query = query.eq('status_aprovacao', 'aprovado');
  }

  const { data, error } = await query;
  if (error) throw error;

  const listings = data || [];
  const creatorIds = [...new Set(listings.map((imovel) => imovel.criado_por).filter(Boolean))];
  const profilesById = new Map();
  const brokersByUserId = new Map();

  if (creatorIds.length > 0) {
    const [{ data: profiles, error: profilesError }, { data: brokers, error: brokersError }] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('id, email, full_name, phone')
        .in('id', creatorIds),
      supabase
        .from('tenant_brokers')
        .select('auth_user_id, name, email, phone')
        .eq('tenant_id', tenantId)
        .in('auth_user_id', creatorIds)
    ]);

    if (profilesError) {
      console.warn('⚠️ Não foi possível buscar contatos de user_profiles para o feed Zap:', profilesError.message);
    }
    if (brokersError) {
      console.warn('⚠️ Não foi possível buscar contatos de tenant_brokers para o feed Zap:', brokersError.message);
    }

    (profiles || []).forEach((profile) => profilesById.set(profile.id, profile));
    (brokers || []).forEach((broker) => {
      if (broker.auth_user_id) brokersByUserId.set(broker.auth_user_id, broker);
    });
  }

  return listings.map((imovel) => {
    const profile = profilesById.get(imovel.criado_por);
    const broker = brokersByUserId.get(imovel.criado_por);
    return {
      ...imovel,
      zap_contact: {
        name: broker?.name || profile?.full_name || profile?.email?.split('@')[0] || null,
        email: broker?.email || profile?.email || null,
        phone: broker?.phone || profile?.phone || null
      }
    };
  }).filter((imovel) => getZapListingEligibility(imovel).eligible);
};

const getZapFeedDebugInfo = async (tenantId) => {
  const { data, error } = await supabase
    .from('imoveis_locais')
    .select(`
      id,
      tenant_id,
      codigo_imovel,
      titulo,
      finalidade,
      valor_venda,
      valor_locacao,
      criado_por,
      fotos,
      status_aprovacao,
      updated_at
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const listings = data || [];
  const statusCounts = {};
  const skipReasonCounts = {};
  let approvedRows = 0;
  let publishableRows = 0;

  const samples = listings.slice(0, 30).map((imovel) => {
    const eligibility = getZapListingEligibility(imovel);
    const status = imovel.status_aprovacao || 'sem_status';

    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'aprovado') approvedRows += 1;
    if (eligibility.eligible) publishableRows += 1;

    eligibility.reasons.forEach((reason) => {
      skipReasonCounts[reason] = (skipReasonCounts[reason] || 0) + 1;
    });

    return {
      id: imovel.id,
      codigo_imovel: imovel.codigo_imovel,
      titulo: imovel.titulo,
      status_aprovacao: imovel.status_aprovacao,
      finalidade: imovel.finalidade,
      valor_venda: imovel.valor_venda,
      valor_locacao: imovel.valor_locacao,
      criado_por: imovel.criado_por,
      updated_at: imovel.updated_at,
      transaction_type: eligibility.transactionType,
      can_publish: eligibility.eligible,
      skipped_reasons: eligibility.reasons
    };
  });

  listings.slice(30).forEach((imovel) => {
    const eligibility = getZapListingEligibility(imovel);
    const status = imovel.status_aprovacao || 'sem_status';

    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'aprovado') approvedRows += 1;
    if (eligibility.eligible) publishableRows += 1;

    eligibility.reasons.forEach((reason) => {
      skipReasonCounts[reason] = (skipReasonCounts[reason] || 0) + 1;
    });
  });

  return {
    total_rows: listings.length,
    approved_rows: approvedRows,
    publishable_rows: publishableRows,
    skipped_rows: listings.length - publishableRows,
    status_counts: statusCounts,
    skip_reason_counts: skipReasonCounts,
    sample_rows: samples
  };
};

const createZapVRSyncFeed = async (req, res) => {
  try {
    const includeAllStatuses = req.query.status === 'all' || req.query.include_pending === 'true';
    const listings = await getZapFeedListings(req.tenantId, { includeAllStatuses });
    const xml = buildZapVRSyncXml({ listings, config: req.zapConfig || getZapFeedConfig() });
    const requesterIp = firstHeaderValue(req.headers['x-forwarded-for']) || req.ip;
    const requesterAgent = firstHeaderValue(req.headers['user-agent']) || 'unknown';

    console.log('🧾 Feed VRSync Zap/OLX gerado:', {
      tenant_id: req.tenantId,
      listings_count: listings.length,
      include_all_statuses: includeAllStatuses,
      requester_ip: requesterIp,
      user_agent: requesterAgent
    });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Zap-Listings-Count', String(listings.length));
    res.status(200).send(xml);

    if (req.integrationAuth === 'zapimoveis_tenant_secret') {
      void zapConfigResolver.touch(req.tenantId, 'last_feed_at');
    }
  } catch (error) {
    console.error('❌ Erro ao gerar feed VRSync Zap/OLX:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
};

const buildPublicFeedUrl = (req, tenantId) => {
  const baseFromHeader = firstHeaderValue(req.headers['x-forwarded-host']) || req.headers.host;
  const proto = firstHeaderValue(req.headers['x-forwarded-proto']) || (req.secure ? 'https' : 'http');
  if (!baseFromHeader) return null;
  return `${proto}://${baseFromHeader}/api/v1/integrations/zapimoveis/vrsync.xml?tenant_id=${encodeURIComponent(tenantId)}`;
};

const notifyZapResync = async ({ tenantId, propertyCodes = [], action = 'update', feedUrl, config = getZapFeedConfig() }) => {
  const payload = {
    tenant_id: tenantId,
    action,
    property_codes: propertyCodes,
    feed_url: feedUrl,
    timestamp: new Date().toISOString()
  };

  if (!config.resyncUrl) {
    return { notified: false, reason: 'ZAPIMOVEIS_RESYNC_URL not configured' };
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.resyncToken) {
      headers['Authorization'] = `Bearer ${config.resyncToken}`;
    }
    const response = await fetch(config.resyncUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    return {
      notified: response.ok,
      status: response.status,
      reason: response.ok ? 'sent' : `upstream returned ${response.status}`
    };
  } catch (error) {
    return { notified: false, reason: `upstream error: ${error.message}` };
  }
};

// ============================================
// HELPERS - kenlo_leads table structure
// ============================================
const mapLeadFromDB = (row) => ({
  id: row.id || row.external_id,
  external_id: row.external_id,
  name: row.client_name || '',
  phone: row.client_phone || '',
  email: row.client_email || '',
  source: row.portal || 'API',
  portal: row.portal,
  lead_timestamp: row.lead_timestamp,
  tenant_id: row.tenant_id,
  created_at: row.created_at,
  updated_at: row.updated_at,
  // Mensagem
  message: row.message || null,
  // Imóvel de interesse
  property_code: row.interest_reference || null,
  interest_reference: row.interest_reference || null,
  interest_image: row.interest_image || null,
  interest_type: row.interest_type || null,
  interest_is_sale: row.interest_is_sale || null,
  interest_is_rent: row.interest_is_rent || null,
  // Funil e temperatura
  stage: row.stage || 1,
  temperature: row.temperature || 'cold',
  // Corretor
  assigned_agent: row.attended_by_name || null,
  status: row.status || 'novo',
  // Arquivamento
  archived_at: row.archived_at || null,
  archive_reason: row.archive_reason || null,
  is_archived: !!row.archived_at,
  // Raw data (opcional, pode ser grande)
  raw_data: row.raw_data
});

const mapLeadToDB = (lead) => {
  const mapped = {};
  
  // Campos básicos do cliente
  if (lead.name !== undefined) mapped.client_name = lead.name;
  if (lead.phone !== undefined) mapped.client_phone = lead.phone;
  if (lead.email !== undefined) mapped.client_email = lead.email;
  
  // Portal/Origem
  if (lead.source !== undefined) mapped.portal = lead.source;
  if (lead.portal !== undefined) mapped.portal = lead.portal;
  
  // IDs
  // tenant_id NÃO é mapeado de propósito: o tenant de destino vem SEMPRE de
  // req.tenantId (validateApiKey). Aceitá-lo do corpo deixava a key do tenant A
  // criar lead no tenant B e, nos handlers de update, MOVER um lead de tenant.
  if (lead.external_id !== undefined) mapped.external_id = lead.external_id;
  
  // Timestamp
  if (lead.timestamp !== undefined) mapped.lead_timestamp = lead.timestamp;
  if (lead.lead_timestamp !== undefined) mapped.lead_timestamp = lead.lead_timestamp;
  
  // Mensagem do lead
  if (lead.message !== undefined) mapped.message = lead.message;
  if (lead.comments !== undefined) mapped.message = lead.comments;
  
  // Imóvel de interesse - aceita múltiplos nomes de campo
  if (lead.property_code !== undefined) mapped.interest_reference = lead.property_code;
  if (lead.interest_reference !== undefined) mapped.interest_reference = lead.interest_reference;
  if (lead.codigo_imovel !== undefined) mapped.interest_reference = lead.codigo_imovel;
  
  // Detalhes do imóvel
  if (lead.interest_image !== undefined) mapped.interest_image = lead.interest_image;
  if (lead.interest_type !== undefined) mapped.interest_type = lead.interest_type;
  if (lead.interest_is_sale !== undefined) mapped.interest_is_sale = lead.interest_is_sale;
  if (lead.interest_is_rent !== undefined) mapped.interest_is_rent = lead.interest_is_rent;
  if (lead.is_exclusive !== undefined) mapped.is_exclusive = lead.is_exclusive;
  if (lead.exclusivo !== undefined) mapped.is_exclusive = lead.exclusivo;
  if (lead.imovel_exclusivo !== undefined) mapped.is_exclusive = lead.imovel_exclusivo;
  
  // Corretor responsável - aceita múltiplos nomes
  if (lead.assigned_agent !== undefined) mapped.attended_by_name = lead.assigned_agent;
  if (lead.attended_by !== undefined) mapped.attended_by_name = lead.attended_by;
  if (lead.corretor !== undefined) mapped.attended_by_name = lead.corretor;
  
  // Etapa do funil (stage) — coluna real é 'stage'
  if (lead.stage !== undefined) mapped.stage = lead.stage;
  if (lead.etapa_funil !== undefined) mapped.stage = lead.etapa_funil;
  
  // Temperatura — coluna real é 'temperature'
  if (lead.temperature !== undefined) mapped.temperature = lead.temperature;
  if (lead.temperatura !== undefined) mapped.temperature = lead.temperatura;
  
  // Arquivamento
  if (lead.archive_reason !== undefined) mapped.archive_reason = lead.archive_reason;
  if (lead.archived !== undefined && lead.archived) {
    mapped.archived_at = new Date().toISOString();
    mapped.archive_reason = lead.archive_reason || lead.motivo || 'Arquivado via API';
  }
  if (lead.archived === false) {
    mapped.archived_at = null;
    mapped.archive_reason = null;
  }
  
  // Raw data
  if (lead.raw_data !== undefined) mapped.raw_data = lead.raw_data;
  
  return mapped;
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const nested = pickFirstNonEmpty(...value);
      if (nested) return nested;
      continue;
    }
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
};

const getNestedValue = (source, path) => {
  if (!source || !path) return undefined;
  return path.split('.').reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, source);
};

const pickNestedText = (source, paths) => pickFirstNonEmpty(
  ...paths.map((path) => getNestedValue(source, path))
);

const extractZapPhone = (payload) => {
  const rawPhone = pickNestedText(payload, [
    'phone',
    'telefone',
    'lead.phone',
    'lead.telefone',
    'customer.phone',
    'customer.telefone',
    'contact.phone',
    'contact.telefone',
    'client.phone',
    'client.telefone',
    'phoneNumber',
  ]);
  if (rawPhone) return rawPhone;

  const collections = [
    payload?.phones,
    payload?.telefones,
    payload?.lead?.phones,
    payload?.customer?.phones,
    payload?.contact?.phones,
  ];

  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const entry of collection) {
      const phone = typeof entry === 'object'
        ? pickFirstNonEmpty(entry.number, entry.phone, entry.value, entry.telefone)
        : pickFirstNonEmpty(entry);
      if (phone) return phone;
    }
  }

  return null;
};

const normalizeZapLeadPayload = (payload) => {
  const body = payload || {};
  const lead = body.lead || body.data?.lead || body.payload?.lead || {};
  const customer = body.customer || body.client || body.contact || lead.customer || lead.client || {};
  const listing = body.listing || body.property || body.imovel || lead.listing || lead.property || {};
  const zapLeadId = pickNestedText(body, ['id', 'leadId', 'lead_id', 'lead.id', 'data.id', 'payload.id']);
  // Mesma lista do proxy-production: o Grupo OLX manda o imóvel em
  // clientListingId/originListingId, não em listing/listingId.
  const propertyCode = pickFirstNonEmpty(
    body.interest_reference,
    body.property_code,
    body.codigo_imovel,
    body.clientListingId,
    body.client_listing_id,
    body.extraData?.clientListingId,
    body.originListingId,
    body.origin_listing_id,
    body.extraData?.originListingId,
    body.listingId,
    body.externalListingId,
    body.propertyId,
    listing.externalId,
    listing.external_id,
    listing.externalCode,
    listing.code,
    listing.id,
    lead.listingId,
    lead.propertyId
  );
  const transactionType = String(pickFirstNonEmpty(
    body.transactionType,
    body.transaction_type,
    listing.transactionType,
    listing.transaction_type,
    listing.finalidade
  ) || '').toLowerCase();

  return {
    name: pickFirstNonEmpty(body.name, body.nome, lead.name, lead.nome, customer.name, customer.nome, customer.fullName),
    phone: extractZapPhone({ ...body, lead, customer }),
    email: pickFirstNonEmpty(body.email, lead.email, customer.email, customer.mail),
    portal: pickFirstNonEmpty(body.portal, body.source, body.origin, body.origem) || 'ZAP Imóveis',
    message: pickFirstNonEmpty(body.message, body.mensagem, body.comments, lead.message, lead.mensagem, body.description, body.text),
    interest_reference: propertyCode,
    property_code: propertyCode,
    interest_type: propertyCode ? 'property' : null,
    interest_is_sale: transactionType ? transactionType.includes('sale') || transactionType.includes('venda') : undefined,
    interest_is_rent: transactionType ? transactionType.includes('rent') || transactionType.includes('loca') || transactionType.includes('aluguel') : undefined,
    interest_image: pickFirstNonEmpty(body.interest_image, body.image, body.imageUrl, listing.image, listing.imageUrl, listing.thumbnail),
    attended_by: pickFirstNonEmpty(body.attended_by, body.assigned_agent, body.corretor, listing.brokerName, listing.agentName, lead.attended_by),
    external_id: zapLeadId ? `zap_${zapLeadId}` : null,
    raw_data: {
      source: 'zapimoveis_webhook',
      zap_lead_id: zapLeadId,
      original_request: body,
    },
  };
};

const resolvePropertyExclusivity = async (tenantId, propertyCode) => {
  if (!tenantId || !propertyCode) return false;

  const normalizedCode = String(propertyCode).trim().toUpperCase();

  try {
    const { data: localProperty } = await supabase
      .from('imoveis_locais')
      .select('exclusivo')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', normalizedCode)
      .maybeSingle();

    if (localProperty && typeof localProperty.exclusivo === 'boolean') {
      return localProperty.exclusivo;
    }

    const { data: brokerProperty } = await supabase
      .from('imoveis_corretores')
      .select('exclusivo')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', normalizedCode)
      .maybeSingle();

    if (brokerProperty && typeof brokerProperty.exclusivo === 'boolean') {
      return brokerProperty.exclusivo;
    }
  } catch (error) {
    console.warn('⚠️ Erro ao resolver exclusividade do imóvel:', error.message);
  }

  return false;
};

// Mappers para tabela bolsao
const mapBolsaoLeadFromDB = (row) => ({
  id: row.id,
  name: row.nome || row.client_name || '',
  phone: row.telefone || row.client_phone || '',
  email: row.email || '',
  source: row.portal || row.origem || '',
  stage: row.status === 'bolsao' ? 1 : (row.status === 'atribuido' ? 2 : 3),
  status: row.status,
  assigned_agent: row.corretor_responsavel || null,
  assigned_agent_phone: row.numero_corretor_responsavel || null,
  assigned_at: row.data_atribuicao,
  attended: row.atendido || false,
  created_at: row.created_at,
  updated_at: row.updated_at
});

// ============================================
// ROUTES - LEADS
// ============================================

// GET /api/v1/leads - Listar leads
app.get('/api/v1/leads', validateApiKey, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      stage, 
      temperature, 
      source, 
      portal,
      tenant_id,
      search,
      start_date,
      end_date,
      archived = 'false'
    } = req.query;

    let query = supabase
      .from(LEADS_TABLE)
      .select('*', { count: 'exact' });

    // Filtro de arquivamento: por padrão retorna apenas ativos
    if (archived === 'true') {
      query = query.not('archived_at', 'is', null);
    } else if (archived !== 'all') {
      query = query.is('archived_at', null);
    }

    // Escopo por tenant (via API Key)
    if (req.tenantId) query = query.eq('tenant_id', req.tenantId);

    // Filtros adicionais
    if (portal) query = query.eq('portal', portal);
    if (source) query = query.eq('portal', source);
    // O escopo de tenant já vem da API key (req.tenantId, sempre definido).
    // NÃO honrar ?tenant_id= da query — seria um vetor de acesso cross-tenant.
    if (search) {
      const s = sanitizeFilterValue(search);
      query = query.or(`client_name.ilike.%${s}%,client_phone.ilike.%${s}%,client_email.ilike.%${s}%`);
    }
    if (start_date) query = query.gte('lead_timestamp', start_date);
    if (end_date) query = query.lte('lead_timestamp', end_date);

    // Paginação
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    query = query.order('lead_timestamp', { ascending: false });

    const { data, error, count } = await query;

    if (error) throw error;

    const leads = (data || []).map(mapLeadFromDB);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        total_pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Erro ao listar leads:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/leads/archived - Listar leads arquivados do tenant
app.get('/api/v1/leads/archived', validateApiKey, async (req, res) => {
  try {
    const { 
      page = 1,
      limit = 50,
      search,
      assigned_agent
    } = req.query;

    let query = supabase
      .from(LEADS_TABLE)
      .select('*', { count: 'exact' })
      .not('archived_at', 'is', null);

    if (req.tenantId) query = query.eq('tenant_id', req.tenantId);
    if (search) {
      const s = sanitizeFilterValue(search);
      query = query.or(`client_name.ilike.%${s}%,client_phone.ilike.%${s}%,client_email.ilike.%${s}%`);
    }
    if (assigned_agent) query = query.eq('attended_by_name', assigned_agent);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);
    query = query.order('archived_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      data: (data || []).map(mapLeadFromDB),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        total_pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Erro ao listar leads arquivados:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// GET /api/v1/leads/:id - Buscar lead por ID ou external_id
app.get('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    // Tentar buscar por id numérico ou external_id
    // Escopo por tenant da API Key (evita leitura cross-tenant).
    let query = supabase.from(LEADS_TABLE).select('*').eq('tenant_id', req.tenantId);
    
    // Se for numérico, buscar por id; senão, buscar por external_id
    if (!isNaN(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('external_id', id);
    }
    
    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead com ID ${id} não encontrado`
          }
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data: mapLeadFromDB(data)
    });
  } catch (error) {
    console.error('❌ Erro ao buscar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/leads/phone/:phone - Buscar lead por telefone
app.get('/api/v1/leads/phone/:phone', validateApiKey, async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = phone.replace(/\D/g, '');

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .select('*')
      .eq('tenant_id', req.tenantId)
      .or(`client_phone.eq.${cleanPhone},client_phone.eq.${phone}`)
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Lead com telefone ${phone} não encontrado`
        }
      });
    }

    res.json({
      success: true,
      data: mapLeadFromDB(data[0]),
      exists: true
    });
  } catch (error) {
    console.error('❌ Erro ao buscar lead por telefone:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// ROLETA DE CORRETORES - Estado em memória por tenant
// ============================================
const tenantRoletaState = new Map(); // { tenant_id: { lastIndex: number, brokers: string[] } }

/**
 * Normaliza telefone para comparação (remove máscaras, DDD duplicado, etc)
 */
const normalizePhone = (phone) => {
  if (!phone) return null;
  let clean = String(phone).replace(/\D/g, '');
  // Remover código do país se presente (55)
  if (clean.length > 11 && clean.startsWith('55')) {
    clean = clean.substring(2);
  }
  // Se tiver 11 dígitos, está ok (DDD + 9 dígitos)
  // Se tiver 10 dígitos, adicionar 9 após DDD para celular
  if (clean.length === 10) {
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
  }
  return clean;
};

/**
 * Busca corretor responsável pelo imóvel usando pipeline:
 * 1. raw_data.attendedBy (leads Kenlo)
 * 2. properties_cache (XML sincronizado)  
 * 3. imoveis_corretores (Meus Imóveis - atribuição manual)
 * 4. Roleta (fallback)
 */
const resolveBrokerForLead = async (leadData, tenantId, rawData = null) => {
  let broker = null;
  let method = null;
  
  // 1. Verificar se já veio com attendedBy do Kenlo (raw_data)
  if (rawData?.attendedBy && Array.isArray(rawData.attendedBy) && rawData.attendedBy.length > 0) {
    const attendedBroker = rawData.attendedBy[0];
    if (attendedBroker?.name) {
      broker = {
        name: attendedBroker.name,
        id: attendedBroker.id?.toString() || null,
        phone: null
      };
      method = 'kenlo_attended_by';
      console.log(`✅ Corretor encontrado via Kenlo attendedBy: ${broker.name}`);
      return { broker, method };
    }
  }
  
  // 2. Buscar no cache de imóveis (XML sincronizado) por código
  const propertyCode = leadData.interest_reference?.trim().toUpperCase();
  if (propertyCode) {
    // 2a. Primeiro tentar properties_cache (dados do XML)
    const { data: cachedProperty } = await supabase
      .from('properties_cache')
      .select('agent_name, agent_phone, agent_email')
      .eq('tenant_id', tenantId)
      .eq('property_code', propertyCode)
      .single();
    
    if (cachedProperty?.agent_name) {
      broker = {
        name: cachedProperty.agent_name,
        phone: normalizePhone(cachedProperty.agent_phone),
        email: cachedProperty.agent_email
      };
      method = 'xml_property_cache';
      console.log(`✅ Corretor encontrado via XML/cache: ${broker.name}`);
      return { broker, method };
    }
    
    // 2b. Fallback: buscar em imoveis_corretores (Meus Imóveis - atribuição manual)
    const { data: manualAssignment } = await supabase
      .from('imoveis_corretores')
      .select('corretor_nome, corretor_id, corretor_telefone, corretor_email')
      .eq('tenant_id', tenantId)
      .eq('codigo_imovel', propertyCode)
      .single();
    
    if (manualAssignment?.corretor_nome) {
      broker = {
        name: manualAssignment.corretor_nome,
        id: manualAssignment.corretor_id,
        phone: normalizePhone(manualAssignment.corretor_telefone),
        email: manualAssignment.corretor_email
      };
      method = 'meus_imoveis';
      console.log(`✅ Corretor encontrado via Meus Imóveis: ${broker.name}`);
      return { broker, method };
    }
  }
  
  // 3. Nenhum corretor encontrado - usar ROLETA
  console.log(`⚙️ Nenhum corretor encontrado para código ${propertyCode}, usando roleta...`);
  const roletaBroker = await getNextBrokerFromRoleta(tenantId);
  
  if (roletaBroker) {
    broker = roletaBroker;
    method = 'roleta';
    console.log(`🎰 Corretor atribuído via roleta: ${broker.name}`);
    return { broker, method };
  }
  
  // Nenhum corretor disponível
  console.log('⚠️ Nenhum corretor disponível para atribuição');
  return { broker: null, method: null };
};

/**
 * Obtém próximo corretor da roleta para o tenant (Multi-tenant)
 * Fonte primária: roleta_participantes (corretores selecionados pelo admin)
 * Fallback 1: tenant_memberships (todos os corretores do tenant)
 * Fallback 2: imoveis_corretores (para compatibilidade)
 */
const getNextBrokerFromRoleta = async (tenantId) => {
  try {
    let brokerList = [];
    
    // 1. FONTE PRIMÁRIA: Buscar corretores ATIVOS na tabela roleta_participantes
    const { data: participantes, error: participantesError } = await supabase
      .from('roleta_participantes')
      .select('broker_id, broker_name, broker_email, broker_phone')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    
    if (!participantesError && participantes && participantes.length > 0) {
      brokerList = participantes.map(p => ({
        id: p.broker_id,
        name: p.broker_name,
        email: p.broker_email,
        phone: normalizePhone(p.broker_phone)
      }));
      console.log(`🎰 Roleta: ${brokerList.length} corretor(es) configurados na roleta`);
    }
    
    // 2. FALLBACK 1: Se não houver participantes configurados, usar tenant_memberships
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor configurado na roleta, usando memberships...');
      const { data: members } = await supabase
        .from('tenant_memberships')
        .select(`
          user_id,
          role,
          users:user_id (
            id,
            raw_user_meta_data
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('role', 'corretor');
      
      if (members && members.length > 0) {
        brokerList = members
          .filter(m => m.users?.raw_user_meta_data?.name)
          .map(m => ({
            name: m.users.raw_user_meta_data.name,
            id: m.user_id,
            phone: m.users.raw_user_meta_data.phone || null
          }));
      }
    }
    
    // 3. FALLBACK 2: Se não houver memberships, tentar imoveis_corretores
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor em memberships, tentando imoveis_corretores...');
      const { data: brokers } = await supabase
        .from('imoveis_corretores')
        .select('corretor_nome, corretor_id, corretor_telefone')
        .eq('tenant_id', tenantId)
        .not('corretor_nome', 'is', null);
      
      if (brokers && brokers.length > 0) {
        // Deduplicar por nome
        const seen = new Set();
        brokerList = brokers
          .filter(b => {
            if (seen.has(b.corretor_nome)) return false;
            seen.add(b.corretor_nome);
            return true;
          })
          .map(b => ({
            name: b.corretor_nome,
            id: b.corretor_id,
            phone: b.corretor_telefone
          }));
      }
    }
    
    if (brokerList.length === 0) {
      console.log('⚠️ Nenhum corretor disponível para roleta');
      return null;
    }
    
    // Estado da roleta por tenant (round-robin)
    if (!tenantRoletaState.has(tenantId)) {
      tenantRoletaState.set(tenantId, { lastIndex: -1 });
    }
    
    const state = tenantRoletaState.get(tenantId);
    const nextIndex = (state.lastIndex + 1) % brokerList.length;
    state.lastIndex = nextIndex;
    
    console.log(`🎰 Roleta: ${nextIndex + 1}/${brokerList.length} - ${brokerList[nextIndex].name}`);
    return brokerList[nextIndex];
  } catch (error) {
    console.error('❌ Erro na roleta:', error);
    return null;
  }
};

// ============================================
// ZAP/OLX VRSync feed routes
// ============================================
app.get('/api/v1/integrations/zapimoveis/health', validateZapFeedAccess, async (req, res) => {
  try {
    const listings = await getZapFeedListings(req.tenantId);
    res.json({
      success: true,
      integration: 'zapimoveis-vrsync',
      status: 'ready',
      tenant_id: req.tenantId,
      approved_listings_count: listings.length,
      routes: [
        'GET /api/v1/integrations/zapimoveis/vrsync.xml',
        'GET /api/v1/integrations/zapimoveis/feed.xml',
        'GET /api/v1/integrations/zapimoveis/debug',
        'POST /api/v1/integrations/zapimoveis/webhook',
        'POST /api/v1/integrations/zapimoveis/notify-update',
        'GET /api/v1/integrations/grupo-olx/vrsync.xml'
      ],
      auth: {
        feed_secret_configured: Boolean(getZapFeedConfig().secret),
        tenant_id_configured: Boolean(getZapFeedConfig().tenantId),
        supabase_using_service_role: usingServiceRole
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

app.get('/api/v1/integrations/zapimoveis/debug', validateZapFeedAccess, async (req, res) => {
  try {
    const debugInfo = await getZapFeedDebugInfo(req.tenantId);
    res.json({
      success: true,
      integration: 'zapimoveis-vrsync',
      tenant_id: req.tenantId,
      supabase_using_service_role: usingServiceRole,
      ...debugInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao diagnosticar feed VRSync Zap/OLX:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

app.get('/api/v1/integrations/zapimoveis/vrsync.xml', validateZapFeedAccess, createZapVRSyncFeed);
app.get('/api/v1/integrations/zapimoveis/feed.xml', validateZapFeedAccess, createZapVRSyncFeed);
app.get('/api/v1/integrations/grupo-olx/vrsync.xml', validateZapFeedAccess, createZapVRSyncFeed);

app.post('/api/v1/integrations/zapimoveis/notify-update', validateZapFeedAccess, async (req, res) => {
  try {
    const rawCodes = req.body?.property_code ?? req.body?.codigo_imovel ?? req.body?.property_codes ?? [];
    const propertyCodes = (Array.isArray(rawCodes) ? rawCodes : [rawCodes])
      .map((code) => normalizeFeedText(code).toUpperCase())
      .filter(Boolean);
    const action = ['create', 'update', 'delete'].includes(req.body?.action) ? req.body.action : 'update';

    const listings = await getZapFeedListings(req.tenantId);
    const eligibleCodes = new Set(listings.map((l) => normalizeFeedText(l.codigo_imovel).toUpperCase()));
    const missing = propertyCodes.filter((code) => !eligibleCodes.has(code));

    const feedUrl = buildPublicFeedUrl(req, req.tenantId);
    const notifyResult = await notifyZapResync({
      tenantId: req.tenantId,
      propertyCodes,
      action,
      feedUrl,
      config: req.zapConfig || getZapFeedConfig()
    });

    console.log('📤 Webhook ZAP notify-update:', {
      tenant_id: req.tenantId,
      action,
      property_codes: propertyCodes,
      eligible_count: listings.length,
      missing_from_feed: missing,
      notified: notifyResult.notified,
      reason: notifyResult.reason
    });

    res.json({
      success: true,
      integration: 'zapimoveis-notify-update',
      tenant_id: req.tenantId,
      action,
      property_codes: propertyCodes,
      eligible_listings_count: listings.length,
      missing_from_feed: missing,
      feed_url: feedUrl,
      zap_resync: notifyResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro no notify-update do ZAP:', error);
    res.status(500).json({
      success: false,
      integration: 'zapimoveis-notify-update',
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// POST /api/v1/leads - Criar lead com atribuição automática
// Pipeline: 1) attendedBy → 2) XML/cache → 3) Meus Imóveis → 4) Roleta
app.post('/api/v1/integrations/zapimoveis/webhook', validateZapFeedAccess, async (req, res) => {
  try {
    const normalized = normalizeZapLeadPayload(req.body);
    // Tenant vem do secret/API Key (validateZapFeedAccess), nunca do payload do portal.
    const tenantId = req.tenantId;
    const now = new Date().toISOString();
    const propertyCode = normalized.property_code || normalized.interest_reference || null;
    const sourceLeadId = normalized.external_id || `zap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!normalized.name && !normalized.phone) {
      return res.status(400).json({
        success: false,
        integration: 'zapimoveis-webhook',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Nome ou telefone é obrigatório'
        }
      });
    }

    const { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('source_lead_id', sourceLeadId)
      .maybeSingle();

    if (existingLead) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        integration: 'zapimoveis-webhook',
        data: existingLead,
        message: 'Lead já recebido anteriormente.'
      });
    }

    const normalizedPropertyCode = propertyCode ? String(propertyCode).trim().toUpperCase() : null;
    const isExclusive = await resolvePropertyExclusivity(tenantId, normalizedPropertyCode);
    const assignmentLeadData = {
      tenant_id: tenantId,
      interest_reference: normalizedPropertyCode,
      raw_data: normalized.raw_data,
    };
    const { broker, method } = await resolveBrokerForLead(assignmentLeadData, tenantId, normalized.raw_data);
    const crmLeadData = {
      tenant_id: tenantId,
      name: normalized.name || 'Lead sem nome',
      phone: normalized.phone,
      email: normalized.email,
      source: normalized.portal || 'ZAP Imóveis',
      source_lead_id: sourceLeadId,
      status: 'Novos Leads',
      temperature: 'Frio',
      property_code: normalizedPropertyCode,
      is_exclusive: isExclusive,
      assigned_agent_id: broker?.id || null,
      assigned_agent_name: broker?.name || normalized.attended_by || null,
      comments: normalized.message,
      lead_type: 1,
      custom_fields: {
        source: 'zapimoveis_webhook',
        external_id: sourceLeadId,
        interest_type: normalized.interest_type,
        interest_is_sale: normalized.interest_is_sale,
        interest_is_rent: normalized.interest_is_rent,
        interest_image: normalized.interest_image,
        raw_data: normalized.raw_data,
        auto_assigned: broker ? { broker: broker.name, method } : null,
      },
      created_at: now,
      updated_at: now,
    };

    if (broker) {
      crmLeadData.assigned_agent_name = broker.name;
      crmLeadData.assigned_agent_id = broker.id || null;
    }

    const { data, error } = await supabase
      .from('leads')
      .insert(crmLeadData)
      .select()
      .single();

    if (error) throw error;

    if (req.integrationAuth === 'zapimoveis_tenant_secret') {
      void zapConfigResolver.touch(tenantId, 'last_lead_at');
    }

    res.status(201).json({
      success: true,
      integration: 'zapimoveis-webhook',
      data,
      auto_assigned: broker ? {
        broker_name: broker.name,
        broker_id: crmLeadData.assigned_agent_id,
        method
      } : null,
      message: broker
        ? `Lead do ZAP recebido e atribuído a ${broker.name} (via ${method})`
        : 'Lead do ZAP recebido e salvo.'
    });
  } catch (error) {
    console.error('❌ Erro no webhook ZAP:', error);
    res.status(500).json({
      success: false,
      integration: 'zapimoveis-webhook',
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

app.post('/api/v1/leads', validateApiKey, async (req, res) => {
  try {
    const leadData = mapLeadToDB(req.body);
    const { auto_assign = true, broker_id, broker_phone, raw_data, is_exclusive, exclusivo, imovel_exclusivo } = req.body;
    // Tenant da API Key, sempre — o corpo não escolhe o destino do lead.
    const tenantId = req.tenantId;
    leadData.tenant_id = req.tenantId;

    // Definir timestamp se não fornecido
    if (!leadData.lead_timestamp) {
      leadData.lead_timestamp = new Date().toISOString();
    }

    // Validação: nome ou telefone é obrigatório
    if (!leadData.client_name && !leadData.client_phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Nome ou telefone é obrigatório'
        }
      });
    }
    
    // Gerar external_id se não fornecido
    if (!leadData.external_id) {
      leadData.external_id = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    const explicitExclusiveValue = is_exclusive ?? exclusivo ?? imovel_exclusivo;
    const normalizedExclusive = explicitExclusiveValue === undefined || explicitExclusiveValue === null
      ? null
      : explicitExclusiveValue === true || explicitExclusiveValue === 'true' || explicitExclusiveValue === '1' || explicitExclusiveValue === 1 || String(explicitExclusiveValue).toLowerCase() === 'sim';

    leadData.interest_reference = leadData.interest_reference ? String(leadData.interest_reference).trim().toUpperCase() : null;
    leadData.is_exclusive = normalizedExclusive !== null
      ? normalizedExclusive
      : await resolvePropertyExclusivity(tenantId, leadData.interest_reference);

    let assignedBroker = null;
    let assignmentMethod = null;

    // Auto-atribuição de corretor
    if (auto_assign !== false) {
      // Prioridade 0: broker_id ou broker_phone explícito
      if (broker_id) {
        const { data: brokerData } = await supabase
          .from('imoveis_corretores')
          .select('corretor_nome, corretor_id')
          .eq('tenant_id', tenantId)
          .eq('corretor_id', broker_id)
          .limit(1);

        if (brokerData && brokerData.length > 0) {
          leadData.attended_by_name = brokerData[0].corretor_nome;
          assignedBroker = brokerData[0].corretor_nome;
          assignmentMethod = 'broker_id_explicit';
        }
      } else if (broker_phone) {
        const cleanPhone = normalizePhone(broker_phone);
        const { data: brokerData } = await supabase
          .from('imoveis_corretores')
          .select('corretor_nome, corretor_id, corretor_telefone')
          .eq('tenant_id', tenantId)
          .or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${broker_phone}`)
          .limit(1);
        
        if (brokerData && brokerData.length > 0) {
          leadData.attended_by_name = brokerData[0].corretor_nome;
          assignedBroker = brokerData[0].corretor_nome;
          assignmentMethod = 'broker_phone_explicit';
        }
      }
      
      // Se não encontrou por ID/phone explícito, usar pipeline completo
      if (!assignedBroker && tenantId) {
        const { broker, method } = await resolveBrokerForLead(leadData, tenantId, raw_data || leadData.raw_data);
        
        if (broker) {
          leadData.attended_by_name = broker.name;
          if (broker.id) leadData.corretor_id = broker.id;
          assignedBroker = broker.name;
          assignmentMethod = method;
        }
      }
    }

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .insert(leadData)
      .select()
      .single();

    if (error) throw error;

    const response = {
      success: true,
      data: mapLeadFromDB(data),
      message: 'Lead criado com sucesso'
    };

    if (assignedBroker) {
      response.auto_assigned = {
        broker_name: assignedBroker,
        broker_id: leadData.corretor_id || null,
        method: assignmentMethod
      };
      response.message = `Lead criado e atribuído a ${assignedBroker} (via ${assignmentMethod})`;
    } else {
      response.message = 'Lead criado sem atribuição de corretor';
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('❌ Erro ao criar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PUT /api/v1/leads/:id - Atualizar lead (completo)
app.put('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const leadData = mapLeadToDB(req.body);
    leadData.updated_at = new Date().toISOString();

    // Buscar por id numérico ou external_id
    // Escopo por tenant da API Key (evita escrita cross-tenant).
    let query = supabase.from(LEADS_TABLE).update(leadData).eq('tenant_id', req.tenantId);
    if (!isNaN(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('external_id', id);
    }
    
    const { data, error } = await query.select().single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead com ID ${id} não encontrado`
          }
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: 'Lead atualizado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id - Atualizar lead (parcial)
app.patch('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const leadData = mapLeadToDB(req.body);
    leadData.updated_at = new Date().toISOString();

    // Buscar por id numérico ou external_id
    // Escopo por tenant da API Key (evita escrita cross-tenant).
    let query = supabase.from(LEADS_TABLE).update(leadData).eq('tenant_id', req.tenantId);
    if (!isNaN(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('external_id', id);
    }
    
    const { data, error } = await query.select().single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Lead com ID ${id} não encontrado`
          }
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: 'Lead atualizado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// Etapa numérica (1..10, contrato público) -> slug real da coluna kenlo_leads.stage.
// Espelha normalizeStage de proxy-production.js. kenlo_leads.stage é TEXT (slug),
// não número — gravar número quebra a leitura no front (KENLO_STAGE_TO_STATUS).
const STAGE_NUM_TO_KENLO_STAGE = {
  1: 'new', 2: 'contacted', 3: 'qualified', 4: 'visit_scheduled', 5: 'visit_done',
  6: 'negotiation', 7: 'proposal', 8: 'proposal', 9: 'closed_won', 10: 'closed_lost',
};

const STAGE_NUM_NAMES = {
  1: 'Novos Leads', 2: 'Em Atendimento', 3: 'Qualificado',
  4: 'Visita Agendada', 5: 'Visita Realizada', 6: 'Em Negociação',
  7: 'Proposta Criada', 8: 'Proposta Enviada', 9: 'Proposta Assinada', 10: 'Arquivado'
};

// PATCH /api/v1/leads/:id/stage - Alterar etapa do funil (kenlo_leads)
app.patch('/api/v1/leads/:id/stage', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const stageNum = Number(req.body?.stage);

    if (!Number.isInteger(stageNum) || stageNum < 1 || stageNum > 10) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Etapa deve ser um número inteiro entre 1 e 10'
        }
      });
    }

    const kenloStage = STAGE_NUM_TO_KENLO_STAGE[stageNum];

    // Escopo por tenant da API Key (evita escrita cross-tenant) + match por id/external_id.
    const applyScope = (query) => {
      const scoped = query.eq('tenant_id', req.tenantId);
      return !isNaN(id) ? scoped.eq('id', id) : scoped.eq('external_id', id);
    };

    // Buscar lead atual para a etapa anterior (coluna real é 'stage', não 'etapa_funil').
    const { data: currentLead } = await applyScope(
      supabase.from(LEADS_TABLE).select('stage')
    ).single();

    const previousStage = currentLead?.stage || 'new';

    const { data, error } = await applyScope(
      supabase.from(LEADS_TABLE).update({
        stage: kenloStage,
        updated_at: new Date().toISOString()
      })
    ).select().single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `Lead com ID ${id} não encontrado` }
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data: {
        ...mapLeadFromDB(data),
        stage_name: STAGE_NUM_NAMES[stageNum],
        previous_stage: previousStage
      }
    });
  } catch (error) {
    console.error('❌ Erro ao alterar etapa:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id/temperature - Alterar temperatura
app.patch('/api/v1/leads/:id/temperature', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    let { temperature } = req.body;

    // Aceitar número ou string
    const tempMap = { 1: 'cold', 2: 'warm', 3: 'hot', cold: 'cold', warm: 'warm', hot: 'hot' };
    temperature = tempMap[temperature];

    if (!temperature) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Temperatura deve ser 1 (cold), 2 (warm), 3 (hot) ou cold/warm/hot'
        }
      });
    }

    let selectQuery = supabase.from(LEADS_TABLE).select('temperatura').eq('tenant_id', req.tenantId);
    if (!isNaN(id)) {
      selectQuery = selectQuery.eq('id', id);
    } else {
      selectQuery = selectQuery.eq('external_id', id);
    }
    const { data: currentLead } = await selectQuery.single();

    const previousTemp = currentLead?.temperatura || 'cold';

    let updateQuery = supabase.from(LEADS_TABLE).update({
      temperatura: temperature,
      updated_at: new Date().toISOString()
    }).eq('tenant_id', req.tenantId);
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    const tempNames = { cold: 'Frio', warm: 'Morno', hot: 'Quente' };

    res.json({
      success: true,
      data: {
        ...mapLeadFromDB(data),
        temperature_name: tempNames[temperature],
        previous_temperature: previousTemp
      }
    });
  } catch (error) {
    console.error('❌ Erro ao alterar temperatura:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id/agent - Atribuir corretor
app.patch('/api/v1/leads/:id/agent', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_agent, assigned_agent_id } = req.body;

    let updateQuery = supabase.from(LEADS_TABLE).update({
      attended_by_name: assigned_agent,
      updated_at: new Date().toISOString()
    }).eq('tenant_id', req.tenantId);
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: `Lead atribuído a ${assigned_agent}`
    });
  } catch (error) {
    console.error('❌ Erro ao atribuir corretor:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// DELETE /api/v1/leads/:id - Arquivar lead (soft delete)
app.delete('/api/v1/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, motivo } = req.body || {};
    const archiveReason = reason || motivo || 'Arquivado via API';

    let updateQuery = supabase.from(LEADS_TABLE).update({ 
      archived_at: new Date().toISOString(),
      archive_reason: archiveReason,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    if (req.tenantId) updateQuery = updateQuery.eq('tenant_id', req.tenantId);
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: 'Lead arquivado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao arquivar lead:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// PATCH /api/v1/leads/:id/archive - Arquivar lead com motivo
app.patch('/api/v1/leads/:id/archive', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, motivo } = req.body || {};
    const archiveReason = reason || motivo || 'Arquivado via API';

    let updateQuery = supabase.from(LEADS_TABLE).update({
      archived_at: new Date().toISOString(),
      archive_reason: archiveReason,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    if (req.tenantId) updateQuery = updateQuery.eq('tenant_id', req.tenantId);
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: `Lead arquivado: ${archiveReason}`
    });
  } catch (error) {
    console.error('❌ Erro ao arquivar lead:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// PATCH /api/v1/leads/:id/unarchive - Desarquivar lead
app.patch('/api/v1/leads/:id/unarchive', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    let updateQuery = supabase.from(LEADS_TABLE).update({
      archived_at: null,
      archive_reason: null,
      updated_at: new Date().toISOString()
    });
    if (!isNaN(id)) {
      updateQuery = updateQuery.eq('id', id);
    } else {
      updateQuery = updateQuery.eq('external_id', id);
    }
    if (req.tenantId) updateQuery = updateQuery.eq('tenant_id', req.tenantId);
    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    res.json({
      success: true,
      data: mapLeadFromDB(data),
      message: 'Lead desarquivado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao desarquivar lead:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// POST /api/v1/leads/batch - Criar leads em lote
app.post('/api/v1/leads/batch', validateApiKey, async (req, res) => {
  try {
    const { leads } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Array de leads é obrigatório'
        }
      });
    }

    if (leads.length > 100) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Máximo de 100 leads por requisição'
        }
      });
    }

    const leadsToInsert = leads.map(lead => {
      const mapped = mapLeadToDB(lead);
      // Sem isto o lead nasce com tenant_id NULL — órfão, invisível na aplicação.
      mapped.tenant_id = req.tenantId;
      // Definir timestamp se não fornecido
      if (!mapped.lead_timestamp) {
        mapped.lead_timestamp = new Date().toISOString();
      }
      // Gerar external_id se não fornecido
      if (!mapped.external_id) {
        mapped.external_id = `api-batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      return mapped;
    });

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .insert(leadsToInsert)
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data: (data || []).map(mapLeadFromDB),
      count: data?.length || 0,
      message: `${data?.length || 0} leads criados com sucesso`
    });
  } catch (error) {
    console.error('❌ Erro ao criar leads em lote:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/leads/upsert - Criar ou atualizar lead por telefone
app.post('/api/v1/leads/upsert', validateApiKey, async (req, res) => {
  try {
    const { phone, ...leadData } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Telefone é obrigatório para upsert'
        }
      });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // Verificar se existe (usando client_phone que é o nome correto da coluna)
    // Escopo por tenant da API Key (evita match/atualização cross-tenant).
    const { data: existing } = await supabase
      .from(LEADS_TABLE)
      .select('id, external_id')
      .eq('tenant_id', req.tenantId)
      .or(`client_phone.eq.${cleanPhone},client_phone.eq.${phone}`)
      .limit(1);

    let result;
    let isNew = false;

    if (existing && existing.length > 0) {
      // Atualizar
      const { data, error } = await supabase
        .from(LEADS_TABLE)
        .update({
          ...mapLeadToDB(leadData),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing[0].id)
        .eq('tenant_id', req.tenantId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Criar
      const mapped = mapLeadToDB({ phone, ...leadData });
      // Escopo por tenant da API Key: garante que o lead criado pertence ao tenant
      // (mesmo idioma do POST /leads), evitando linhas órfãs e duplicatas em upserts futuros.
      mapped.tenant_id = req.tenantId;
      if (!mapped.lead_timestamp) {
        mapped.lead_timestamp = new Date().toISOString();
      }
      if (!mapped.external_id) {
        mapped.external_id = `api-upsert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const { data, error } = await supabase
        .from(LEADS_TABLE)
        .insert(mapped)
        .select()
        .single();

      if (error) throw error;
      result = data;
      isNew = true;
    }

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: mapLeadFromDB(result),
      created: isNew,
      message: isNew ? 'Lead criado com sucesso' : 'Lead atualizado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro no upsert:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// ROUTES - ROLETA
// ============================================

// GET /api/v1/roleta - Consultar estado da roleta da imobiliária
// Retorna todos os participantes ativos e quem será o próximo a receber um lead
app.get('/api/v1/roleta', validateApiKey, async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id não identificado na API Key' }
      });
    }

    // Buscar participantes ativos da roleta (fonte primária)
    const { data: participantes, error: participantesError } = await supabase
      .from('roleta_participantes')
      .select('broker_id, broker_name, broker_email, broker_phone, is_active, created_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    let brokerList = [];
    let source = 'roleta_participantes';

    if (!participantesError && participantes && participantes.length > 0) {
      brokerList = participantes.map((p, index) => ({
        position: index + 1,
        broker_id: p.broker_id,
        name: p.broker_name,
        email: p.broker_email || null,
        phone: p.broker_phone || null,
        added_at: p.created_at
      }));
    } else {
      // Fallback: tenant_memberships (corretores com acesso ao sistema)
      source = 'tenant_memberships';
      const { data: members } = await supabase
        .from('tenant_memberships')
        .select('user_id, role')
        .eq('tenant_id', tenantId)
        .eq('role', 'corretor');

      if (members && members.length > 0) {
        brokerList = members.map((m, index) => ({
          position: index + 1,
          broker_id: m.user_id,
          name: null,
          email: null,
          phone: null,
          added_at: null
        }));
      }
    }

    // Calcular quem é o próximo (sem avançar o índice — apenas leitura)
    const state = tenantRoletaState.get(tenantId);
    const lastIndex = state ? state.lastIndex : -1;
    const nextIndex = brokerList.length > 0 ? (lastIndex + 1) % brokerList.length : null;
    const nextBroker = nextIndex !== null ? brokerList[nextIndex] : null;

    // Marcar o próximo na lista
    const brokersWithStatus = brokerList.map((b, i) => ({
      ...b,
      is_next: i === nextIndex
    }));

    res.json({
      success: true,
      data: {
        total: brokerList.length,
        source,
        next_broker: nextBroker
          ? { position: nextBroker.position, name: nextBroker.name, broker_id: nextBroker.broker_id, phone: nextBroker.phone, email: nextBroker.email }
          : null,
        brokers: brokersWithStatus
      },
      message: brokerList.length === 0
        ? 'Nenhum corretor configurado na roleta'
        : `Roleta com ${brokerList.length} corretor(es). Próximo: ${nextBroker?.name || 'N/A'}`
    });
  } catch (error) {
    console.error('❌ Erro ao buscar roleta:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// POST /api/v1/leads/roleta - Cadastrar lead com distribuição FORÇADA via roleta
// Atribui o lead diretamente ao próximo corretor da roleta (sem pipeline de imóvel)
app.post('/api/v1/leads/roleta', validateApiKey, async (req, res) => {
  try {
    const leadData = mapLeadToDB(req.body);
    // Tenant da API Key, sempre — o corpo não escolhe o destino do lead.
    const tenantId = req.tenantId;
    leadData.tenant_id = req.tenantId;

    if (!leadData.lead_timestamp) {
      leadData.lead_timestamp = new Date().toISOString();
    }

    if (!leadData.client_name && !leadData.client_phone) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Nome ou telefone é obrigatório' }
      });
    }

    if (!leadData.external_id) {
      leadData.external_id = `api-roleta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Distribuição FORÇADA via roleta (ignora imóvel/pipeline)
    const broker = await getNextBrokerFromRoleta(tenantId);

    if (!broker) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'NO_BROKER_AVAILABLE',
          message: 'Nenhum corretor disponível na roleta. Configure participantes em Configurações > Roleta.'
        }
      });
    }

    leadData.attended_by_name = broker.name;
    if (broker.id) leadData.corretor_id = broker.id;

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .insert(leadData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: `Lead cadastrado com sucesso. Distribuído na roleta para o corretor ${broker.name}.`,
      assigned_broker: {
        name: broker.name,
        id: broker.id || null,
        phone: broker.phone || null,
        email: broker.email || null
      },
      data: mapLeadFromDB(data)
    });
  } catch (error) {
    console.error('❌ Erro ao criar lead via roleta:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// ============================================
// ROUTES - BROKERS
// ============================================

// GET /api/v1/brokers - Listar corretores
// Busca corretores de tenant_memberships e tenant_brokers (Gestão de Equipe)
// Suporta filtros: phone, tenant_id, include_assignments
app.get('/api/v1/brokers', validateApiKey, async (req, res) => {
  try {
    const { phone, tenant_id, include_assignments } = req.query;
    // Escopo obrigatório por tenant: prioriza o tenant da API key; só usa o
    // tenant_id da query quando a key não está vinculada a um tenant (ex.: 'demo').
    const effectiveTenantId = req.tenantId || tenant_id;
    if (!effectiveTenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT_ID', message: 'tenant_id é obrigatório' }
      });
    }

    // Se busca por telefone específico
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      
      // 1. Buscar em tenant_brokers por telefone
      let brokerQuery = supabase
        .from('tenant_brokers')
        .select('id, name, email, phone, photo_url, auth_user_id, status');
      
      if (effectiveTenantId) brokerQuery = brokerQuery.eq('tenant_id', effectiveTenantId);
      brokerQuery = brokerQuery.or(`phone.eq.${cleanPhone},phone.eq.${phone}`);
      
      const { data: brokerData } = await brokerQuery;
      
      if (brokerData && brokerData.length > 0) {
        const broker = brokerData[0];
        
        // Buscar imóveis atribuídos
        let assignQuery = supabase
          .from('imoveis_corretores')
          .select('codigo_imovel')
          .eq('corretor_id', broker.auth_user_id || broker.id);
        
        if (effectiveTenantId) assignQuery = assignQuery.eq('tenant_id', effectiveTenantId);
        
        const { data: assignments } = await assignQuery;
        
        return res.json({
          success: true,
          data: [{
            id: broker.auth_user_id || broker.id,
            name: broker.name,
            email: broker.email,
            phone: broker.phone,
            photo_url: broker.photo_url,
            status: broker.status,
            property_codes: (assignments || []).map(a => a.codigo_imovel)
          }],
          count: 1,
          found_by: 'phone'
        });
      }
      
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: `Nenhum corretor encontrado com telefone ${phone}`
      });
    }

    // ============================================
    // BUSCAR CORRETORES DE TENANT_BROKERS (principal)
    // Esta é a fonte correta: Gestão de Equipe / Acessos e Permissões
    // ============================================
    
    const brokerMap = new Map();
    
    // 1. Buscar de tenant_brokers (corretores cadastrados via XML ou manualmente)
    let brokersQuery = supabase
      .from('tenant_brokers')
      .select('id, name, email, phone, photo_url, auth_user_id, status, source, created_at');
    
    if (effectiveTenantId) brokersQuery = brokersQuery.eq('tenant_id', effectiveTenantId);
    brokersQuery = brokersQuery.eq('status', 'active');
    
    const { data: tenantBrokers, error: brokersError } = await brokersQuery;
    
    if (brokersError) {
      console.error('❌ Erro ao buscar tenant_brokers:', brokersError);
    }
    
    // Adicionar corretores de tenant_brokers ao mapa
    (tenantBrokers || []).forEach(broker => {
      const key = broker.auth_user_id || broker.id;
      if (!brokerMap.has(key)) {
        brokerMap.set(key, {
          id: key,
          broker_id: broker.id,
          auth_user_id: broker.auth_user_id,
          name: broker.name,
          email: broker.email,
          phone: broker.phone,
          photo_url: broker.photo_url,
          status: broker.status,
          source: broker.source || 'manual',
          created_at: broker.created_at,
          property_codes: [],
          leads_count: 0
        });
      }
    });
    
    // 2. Também buscar de tenant_memberships (usuários com acesso ao sistema)
    let membersQuery = supabase
      .from('tenant_memberships')
      .select('user_id, role');
    
    if (effectiveTenantId) membersQuery = membersQuery.eq('tenant_id', effectiveTenantId);
    membersQuery = membersQuery.in('role', ['corretor', 'team_leader']);
    
    const { data: members, error: membersError } = await membersQuery;
    
    if (membersError) {
      console.error('❌ Erro ao buscar tenant_memberships:', membersError);
    }
    
    // Buscar dados dos usuários via auth.users metadata (se houver membros não em tenant_brokers)
    const memberUserIds = (members || []).map(m => m.user_id).filter(id => !brokerMap.has(id));
    
    if (memberUserIds.length > 0) {
      // Buscar user metadata para membros que não estão em tenant_brokers
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone, avatar_url')
        .in('id', memberUserIds);
      
      (profiles || []).forEach(profile => {
        if (!brokerMap.has(profile.id)) {
          const memberRole = members?.find(m => m.user_id === profile.id)?.role || 'corretor';
          brokerMap.set(profile.id, {
            id: profile.id,
            auth_user_id: profile.id,
            name: profile.full_name || profile.email?.split('@')[0] || 'Usuário',
            email: profile.email,
            phone: profile.phone,
            photo_url: profile.avatar_url,
            status: 'active',
            source: 'membership',
            role: memberRole,
            property_codes: [],
            leads_count: 0
          });
        }
      });
    }

    // 3. Buscar atribuições de imóveis para todos os corretores
    if (include_assignments === 'true' || brokerMap.size > 0) {
      let assignQuery = supabase
        .from('imoveis_corretores')
        .select('corretor_id, corretor_nome, codigo_imovel');
      
      if (effectiveTenantId) assignQuery = assignQuery.eq('tenant_id', effectiveTenantId);
      
      const { data: assignments } = await assignQuery;
      
      (assignments || []).forEach(a => {
        // Tentar associar por corretor_id primeiro
        if (a.corretor_id && brokerMap.has(a.corretor_id)) {
          brokerMap.get(a.corretor_id).property_codes.push(a.codigo_imovel);
        } else {
          // Fallback: associar por nome
          for (const [key, broker] of brokerMap) {
            if (broker.name?.toLowerCase() === a.corretor_nome?.toLowerCase()) {
              broker.property_codes.push(a.codigo_imovel);
              break;
            }
          }
        }
      });
    }

    // 4. Contar leads atribuídos a cada corretor (contagem no banco — ver brokerLeadStats.js)
    let countsUnavailable = false;
    if (brokerMap.size > 0) {
      const lista = Array.from(brokerMap.values());
      const { ok, counts } = await countLeadsPerBroker(supabase, effectiveTenantId, lista);
      countsUnavailable = !ok;
      for (const broker of lista) {
        // Falhou a contagem → `null` (desconhecido), nunca 0. Ver nota no módulo.
        broker.leads_count = ok ? (counts.get(broker.id) ?? 0) : null;
      }
    }

    const brokers = Array.from(brokerMap.values());

    res.json({
      success: true,
      data: brokers,
      count: brokers.length,
      ...(countsUnavailable ? { leads_count_unavailable: true } : {}),
      source: 'tenant_brokers_and_memberships'
    });
  } catch (error) {
    console.error('❌ Erro ao listar corretores:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/brokers/active - Listar APENAS corretores ativos (payload enxuto)
// Endpoint otimizado para consumo por IA: retorna apenas o necessário (id, nome,
// email, telefone, foto) sem joins pesados de imóveis/leads.
app.get('/api/v1/brokers/active', validateApiKey, async (req, res) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id não identificado na API Key' }
      });
    }

    const { data, error } = await supabase
      .from('tenant_brokers')
      .select('id, auth_user_id, name, email, phone, photo_url, source')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) throw error;

    const brokers = (data || []).map((b) => ({
      id: b.auth_user_id || b.id,
      broker_id: b.id,
      auth_user_id: b.auth_user_id,
      name: b.name,
      email: b.email,
      phone: b.phone,
      photo_url: b.photo_url,
      source: b.source || 'manual',
    }));

    res.json({
      success: true,
      data: brokers,
      count: brokers.length,
    });
  } catch (error) {
    console.error('❌ Erro ao listar corretores ativos:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// GET /api/v1/brokers/:id - Buscar corretor por ID ou nome
app.get('/api/v1/brokers/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const decodedId = decodeURIComponent(id);

    // Buscar todos os leads e filtrar pelo corretor
    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .select('*');

    if (error) throw error;

    // Filtrar leads onde o corretor corresponde ao ID ou nome
    const matchedLeads = (data || []).filter(row => {
      const attendedBy = row.raw_data?.attendedBy;
      if (attendedBy && Array.isArray(attendedBy) && attendedBy.length > 0) {
        const broker = attendedBy[0];
        return broker?.id?.toString() === decodedId || broker?.name === decodedId;
      }
      return false;
    });

    if (matchedLeads.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Corretor ${decodedId} não encontrado`
        }
      });
    }

    const brokerInfo = matchedLeads[0].raw_data?.attendedBy?.[0];
    const brokerName = brokerInfo?.name || decodedId;
    const leads = matchedLeads.map(mapLeadFromDB);

    // Calcular estatísticas
    const stats = {
      total_leads: leads.length,
      by_stage: {},
      by_temperature: { cold: 0, warm: 0, hot: 0 },
      conversions: leads.filter(l => l.stage === 9).length
    };

    leads.forEach(lead => {
      stats.by_stage[lead.stage] = (stats.by_stage[lead.stage] || 0) + 1;
      if (lead.temperature) {
        stats.by_temperature[lead.temperature] = (stats.by_temperature[lead.temperature] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: {
        id: id,
        name: brokerName,
        statistics: stats,
        leads: leads.slice(0, 10) // Últimos 10 leads
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar corretor:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/brokers/:id/assign - Atribuir leads ao corretor
app.post('/api/v1/brokers/:id/assign', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { lead_ids, broker_name } = req.body;

    if (!lead_ids || !Array.isArray(lead_ids)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Array de lead_ids é obrigatório'
        }
      });
    }

    const { data, error } = await supabase
      .from(LEADS_TABLE)
      .update({ 
        corretor_id: id,
        corretor: broker_name || id,
        updated_at: new Date().toISOString()
      })
      .in('id_lead', lead_ids)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      data: (data || []).map(mapLeadFromDB),
      count: data?.length || 0,
      message: `${data?.length || 0} leads atribuídos ao corretor ${broker_name || id}`
    });
  } catch (error) {
    console.error('❌ Erro ao atribuir leads:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// ROUTES - AI KANBAN (opera sobre public.leads, NÃO kenlo_leads)
// ============================================

// Statuses válidos na tabela public.leads (constraint leads_status_check).
const INTERESSADO_STATUSES = [
  'Novos Leads', 'Em Atendimento', 'Interação', 'Visita Agendada', 'Visita Realizada',
  'Negociação', 'Proposta Criada', 'Proposta Enviada', 'Proposta Assinada'
];
const PROPRIETARIO_STATUSES = [
  'Novos Proprietários', 'Primeira Visita', 'Criação do Estudo de Mercado',
  'Apresentação do Estudo de Mercado', 'Não Exclusivo', 'Exclusivo', 'Cadastro',
  'Plano de Marketing', 'Propostas Respondidas', 'Feitura de Contrato'
];
const ARCHIVED_STATUS = 'Arquivado';
const ALLOWED_STATUSES = [...INTERESSADO_STATUSES, ...PROPRIETARIO_STATUSES, ARCHIVED_STATUS];

// Atalhos numéricos para Interessado (1..10). Stage 10 = Arquivado.
const STAGE_NUM_TO_STATUS = {
  1: 'Novos Leads', 2: 'Em Atendimento', 3: 'Interação',
  4: 'Visita Agendada', 5: 'Visita Realizada', 6: 'Negociação',
  7: 'Proposta Criada', 8: 'Proposta Enviada', 9: 'Proposta Assinada', 10: 'Arquivado',
};

const normalizeStr = (s) => String(s ?? '').trim().toLowerCase();
const stripAccents = (s) => normalizeStr(s).normalize('NFD').replace(/\p{Diacritic}/gu, '');

// Index acento-insensível para casar nomes da IA com o status canônico.
const STATUS_BY_NORMALIZED = ALLOWED_STATUSES.reduce((acc, status) => {
  acc[stripAccents(status)] = status;
  return acc;
}, {});

// Sinônimos que a IA pode mandar.
const STATUS_SYNONYMS = {
  'novo': 'Novos Leads',
  'novos': 'Novos Leads',
  'atendimento': 'Em Atendimento',
  'qualificado': 'Interação',
  'qualificacao': 'Interação',
  'agendada': 'Visita Agendada',
  'realizada': 'Visita Realizada',
  'negociacao': 'Negociação',
  'em negociacao': 'Negociação',
  'fechado': 'Proposta Assinada',
  'ganho': 'Proposta Assinada',
  'perdido': 'Arquivado',
};

const resolveStatus = (input) => {
  if (input === undefined || input === null || input === '') return { ok: true, value: undefined };
  if (typeof input === 'number' && STAGE_NUM_TO_STATUS[input]) {
    return { ok: true, value: STAGE_NUM_TO_STATUS[input] };
  }
  const asNum = parseInt(input, 10);
  if (!Number.isNaN(asNum) && STAGE_NUM_TO_STATUS[asNum]) {
    return { ok: true, value: STAGE_NUM_TO_STATUS[asNum] };
  }
  const norm = stripAccents(input);
  if (STATUS_BY_NORMALIZED[norm]) return { ok: true, value: STATUS_BY_NORMALIZED[norm] };
  if (STATUS_SYNONYMS[norm]) return { ok: true, value: STATUS_SYNONYMS[norm] };
  return {
    ok: false,
    error: `status inválido: "${input}". Use 1-10 ou um dos nomes: ${ALLOWED_STATUSES.join(', ')}`,
  };
};

// public.leads.temperature usa pt-BR: Frio | Morno | Quente.
const TEMP_BY_INPUT = {
  1: 'Frio', 2: 'Morno', 3: 'Quente',
  cold: 'Frio', warm: 'Morno', hot: 'Quente',
  frio: 'Frio', morno: 'Morno', quente: 'Quente',
};

const resolveTemperature = (input) => {
  if (input === undefined || input === null || input === '') return { ok: true, value: undefined };
  const key = typeof input === 'number' ? input : normalizeStr(input);
  const value = TEMP_BY_INPUT[key];
  if (!value) return { ok: false, error: `temperature inválida: "${input}". Use Frio/Morno/Quente, cold/warm/hot ou 1/2/3` };
  return { ok: true, value };
};

// Resolve corretor a partir de id (auth_user_id ou tenant_brokers.id), nome ou telefone.
// Valida que pertence ao tenant e está ativo. Retorna { name, id, phone, email }.
const resolveBrokerForAssignment = async (tenantId, input) => {
  if (!input || typeof input !== 'object') return { ok: false, error: 'broker deve ser objeto com id, name ou phone' };
  const { id, name, phone } = input;

  if (!id && !name && !phone) {
    return { ok: false, error: 'broker precisa de id, name ou phone' };
  }

  let query = supabase
    .from('tenant_brokers')
    .select('id, auth_user_id, name, email, phone, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (id) {
    query = query.or(`id.eq.${id},auth_user_id.eq.${id}`);
  } else if (phone) {
    const clean = normalizePhone(phone);
    query = query.or(`phone.eq.${clean},phone.eq.${phone}`);
  } else if (name) {
    query = query.ilike('name', name);
  }

  const { data, error } = await query.limit(1);
  if (error) return { ok: false, error: `Erro ao buscar corretor: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, error: `Corretor não encontrado/ativo (id=${id || '-'}, name=${name || '-'}, phone=${phone || '-'})` };
  }

  const broker = data[0];
  return {
    ok: true,
    broker: {
      name: broker.name,
      id: broker.auth_user_id || broker.id,
      auth_user_id: broker.auth_user_id,
      phone: broker.phone,
      email: broker.email,
    }
  };
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/v1/ai/kanban/leads/:id
// Endpoint unificado para a IA mover leads no kanban em uma única chamada.
// Opera sobre public.leads. :id aceita UUID (leads.id) ou string (source_lead_id).
// Body (todos opcionais, ao menos um obrigatório):
//   status (ou stage): number 1..10 | nome (ex.: "Interação", "Negociação")
//   temperature:       "Frio"|"Morno"|"Quente" | "cold"|"warm"|"hot" | 1|2|3
//   broker:            { id?, name?, phone? } — corretor precisa estar ativo no tenant
//   archive:           true (arquiva) | false (desarquiva)
//   archive_reason:    string (usado quando archive=true)
app.post('/api/v1/ai/kanban/leads/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id não identificado na API Key' }
      });
    }

    const { stage, status, temperature, broker, archive, archive_reason } = req.body || {};
    const statusInput = status !== undefined ? status : stage;

    if (statusInput === undefined && temperature === undefined && broker === undefined && archive === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Forneça ao menos um dos campos: status (ou stage), temperature, broker, archive'
        }
      });
    }

    // Carregar lead atual (e validar tenant)
    let selectQuery = supabase.from('leads').select('*').eq('tenant_id', tenantId);
    selectQuery = UUID_REGEX.test(id)
      ? selectQuery.eq('id', id)
      : selectQuery.eq('source_lead_id', id);
    const { data: currentLead, error: selectError } = await selectQuery.maybeSingle();

    if (selectError) throw selectError;
    if (!currentLead) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Lead ${id} não encontrado no tenant` }
      });
    }

    const update = { updated_at: new Date().toISOString() };
    const changes = {};
    const errors = [];

    // status (alias: stage)
    const statusResolved = resolveStatus(statusInput);
    if (!statusResolved.ok) errors.push(statusResolved.error);
    else if (statusResolved.value !== undefined) {
      update.status = statusResolved.value;
      changes.status = {
        from: currentLead.status ?? null,
        to: statusResolved.value,
      };
    }

    // temperature
    const tempResolved = resolveTemperature(temperature);
    if (!tempResolved.ok) errors.push(tempResolved.error);
    else if (tempResolved.value !== undefined) {
      update.temperature = tempResolved.value;
      changes.temperature = {
        from: currentLead.temperature ?? null,
        to: tempResolved.value,
      };
    }

    // broker
    if (broker !== undefined && broker !== null) {
      const brokerResolved = await resolveBrokerForAssignment(tenantId, broker);
      if (!brokerResolved.ok) errors.push(brokerResolved.error);
      else {
        update.assigned_agent_name = brokerResolved.broker.name;
        update.assigned_agent_id = brokerResolved.broker.id;
        if (!currentLead.assigned_at) update.assigned_at = new Date().toISOString();
        changes.broker = {
          from: currentLead.assigned_agent_name ?? null,
          to: brokerResolved.broker.name,
          id: brokerResolved.broker.id,
        };
      }
    }

    // archive / unarchive
    if (archive === true) {
      const reason = archive_reason || 'Arquivado via IA';
      update.archived_at = new Date().toISOString();
      update.archive_reason = reason;
      changes.archived = { from: !!currentLead.archived_at, to: true, reason };
    } else if (archive === false) {
      update.archived_at = null;
      update.archive_reason = null;
      changes.archived = { from: !!currentLead.archived_at, to: false };
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Falha na validação', details: errors }
      });
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_OP', message: 'Nenhuma alteração aplicável foi fornecida' }
      });
    }

    let updateQuery = supabase.from('leads').update(update).eq('tenant_id', tenantId);
    updateQuery = UUID_REGEX.test(id)
      ? updateQuery.eq('id', id)
      : updateQuery.eq('source_lead_id', id);
    const { data, error } = await updateQuery.select().single();
    if (error) throw error;

    res.json({
      success: true,
      data,
      changes,
      message: `Lead ${id} atualizado: ${Object.keys(changes).join(', ')}`
    });
  } catch (error) {
    console.error('❌ Erro no AI kanban:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// Inverso de STAGE_NUM_TO_STATUS: nome canônico (pt-BR) -> número da etapa (1..10).
const STATUS_TO_STAGE_NUM = Object.fromEntries(
  Object.entries(STAGE_NUM_TO_STATUS).map(([num, status]) => [status, Number(num)])
);

// Deriva o número da etapa (1..10) a partir de número, string numérica ou nome.
// Retorna undefined para entradas que não pertençam ao funil interessado numerado
// (ex.: status de proprietário não têm número e não existem em kenlo_leads).
const resolveStageNumber = (input) => {
  if (typeof input === 'number' && STAGE_NUM_TO_STATUS[input]) return input;
  const asNum = parseInt(input, 10);
  if (!Number.isNaN(asNum) && STAGE_NUM_TO_STATUS[asNum]) return asNum;
  const r = resolveStatus(input);
  if (r.ok && r.value) return STATUS_TO_STAGE_NUM[r.value];
  return undefined;
};

// POST /api/v1/ai/leads/:id/stage
// Endpoint focado para a IA mudar APENAS a etapa (stage) de um lead.
// Opera sobre AMBAS as tabelas: tenta primeiro public.leads (origem da maioria
// dos leads) e, se não encontrar, cai para kenlo_leads (leads de portais).
// :id aceita UUID/source_lead_id (leads) ou id numérico/external_id (kenlo_leads).
//
// Body:
//   { "stage": <1..10> }   — número é o caminho preferido (1=Novos Leads ... 10=Arquivado)
//   também aceita o nome do status (ex.: "Negociação") por conveniência.
//
// Sucesso: 200 { success: true, source: 'leads'|'kenlo_leads', data: <lead>, changes: {...} }
app.post('/api/v1/ai/leads/:id/stage', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tenant_id não identificado na API Key' }
      });
    }

    const { stage } = req.body || {};

    if (stage === undefined || stage === null || stage === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Forneça o campo "stage" (número 1-10 ou o nome da etapa).',
          stages: STAGE_NUM_TO_STATUS
        }
      });
    }

    // Resolve número (1..10) ou nome para o status canônico de public.leads.
    const resolved = resolveStatus(stage);
    if (!resolved.ok) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: resolved.error, stages: STAGE_NUM_TO_STATUS }
      });
    }
    const newStatus = resolved.value;

    const now = new Date().toISOString();

    // ── 1) public.leads (caminho principal) ─────────────────────────────────
    // Escopo por tenant da API Key (evita acesso cross-tenant). :id = UUID -> id,
    // caso contrário -> source_lead_id.
    const scopeLeads = (query) => {
      const scoped = query.eq('tenant_id', tenantId);
      return UUID_REGEX.test(id) ? scoped.eq('id', id) : scoped.eq('source_lead_id', id);
    };

    const { data: lead, error: leadSelErr } = await scopeLeads(
      supabase.from('leads').select('*')
    ).maybeSingle();
    if (leadSelErr) throw leadSelErr;

    if (lead) {
      if (lead.status === newStatus) {
        return res.status(200).json({
          success: true,
          source: 'leads',
          data: lead,
          changes: {},
          message: `Lead ${id} já está na etapa "${newStatus}"`
        });
      }
      const { data, error } = await scopeLeads(
        supabase.from('leads').update({ status: newStatus, updated_at: now })
      ).select().single();
      if (error) throw error;

      return res.status(200).json({
        success: true,
        source: 'leads',
        data,
        changes: { status: { from: lead.status ?? null, to: newStatus } },
        message: `Etapa do lead ${id} alterada para "${newStatus}"`
      });
    }

    // ── 2) Fallback: kenlo_leads (leads de portais) ─────────────────────────
    // kenlo_leads.stage é TEXT com slug ('new','negotiation',...). Precisa da
    // etapa numérica (funil interessado); status de proprietário não se aplica.
    const stageNum = resolveStageNumber(stage);
    if (!stageNum) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Lead ${id} não encontrado em 'leads'. A etapa "${newStatus}" não tem equivalente em kenlo_leads (apenas etapas 1-10 do funil interessado).`
        }
      });
    }
    const kenloStage = STAGE_NUM_TO_KENLO_STAGE[stageNum];

    const scopeKenlo = (query) => {
      const scoped = query.eq('tenant_id', tenantId);
      return !isNaN(id) ? scoped.eq('id', id) : scoped.eq('external_id', id);
    };

    const { data: kenloLead, error: kenloSelErr } = await scopeKenlo(
      supabase.from(LEADS_TABLE).select('*')
    ).maybeSingle();
    if (kenloSelErr) throw kenloSelErr;

    if (!kenloLead) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Lead ${id} não encontrado no tenant (nem em 'leads' nem em 'kenlo_leads')` }
      });
    }

    if (kenloLead.stage === kenloStage) {
      return res.status(200).json({
        success: true,
        source: 'kenlo_leads',
        data: { ...mapLeadFromDB(kenloLead), stage_name: STAGE_NUM_NAMES[stageNum] },
        changes: {},
        message: `Lead ${id} já está na etapa "${STAGE_NUM_NAMES[stageNum]}"`
      });
    }

    const { data, error } = await scopeKenlo(
      supabase.from(LEADS_TABLE).update({ stage: kenloStage, updated_at: now })
    ).select().single();
    if (error) throw error;

    res.status(200).json({
      success: true,
      source: 'kenlo_leads',
      data: { ...mapLeadFromDB(data), stage_name: STAGE_NUM_NAMES[stageNum] },
      changes: { stage: { from: kenloLead.stage ?? null, to: kenloStage } },
      message: `Etapa do lead ${id} alterada para "${STAGE_NUM_NAMES[stageNum]}"`
    });
  } catch (error) {
    console.error('❌ Erro ao alterar etapa do lead (IA):', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
});

// ============================================
// ROUTES - PROPERTY ASSIGNMENTS (Imóveis → Corretores)
// ============================================

const IMOVEIS_CORRETORES_TABLE = 'imoveis_corretores';

// GET /api/v1/property-assignments - Listar atribuições de imóveis
app.get('/api/v1/property-assignments', validateApiKey, async (req, res) => {
  try {
    const { tenant_id, broker_id, broker_phone } = req.query;

    // Escopo obrigatório por tenant: usa o tenant da API key; só aceita tenant_id
    // da query quando a key não está vinculada a um tenant (ex.: key 'demo').
    const effectiveTenantId = req.tenantId || tenant_id;
    if (!effectiveTenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT_ID', message: 'tenant_id é obrigatório' }
      });
    }

    let query = supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .select('*')
      .eq('tenant_id', effectiveTenantId);

    if (broker_id) query = query.eq('corretor_id', broker_id);
    if (broker_phone) {
      const cleanPhone = broker_phone.replace(/\D/g, '');
      query = query.or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${broker_phone}`);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: (data || []).map(row => ({
        id: row.id,
        tenant_id: row.tenant_id,
        property_code: row.codigo_imovel,
        broker_id: row.corretor_id,
        broker_name: row.corretor_nome,
        broker_email: row.corretor_email,
        broker_phone: row.corretor_telefone,
        created_at: row.created_at,
        updated_at: row.updated_at
      })),
      count: data?.length || 0
    });
  } catch (error) {
    console.error('❌ Erro ao listar atribuições:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// POST /api/v1/property-assignments - Atribuir imóvel a corretor
// Regras: Corretor só atribui para si; gestão/admin pode atribuir para qualquer um
// Se código já tem dono, só gestão pode transferir
app.post('/api/v1/property-assignments', validateApiKey, async (req, res) => {
  try {
    const {
      tenant_id,
      property_code,
      broker_id,
      broker_name,
      broker_email,
      broker_phone,
      requester_id,
      requester_role
    } = req.body;

    // Escopo obrigatório por tenant: a API key manda; tenant_id do corpo só vale
    // quando a key não está vinculada a um tenant (ex.: 'demo').
    const effectiveTenantId = req.tenantId || tenant_id;

    if (!effectiveTenantId || !property_code) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tenant_id e property_code são obrigatórios'
        }
      });
    }

    if (req.tenantId && tenant_id && tenant_id !== req.tenantId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_MISMATCH',
          message: 'tenant_id não corresponde à API key'
        }
      });
    }

    if (!broker_name && !broker_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'broker_name ou broker_id é obrigatório'
        }
      });
    }

    const codigoNormalizado = property_code.trim().toUpperCase();

    // Verificar se código já está atribuído
    const { data: existing } = await supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .eq('codigo_imovel', codigoNormalizado)
      .limit(1);

    const isManager = ['admin', 'owner', 'gestao', 'gerente'].includes(requester_role?.toLowerCase());

    if (existing && existing.length > 0) {
      // Código já tem dono
      const currentOwner = existing[0];
      
      // Corretor tentando pegar código de outro - bloqueado
      if (!isManager && currentOwner.corretor_id !== requester_id) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Código ${codigoNormalizado} já está atribuído a ${currentOwner.corretor_nome}. Somente gestão pode transferir.`
          }
        });
      }

      // Gestão pode transferir - atualizar
      const { data, error } = await supabase
        .from(IMOVEIS_CORRETORES_TABLE)
        .update({
          corretor_id: broker_id || null,
          corretor_nome: broker_name || currentOwner.corretor_nome,
          corretor_email: broker_email || currentOwner.corretor_email,
          corretor_telefone: broker_phone || currentOwner.corretor_telefone,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentOwner.id)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        data: {
          id: data.id,
          property_code: data.codigo_imovel,
          broker_id: data.corretor_id,
          broker_name: data.corretor_nome,
          broker_phone: data.corretor_telefone,
          transferred: true,
          previous_broker: currentOwner.corretor_nome
        },
        message: `Imóvel ${codigoNormalizado} transferido para ${broker_name}`
      });
    }

    // Código livre - criar atribuição
    const { data, error } = await supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .insert({
        tenant_id: effectiveTenantId,
        codigo_imovel: codigoNormalizado,
        corretor_id: broker_id || null,
        corretor_nome: broker_name,
        corretor_email: broker_email || null,
        corretor_telefone: broker_phone || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data: {
        id: data.id,
        property_code: data.codigo_imovel,
        broker_id: data.corretor_id,
        broker_name: data.corretor_nome,
        broker_phone: data.corretor_telefone
      },
      message: `Imóvel ${codigoNormalizado} atribuído a ${broker_name}`
    });
  } catch (error) {
    console.error('❌ Erro ao criar atribuição:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// DELETE /api/v1/property-assignments/:codigo - Remover atribuição
app.delete('/api/v1/property-assignments/:codigo', validateApiKey, async (req, res) => {
  try {
    const { codigo } = req.params;
    const { tenant_id, requester_id, requester_role } = req.query;

    const effectiveTenantId = req.tenantId || tenant_id;
    if (!effectiveTenantId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tenant_id é obrigatório'
        }
      });
    }

    if (req.tenantId && tenant_id && tenant_id !== req.tenantId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_MISMATCH',
          message: 'tenant_id não corresponde à API key'
        }
      });
    }

    const codigoNormalizado = codigo.trim().toUpperCase();

    // Buscar atribuição existente
    const { data: existing } = await supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .eq('codigo_imovel', codigoNormalizado)
      .limit(1);

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Atribuição para código ${codigoNormalizado} não encontrada`
        }
      });
    }

    const assignment = existing[0];
    const isManager = ['admin', 'owner', 'gestao', 'gerente'].includes(requester_role?.toLowerCase());

    // Corretor só pode remover suas próprias atribuições
    if (!isManager && assignment.corretor_id !== requester_id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Você só pode remover suas próprias atribuições'
        }
      });
    }

    const { error } = await supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .delete()
      .eq('id', assignment.id);

    if (error) throw error;

    res.json({
      success: true,
      message: `Atribuição do código ${codigoNormalizado} removida com sucesso`
    });
  } catch (error) {
    console.error('❌ Erro ao remover atribuição:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// GET /api/v1/property-assignments/broker/:identifier - Buscar atribuições por corretor (ID ou telefone)
app.get('/api/v1/property-assignments/broker/:identifier', validateApiKey, async (req, res) => {
  try {
    const { identifier } = req.params;
    const { tenant_id } = req.query;

    const effectiveTenantId = req.tenantId || tenant_id;
    if (!effectiveTenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT_ID', message: 'tenant_id é obrigatório' }
      });
    }

    let query = supabase
      .from(IMOVEIS_CORRETORES_TABLE)
      .select('*')
      .eq('tenant_id', effectiveTenantId);

    // Verificar se é UUID (broker_id) ou telefone
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    
    if (isUUID) {
      query = query.eq('corretor_id', identifier);
    } else {
      // Tratar como telefone
      const cleanPhone = identifier.replace(/\D/g, '');
      query = query.or(`corretor_telefone.eq.${cleanPhone},corretor_telefone.eq.${identifier}`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: (data || []).map(row => ({
        property_code: row.codigo_imovel,
        broker_name: row.corretor_nome,
        broker_id: row.corretor_id,
        created_at: row.created_at
      })),
      count: data?.length || 0
    });
  } catch (error) {
    console.error('❌ Erro ao buscar atribuições do corretor:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// ============================================
// ROUTES - WEBHOOKS
// ============================================

// Armazenamento temporário de webhooks (em produção, usar banco de dados)
const webhooks = new Map();

// GET /api/v1/webhooks - Listar webhooks
app.get('/api/v1/webhooks', validateApiKey, async (req, res) => {
  const userWebhooks = Array.from(webhooks.values())
    .filter(w => w.api_key === req.apiKey);

  res.json({
    success: true,
    data: userWebhooks,
    count: userWebhooks.length
  });
});

// POST /api/v1/webhooks - Criar webhook
app.post('/api/v1/webhooks', validateApiKey, async (req, res) => {
  try {
    const { url, events, active = true } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL do webhook é obrigatória'
        }
      });
    }

    const validEvents = ['lead.created', 'lead.updated', 'lead.stage_changed', 'lead.assigned', 'lead.archived'];
    const webhookEvents = events?.filter(e => validEvents.includes(e)) || validEvents;

    const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const webhook = {
      id: webhookId,
      url,
      events: webhookEvents,
      active,
      api_key: req.apiKey,
      created_at: new Date().toISOString()
    };

    webhooks.set(webhookId, webhook);

    res.status(201).json({
      success: true,
      data: webhook,
      message: 'Webhook criado com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao criar webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

// DELETE /api/v1/webhooks/:id - Deletar webhook
app.delete('/api/v1/webhooks/:id', validateApiKey, async (req, res) => {
  const { id } = req.params;
  
  if (!webhooks.has(id)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Webhook não encontrado'
      }
    });
  }

  webhooks.delete(id);

  res.json({
    success: true,
    message: 'Webhook deletado com sucesso'
  });
});

// ============================================
// ROUTES - REFERENCE DATA
// ============================================

// GET /api/v1/reference/stages - Etapas do funil
app.get('/api/v1/reference/stages', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'Novos Leads', color: '#6366f1' },
      { id: 2, name: 'Em Atendimento', color: '#8b5cf6' },
      { id: 3, name: 'Qualificado', color: '#a855f7' },
      { id: 4, name: 'Visita Agendada', color: '#d946ef' },
      { id: 5, name: 'Visita Realizada', color: '#ec4899' },
      { id: 6, name: 'Em Negociação', color: '#f43f5e' },
      { id: 7, name: 'Proposta Criada', color: '#f97316' },
      { id: 8, name: 'Proposta Enviada', color: '#eab308' },
      { id: 9, name: 'Proposta Assinada', color: '#22c55e' },
      { id: 10, name: 'Arquivado', color: '#64748b' }
    ]
  });
});

// GET /api/v1/reference/temperatures - Temperaturas
app.get('/api/v1/reference/temperatures', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, value: 'cold', name: 'Frio', color: '#3b82f6' },
      { id: 2, value: 'warm', name: 'Morno', color: '#f59e0b' },
      { id: 3, value: 'hot', name: 'Quente', color: '#ef4444' }
    ]
  });
});

// GET /api/v1/reference/sources - Origens
app.get('/api/v1/reference/sources', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 0, name: 'LIA Serhant', category: 'ai' },
      { id: 1, name: 'WhatsApp', category: 'channels' },
      { id: 2, name: 'Facebook', category: 'channels' },
      { id: 3, name: 'Instagram', category: 'channels' },
      { id: 4, name: 'Google Ads', category: 'channels' },
      { id: 5, name: 'LinkedIn', category: 'channels' },
      { id: 6, name: 'Site', category: 'channels' },
      { id: 7, name: 'Email', category: 'channels' },
      { id: 8, name: 'Landing Page', category: 'channels' },
      { id: 9, name: 'API', category: 'channels' },
      { id: 10, name: 'Zap Imóveis', category: 'portal' },
      { id: 11, name: 'Viva Real', category: 'portal' },
      { id: 12, name: 'Imovelweb', category: 'portal' },
      { id: 13, name: 'OLX', category: 'portal' }
    ]
  });
});

// ============================================
// ROUTES - LANÇAMENTOS (consumo por agentes de IA)
// ============================================

// Normaliza uma linha da tabela lancamentos no formato exposto pela API.
// Devolve apenas campos relevantes para IA: nome, descrição, URL do book em PDF,
// e fotos com legendas (ex.: { legenda: "Sala", url: "..." }).
const mapLancamentoFromDB = (row) => ({
  id: row.id,
  nome: row.nome,
  descricao: row.descricao || null,
  // Endereço do plantão (estande de vendas). null = não cadastrado:
  // nesse caso a Lia deve dizer que o corretor entrará em contato para
  // informar o endereço e combinar a melhor data.
  endereco_plantao: row.endereco_plantao || null,
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

// GET /api/v1/lancamentos - Listar lançamentos do tenant (resumido)
// Query params:
//   - search: filtra por nome (case-insensitive)
//   - page (default 1), limit (default 50, máx 200)
app.get('/api/v1/lancamentos', validateApiKey, async (req, res) => {
  try {
    const { search } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('lancamentos')
      .select('id, nome, descricao, endereco_plantao, site_url, book_pdf, book_pdf_filename, fotos, created_at, updated_at', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search && String(search).trim()) {
      query = query.ilike('nome', `%${String(search).trim()}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Erro ao listar lançamentos:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Falha ao listar lançamentos' },
      });
    }

    // Versão resumida para a lista: nome + capa + contagens.
    // O detalhe (PDF, descrição, todas as fotos com legenda) fica em /:id.
    const items = (data || []).map((row) => {
      const fotos = Array.isArray(row.fotos) ? row.fotos : [];
      const capa = fotos.find((f) => f?.isCapa) || fotos[0] || null;
      return {
        id: row.id,
        nome: row.nome,
        endereco_plantao: row.endereco_plantao || null,
        site_url: row.site_url || null,
        capa_url: capa?.url || null,
        total_fotos: fotos.length,
        tem_book: !!row.book_pdf,
        updated_at: row.updated_at,
      };
    });

    res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (err) {
    console.error('Erro inesperado em /lancamentos:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erro inesperado' },
    });
  }
});

// GET /api/v1/lancamentos/:id - Detalhe completo de um lançamento
app.get('/api/v1/lancamentos/:id', validateApiKey, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('lancamentos')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar lançamento:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Falha ao buscar lançamento' },
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lançamento não encontrado' },
      });
    }

    res.json({ success: true, data: mapLancamentoFromDB(data) });
  } catch (err) {
    console.error('Erro inesperado em /lancamentos/:id:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Erro inesperado' },
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    version: 'v1',
    timestamp: new Date().toISOString()
  });
});

// GET /api/v1/health/jobs — saúde dos jobs (P1 observabilidade). Protegido por
// X-Health-Token. Registrado nos DOIS entrypoints (api-server + proxy-production).
import { registerHealthRoutes } from './observability/healthRoutes.js';
registerHealthRoutes(app, supabase);
// GET /api/v1/health/tenant/:tenantId — status operacional por tenant (P2, owner-only).
import { registerTenantHealthRoutes } from './observability/tenantHealthRoutes.js';
registerTenantHealthRoutes(app, supabase);

// ============================================
// SCRAPER - Estudo de Mercado (substitui n8n)
// ============================================
import { registerScrapeRoute } from './scrapers/index.js';
registerScrapeRoute(app, supabase);

// ============================================
// WHATSAPP - Chat (Meta Cloud API)
// ============================================
import { registerWhatsappRoutes } from './whatsapp/index.js';
registerWhatsappRoutes(app, supabase);

// ============================================
// RECOMENDAÇÕES DE IMÓVEIS — envio por e-mail + histórico
// ============================================
import { registerRecommendationRoutes, startRecommendationScheduler } from './recommendations/index.js';
registerRecommendationRoutes(app, supabase);

// Worker de agendamento (Fase 2). Flag-gated: em produção prefira UM único
// processo com RECOMMENDATION_SCHEDULER=1 (evita execuções duplicadas em cluster).
if (process.env.RECOMMENDATION_SCHEDULER === '1') {
  startRecommendationScheduler(supabase);
}

// ============================================
// KPIs — indicadores do dashboard (cálculo no servidor, isolado por tenant)
// ============================================
import { registerKpisRoutes } from './kpis/index.js';
registerKpisRoutes(app, supabase);

// ============================================
// VISUALIZAR COMO — Owner/Admin veem o dashboard no contexto de outro usuário
// ============================================
import { registerViewAsRoutes } from './viewAs/index.js';
registerViewAsRoutes(app, supabase);

// ============================================
// AGENTE DISPARADOR — interpreta NL → ações (WhatsApp) com prévia + confirmação
// ============================================
import { registerAgentActionRoutes } from './agent-actions/routes.js';
registerAgentActionRoutes(app, supabase);

// Módulo Comunicação: alias /api/v1/communication/dispatch/* dos mesmos handlers.
import { registerCommunicationRoutes } from './communication/index.js';
registerCommunicationRoutes(app, supabase);

// Telemetria de Agentes IA — ingest de eventos (front, server e n8n).
import { registerAgentTelemetryRoutes } from './agent-telemetry/routes.js';
registerAgentTelemetryRoutes(app, supabase);

// Santa Ângela — integração multi-tenant. Registrar ANTES do 404 catch-all.
import { registerSantaAngelaRoutes } from './santaAngela/index.js';
registerSantaAngelaRoutes(app, supabase);

// Rotas owner/admin da config ZAP por tenant — mesmo resolver do feed (save invalida cache).
registerZapRoutes(app, supabase, { resolver: zapConfigResolver });

// Contact2Sale — CRM principal alternativo ao Kenlo. Registrar ANTES do 404 catch-all.
import { registerContact2SaleRoutes, makeC2sRunner, createC2sConfigResolver, createC2sApiClient } from './contact2sale/index.js';
const c2sResolver = createC2sConfigResolver({ supabase });
const c2sApiClient = createC2sApiClient({ resolver: c2sResolver });
const c2sRunner = makeC2sRunner(supabase, { resolver: c2sResolver, apiClient: c2sApiClient });
registerContact2SaleRoutes(app, supabase, { resolver: c2sResolver, apiClient: c2sApiClient, runner: c2sRunner });

// Meta Lead Ads — registrar ANTES do 404 catch-all.
import { registerMetaLeadgenRoutes } from './metaLeadgen/index.js';
registerMetaLeadgenRoutes(app, supabase);

import { registerAnthropicRoutes } from './anthropic/routes.js';
import { ingestMaxUsage } from './anthropic/ingest.js';
registerAnthropicRoutes(app, supabase);

// Ingest do modo MAX (reporter get_usage POSTa o % da assinatura). Auth pela
// tenant_api_key (validateApiKey) — mesmo padrão das rotas /api/v1/leads.
app.post('/api/v1/anthropic/usage-report', validateApiKey, async (req, res) => {
  const r = await ingestMaxUsage(supabase, req.tenantId, req.body || {});
  res.status(r.ok ? 200 : (r.code === 'mode_not_max' ? 409 : 400)).json(r);
});

// eNPS de Corretores — pesquisa recorrente. Registrar ANTES do 404 catch-all.
import { registerEnpsRoutes, startEnpsScheduler, makeEnpsRunner } from './enps/index.js';
const enpsRunner = makeEnpsRunner(supabase);
registerEnpsRoutes(app, supabase);
if (process.env.ENPS_SCHEDULER === '1') {
  startEnpsScheduler(supabase, { runner: enpsRunner });
}

// 404 Handler (DEVE ficar DEPOIS de todas as rotas)
app.use('/api/v1/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} não encontrado`
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OctoDash API Server running on port ${PORT}`);
  console.log(`📍 Base URL: http://localhost:${PORT}/api/v1`);
  console.log(`📚 Documentation: /apidocs`);
  console.log('   ├─ 🏠 GET  /api/v1/integrations/zapimoveis/health        → Diagnóstico feed Zap/OLX');
  console.log('   ├─ 🔎 GET  /api/v1/integrations/zapimoveis/debug         → Motivos de imóveis fora do feed');
  console.log('   ├─ 🧾 GET  /api/v1/integrations/zapimoveis/vrsync.xml    → Feed VRSync Zap');
  console.log('   ├─ 🧾 GET  /api/v1/integrations/grupo-olx/vrsync.xml     → Feed VRSync OLX');
  console.log('   └─ 📤 POST /api/v1/integrations/zapimoveis/notify-update → Avisa ZAP para re-sincronizar');
});

export default app;
