import { describe, it, expect, vi } from 'vitest';
import {
  normalizeEvent,
  emitAgentEvent,
  EVENT_SOURCES,
  EVENT_TYPES,
  EVENT_STATUSES,
} from './emit.js';

const NOW = Date.parse('2026-07-24T12:00:00.000Z');

const validRaw = (over = {}) => ({
  agent_slug: 'lia',
  event_type: 'llm_call',
  ...over,
});

describe('normalizeEvent — validação e defaults', () => {
  it('evento mínimo válido ganha defaults (source crm_server, status ok, occurred_at = agora)', () => {
    const r = normalizeEvent(validRaw(), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.event.source).toBe('crm_server');
    expect(r.event.status).toBe('ok');
    expect(r.event.occurred_at).toBe(new Date(NOW).toISOString());
    expect(r.event.metadata).toEqual({});
    expect(r.event.input_tokens).toBeNull();
  });

  it('rejeita não-objeto e slug inválido', () => {
    expect(normalizeEvent(null).ok).toBe(false);
    expect(normalizeEvent([]).ok).toBe(false);
    expect(normalizeEvent(validRaw({ agent_slug: '' })).reason).toBe('invalid_agent_slug');
    expect(normalizeEvent(validRaw({ agent_slug: 'Não Válido!' })).reason).toBe('invalid_agent_slug');
    expect(normalizeEvent(validRaw({ agent_slug: 'x'.repeat(61) })).reason).toBe('invalid_agent_slug');
  });

  it('slug é normalizado para lowercase', () => {
    const r = normalizeEvent(validRaw({ agent_slug: 'ELAINE' }));
    expect(r.ok).toBe(true);
    expect(r.event.agent_slug).toBe('elaine');
  });

  it('rejeita source/event_type/status fora dos enums', () => {
    expect(normalizeEvent(validRaw({ source: 'zapier' })).reason).toBe('invalid_source');
    expect(normalizeEvent(validRaw({ event_type: 'coisa' })).reason).toBe('invalid_event_type');
    expect(normalizeEvent(validRaw({ status: 'meh' })).reason).toBe('invalid_status');
    // enums exportados batem com os aceitos
    for (const s of EVENT_SOURCES) expect(normalizeEvent(validRaw({ source: s })).ok).toBe(true);
    for (const t of EVENT_TYPES) expect(normalizeEvent(validRaw({ event_type: t })).ok).toBe(true);
    for (const st of EVENT_STATUSES) expect(normalizeEvent(validRaw({ status: st })).ok).toBe(true);
  });

  it('occurred_at inválido rejeita; futuro além do skew clampa para agora', () => {
    expect(normalizeEvent(validRaw({ occurred_at: 'ontem' })).reason).toBe('invalid_occurred_at');
    const past = normalizeEvent(validRaw({ occurred_at: '2026-07-24T11:00:00.000Z' }), { now: NOW });
    expect(past.event.occurred_at).toBe('2026-07-24T11:00:00.000Z');
    const farFuture = normalizeEvent(
      validRaw({ occurred_at: '2026-07-24T13:00:00.000Z' }),
      { now: NOW },
    );
    expect(farFuture.event.occurred_at).toBe(new Date(NOW).toISOString());
  });

  it('tokens: coage para int ≥ 0, lixo vira null, total é derivado das partes', () => {
    const r = normalizeEvent(
      validRaw({ input_tokens: '120.9', output_tokens: 30, cached_tokens: -5, duration_ms: 'x' }),
    );
    expect(r.event.input_tokens).toBe(120);
    expect(r.event.output_tokens).toBe(30);
    expect(r.event.cached_tokens).toBeNull();
    expect(r.event.duration_ms).toBeNull();
    expect(r.event.total_tokens).toBe(150); // derivado
  });

  it('total_tokens explícito não é sobrescrito; sem partes fica null', () => {
    expect(normalizeEvent(validRaw({ total_tokens: 999, input_tokens: 1 })).event.total_tokens).toBe(999);
    expect(normalizeEvent(validRaw()).event.total_tokens).toBeNull();
  });

  it('metadata: não-objeto rejeita; acima do cap vira {truncated:true}', () => {
    expect(normalizeEvent(validRaw({ metadata: 'texto' })).reason).toBe('invalid_metadata');
    expect(normalizeEvent(validRaw({ metadata: [1, 2] })).reason).toBe('invalid_metadata');
    const big = normalizeEvent(validRaw({ metadata: { blob: 'x'.repeat(3000) } }));
    expect(big.ok).toBe(true);
    expect(big.event.metadata).toEqual({ truncated: true });
  });

  it('error_message é truncada em 500 chars; textos curtos são aparados', () => {
    const r = normalizeEvent(
      validRaw({ error_message: 'e'.repeat(600), model: '  gpt-4.1-mini  ' }),
    );
    expect(r.event.error_message).toHaveLength(500);
    expect(r.event.model).toBe('gpt-4.1-mini');
  });
});

describe('emitAgentEvent — nunca derruba o chamador', () => {
  const makeSupabase = (insertResult = { error: null }) => {
    const insert = vi.fn(async () => insertResult);
    return { supabase: { from: vi.fn(() => ({ insert })) }, insert };
  };

  it('grava evento válido com tenant_id', async () => {
    const { supabase, insert } = makeSupabase();
    await emitAgentEvent(supabase, validRaw({ tenant_id: 't1', duration_ms: 42 }));
    expect(supabase.from).toHaveBeenCalledWith('agent_telemetry_events');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 't1', agent_slug: 'lia', duration_ms: 42 }),
    );
  });

  it('descarta sem tenant_id e sem shape válido (insert não é chamado)', async () => {
    const { supabase, insert } = makeSupabase();
    await emitAgentEvent(supabase, validRaw()); // sem tenant
    await emitAgentEvent(supabase, { tenant_id: 't1' }); // sem agent_slug/event_type
    expect(insert).not.toHaveBeenCalled();
  });

  it('erro do banco e exceção não propagam', async () => {
    const { supabase } = makeSupabase({ error: { message: 'boom' } });
    await expect(
      emitAgentEvent(supabase, validRaw({ tenant_id: 't1' })),
    ).resolves.toBeUndefined();

    const throwing = { from: () => { throw new Error('explode'); } };
    await expect(
      emitAgentEvent(throwing, validRaw({ tenant_id: 't1' })),
    ).resolves.toBeUndefined();
  });
});
