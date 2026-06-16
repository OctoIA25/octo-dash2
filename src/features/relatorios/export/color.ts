/** Utilitários de cor compartilhados pelos geradores (PDF/Excel). */

export type RGB = [number, number, number];

/** Paleta de marca (azul OctoDash) usada quando a série não traz cor própria. */
export const BRAND_PALETTE: RGB[] = [
  [37, 99, 235],
  [34, 197, 94],
  [234, 179, 8],
  [168, 85, 247],
  [6, 182, 212],
  [249, 115, 22],
  [236, 72, 153],
  [16, 185, 129],
];

/** Converte uma cor CSS (rgba/rgb/hex) em [r,g,b]. Cai no azul de marca se inválida. */
export function parseColor(input?: string): RGB {
  if (!input) return BRAND_PALETTE[0];
  const value = input.trim();

  const rgba = value.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => parseFloat(p.trim()));
    if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
      return [clampByte(parts[0]), clampByte(parts[1]), clampByte(parts[2])];
    }
  }

  const hex = value.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }

  return BRAND_PALETTE[0];
}

/** Cor da série N (própria, se houver; senão a paleta de marca). */
export function seriesColor(color: string | undefined, index: number): RGB {
  return color ? parseColor(color) : BRAND_PALETTE[index % BRAND_PALETTE.length];
}

/** [r,g,b] -> "RRGGBB" (sem #) para o formato ARGB do ExcelJS. */
export function rgbToHex([r, g, b]: RGB): string {
  return [r, g, b].map((n) => clampByte(n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
