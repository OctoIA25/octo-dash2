/**
 * Ocultar complemento no feed (owner-only): tenant com hide_complement=true não
 * emite <Complement> no VRSync — o complemento ("apto 12, bloco B") identifica a
 * unidade exata e o owner pode não querer expô-la aos portais.
 *
 * Como nos demais proxy-production.*.test.js: o feed está duplicado em
 * proxy-production.js e api-server.js e nenhum dos dois é importável (app.listen
 * no import), então os invariantes são checados no código-fonte. O resolver e as
 * rotas SÃO importáveis e têm teste comportamental real.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createZapConfigResolver } from './zap/zapConfigResolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sources = {
  'proxy-production.js': readFileSync(join(__dirname, 'proxy-production.js'), 'utf8'),
  'api-server.js': readFileSync(join(__dirname, 'api-server.js'), 'utf8'),
};

describe('proxy-production.js / api-server.js — invariantes do hide_complement', () => {
  for (const [file, source] of Object.entries(sources)) {
    it(`${file}: <Complement> só sai quando cfg.hideComplement é falso`, () => {
      expect(source).toContain('imovel.complemento && !cfg.hideComplement');
      // Nenhuma emissão de <Complement> sem o guard.
      const unguarded = source.match(/\$\{imovel\.complemento \? `[^`]*<Complement>/);
      expect(unguarded).toBeNull();
    });

    it(`${file}: effectiveZapConfig propaga hideComplement do tenant`, () => {
      expect(source).toContain('hideComplement: tenantConfig.hideComplement === true');
    });
  }

  it('routes.js: hideComplement é gated ao owner da plataforma', () => {
    const routes = readFileSync(join(__dirname, 'zap', 'routes.js'), 'utf8');
    expect(routes).toContain("fields.hideComplement !== undefined");
    expect(routes).toContain('req.isPlatformOwner');
  });
});

describe('zapConfigResolver — hide_complement', () => {
  const KEY = Buffer.alloc(32, 7).toString('base64');
  const env = { EMAIL_ENCRYPTION_KEY: KEY };

  function makeSupabase(rows = []) {
    const store = [...rows];
    const calls = { upserts: [] };
    const b = {
      from() { return b; },
      select() { return b; },
      eq(col, val) { b._pending = { col, val }; return b; },
      maybeSingle() {
        const { col, val } = b._pending;
        return Promise.resolve({ data: store.find((r) => r[col] === val) || null, error: null });
      },
      upsert(payload) {
        calls.upserts.push(payload);
        return Promise.resolve({ error: null });
      },
    };
    return { supabase: b, calls };
  }

  it('lê hide_complement do banco como hideComplement (default false)', async () => {
    const { supabase } = makeSupabase([
      { tenant_id: 't1', status: 'active', hide_complement: true },
      { tenant_id: 't2', status: 'active' },
    ]);
    const resolver = createZapConfigResolver({ supabase, processEnv: env });
    expect((await resolver.resolveByTenant('t1')).hideComplement).toBe(true);
    expect((await resolver.resolveByTenant('t2')).hideComplement).toBe(false);
  });

  it('saveConfig grava hideComplement na coluna hide_complement', async () => {
    const { supabase, calls } = makeSupabase();
    const resolver = createZapConfigResolver({ supabase, processEnv: env });
    const r = await resolver.saveConfig('t1', { hideComplement: true });
    expect(r.ok).toBe(true);
    expect(calls.upserts[0].hide_complement).toBe(true);
  });
});
