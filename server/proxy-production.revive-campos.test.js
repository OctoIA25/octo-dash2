/**
 * Regressão: o revive apagava o que o lead já tinha.
 *
 * `insertOrReviveLead` trata o conflito de `unique_phone_per_tenant` fazendo
 * UPDATE do lead existente com o payload inteiro do lead novo. Como o payload
 * traz SEMPRE a chave `property_code` (null quando o anúncio não está no
 * de-para), quem já era lead com código — 'RESERVA CASTANHEIRA' vindo da Santa
 * Ângela, 'L014' vindo do ZAP — e voltasse por um formulário da Meta fora do
 * de-para perdia o código. Pior: o UPDATE também reescreve `created_at`, o que
 * dispara o trigger de reclassificação (20260903) e rebaixa o lead para
 * 'indefinido'. O processor recebe 201, marca o evento `done`, e nada registra
 * a substituição.
 *
 * proxy-production.js não é importável (chama app.listen no import), então —
 * como os outros proxy-production.*.test.js — validamos o invariante no
 * código-fonte e replicamos a lógica pura do helper.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'proxy-production.js'), 'utf8');

// Réplica exata do helper (a fonte não é importável).
const semNulos = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));

describe('semNulos — o patch do revive', () => {
  it('não leva property_code null (o bug)', () => {
    expect(semNulos({ name: 'Maria', property_code: null })).toEqual({ name: 'Maria' });
  });

  it('leva o código quando o lead novo tem um', () => {
    expect(semNulos({ property_code: 'ALLEGRATO' }).property_code).toBe('ALLEGRATO');
  });

  it('não desatribui o corretor por ausência', () => {
    expect(semNulos({ assigned_agent_id: null, assigned_agent_name: null })).toEqual({});
  });

  it('false, 0 e string vazia passam — são valor, não ausência', () => {
    expect(semNulos({ is_exclusive: false, n: 0, comments: '' }))
      .toEqual({ is_exclusive: false, n: 0, comments: '' });
  });

  it('undefined também não passa', () => {
    expect(semNulos({ email: undefined, name: 'X' })).toEqual({ name: 'X' });
  });
});

describe('proxy-production.js — uso do helper', () => {
  it('o UPDATE do revive filtra os nulos', () => {
    expect(source).toContain('.update({ ...semNulos(rest), created_at: now, updated_at: now })');
  });

  it('não sobrou nenhum revive espalhando o payload cru', () => {
    expect(source).not.toContain('.update({ ...rest,');
  });
});
