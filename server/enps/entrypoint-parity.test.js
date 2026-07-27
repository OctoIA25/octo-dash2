import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];

describe('paridade de entrypoints — módulo eNPS', () => {
  for (const entry of ENTRYPOINTS) {
    const src = readFileSync(join(SERVER_DIR, entry), 'utf8');
    it(`${entry} importa e chama registerEnpsRoutes(app, supabase)`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bregisterEnpsRoutes\b/);
      expect(src).toMatch(/registerEnpsRoutes\s*\(\s*app\s*,\s*supabase/);
    });
    it(`${entry} liga o scheduler atrás de ENPS_SCHEDULER==='1'`, () => {
      expect(src).toMatch(/ENPS_SCHEDULER\s*===\s*'1'/);
      expect(src).toMatch(/startEnpsScheduler\s*\(\s*supabase/);
    });
  }
});
