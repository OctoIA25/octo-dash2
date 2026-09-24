/**
 * Quantos passaram por cada etapa.
 *
 * O caso que sustenta o arquivo é o do lead que VAI E VOLTA: contar evento em
 * vez de lead distinto inflaria a taxa de conversão, que é exatamente o número
 * que o chefe pediu para poder confiar.
 */
import { describe, it, expect } from 'vitest';
import { contarPassaramPorEtapa, inicioDoHistorico } from './passaramPorEtapa.js';

const ETAPAS = ['Novos Leads', 'Interação', 'Visita Agendada', 'Negociação'];
const ev = (lead_id, para, created_at = '2026-09-11T10:00:00Z') => ({ lead_id, para, created_at });

describe('contarPassaramPorEtapa', () => {
  it('o lead continua contando na etapa por onde passou, mesmo tendo seguido adiante', () => {
    // É o pedido, literal: "o número continua ali mesmo que o lead tenha
    // migrado para a etapa de negociação".
    const r = contarPassaramPorEtapa(
      [ev('a', 'Visita Agendada'), ev('a', 'Negociação')],
      ETAPAS,
    );
    expect(r[ETAPAS.indexOf('Visita Agendada')]).toBe(1);
    expect(r[ETAPAS.indexOf('Negociação')]).toBe(1);
  });

  it('lead que vai e volta conta UMA vez — senão a taxa de conversão infla', () => {
    const r = contarPassaramPorEtapa(
      [
        ev('a', 'Visita Agendada'),
        ev('a', 'Interação'),
        ev('a', 'Visita Agendada'),   // voltou
        ev('a', 'Negociação'),
      ],
      ETAPAS,
    );
    expect(r[ETAPAS.indexOf('Visita Agendada')]).toBe(1);
  });

  it('leads diferentes somam', () => {
    const r = contarPassaramPorEtapa(
      [ev('a', 'Visita Agendada'), ev('b', 'Visita Agendada'), ev('c', 'Visita Agendada')],
      ETAPAS,
    );
    expect(r[ETAPAS.indexOf('Visita Agendada')]).toBe(3);
  });

  it('etapa que saiu do funil não derruba a contagem das outras', () => {
    const r = contarPassaramPorEtapa(
      [ev('a', 'Etapa Que Nao Existe Mais'), ev('b', 'Negociação')],
      ETAPAS,
    );
    expect(r[ETAPAS.indexOf('Negociação')]).toBe(1);
    expect(r).toHaveLength(ETAPAS.length);
  });

  it('evento sem destino ou sem lead é ignorado, e não vira contagem', () => {
    const r = contarPassaramPorEtapa(
      [{ lead_id: 'a', para: null }, { lead_id: null, para: 'Negociação' }, ev('b', 'Negociação')],
      ETAPAS,
    );
    expect(r[ETAPAS.indexOf('Negociação')]).toBe(1);
  });

  it('sem evento nenhum, tudo zero — e do mesmo tamanho da lista de etapas', () => {
    expect(contarPassaramPorEtapa([], ETAPAS)).toEqual([0, 0, 0, 0]);
    expect(contarPassaramPorEtapa(undefined, ETAPAS)).toEqual([0, 0, 0, 0]);
  });
});

describe('inicioDoHistorico', () => {
  it('devolve o evento mais antigo — é a data que a tela precisa mostrar', () => {
    const r = inicioDoHistorico([
      ev('a', 'Negociação', '2026-09-20T10:00:00Z'),
      ev('b', 'Negociação', '2026-09-10T08:00:00Z'),
      ev('c', 'Negociação', '2026-09-15T10:00:00Z'),
    ]);
    expect(r).toBe('2026-09-10T08:00:00.000Z');
  });

  it('sem evento devolve null — a tela mostra só o "agora", e não um zero enganoso', () => {
    expect(inicioDoHistorico([])).toBeNull();
    expect(inicioDoHistorico(undefined)).toBeNull();
  });

  it('data corrompida não vira Invalid Date na tela', () => {
    expect(inicioDoHistorico([{ created_at: 'nao é data' }, ev('a', 'X', '2026-09-12T00:00:00Z')]))
      .toBe('2026-09-12T00:00:00.000Z');
  });
});
