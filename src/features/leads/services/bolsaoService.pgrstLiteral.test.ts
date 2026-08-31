import { describe, it, expect } from 'vitest';
import { pgrstLiteral } from './bolsaoService';

/**
 * NEW-3 — injeção em filtro PostgREST via nome do corretor cru em .or().
 * pgrstLiteral deve transformar o valor num literal citado, matando a injeção
 * de cláusulas extras, sem remover caracteres do nome.
 */
describe('pgrstLiteral — blindagem de filtro PostgREST', () => {
  it('envolve valor simples em aspas', () => {
    expect(pgrstLiteral('João Silva')).toBe('"João Silva"');
  });

  it('neutraliza payload de injeção com vírgula/ponto (não vira sintaxe)', () => {
    const payload = 'x,corretor.not.is.null';
    const out = pgrstLiteral(payload);
    // O payload inteiro fica DENTRO das aspas → é valor, não cláusula.
    expect(out).toBe('"x,corretor.not.is.null"');
    // A vírgula não aparece fora das aspas (não separa cláusulas do .or()).
    expect(out.slice(1, -1)).toBe(payload);
  });

  it('escapa aspas duplas e barra invertida', () => {
    expect(pgrstLiteral('a"b')).toBe('"a\\"b"');
    expect(pgrstLiteral('a\\b')).toBe('"a\\\\b"');
    // aspa de fechamento forjada não escapa do literal
    expect(pgrstLiteral('".is.null,corretor.eq.')).toBe('"\\".is.null,corretor.eq."');
  });

  it('trata null/undefined como string vazia citada', () => {
    // @ts-expect-error teste de robustez em runtime
    expect(pgrstLiteral(null)).toBe('""');
    // @ts-expect-error teste de robustez em runtime
    expect(pgrstLiteral(undefined)).toBe('""');
  });
});
