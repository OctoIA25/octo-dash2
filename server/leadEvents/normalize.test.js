import { describe, it, expect } from 'vitest';
import { normalizarEvento } from './normalize.js';

const LEAD = '11111111-1111-4111-8111-111111111111';
const base = { lead_id: LEAD, event_type: 'lia.contato_realizado', idempotency_key: 'lia:x:1' };
const motivos = (r) => r.details.map((d) => `${d.field}:${d.reason}`);

describe('normalizarEvento', () => {
  it('aceita o corpo mínimo e separa a âncora da linha a gravar', () => {
    const r = normalizarEvento(base);
    expect(r.ok).toBe(true);
    expect(r.leadId).toBe(LEAD);
    expect(r.row).toEqual({
      event_type: 'lia.contato_realizado',
      idempotency_key: 'lia:x:1',
      ator_tipo: 'lia',
    });
    // lead_id NÃO entra na linha: a rota grava o id que ELA resolveu.
    expect(r.row.lead_id).toBeUndefined();
  });

  it('aceita telefone como única âncora — lead de origem Kenlo não tem uuid conhecido', () => {
    const r = normalizarEvento({ ...base, lead_id: undefined, lead_phone: '5511999998888' });
    expect(r.ok).toBe(true);
    expect(r.leadPhone).toBe('5511999998888');
    expect(r.leadId).toBeNull();
  });

  it('recusa corpo sem nenhuma âncora', () => {
    const r = normalizarEvento({ event_type: 'lia.x', idempotency_key: 'k' });
    expect(motivos(r)).toContain('lead_id:missing_lead_id_or_lead_phone');
  });

  it('recusa o namespace lead.*, reservado ao trigger do banco', () => {
    // Sem isto, quem integra poderia forjar "lead entregue para fulano".
    for (const tipo of ['lead.created', 'lead.assigned', 'LEAD.Created']) {
      expect(motivos(normalizarEvento({ ...base, event_type: tipo }))).toContain(
        'event_type:reserved_prefix',
      );
    }
  });

  it('exige idempotency_key: é o que impede evento duplicado em retry', () => {
    const r = normalizarEvento({ ...base, idempotency_key: '  ' });
    expect(motivos(r)).toContain('idempotency_key:required');
  });

  it('leva etapa para o metadata sem criar coluna de um emissor só', () => {
    const r = normalizarEvento({ ...base, etapa: 1, metadata: { origem: 'whatsapp' } });
    expect(r.row.metadata).toEqual({ origem: 'whatsapp', etapa: '1' });
  });

  it('recusa data no futuro — evento é o que já aconteceu', () => {
    const agora = Date.parse('2026-09-10T12:00:00Z');
    const r = normalizarEvento({ ...base, occurred_at: '2026-09-11T12:00:00Z' }, { now: agora });
    expect(motivos(r)).toContain('occurred_at:in_the_future');

    const ok = normalizarEvento({ ...base, occurred_at: '2026-09-10T11:00:00Z' }, { now: agora });
    expect(ok.row.created_at).toBe('2026-09-10T11:00:00.000Z');
  });

  it('all-or-nothing: acumula TODOS os motivos, não só o primeiro', () => {
    const r = normalizarEvento({ lead_id: 'nao-e-uuid', event_type: '', metadata: [] });
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual(
      expect.arrayContaining([
        'lead_id:invalid_uuid',
        'event_type:required',
        'idempotency_key:required',
        'metadata:not_an_object',
      ]),
    );
  });

  it('omite campo ausente para o merge não apagar o que já estava gravado', () => {
    // A LIA reenvia o mesmo evento com a mesma chave trazendo só o que mudou.
    const r = normalizarEvento({ ...base, para: 'João' });
    expect(Object.keys(r.row)).not.toContain('descricao');
    expect(Object.keys(r.row)).not.toContain('de');
  });
});
