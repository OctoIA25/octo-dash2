/**
 * Opt-out de marca d'água POR IMÓVEL (imoveis_locais.sem_marca_dagua): a foto já
 * chega marcada (fotógrafo/construtora/portal) e aplicar a nossa duplicaria.
 * O que garantimos aqui é a decisão de ensureDerivative: com o flag ligado o
 * derivado sai na chave LIMPA (clean_), mesmo com a marca ligada no tenant.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('./watermarkEngine.js', () => ({
  composeWatermark: vi.fn(async () => Buffer.from('img')),
  buildLogoWatermark: vi.fn(async () => Buffer.from('mask')),
}));

const { createWatermarkService } = await import('./service.js');
const { composeWatermark } = await import('./watermarkEngine.js');

const TENANT = '11111111-1111-1111-1111-111111111111';
const PHOTO = '22222222-2222-2222-2222-222222222222';

/** Supabase mínimo: só o que ensureDerivative toca. `semMarca` = flag do imóvel. */
function fakeSupabase(semMarca) {
  const rows = {
    property_photos: {
      id: PHOTO,
      tenant_id: TENANT,
      property_id: 'CA054',
      master_path: 'master.bin',
      derivatives: {},
    },
    tenants: {
      logo_version: 3,
      logo_mask_path: 'logos/mask_v3.png',
      watermark_enabled: true,
    },
    imoveis_locais: semMarca === null ? null : { sem_marca_dagua: semMarca },
  };
  const from = (table) => {
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => ({ data: rows[table], error: null }),
      maybeSingle: async () => ({ data: rows[table], error: null }),
      update: () => q,
    };
    return q;
  };
  return {
    from,
    rpc: async () => ({ error: null }),
    storage: {
      from: () => ({
        download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(3) }, error: null }),
        upload: async () => ({ error: null }),
        list: async () => ({ data: [], error: null }),
        getPublicUrl: (key) => ({ data: { publicUrl: `https://cdn/${key}` } }),
      }),
    },
  };
}

const portalKey = async (semMarca) => {
  const service = createWatermarkService(fakeSupabase(semMarca));
  const { key } = await service.ensureDerivative(PHOTO, 'portal');
  return key;
};

describe("ensureDerivative — opt-out por imóvel", () => {
  it('flag ligado no imóvel → derivado LIMPO, sem marca', async () => {
    composeWatermark.mockClear();
    expect(await portalKey(true)).toMatch(/clean_portal\.jpg$/);
    // A máscara não é nem carregada: composeWatermark recebe watermark: false.
    expect(composeWatermark.mock.calls[0][1]).toBeNull();
  });

  it('flag desligado → derivado COM marca (comportamento atual)', async () => {
    expect(await portalKey(false)).toMatch(/wm_v3_o\d+_s\d+.*_portal\.jpg$/);
  });

  it('imóvel inexistente (condomínio/lançamento) → mantém a marca', async () => {
    expect(await portalKey(null)).toMatch(/wm_v3_/);
  });
});
