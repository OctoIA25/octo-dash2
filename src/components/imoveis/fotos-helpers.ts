/**
 * Helpers para ler fotos no formato novo ({url, legenda, isCapa}) ou legado (string).
 * Mantido separado de FotosUploader.tsx para não quebrar Fast Refresh.
 */

export interface Foto {
  url: string;
  legenda?: string;
  isCapa?: boolean;
  /** id da foto no pipeline de marca d'água (property_photos.id), quando aplicável. */
  id?: string;
}

export type FotoInput = string | Foto;

export function getFotoUrl(foto: FotoInput | null | undefined): string | null {
  if (!foto) return null;
  if (typeof foto === 'string') return foto;
  // Em registros legados/inconsistentes, `url` pode ter sido gravado como objeto
  // aninhado (ex.: { url: { url: 'https://...' } }) — o que renderizava
  // `src="[object Object]"`. Desembrulha até achar a string da fonte.
  let value: unknown = foto.url;
  for (let i = 0; value && typeof value === 'object' && i < 5; i++) {
    const obj = value as { url?: unknown; publicUrl?: unknown };
    value = obj.url ?? obj.publicUrl;
  }
  return typeof value === 'string' ? value : null;
}

export function getFotoLegenda(foto: FotoInput | null | undefined): string {
  if (!foto || typeof foto === 'string') return '';
  return foto.legenda ?? '';
}

/**
 * Escolhe a foto de capa: prefere a marcada com `isCapa`, cai para a primeira.
 * Aceita formato legado (string[]) e novo ({url, legenda, isCapa}[]).
 */
export function getFotoCapa(fotos: FotoInput[] | null | undefined): FotoInput | null {
  if (!fotos || fotos.length === 0) return null;
  const marcada = fotos.find((f) => typeof f === 'object' && f !== null && (f as Foto).isCapa);
  return marcada ?? fotos[0] ?? null;
}

export function getFotoCapaUrl(fotos: FotoInput[] | null | undefined): string | null {
  return getFotoUrl(getFotoCapa(fotos));
}

/**
 * Normaliza uma lista de fotos para o formato novo ({url, legenda, isCapa})
 * e garante exatamente uma capa (se nenhuma marcada, a primeira vira capa).
 * Compatível com formato legado (string[]) e novo.
 */
export function normalizeFotos(raw: FotoInput[] | null | undefined): Foto[] {
  const list = (raw || [])
    .map((f) => ({
      // Sempre extrai a string da fonte (desembrulhando objetos aninhados),
      // garantindo que o que é persistido seja sempre uma URL e não `[object Object]`.
      url: getFotoUrl(f) ?? '',
      legenda: getFotoLegenda(f),
      isCapa: typeof f === 'object' && f !== null ? !!f.isCapa : false,
      // Preserva o id do pipeline de marca d'água (property_photos.id). Sem ele, o
      // reprocessamento (repointTenantPhotos) pula a foto e o liga/desliga da marca
      // nunca reescreve a URL — a marca fica "presa". Mantemos o id ao normalizar.
      ...(typeof f === 'object' && f !== null && (f as Foto).id ? { id: (f as Foto).id } : {}),
    }))
    .filter((f) => !!f.url);
  // Se há fotos mas nenhuma é capa, marca a primeira
  if (list.length > 0 && !list.some((f) => f.isCapa)) {
    list[0] = { ...list[0], isCapa: true };
  }
  // Se há mais de uma com isCapa (caso de estado inconsistente), mantém só a primeira marcada
  let jaTeveCapa = false;
  return list.map((f) => {
    if (f.isCapa && !jaTeveCapa) {
      jaTeveCapa = true;
      return f;
    }
    return { ...f, isCapa: false };
  });
}
