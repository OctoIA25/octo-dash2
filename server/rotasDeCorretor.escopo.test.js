/**
 * As rotas de corretor precisam ficar dentro da imobiliária de quem chamou.
 *
 * POR QUE ESTE TESTE EXISTE. Em 19/09/2026 uma revisão achou DOIS buracos no
 * entrypoint de desenvolvimento (`api-server.js`), os dois na mesma família:
 *
 *   GET  /api/v1/brokers/:id         lia   os leads de TODAS as imobiliárias
 *   POST /api/v1/brokers/:id/assign  ESCREVIA em leads de outra imobiliária,
 *                                    bastando saber os ids
 *
 * As duas rotas são autenticadas por chave de API, e a chave resolve o tenant
 * — mas as consultas não usavam esse tenant. O entrypoint de produção não
 * tinha o problema: ele chama a RPC `assign_broker_to_leads`, que recebe o
 * tenant. Nada caiu porque `api-server.js` só roda na máquina do
 * desenvolvedor — com o `.env` apontando para produção, o que torna o buraco
 * alcançável na prática.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(AQUI, 'api-server.js'), 'utf8');

/** O corpo de uma rota, do `app.<verbo>('<caminho>'` até a rota seguinte. */
function corpoDaRota(src, verbo, caminho) {
  const inicio = src.indexOf(`app.${verbo}('${caminho}'`);
  if (inicio < 0) return null;
  const proxima = src.indexOf('\napp.', inicio + 1);
  return src.slice(inicio, proxima < 0 ? src.length : proxima);
}

describe('rotas de corretor ficam dentro da imobiliária', () => {
  for (const [verbo, caminho] of [
    ['get', '/api/v1/brokers/:id'],
    ['post', '/api/v1/brokers/:id/assign'],
  ]) {
    it(`${verbo.toUpperCase()} ${caminho} existe e é autenticada por chave de API`, () => {
      const corpo = corpoDaRota(fonte, verbo, caminho);
      expect(corpo, `rota ${caminho} não encontrada`).toBeTruthy();
      expect(corpo).toContain('validateApiKey');
    });

    it(`${verbo.toUpperCase()} ${caminho} filtra por tenant_id nas consultas de lead`, () => {
      const corpo = corpoDaRota(fonte, verbo, caminho);
      // Toda consulta a leads dentro da rota precisa do escopo. Sem isto, a
      // chave de uma imobiliária alcança as outras.
      expect(corpo).toMatch(/\.from\(LEADS_TABLE\)/);
      expect(corpo).toMatch(/\.eq\('tenant_id',\s*req\.tenantId\)/);
    });
  }
});
