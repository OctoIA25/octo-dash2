/**
 * Os dois entrypoints precisam registrar a rota da distribuição.
 *
 * POR QUE ESTE TESTE EXISTE. Neste repositório o mesmo código já viveu
 * duplicado nos dois servidores e divergiu: o mapper que decide o que vai para
 * a Lia estava escrito duas vezes, sem teste, apesar de um comentário avisando
 * que isso "já custou caro". Uma rota registrada só num dos dois some quando o
 * outro entra no ar — e some em silêncio, porque 404 de rota não acorda
 * ninguém.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SERVIDOR = join(AQUI, '..');
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];

describe('paridade de entrypoints — distribuição', () => {
  for (const arquivo of ENTRYPOINTS) {
    const src = readFileSync(join(SERVIDOR, arquivo), 'utf8');

    it(`${arquivo} importa registerDistribuicaoRoutes`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bregisterDistribuicaoRoutes\b/);
    });

    it(`${arquivo} registra a rota passando o validador de API key`, () => {
      // Sem o validador, a rota responderia a qualquer um — e ela diz de quem
      // é cada lead da imobiliária.
      expect(src).toMatch(/registerDistribuicaoRoutes\s*\(\s*app\s*,\s*supabase\s*,\s*validateApiKey\s*\)/);
    });
  }

  it('nenhum dos dois declara a regra por conta própria', () => {
    // A regra mora em server/distribuicao/regra.js. Uma cópia local num
    // entrypoint é exatamente o defeito que este módulo veio evitar.
    for (const arquivo of ENTRYPOINTS) {
      const src = readFileSync(join(SERVIDOR, arquivo), 'utf8');
      expect(src).not.toMatch(/function\s+decidirDestino/);
      expect(src).not.toMatch(/const\s+decidirDestino\s*=/);
    }
  });
});
