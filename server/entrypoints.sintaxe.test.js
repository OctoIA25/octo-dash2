/**
 * Os entrypoints do servidor precisam, no mínimo, PARSEAR.
 *
 * POR QUE ESTE TESTE EXISTE. Em 18/09/2026 o commit do teste diário de
 * consistência inseriu um bloco no meio da lista de argumentos de uma chamada
 * em `proxy-production.js` — o arquivo que serve a produção. O resultado:
 *
 *     if (process.env.ENPS_SCHEDULER === '1') {
 *       startEnpsScheduler(supabase, { runner: enpsRunner }
 *
 *     // P0.6 — ...
 *     import { startConsistenciaScheduler } from './consistencia/scheduler.js';
 *     ...
 *     });
 *     }
 *
 * O arquivo ficou com erro de sintaxe e `npm run start:prod` não subiria. Nada
 * caiu porque nada tinha sido publicado, mas ficou assim em `main`.
 *
 * Nada pegou: o TypeScript não olha `server/`, o lint não roda no CI, e nenhum
 * teste IMPORTA esses dois arquivos — eles sobem o Express ao serem carregados,
 * então importá-los num teste levantaria um servidor. `node --check` resolve
 * sem executar nada.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Os arquivos que SOBEM um processo — nenhum teste os importa. */
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];

const parseia = (arquivo) => {
  try {
    execFileSync(process.execPath, ['--check', join(AQUI, arquivo)], { stdio: 'pipe' });
    return { ok: true, erro: '' };
  } catch (e) {
    return { ok: false, erro: String(e.stderr || e.message).slice(0, 400) };
  }
};

describe('os entrypoints do servidor parseiam', () => {
  for (const arquivo of ENTRYPOINTS) {
    it(`${arquivo} não tem erro de sintaxe`, () => {
      const r = parseia(arquivo);
      expect(r.ok, `${arquivo} não parseia:\n${r.erro}`).toBe(true);
    });
  }

  it('a lista de entrypoints não ficou para trás', () => {
    // Um entrypoint novo precisa entrar na lista acima — senão este teste
    // passa enquanto o arquivo novo quebra a produção em silêncio.
    const candidatos = readdirSync(AQUI).filter(
      (f) => f.endsWith('.js') && !f.includes('.test.') && /server|proxy/.test(f)
    );
    expect(candidatos.sort()).toEqual([...ENTRYPOINTS].sort());
  });
});
