// ============================================================
// Classificação de origem de lead -> CANAL (agrupamento)
// Ex: "ZAP Imóveis" -> "Portais Imobiliários", "Meta" -> "Redes Sociais".
//
// A heurística abaixo é apenas a SUGESTÃO automática: a fonte de
// verdade são as escolhas do admin/owner salvas em
// tenant_lead_source_channels (ver leadSourceChannelsService).
// resolveCanal() aplica: escolha salva > sugestão automática.
// ============================================================

/** Canais padrão oferecidos no select de Configurações (o admin pode criar outros). */
export const DEFAULT_CANAIS = [
  'Portais Imobiliários',
  'Redes Sociais',
  'Google / Mídia Paga',
  'Site',
  'WhatsApp',
  'Indicação',
  'IA (LIA)',
  'Presencial',
  'Telefone',
  'E-mail',
  'CRM / Importação',
  'Outros',
] as const;

export const CANAL_OUTROS = 'Outros';

/**
 * Chave normalizada da origem (trim + lowercase) — MESMA normalização
 * usada em tenant_lead_source_costs, para "ZAP Imoveis" e "Zap Imoveis"
 * caírem na mesma linha do banco.
 */
export function origemChannelKey(origem: string | undefined): string {
  return (origem || '').trim().toLowerCase();
}

/** Remove acentos para o matching de palavras-chave ("Orgânico" -> "organico"). */
function semAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
}

// Ordem importa: regras mais específicas primeiro (ex: "Meta Ads" deve
// cair em Redes Sociais antes da regra genérica de "ads").
const REGRAS: Array<{ canal: string; test: (s: string) => boolean }> = [
  {
    canal: 'WhatsApp',
    test: (s) => s.includes('whats') || s.includes('wpp') || s === 'wa',
  },
  {
    canal: 'Portais Imobiliários',
    test: (s) =>
      s.includes('zap') ||
      s.includes('olx') ||
      s.includes('viva') ||
      s.includes('imovelweb') ||
      s.includes('imovel web') ||
      s.includes('chaves na mao') ||
      s.includes('chavesnamao') ||
      s.includes('mercado livre') ||
      s.includes('mercadolivre') ||
      s.includes('santa angela') ||
      s.includes('Santa Angela') ||
      s.includes('portal'),
  },
  {
    canal: 'Redes Sociais',
    test: (s) =>
      s.includes('face') ||
      s.includes('insta') ||
      /\bmeta\b/.test(s) ||
      s.includes('tiktok') ||
      s.includes('linkedin') ||
      s.includes('youtube') ||
      s.includes('social'),
  },
  {
    canal: 'Google / Mídia Paga',
    test: (s) =>
      s.includes('google') ||
      s.includes('adwords') ||
      /\bads\b/.test(s) ||
      s.includes('trafego') ||
      s.includes('midia paga') ||
      s.includes('anuncio') ||
      s.includes('campanha'),
  },
  {
    canal: 'Site',
    test: (s) =>
      s.includes('site') ||
      s.includes('organico') ||
      s.includes('landing') ||
      s.includes('www') ||
      s.includes('seo') ||
      s.includes('blog') ||
      s.includes('formulario'),
  },
  {
    canal: 'IA (LIA)',
    test: (s) => /\b(ia|lia)\b/.test(s) || s.includes('inteligencia artificial'),
  },
  {
    canal: 'Indicação',
    test: (s) => s.includes('indica') || s.includes('referenc') || s.includes('recomenda'),
  },
  {
    canal: 'Presencial',
    test: (s) =>
      s.includes('placa') ||
      s.includes('fachada') ||
      s.includes('plantao') ||
      s.includes('stand') ||
      s.includes('loja') ||
      s.includes('escritorio') ||
      s.includes('presencial'),
  },
  {
    canal: 'Telefone',
    test: (s) => s.includes('telefone') || s.includes('ligacao') || s.includes('0800'),
  },
  {
    canal: 'E-mail',
    test: (s) => s.includes('email') || s.includes('e-mail') || s.includes('newsletter'),
  },
  {
    canal: 'CRM / Importação',
    test: (s) =>
      s.includes('kenlo') ||
      s.includes('importa') ||
      s.includes('planilha') ||
      s.includes('excel') ||
      s.includes('migra'),
  },
];

/** Sugestão automática de canal para uma origem (sempre retorna algo; fallback "Outros"). */
export function suggestCanal(origem: string | undefined): string {
  const s = semAcentos(origemChannelKey(origem));
  if (!s) return CANAL_OUTROS;
  for (const regra of REGRAS) {
    if (regra.test(s)) return regra.canal;
  }
  return CANAL_OUTROS;
}

/**
 * Canal efetivo de uma origem: escolha salva do tenant (se houver) > sugestão automática.
 * `overrides` é o mapa { chave normalizada da origem -> canal } vindo do banco.
 */
export function resolveCanal(
  origem: string | undefined,
  overrides: Record<string, string>
): string {
  const key = origemChannelKey(origem);
  const manual = key ? overrides[key] : undefined;
  return (manual || '').trim() || suggestCanal(origem);
}
