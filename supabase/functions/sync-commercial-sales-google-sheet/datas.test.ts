// node --test supabase/functions/sync-commercial-sales-google-sheet/datas.test.ts
// (o vitest exclui supabase/**; o Node 24 roda o TypeScript direto)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate } from './datas.ts';

test('a data como a planilha sempre escreveu', () => {
  assert.equal(parseDate('22/09/2026', 2026), '2026-09-22');
  assert.equal(parseDate('07/07', 2026), '2026-07-07');
  assert.equal(parseDate('5/3/26', 2026), '2026-03-05');
  assert.equal(parseDate('2026-09-22', 2026), '2026-09-22');
});

// 03/10: as vendas de setembro da planilha nova vieram com ponto ("22.09.2026").
// Lidas como vazias, elas entravam sem data de assinatura e a ponte as ignorava.
test('a data com ponto, como as vendas de setembro vieram', () => {
  assert.equal(parseDate('22.09.2026', 2026), '2026-09-22');
  assert.equal(parseDate('30.09', 2026), '2026-09-30');
});

test('o que não é data continua vazio', () => {
  assert.equal(parseDate('A RECEBER', 2026), null);
  assert.equal(parseDate('PARCELADO', 2026), null);
  assert.equal(parseDate('/', 2026), null);
  assert.equal(parseDate('31.13.2026', 2026), null);
  assert.equal(parseDate('', 2026), null);
});
