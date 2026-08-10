/**
 * O Grupo OLX importa APENAS JPG no VRSync (developers.grupozap.com/feeds/xml-formats/).
 * O feed serve a variante `portal`, então ela precisa sair em JPEG — e só ela:
 * card/thumb seguem WebP para o CRM não engordar.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { SIZES, formatFor } from './config.js';
import { cleanKey, derivedKey } from './storageRepo.js';
import { composeWatermark } from './watermarkEngine.js';

const REF = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  propertyId: 'CA054',
  imageId: '22222222-2222-2222-2222-222222222222',
};

const isJpeg = (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
const isWebp = (buf) =>
  buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
  buf.subarray(8, 12).toString('ascii') === 'WEBP';

const basePhoto = () =>
  sharp({ create: { width: 60, height: 40, channels: 3, background: '#777777' } }).png().toBuffer();
const logoRgba = () =>
  sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png().toBuffer();

describe('formatFor', () => {
  it('portal é JPEG', () => {
    expect(formatFor('portal')).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
  });

  it('card e thumb seguem WebP', () => {
    expect(formatFor('card')).toEqual({ ext: 'webp', contentType: 'image/webp' });
    expect(formatFor('thumb')).toEqual({ ext: 'webp', contentType: 'image/webp' });
  });

  it('tamanho desconhecido cai em WebP (default seguro)', () => {
    expect(formatFor('nao-existe')).toEqual({ ext: 'webp', contentType: 'image/webp' });
  });
});

describe('chaves do storage', () => {
  it('clean portal termina em .jpg', () => {
    expect(cleanKey(REF, 'portal')).toMatch(/\/clean_portal\.jpg$/);
  });

  it('clean card continua .webp (não invalida derivados existentes)', () => {
    expect(cleanKey(REF, 'card')).toMatch(/\/clean_card\.webp$/);
  });

  it('derivado com marca em portal termina em .jpg', () => {
    expect(derivedKey(REF, 12, 'portal', 0.35, 0.3, 'center')).toMatch(/_portal\.jpg$/);
  });

  it('derivado com marca em card continua .webp', () => {
    expect(derivedKey(REF, 12, 'card', 0.35, 0.3, 'center')).toMatch(/_card\.webp$/);
  });
});

describe('composeWatermark', () => {
  it('portal SEM marca sai em JPEG', async () => {
    const out = await composeWatermark(await basePhoto(), null, {
      size: { ...SIZES.portal, watermark: false }, opacity: 0.35, scale: 0.3,
    });
    expect(isJpeg(out)).toBe(true);
  });

  it('portal COM marca sai em JPEG', async () => {
    const out = await composeWatermark(await basePhoto(), await logoRgba(), {
      size: SIZES.portal, opacity: 0.35, scale: 0.3,
    });
    expect(isJpeg(out)).toBe(true);
  });

  it('card continua em WebP', async () => {
    const out = await composeWatermark(await basePhoto(), await logoRgba(), {
      size: SIZES.card, opacity: 0.35, scale: 0.3,
    });
    expect(isWebp(out)).toBe(true);
  });

  it('foto com transparência não vira fundo preto no JPEG', async () => {
    const transparente = await sharp({
      create: { width: 60, height: 40, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
    }).png().toBuffer();
    const out = await composeWatermark(transparente, null, {
      size: { ...SIZES.portal, watermark: false }, opacity: 0.35, scale: 0.3,
    });
    const { dominant } = await sharp(out).stats();
    expect(dominant.r + dominant.g + dominant.b).toBeGreaterThan(600); // branco, não preto
  });
});
