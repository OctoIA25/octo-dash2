/**
 * O contrato de escrita é a fronteira com um app que não controlamos. Estes
 * testes travam: obrigatoriedade da chave de idempotência, all-or-nothing,
 * e as duas regras que evitam linha inútil na tela (âncora do lead e
 * sent_at obrigatório quando o status diz que saiu).
 */
import { describe, it, expect } from 'vitest';
import { normalizarCadencia } from './normalize.js';

const NOW = Date.parse('2026-09-10T12:00:00Z');
const base = {
  lead_id: 'bf3bfb20-d643-4147-a2ba-aa170d21a5b7',
  idempotency_key: 'lia:bf3bfb20:pos_apresentacao:1',
  status: 'pending',
  scheduled_at: '2026-09-11T14:00:00Z',
};
const campos = (r) => r.details.map((d) => d.field);

describe('normalizarCadencia — aceitação', () => {
  it('aceita o corpo mínimo e devolve a linha pronta', () => {
    const r = normalizarCadencia(base, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.row).toMatchObject({ lead_id: base.lead_id, status: 'pending' });
    expect(r.row.updated_at).toBe('2026-09-10T12:00:00.000Z');
  });

  it('campo não enviado NÃO entra na linha — senão o merge apaga o que já existe', () => {
    const { row } = normalizarCadencia(
      { idempotency_key: 'k', lead_id: base.lead_id, status: 'cancelled', cancelled_reason: 'lead_returned' },
      { now: NOW },
    );
    expect(Object.keys(row).sort()).toEqual(
      ['cancelled_reason', 'idempotency_key', 'lead_id', 'status', 'updated_at'],
    );
    expect('scheduled_at' in row).toBe(false);
  });

  it('status ausente não é decidido aqui — quem aplica o default é o INSERT', () => {
    const { row } = normalizarCadencia({ ...base, status: undefined }, { now: NOW });
    expect('status' in row).toBe(false);
  });

  it('telefone sozinho basta como âncora do lead', () => {
    const r = normalizarCadencia(
      { idempotency_key: 'k', lead_phone: '5511999998888' }, { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect('lead_id' in r.row).toBe(false);
    expect(r.row.lead_phone).toBe('5511999998888');
  });

  it('ignora campo desconhecido em vez de reprovar', () => {
    const r = normalizarCadencia({ ...base, campo_do_app: 'x' }, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.row.campo_do_app).toBeUndefined();
  });

  it('trunca texto longo em vez de estourar o banco', () => {
    const r = normalizarCadencia({ ...base, motivo: 'a'.repeat(9000) }, { now: NOW });
    expect(r.row.motivo).toHaveLength(4000);
  });

  it('normaliza caixa de channel e outcome', () => {
    const r = normalizarCadencia({ ...base, channel: 'WhatsApp', outcome: 'Respondido' }, { now: NOW });
    expect(r.row).toMatchObject({ channel: 'whatsapp', outcome: 'respondido' });
  });
});

describe('normalizarCadencia — recusa', () => {
  it('exige idempotency_key', () => {
    const r = normalizarCadencia({ ...base, idempotency_key: '  ' }, { now: NOW });
    expect(campos(r)).toContain('idempotency_key');
  });

  it('exige lead_id ou lead_phone', () => {
    const r = normalizarCadencia({ idempotency_key: 'k' }, { now: NOW });
    expect(campos(r)).toContain('lead_id');
  });

  it('recusa uuid malformado', () => {
    const r = normalizarCadencia({ ...base, lead_id: '123' }, { now: NOW });
    expect(r.details).toContainEqual({ field: 'lead_id', reason: 'invalid_uuid' });
  });

  it('recusa status fora do enum do banco', () => {
    const r = normalizarCadencia({ ...base, status: 'enviado' }, { now: NOW });
    expect(campos(r)).toContain('status');
  });

  it('status sent sem sent_at é recusado — a tela ficaria cega', () => {
    const r = normalizarCadencia({ ...base, status: 'sent' }, { now: NOW });
    expect(r.details).toContainEqual({ field: 'sent_at', reason: 'required_when_status_sent' });
  });

  it('recusa data impossível e data no futuro, menos scheduled_at', () => {
    expect(campos(normalizarCadencia({ ...base, sent_at: 'ontem' }, { now: NOW }))).toContain('sent_at');
    expect(campos(normalizarCadencia(
      { ...base, sent_at: '2027-01-01T00:00:00Z', status: 'sent' }, { now: NOW },
    ))).toContain('sent_at');
    // scheduled_at futuro é o caso normal: agendamento.
    expect(normalizarCadencia({ ...base, scheduled_at: '2027-01-01T00:00:00Z' }, { now: NOW }).ok).toBe(true);
  });

  it('recusa tentativa fora de faixa', () => {
    expect(campos(normalizarCadencia({ ...base, attempt_number: 0 }, { now: NOW }))).toContain('attempt_number');
    expect(campos(normalizarCadencia({ ...base, attempt_number: 1.5 }, { now: NOW }))).toContain('attempt_number');
  });

  it('all-or-nothing: acumula todos os erros de uma vez', () => {
    const r = normalizarCadencia({ lead_id: 'x', status: 'z', attempt_number: -1 }, { now: NOW });
    expect(r.ok).toBe(false);
    expect(campos(r).sort()).toEqual(['attempt_number', 'idempotency_key', 'lead_id', 'status']);
  });

  it('corpo que não é objeto é recusado sem explodir', () => {
    for (const v of [null, 'texto', [], 42]) {
      expect(normalizarCadencia(v, { now: NOW }).ok).toBe(false);
    }
  });
});
