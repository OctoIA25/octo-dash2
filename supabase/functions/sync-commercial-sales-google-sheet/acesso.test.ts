// node --test supabase/functions/sync-commercial-sales-google-sheet/acesso.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirAcesso } from './acesso.ts';

const base = { ehServidor: false, usuarioLogado: true, podeVerFinanceiro: true, pediuOutraOrigem: false };

// 03/10: com a ponte planilha → venda, cada linha gravada vira venda e "a
// receber". A função aceitava a chave pública do site — e uma planilha de
// qualquer endereço (sourceUrl).
test('sem login (só a chave pública do site) não relê', () => {
  const r = decidirAcesso({ ...base, usuarioLogado: false, podeVerFinanceiro: false });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 401);
});

test('logado sem acesso ao Financeiro daquela casa não relê', () => {
  const r = decidirAcesso({ ...base, podeVerFinanceiro: false });
  assert.equal(r.ok === false && r.status, 403);
});

test('quem cuida do dinheiro relê a planilha configurada', () => {
  assert.equal(decidirAcesso(base).ok, true);
});

test('mas só o servidor troca a planilha de origem', () => {
  assert.equal(decidirAcesso({ ...base, pediuOutraOrigem: true }).ok, false);
  assert.equal(decidirAcesso({ ...base, ehServidor: true, usuarioLogado: false, pediuOutraOrigem: true }).ok, true);
});
