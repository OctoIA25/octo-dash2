import { describe, it, expect } from 'vitest';
import { normalizarToque } from './normalize.js';

const AGORA = Date.parse('2026-09-16T12:00:00Z');
const valido = (over = {}) => ({ canal: 'ligacao', resultado: 'nao_respondeu', ...over });

describe('normalizarToque', () => {
  it('aceita o mínimo: canal + resultado', () => {
    expect(normalizarToque(valido(), { now: AGORA })).toEqual({
      ok: true,
      row: { canal: 'ligacao', resultado: 'nao_respondeu', observacao: null, proximo_toque_em: null },
    });
  });

  it.each(['whatsapp', 'ligacao', 'email', 'presencial'])('aceita canal %s', (canal) => {
    expect(normalizarToque(valido({ canal }), { now: AGORA }).ok).toBe(true);
  });

  it.each(['respondeu', 'nao_respondeu', 'numero_errado', 'nao_contatar'])('aceita resultado %s', (resultado) => {
    expect(normalizarToque(valido({ resultado }), { now: AGORA }).ok).toBe(true);
  });

  it('recusa canal e resultado fora da lista, acusando os dois', () => {
    const r = normalizarToque({ canal: 'sms', resultado: 'talvez' }, { now: AGORA });
    expect(r.ok).toBe(false);
    expect(r.details).toEqual([
      { field: 'canal', reason: 'invalid_value' },
      { field: 'resultado', reason: 'invalid_value' },
    ]);
  });

  it('canal e resultado são obrigatórios', () => {
    const r = normalizarToque({}, { now: AGORA });
    expect(r.details).toEqual([
      { field: 'canal', reason: 'required' },
      { field: 'resultado', reason: 'required' },
    ]);
  });

  it('corpo que não é objeto é recusado', () => {
    expect(normalizarToque(null).ok).toBe(false);
    expect(normalizarToque([]).ok).toBe(false);
  });

  it('observação vazia vira null e a longa é recusada', () => {
    expect(normalizarToque(valido({ observacao: '   ' }), { now: AGORA }).row.observacao).toBeNull();
    expect(normalizarToque(valido({ observacao: ' ligou a esposa ' }), { now: AGORA }).row.observacao).toBe('ligou a esposa');
    const longa = normalizarToque(valido({ observacao: 'x'.repeat(1001) }), { now: AGORA });
    expect(longa.details).toEqual([{ field: 'observacao', reason: 'too_long' }]);
  });

  it('próximo toque no futuro é normalizado para ISO', () => {
    const r = normalizarToque(valido({ proximo_toque_em: '2026-09-17T10:00:00-03:00' }), { now: AGORA });
    expect(r.row.proximo_toque_em).toBe('2026-09-17T13:00:00.000Z');
  });

  it('próximo toque no passado ou inválido é recusado', () => {
    expect(normalizarToque(valido({ proximo_toque_em: '2026-09-15T10:00:00Z' }), { now: AGORA }).details)
      .toEqual([{ field: 'proximo_toque_em', reason: 'in_the_past' }]);
    expect(normalizarToque(valido({ proximo_toque_em: 'amanhã' }), { now: AGORA }).details)
      .toEqual([{ field: 'proximo_toque_em', reason: 'invalid_date' }]);
  });

  it('ignora o que o cliente não pode decidir (quem, quando, tenant)', () => {
    const r = normalizarToque(
      valido({ executado_por: 'x', executado_em: '2020-01-01', tenant_id: 'y', lead_id: 'z' }),
      { now: AGORA },
    );
    expect(Object.keys(r.row).sort()).toEqual(['canal', 'observacao', 'proximo_toque_em', 'resultado']);
  });
});
