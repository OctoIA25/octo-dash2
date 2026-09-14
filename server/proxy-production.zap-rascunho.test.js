/**
 * Rascunho de imóvel (status_aprovacao = 'rascunho') nunca sai para portal nem
 * aparece no diagnóstico do feed — nem com ?status=all / ?include_pending=true,
 * que pulam o filtro de 'aprovado'. E a exportação XLSX do catálogo está
 * registrada nos dois entrypoints, com o parser de 10 MB antes do express.json global.
 *
 * O feed está DUPLICADO em proxy-production.js (prod) e api-server.js (dev) e
 * nenhum dos dois é importável (listen no import), então o invariante é checado
 * no código-fonte dos dois, como em proxy-production.zap-publicar-site.test.js.
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

const EXCLUI_RASCUNHO = ".neq('status_aprovacao', 'rascunho')";

const corpoDaFuncao = (source, nome) => {
  const fn = source.match(new RegExp(`const ${nome} = async[\\s\\S]*?\\n};`));
  expect(fn, `${nome} não encontrado`).not.toBeNull();
  return fn[0];
};

describe('feed ZAP/Grupo OLX — rascunho nunca entra', () => {
  for (const [file, source] of Object.entries(sources)) {
    it(`${file}: getZapFeedListings exclui rascunho na query base, fora do if (!includeAllStatuses)`, () => {
      const fn = corpoDaFuncao(source, 'getZapFeedListings');
      const inicioDoIf = fn.indexOf('if (!includeAllStatuses)');
      expect(inicioDoIf, 'bloco includeAllStatuses não encontrado').toBeGreaterThan(-1);
      // Antes do if = vale para as duas variantes (só aprovados e status=all).
      expect(fn.slice(0, inicioDoIf)).toContain(EXCLUI_RASCUNHO);
    });

    it(`${file}: getZapFeedDebugInfo exclui rascunho (o /debug devolve amostras das linhas)`, () => {
      expect(corpoDaFuncao(source, 'getZapFeedDebugInfo')).toContain(EXCLUI_RASCUNHO);
    });
  }
});

describe('exportação do catálogo — registrada nos dois entrypoints', () => {
  for (const [file, source] of Object.entries(sources)) {
    it(`${file}: registra a rota antes do 404 catch-all de /api/v1/*`, () => {
      const registro = source.indexOf('registerImoveisExportRoutes(app, supabase);');
      const catchAll = source.indexOf("app.use('/api/v1/*'");
      expect(registro, 'registerImoveisExportRoutes não chamado').toBeGreaterThan(-1);
      expect(registro).toBeLessThan(catchAll);
    });

    it(`${file}: monta o parser de 10 MB da rota ANTES do express.json global`, () => {
      const parserDaRota = source.indexOf('app.use(EXPORTAR_PATH, exportarJsonParser);');
      const parserGlobal = source.indexOf('app.use(express.json(');
      expect(parserDaRota, 'parser da exportação não montado').toBeGreaterThan(-1);
      expect(parserDaRota).toBeLessThan(parserGlobal);
    });
  }
});
