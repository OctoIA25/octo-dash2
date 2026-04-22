/**
 * Helpers para ler fotos no formato novo ({url, legenda, isCapa}) ou legado (string).
 * Mantido separado de FotosUploader.tsx para não quebrar Fast Refresh.
 */

export interface Foto {
  url: string;
  legenda?: string;
  isCapa?: boolean;
}

export type FotoInput = string | Foto;

export function getFotoUrl(foto: FotoInput | null | undefined): string | null {
  if (!foto) return null;
  return typeof foto === 'string' ? foto : foto.url ?? null;
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
