import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do SDK: enrichWithAI constrói `new OpenAI({ apiKey })` internamente;
// mockar o módulo é a costura sem mudar a assinatura de produção.
const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class OpenAI {
    constructor() {
      this.chat = { completions: { create: createMock } };
    }
  },
}));

const { enrichWithAI, openAiUsageToTokens } = await import('./aiEnricher.js');

const usageFixture = {
  prompt_tokens: 1200,
  completion_tokens: 84,
  total_tokens: 1284,
  prompt_tokens_details: { cached_tokens: 1024 },
};

const okResponse = {
  choices: [{ message: { content: 'Cidade: Jundiaí\nEstado: SP' } }],
  usage: usageFixture,
};

/** Supabase fake que captura inserts de telemetria. */
function makeTelemetryFake() {
  const inserts = [];
  return {
    inserts,
    supabase: {
      from: (table) => ({
        insert(row) {
          if (table === 'agent_telemetry_events') inserts.push(row);
          return { error: null };
        },
      }),
    },
  };
}

const flush = () => new Promise((res) => setTimeout(res, 0));

beforeEach(() => {
  createMock.mockReset();
});

describe('openAiUsageToTokens — usage da OpenAI → campos do evento', () => {
  it('mapeia usage completo (incluindo cached tokens)', () => {
    expect(openAiUsageToTokens(usageFixture)).toEqual({
      input_tokens: 1200,
      output_tokens: 84,
      cached_tokens: 1024,
      total_tokens: 1284,
    });
  });

  it('usage ausente ou parcial vira null (não informado ≠ 0)', () => {
    expect(openAiUsageToTokens(undefined)).toEqual({
      input_tokens: null,
      output_tokens: null,
      cached_tokens: null,
      total_tokens: null,
    });
    expect(openAiUsageToTokens({ prompt_tokens: 10 })).toMatchObject({
      input_tokens: 10,
      output_tokens: null,
      cached_tokens: null,
    });
  });
});

describe('enrichWithAI — telemetria integrada (llm_call)', () => {
  it('sucesso emite llm_call ok com o usage real e retorna os campos parseados', async () => {
    createMock.mockResolvedValue(okResponse);
    const { supabase, inserts } = makeTelemetryFake();

    const result = await enrichWithAI('texto do imóvel', 'sk-teste', {
      supabase,
      tenantId: 't1',
    });

    expect(result).toMatchObject({ cidade: 'Jundiaí', estado: 'SP' });
    await flush();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      tenant_id: 't1',
      agent_slug: 'estudo-mercado',
      event_type: 'llm_call',
      status: 'ok',
      model: 'gpt-4.1-mini',
      provider: 'openai',
      input_tokens: 1200,
      output_tokens: 84,
      cached_tokens: 1024,
      total_tokens: 1284,
    });
    expect(inserts[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('falha da OpenAI emite llm_call error e PRESERVA o contrato de retorno {}', async () => {
    createMock.mockRejectedValue(new Error('rate limit'));
    const { supabase, inserts } = makeTelemetryFake();

    const result = await enrichWithAI('texto', 'sk-teste', { supabase, tenantId: 't1' });

    expect(result).toEqual({}); // nunca lança, retorna {} (contrato pré-existente)
    await flush();
    expect(inserts[0]).toMatchObject({
      status: 'error',
      error_message: 'rate limit',
      input_tokens: null,
      total_tokens: null,
    });
  });

  it('sem contexto de telemetria (caller legado), nada é emitido e nada muda', async () => {
    createMock.mockResolvedValue(okResponse);
    const { inserts } = makeTelemetryFake();

    const result = await enrichWithAI('texto', 'sk-teste');

    expect(result).toMatchObject({ cidade: 'Jundiaí' });
    await flush();
    expect(inserts).toHaveLength(0);
  });

  it('resposta com corpo vazio emite empty_response', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: '' } }], usage: usageFixture });
    const { supabase, inserts } = makeTelemetryFake();

    const result = await enrichWithAI('texto', 'sk-teste', { supabase, tenantId: 't1' });

    expect(result).toEqual({});
    await flush();
    expect(inserts[0]).toMatchObject({ status: 'empty_response', total_tokens: 1284 });
  });
});
