// ============================================================
// Classificação de origem de lead -> CANAL (agrupamento)
// Ex: "ZAP Imóveis" -> "Portais Imobiliários", "Meta" -> "Redes Sociais".
//
// A heurística abaixo é apenas a SUGESTÃO automática: a fonte de
// verdade são as escolhas do admin/owner salvas em
// tenant_lead_source_channels (ver leadSourceChannelsService).
// resolveCanal() aplica: escolha salva > sugestão automática.
// ============================================================

/** Canais oferecidos no select de Configurações. */
export const DEFAULT_CANAIS = [
  'Internet',
  'Rede Social',
  'Showroom',
  'Telefone',
  'WhatsApp',
] as const;

// Fallback quando nenhuma regra casa: "Internet" (canal digital genérico),
// já que estes são os únicos canais válidos.
export const CANAL_OUTROS = 'Internet';

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

// Ordem importa: regras mais específicas primeiro. O que não casar com
// nenhuma regra cai no fallback "Internet" (digital genérico).
const REGRAS: Array<{ canal: string; test: (s: string) => boolean }> = [
  {
    canal: 'WhatsApp',
    test: (s) => s.includes('whats') || s.includes('wpp') || s === 'wa',
  },
  {
    canal: 'Telefone',
    test: (s) =>
      s.includes('telefone') ||
      s.includes('ligacao') ||
      s.includes('fone') ||
      s.includes('0800') ||
      s.includes('call'),
  },
  {
    canal: 'Rede Social',
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
    canal: 'Showroom',
    test: (s) =>
      s.includes('showroom') ||
      s.includes('placa') ||
      s.includes('fachada') ||
      s.includes('plantao') ||
      s.includes('stand') ||
      s.includes('loja') ||
      s.includes('escritorio') ||
      s.includes('presencial'),
  },
  // Tudo mais (portais, site, orgânico, Google/mídia paga, e-mail, IA,
  // indicação, importação) é digital -> Internet, via fallback.
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

const CANAIS_VALIDOS = new Set<string>(DEFAULT_CANAIS);

/**
 * Canal efetivo de uma origem: escolha salva do tenant (se houver) > sugestão automática.
 * `overrides` é o mapa { chave normalizada da origem -> canal } vindo do banco.
 *
 * Overrides antigos com canais que não existem mais (ex: "Portais Imobiliários")
 * são ignorados e caem na sugestão automática, até o admin re-salvar a escolha.
 */
export function resolveCanal(
  origem: string | undefined,
  overrides: Record<string, string>
): string {
  const key = origemChannelKey(origem);
  const manual = (key ? overrides[key] : undefined)?.trim();
  if (manual && CANAIS_VALIDOS.has(manual)) return manual;
  return suggestCanal(origem);
}
