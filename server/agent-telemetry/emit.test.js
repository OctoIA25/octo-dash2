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

/**
 * `lia_vps` — a origem do servidor da LIA, que roda fora da Dash.
 *
 * Em 26/09 eu liberei este valor no CHECK do banco e disse à equipe que estava
 * feito. A lista da ROTA ficou para trás, e eles levaram 422 invalid_source no
 * primeiro lote — um dia perdido por eu ter consertado uma ponta das duas.
 *
 * A lista aqui e o CHECK `agent_telemetry_events_source_check` são gêmeos.
 */
describe('as origens aceitas são as mesmas do banco', () => {
  it('lia_vps é aceita — o servidor da LIA não é n8n nem crm_server', () => {
    expect(EVENT_SOURCES).toContain('lia_vps');
  });

  it('a lista inteira é esta, para mudá-la ser uma decisão e não um descuido', () => {
    expect([...EVENT_SOURCES].sort()).toEqual(['crm_server', 'crm_web', 'lia_vps', 'n8n']);
  });

  it('origem que ninguém cadastrou continua sendo recusada', () => {
    const r = normalizeEvent({
      tenant_id: '11111111-1111-4111-8111-111111111111',
      agent_slug: 'lia', event_type: 'llm_call', source: 'inventada',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_source');
  });
});

/**
 * A rota grava TODAS as colunas que a tabela tem — 26/09.
 *
 * Três vezes seguidas na mesma semana uma ponta entrou no banco e não na
 * rota: o token de serviço, `lia_vps` e `cache_escrita_tokens`. A última
 * custou 27 eventos reais da LIA gravados com a parcela mais cara em NULO —
 * 92% do custo perdido, o mesmo erro de 36x que acabáramos de consertar,
 * de volta por outro caminho.
 *
 * Esta lista é a de `agent_telemetry_events` em produção, menos as colunas
 * que o banco preenche sozinho. Coluna nova sem mapeamento passa a doer aqui.
 */
describe('nenhuma coluna da tabela fica para trás', () => {
  /** Preenchidas pelo banco ou pela rota, nunca pelo normalizador. */
  const DO_BANCO = ['id', 'tenant_id', 'received_at'];

  const COLUNAS_EM_PRODUCAO = [
    'agent_slug', 'source', 'event_type', 'status', 'execution_id', 'model', 'provider',
    'input_tokens', 'output_tokens', 'cached_tokens', 'cache_escrita_tokens', 'total_tokens',
    'duration_ms', 'queue_ms', 'error_class', 'error_message', 'tool_name', 'metadata',
    'occurred_at', 'etapa', 'lead_id', 'conversa_id', 'documento_id',
  ];

  it('o evento normalizado tem exatamente as colunas da tabela', () => {
    const r = normalizeEvent({
      agent_slug: 'lia', event_type: 'llm_call', source: 'lia_vps',
    });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.event).sort()).toEqual([...COLUNAS_EM_PRODUCAO].sort());
    expect(COLUNAS_EM_PRODUCAO.filter((c) => DO_BANCO.includes(c))).toEqual([]);
  });

  /*
   * O CASO QUE SUSTENTA O ARQUIVO: as quatro parcelas chegam inteiras, e o
   * total é a soma das quatro. Somando só entrada e saída, um turno com o
   * prompt em cache saía como 423 tokens escondendo 130 mil.
   */
  it('as quatro parcelas de token sobrevivem, e o total soma as quatro', () => {
    const r = normalizeEvent({
      agent_slug: 'lia', event_type: 'llm_call', source: 'lia_vps',
      input_tokens: 6, cached_tokens: 110000, cache_escrita_tokens: 20426, output_tokens: 417,
    });

    expect(r.event.cache_escrita_tokens).toBe(20426);
    expect(r.event.cached_tokens).toBe(110000);
    expect(r.event.total_tokens).toBe(6 + 110000 + 20426 + 417);
  });

  it('total_tokens mandado pelo emissor vence o derivado', () => {
    const r = normalizeEvent({
      agent_slug: 'lia', event_type: 'llm_call', source: 'lia_vps',
      input_tokens: 6, output_tokens: 417, total_tokens: 999,
    });
    expect(r.event.total_tokens).toBe(999);
  });

  /* Ausente ≠ zero: sem parcela nenhuma, o total é NULO e não 0. */
  it('sem parcela nenhuma, o total é nulo — não zero', () => {
    const r = normalizeEvent({ agent_slug: 'lia', event_type: 'execution', source: 'lia_vps' });
    expect(r.event.total_tokens).toBeNull();
    expect(r.event.cache_escrita_tokens).toBeNull();
  });
});
