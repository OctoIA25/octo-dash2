import { describe, it, expect } from 'vitest';
import { PORTAL_CODE_TO_NAME, MEDIA_ORIGINS, portalNameFor, loadKenloEnv } from './kenloConfig.js';

describe('kenloConfig', () => {
  it('mapeia códigos de portal conhecidos', () => {
    expect(PORTAL_CODE_TO_NAME[8]).toBe('Site');
    expect(PORTAL_CODE_TO_NAME[1546]).toBe('Cliquei Mudei');
  });

  it('MEDIA_ORIGINS cobre os portais mapeados', () => {
    expect(MEDIA_ORIGINS).toEqual(expect.arrayContaining([8, 12, 512, 1546, 1834]));
  });

  it('portalNameFor faz fallback para código desconhecido', () => {
    expect(portalNameFor(99999)).toBe('Portal 99999');
    expect(portalNameFor('12')).toBe('Imóvel Web');
  });

  it('loadKenloEnv aplica defaults e lê overrides', () => {
    const def = loadKenloEnv({});
    expect(def.retries).toBe(3);
    expect(def.timeoutMs).toBe(15000);
    expect(def.perPage).toBe(200);
    const over = loadKenloEnv({ KENLO_HTTP_RETRIES: '5', KENLO_LIA_WEBHOOK_URL: 'https://x/y' });
    expect(over.retries).toBe(5);
    expect(over.liaWebhookUrl).toBe('https://x/y');
  });

  it('loadKenloEnv expõe syncWindowDays e syncOverlapMin com defaults', () => {
    const cfg = loadKenloEnv({});
    expect(cfg.syncWindowDays).toBe(60);
    expect(cfg.syncOverlapMin).toBe(5);
  });

  it('loadKenloEnv respeita overrides de janela/margem', () => {
    const cfg = loadKenloEnv({ KENLO_SYNC_WINDOW_DAYS: '90', KENLO_SYNC_OVERLAP_MIN: '10' });
    expect(cfg.syncWindowDays).toBe(90);
    expect(cfg.syncOverlapMin).toBe(10);
  });
});
