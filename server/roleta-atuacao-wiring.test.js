/**
 * Regressão de WIRING do filtro de atuação da roleta (lançamentos vs prontos).
 *
 * O comportamento em produção depende de um argumento OPCIONAL no fim da lista
 * de parâmetros, repetido em 7 call sites de dois arquivos. Some com ele num
 * refactor e a feature morre em silêncio: nenhuma função quebra, nenhum teste
 * de unidade fica vermelho — a roleta só volta a sortear no pool inteiro.
 *
 * Nem proxy-production.js nem api-server.js são importáveis (criam client
 * Supabase e chamam app.listen no import), então — como os outros
 * proxy-production.*.test.js — o invariante é validado no código-fonte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sources = {
  'proxy-production.js': readFileSync(join(__dirname, 'proxy-production.js'), 'utf8'),
  'api-server.js': readFileSync(join(__dirname, 'api-server.js'), 'utf8'),
};

/**
 * Extrai o texto de cada CHAMADA de `fnName` (do nome até o parêntese que
 * fecha). As definições não aparecem: `const fnName = async (` não tem o
 * parêntese colado no nome.
 */
function callSites(source, fnName) {
  const marker = `${fnName}(`;
  const sites = [];
  for (let i = source.indexOf(marker); i !== -1; i = source.indexOf(marker, i + 1)) {
    let depth = 0;
    let end = i + marker.length - 1;
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++;
      else if (source[end] === ')' && --depth === 0) break;
    }
    sites.push(source.slice(i, end + 1));
    i = end;
  }
  return sites;
}

/** Corpo de um handler: do registro da rota até o próximo registro. */
function extractHandler(source, method, route) {
  const marker = `app.${method}('${route}'`;
  const start = source.indexOf(marker);
  expect(start, `rota não encontrada: ${method.toUpperCase()} ${route}`).toBeGreaterThan(-1);
  const rest = source.slice(start + marker.length);
  const next = rest.search(/app\.(get|post|put|patch|delete)\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

// Quantidade esperada de chamadas por arquivo. Os números são a trava: se um
// refactor apagar ou duplicar um call site, este teste fica vermelho.
const ESPERADO = {
  'proxy-production.js': { resolveBrokerForLead: 2, getNextBrokerFromRoleta: 1 },
  'api-server.js': { resolveBrokerForLead: 2, getNextBrokerFromRoleta: 2 },
};

describe('atuação da roleta — todos os call sites passam o argumento', () => {
  for (const [file, esperado] of Object.entries(ESPERADO)) {
    for (const [fn, total] of Object.entries(esperado)) {
      it(`${file}: as ${total} chamada(s) de ${fn} passam a atuação`, () => {
        const sites = callSites(sources[file], fn);
        expect(sites.length, `mudou a quantidade de call sites de ${fn}`).toBe(total);
        for (const site of sites) {
          expect(site, `chamada sem atuação: ${site}`).toContain('atuacao');
        }
      });
    }
  }
});

describe('atuação da roleta — assimetria intencional entre as rotas', () => {
  // Réplica do helper dos dois arquivos (a fonte não é importável).
  const atuacaoFromBody = (body) =>
    (body?.lancamento_id || body?.raw_data?.lancamento_id ? 'lancamentos' : 'prontos');

  it('sem lancamento_id o lead é de imóvel pronto', () => {
    expect(atuacaoFromBody({ name: 'Fulano' })).toBe('prontos');
    expect(atuacaoFromBody({})).toBe('prontos');
    expect(atuacaoFromBody(undefined)).toBe('prontos');
  });

  it('lancamento_id na raiz ou dentro de raw_data marca lançamento', () => {
    expect(atuacaoFromBody({ lancamento_id: 'abc' })).toBe('lancamentos');
    expect(atuacaoFromBody({ raw_data: { lancamento_id: 'abc' } })).toBe('lancamentos');
  });

  for (const [file, source] of Object.entries(sources)) {
    it(`${file}: atuacaoFromBody deriva 'prontos' na ausência do id e lê raw_data`, () => {
      const def = source.match(/const atuacaoFromBody = [\s\S]{0,200}?;/);
      expect(def, 'atuacaoFromBody não encontrado').not.toBeNull();
      expect(def[0]).toContain('raw_data?.lancamento_id');
      expect(def[0]).toContain("'prontos'");
    });

    // /leads/roleta é documentada como "força roleta" genérica (chatbots,
    // landing pages): sem lancamento_id ela usa o POOL INTEIRO (undefined), e
    // NÃO 'prontos'. Uniformizar com as outras rotas misrotearia esses leads.
    it(`${file}: POST /leads/roleta sem lancamento_id usa o pool inteiro (undefined)`, () => {
      const handler = extractHandler(source, 'post', '/api/v1/leads/roleta');
      expect(handler).toMatch(/lancamento_id\s*\?\s*'lancamentos'\s*:\s*undefined/);
      expect(handler).not.toContain('atuacaoFromBody');
    });

    it(`${file}: GET /roleta reporta o pool do índice lido`, () => {
      const handler = extractHandler(source, 'get', '/api/v1/roleta');
      expect(handler).toContain('req.query?.atuacao');
      expect(handler).toContain('tenantRoletaState.get(`${tenantId}:${pool}`)');
      expect(handler).toMatch(/\n\s*pool,/); // o pool sai na resposta
    });
  }
});
