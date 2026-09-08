import { describe, it, expect, vi } from 'vitest';
import {
  slaPrimeiroContato, confirmacaoReuniao, prazoMatricula,
  resgatePorSilencio, marcosAtrasados,
} from './jobs.js';

const NOW = () => Date.parse('2026-09-10T12:00:00Z');

/**
 * Fake que registra filtros e escritas. Os filtros SÃO a regra de negócio aqui
 * (quem vence hoje ainda tem o dia; quem já foi encerrado não se toca), então
 * é neles que o teste segura.
 */
function fakeSupabase({ candidatos = [], marcos = [], fila = [], jaNotificado = false } = {}) {
  const filtros = [];
  const inserts = [];
  const updates = [];

  const from = (table) => {
    const chain = {
      select: () => chain,
      eq: (c, v) => { filtros.push([table, 'eq', c, v]); return chain; },
      in: (c, v) => { filtros.push([table, 'in', c, v]); return chain; },
      is: (c, v) => { filtros.push([table, 'is', c, v]); return chain; },
      not: (c, op, v) => { filtros.push([table, 'not', c, `${op} ${v}`]); return chain; },
      lt: (c, v) => { filtros.push([table, 'lt', c, v]); return chain; },
      contains: () => chain,
      insert: async (rows) => { inserts.push({ table, rows }); return { error: null }; },
      update: (row) => ({ eq: async (_c, id) => { updates.push({ table, id, row }); return { error: null }; } }),
      limit: async () => {
        if (table === 'recrut_candidato') return { data: candidatos, error: null };
        if (table === 'recrut_ativacao_marco') return { data: marcos, error: null };
        if (table === 'vw_recrut_fila_acao') return { data: fila, error: null };
        if (table === 'notifications') return { data: jaNotificado ? [{ id: 'n1' }] : [], error: null };
        return { data: [], error: null };
      },
      then: (resolve) => resolve({
        data: table === 'tenant_memberships' ? [{ user_id: 'u-admin' }] : [],
        error: null,
      }),
    };
    return chain;
  };
  return { from: vi.fn(from), _filtros: filtros, _inserts: inserts, _updates: updates };
}

const notificacoes = (s) => s._inserts.filter((i) => i.table === 'notifications').flatMap((i) => i.rows);

describe('jobs do recrutamento', () => {
  it('SLA: avisa quem se candidatou há mais de 1h sem contato', async () => {
    const s = fakeSupabase({ candidatos: [{ id: 'c1', tenant_id: 't1', nome: 'Jaqueline' }] });
    const r = await slaPrimeiroContato(s, { now: NOW });

    expect(r.avisados).toBe(1);
    expect(notificacoes(s)[0]).toMatchObject({
      tenant_id: 't1', user_id: 'u-admin', link_type: 'recrutamento', link_id: 'c1',
    });
    expect(s._filtros).toEqual(expect.arrayContaining([
      ['recrut_candidato', 'eq', 'estagio', 'lead'],
      ['recrut_candidato', 'is', 'ts_primeiro_contato', null],
      ['recrut_candidato', 'lt', 'ts_candidatura', '2026-09-10T11:00:00.000Z'],
    ]));
  });

  it('SLA: não repete o aviso do mesmo candidato', async () => {
    const s = fakeSupabase({ candidatos: [{ id: 'c1', tenant_id: 't1', nome: 'Jaqueline' }], jaNotificado: true });
    expect((await slaPrimeiroContato(s, { now: NOW })).avisados).toBe(0);
    expect(notificacoes(s)).toHaveLength(0);
  });

  it('confirmação: usa a fila e nomeia a hora da reunião', async () => {
    const s = fakeSupabase({
      fila: [{ id: 'c2', tenant_id: 't1', nome: 'Thayna', desde: '2026-09-11T18:00:00Z', motivo: 'confirmar_reuniao' }],
    });
    const r = await confirmacaoReuniao(s, { now: NOW });
    expect(r.avisados).toBe(1);
    expect(notificacoes(s)[0].body).toContain('15:00');   // 18h UTC = 15h em SP
  });

  it('prazo: lembra quem vence hoje e encerra quem já venceu', async () => {
    const s = fakeSupabase({ candidatos: [{ id: 'c3', tenant_id: 't1', nome: 'Mabel' }] });
    const r = await prazoMatricula(s, { now: NOW });

    expect(r.lembretes).toBe(1);
    expect(r.encerrados).toBe(1);
    // Motivo ANTES do evento, senão a constraint recusa.
    expect(s._updates[0].row).toEqual({ motivo_perda: 'nao_pagou_matricula' });
    const evento = s._inserts.find((i) => i.table === 'recrut_evento');
    expect(evento.rows).toMatchObject({ tipo: 'encerrado', payload: { motivo_perda: 'nao_pagou_matricula' } });
    expect(s._filtros).toEqual(expect.arrayContaining([
      ['recrut_candidato', 'eq', 'prazo_matricula', '2026-09-10'],
      ['recrut_candidato', 'lt', 'prazo_matricula', '2026-09-10'],
    ]));
  });

  it('resgate: primeira passagem tenta, segunda encerra com sumiu', async () => {
    const primeira = fakeSupabase({ candidatos: [{ id: 'c4', tenant_id: 't1', nome: 'Nilda' }] });
    expect(await resgatePorSilencio(primeira, { now: NOW })).toEqual({ tentativas: 1, encerrados: 0 });

    const segunda = fakeSupabase({ candidatos: [{ id: 'c4', tenant_id: 't1', nome: 'Nilda' }], jaNotificado: true });
    const r = await resgatePorSilencio(segunda, { now: NOW });
    expect(r).toEqual({ tentativas: 0, encerrados: 1 });
    expect(segunda._updates[0].row).toEqual({ motivo_perda: 'sumiu' });
  });

  it('marcos: alerta o marco vencido nomeando o candidato', async () => {
    const s = fakeSupabase({
      marcos: [{
        id: 9, marco: 'primeira_lista_leads', prazo: '2026-09-01', candidato_id: 'c5',
        recrut_candidato: { id: 'c5', nome: 'Mirleine', tenant_id: 't1' },
      }],
    });
    const r = await marcosAtrasados(s, { now: NOW });
    expect(r.avisados).toBe(1);
    expect(notificacoes(s)[0].body).toContain('primeira lista leads');
  });
});
