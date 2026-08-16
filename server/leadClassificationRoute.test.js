/**
 * O erro mais caro deste repo: registrar rota só no api-server (dev) e não no
 * proxy-production (prod) — 404 em produção, tudo verde em dev.
 * Mesmo padrão de metaLeadgen/entrypoints.test.js.
 *
 * O corpo do handler (validação, fixar source='lia', escopo por tenant) foi
 * extraído para `handleClassificationPatch` em leadClassification.js — os
 * dois entrypoints só registram a rota e delegam. Esse comportamento agora é
 * testado executavelmente em leadClassification.test.js (uma cópia por
 * entrypoint não existe mais para divergir). Este arquivo prova só a FIAÇÃO:
 * que os dois entrypoints registram a rota com validateApiKey e chamam o
 * handler compartilhado passando o req inteiro (não um subconjunto de
 * campos) — é o que garante que req.tenantId, setado pelo validateApiKey,
 * chega ao handler.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(__dirname, f), 'utf8');

describe.each(['proxy-production.js', 'api-server.js'])('%s', (file) => {
  const src = read(file);

  it('registra a rota de classificação com validateApiKey', () => {
    expect(src).toMatch(/app\.patch\(\s*'\/api\/v1\/leads\/:id\/classification',\s*validateApiKey/);
  });

  it('usa o handler compartilhado — não reimplementa a rota inline', () => {
    expect(src).toMatch(/from '\.\/leadClassification\.js'/);
    expect(src).toMatch(/handleClassificationPatch\(\s*req,\s*res,\s*supabase\s*\)/);
  });
});
