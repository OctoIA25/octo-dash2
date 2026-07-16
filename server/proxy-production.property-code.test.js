/**
 * Regressão: o código do imóvel sumia do card do Kanban para leads criados via
 * loopback da Lia/n8n. O webhook lead.created emite o código como `codigo`, mas
 * os handlers de escrita em /api/v1/leads só liam interest_reference/property_code/
 * codigo_imovel → property_code entrava null. Fix: helper resolvePropertyCode(body)
 * que também aceita `codigo`, usado em todos os pontos de escrita.
 *
 * proxy-production.js não é importável (chama app.listen no import), então — como
 * os outros proxy-production.*.test.js — validamos o invariante no código-fonte
 * e replicamos a lógica pura do helper para testar a precedência das chaves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'proxy-production.js'), 'utf8');

// Réplica exata da lógica do helper (a fonte não é importável).
const resolvePropertyCode = (body = {}) =>
  body.interest_reference || body.property_code || body.codigo_imovel || body.codigo || null;

describe('resolvePropertyCode — precedência de chaves', () => {
  it('aceita a chave `codigo` do webhook lead.created (o bug)', () => {
    expect(resolvePropertyCode({ codigo: 'CA0813' })).toBe('CA0813');
  });
  it('interest_reference tem prioridade sobre as demais', () => {
    expect(resolvePropertyCode({ interest_reference: 'AP1', codigo: 'X' })).toBe('AP1');
  });
  it('property_code vence codigo_imovel e codigo', () => {
    expect(resolvePropertyCode({ property_code: 'P', codigo_imovel: 'CI', codigo: 'C' })).toBe('P');
  });
  it('codigo_imovel vence codigo', () => {
    expect(resolvePropertyCode({ codigo_imovel: 'CI', codigo: 'C' })).toBe('CI');
  });
  it('body vazio ou sem chave conhecida → null', () => {
    expect(resolvePropertyCode({})).toBeNull();
    expect(resolvePropertyCode()).toBeNull();
    expect(resolvePropertyCode({ outra: 'W' })).toBeNull();
  });
});

describe('proxy-production.js — uso do helper', () => {
  it('define resolvePropertyCode incluindo a chave `codigo`', () => {
    const def = source.match(/const resolvePropertyCode = \(body = \{\}\) =>[\s\S]*?;/);
    expect(def, 'helper resolvePropertyCode não encontrado').not.toBeNull();
    expect(def[0]).toContain('body.codigo');
  });

  it('nenhum ponto de escrita reintroduziu a cadeia manual sem `codigo`', () => {
    // A cadeia antiga (sem `codigo`) era a fonte do bug; ninguém deve recriá-la.
    const antiga = source.match(/interest_reference \|\| property_code \|\| codigo_imovel;/g) || [];
    expect(antiga.length, 'cadeia manual sem `codigo` voltou — use resolvePropertyCode').toBe(0);
  });

  it('todos os propertyCode de escrita passam pelo helper', () => {
    const viaHelper = source.match(/const propertyCode = resolvePropertyCode\((?:req\.body|body)\);/g) || [];
    expect(viaHelper.length).toBeGreaterThanOrEqual(6);
  });
});
