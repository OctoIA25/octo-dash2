import { describe, it, expect, vi } from 'vitest';
import { createMetaLeadgenProcessor } from './processor.js';

const ENV = { META_EVENT_MAX_ATTEMPTS: '3', PORT: '8080' };

const EVENT = {
  id: 'e1', leadgen_id: 'lg-1', tenant_id: 't1',
  page_id: 'p1', form_id: 'f1', ad_id: 'a1', attempts: 0,
};

const LEAD = {
  id: 'lg-1', platform: 'fb', created_time: '2026-08-06T12:00:00+0000',
  field_data: [
    { name: 'full_name', values: ['Maria'] },
    { name: 'phone_number', values: ['+5511999998888'] },
  ],
};

// Guarda os updates feitos em meta_leadgen_events, serve a API key do tenant,
// simula a checagem de duplicidade em `leads` (existingLead / leadCheckError) e
// a elegibilidade de tenant (activeTenants / deletedTenants / configError).
// `tabelas` registra o que foi consultado — é assim que se prova que a consulta
// de eventos NÃO aconteceu quando não há tenant elegível.
function fakeSupabase({
  apiKey = 'octo_key_123', apiKeyError = null,
  pending = [], existingLead = false, leadCheckError = null,
  activeTenants = ['t1'], deletedTenants = [], configError = null,
} = {}) {
  const updates = [];
  const tabelas = [];
  return {
    updates, tabelas,
    from(table) {
      tabelas.push(table);
      if (table === 'tenant_api_keys') {
        return {
          select() { return this; }, eq() { return this; },
          limit: async () => ({ data: apiKey ? [{ api_key: apiKey }] : [], error: apiKeyError }),
        };
      }
      if (table === 'leads') {
        return {
          select() { return this; }, eq() { return this; },
          limit: async () => ({ data: existingLead ? [{ id: 'lead-1' }] : [], error: leadCheckError }),
        };
      }
      if (table === 'tenant_meta_leadgen_config') {
        const q = {
          select() { return q; },
          eq: async () => ({ data: activeTenants.map((id) => ({ tenant_id: id })), error: configError }),
        };
        return q;
      }
      if (table === 'tenants') {
        const q = {
          select() { return q; }, in() { return q; },
          not: async () => ({ data: deletedTenants.map((id) => ({ id })), error: null }),
        };
        return q;
      }
      const q = {
        select() { return q; },
        eq(col, val) { q[`_${col}`] = val; return q; },
        in(_col, vals) { q._in = vals; return q; },
        order() { return q; },
        // Honra o filtro .in() como o banco faria — sem isso o teste de
        // sufocamento não provaria nada.
        limit: async () => ({ data: q._in ? pending.filter((e) => q._in.includes(e.tenant_id)) : pending, error: null }),
        update(patch) { return { eq: async (_c, id) => { updates.push({ id, patch }); return { error: null }; } }; },
      };
      return q;
    },
  };
}

const TOKEN = 'system-user-token-secreto';

const fakeResolver = (cfg = { tenantId: 't1', accessToken: TOKEN, pageId: 'p1' }) => ({
  resolveByTenant: async () => cfg,
});

const okGraph = { fetchLead: async () => ({ ok: true, lead: LEAD }) };

const make = (opts = {}) => createMetaLeadgenProcessor({
  supabase: opts.supabase || fakeSupabase(),
  resolver: opts.resolver || fakeResolver(),
  graphClient: opts.graphClient || okGraph,
  fetchImpl: opts.fetchImpl || (async () => ({ ok: true, status: 201, json: async () => ({ success: true }) })),
  processEnv: ENV,
});

describe('processEvent', () => {
  it('injeta o lead e marca done', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ success: true }) }));
    const supabase = fakeSupabase();
    const r = await make({ supabase, fetchImpl }).processEvent(EVENT);
    expect(r.status).toBe('done');
    expect(supabase.updates[0].patch.status).toBe('done');
  });

  it('chama o loopback com a API key do tenant', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    await make({ fetchImpl }).processEvent(EVENT);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8080/api/v1/leads');
    expect(init.headers.authorization).toBe('Bearer octo_key_123');
    expect(init.method).toBe('POST');
  });

  it('manda o payload normalizado, com portal e não source', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    await make({ fetchImpl }).processEvent(EVENT);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.portal).toBe('Facebook');
    expect(body.name).toBe('Maria');
    expect(body.phone).toBe('+5511999998888');
    expect(body.raw_data.meta.leadgen_id).toBe('lg-1');
    expect(body.source).toBeUndefined();
  });

  it('erro permanente do Graph marca failed sem retry', async () => {
    const supabase = fakeSupabase();
    const graphClient = { fetchLead: async () => ({ ok: false, retriable: false, status: 401, error: 'token inválido' }) };
    const r = await make({ supabase, graphClient }).processEvent(EVENT);
    expect(r.status).toBe('failed');
    expect(supabase.updates[0].patch.status).toBe('failed');
    expect(supabase.updates[0].patch.last_error).toContain('token inválido');
  });

  it('erro retriable do Graph deixa pending com attempts+1', async () => {
    const supabase = fakeSupabase();
    const graphClient = { fetchLead: async () => ({ ok: false, retriable: true, status: 500, error: 'boom' }) };
    const r = await make({ supabase, graphClient }).processEvent(EVENT);
    expect(r.status).toBe('retry');
    expect(supabase.updates[0].patch.status).toBe('pending');
    expect(supabase.updates[0].patch.attempts).toBe(1);
  });

  it('4xx do self-call é permanente — payload malformado não melhora com retry', async () => {
    const supabase = fakeSupabase();
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Nome ou telefone é obrigatório' } }) });
    const r = await make({ supabase, fetchImpl }).processEvent(EVENT);
    expect(r.status).toBe('failed');
    expect(supabase.updates[0].patch.last_error).toContain('Nome ou telefone');
  });

  it('429 do self-call é retriable', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) });
    expect((await make({ fetchImpl }).processEvent(EVENT)).status).toBe('retry');
  });

  it('5xx do self-call é retriable', async () => {
    const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
    expect((await make({ fetchImpl }).processEvent(EVENT)).status).toBe('retry');
  });

  it('erro de rede no self-call é retriable', async () => {
    const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
    expect((await make({ fetchImpl }).processEvent(EVENT)).status).toBe('retry');
  });

  it('esgotar maxAttempts vira failed', async () => {
    const supabase = fakeSupabase();
    const graphClient = { fetchLead: async () => ({ ok: false, retriable: true, status: 500, error: 'boom' }) };
    const r = await make({ supabase, graphClient }).processEvent({ ...EVENT, attempts: 2 });
    expect(r.status).toBe('failed');
    expect(supabase.updates[0].patch.status).toBe('failed');
  });

  // `failed` é terminal e invisível (ninguém lê meta_leadgen_events). Config e
  // API key indisponíveis são ambíguos — "não existe" e "banco falhou" chegam
  // como o mesmo `null` — então retry, com o teto de maxAttempts terminando o
  // caso genuinamente permanente.
  it('config indisponível (erro do Supabase engolido pelo resolver) → retry, não failed', async () => {
    const supabase = fakeSupabase();
    const r = await make({ supabase, resolver: { resolveByTenant: async () => null } }).processEvent(EVENT);
    expect(r.status).toBe('retry');
    expect(supabase.updates[0].patch.status).toBe('pending');
  });

  it('config indisponível esgotando maxAttempts ainda termina em failed', async () => {
    const supabase = fakeSupabase();
    const r = await make({ supabase, resolver: { resolveByTenant: async () => null } })
      .processEvent({ ...EVENT, attempts: 2 });
    expect(r.status).toBe('failed');
  });

  it('lookup de API key indisponível → retry com erro claro, não failed', async () => {
    const supabase = fakeSupabase({ apiKey: null, apiKeyError: { message: 'timeout' } });
    const r = await make({ supabase }).processEvent(EVENT);
    expect(r.status).toBe('retry');
    expect(supabase.updates[0].patch.last_error).toContain('API key');
  });

  // Decifragem falha (EMAIL_ENCRYPTION_KEY sumiu do ambiente) também zera o
  // accessToken: permanente aqui destruiria o backlog inteiro em minutos.
  it('accessToken ausente/indecifrável → retry, sem chamar o Graph', async () => {
    const supabase = fakeSupabase();
    const fetchLead = vi.fn();
    const r = await make({
      supabase,
      resolver: fakeResolver({ tenantId: 't1', accessToken: null, pageId: 'p1' }),
      graphClient: { fetchLead },
    }).processEvent(EVENT);
    expect(r.status).toBe('retry');
    expect(fetchLead).not.toHaveBeenCalled();
  });

  it('grava o leadgen_id do EVENTO, não o da resposta do Graph', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    const graphClient = { fetchLead: async () => ({ ok: true, lead: { ...LEAD, id: 'divergente' } }) };
    await make({ fetchImpl, graphClient }).processEvent(EVENT);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.raw_data.meta.leadgen_id).toBe('lg-1');
  });

  it('nunca escreve o token nem a API key no last_error', async () => {
    const supabase = fakeSupabase();
    const graphClient = { fetchLead: async () => ({ ok: false, retriable: false, status: 401, error: 'bad' }) };
    await make({ supabase, graphClient }).processEvent(EVENT);
    const s = JSON.stringify(supabase.updates);
    expect(s).not.toContain('octo_key_123');
    expect(s).not.toContain(TOKEN);
  });

  it('nunca escreve o token nem a API key no last_error mesmo com erro no self-call', async () => {
    const supabase = fakeSupabase();
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'internal error' } }) });
    await make({ supabase, fetchImpl }).processEvent(EVENT);
    const s = JSON.stringify(supabase.updates);
    expect(s).not.toContain('octo_key_123');
    expect(s).not.toContain(TOKEN);
  });

  it('lead já existe para o leadgen_id (recuperação de crash) — pula Graph e self-call, marca done', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    const fetchLead = vi.fn(async () => ({ ok: true, lead: LEAD }));
    const supabase = fakeSupabase({ existingLead: true });
    const r = await make({ supabase, fetchImpl, graphClient: { fetchLead } }).processEvent(EVENT);
    expect(r.status).toBe('done');
    expect(fetchLead).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(supabase.updates[0].patch.status).toBe('done');
    expect(supabase.updates[0].patch.last_error).toBeNull();
  });

  it('lead já existe MESMO com Graph que falharia (token revogado) — done sem chamar Graph nem self-call', async () => {
    // Regressão: com a checagem depois do fetchLead, esse cenário virava
    // failed/retry por um lead que já foi criado com sucesso na tentativa
    // anterior — recuperação que depende de uma chamada externa dar certo
    // não é recuperação.
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    const fetchLead = vi.fn(async () => ({ ok: false, retriable: false, status: 401, error: 'token revogado' }));
    const supabase = fakeSupabase({ existingLead: true });
    const r = await make({ supabase, fetchImpl, graphClient: { fetchLead } }).processEvent(EVENT);
    expect(r.status).toBe('done');
    expect(fetchLead).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checagem de duplicidade falha (SELECT com erro) → retry, sem chamar o self-call', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    const supabase = fakeSupabase({ leadCheckError: { message: 'timeout' } });
    const r = await make({ supabase, fetchImpl }).processEvent(EVENT);
    expect(r.status).toBe('retry');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lead não existe → fluxo normal, self-call chamado uma vez', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) }));
    const supabase = fakeSupabase({ existingLead: false });
    const r = await make({ supabase, fetchImpl }).processEvent(EVENT);
    expect(r.status).toBe('done');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('processPending', () => {
  it('processa o lote e conta os resultados', async () => {
    const supabase = fakeSupabase({ pending: [EVENT, { ...EVENT, id: 'e2', leadgen_id: 'lg-2' }] });
    const r = await make({ supabase }).processPending();
    expect(r.processed).toBe(2);
    expect(r.done).toBe(2);
  });

  it('lote vazio não faz nada', async () => {
    const r = await make({ supabase: fakeSupabase({ pending: [] }) }).processPending();
    expect(r.processed).toBe(0);
  });

  it('um evento que falha não derruba o resto do lote', async () => {
    let n = 0;
    const graphClient = {
      fetchLead: async () => (++n === 1
        ? { ok: false, retriable: false, status: 400, error: 'ruim' }
        : { ok: true, lead: LEAD }),
    };
    const supabase = fakeSupabase({ pending: [EVENT, { ...EVENT, id: 'e2', leadgen_id: 'lg-2' }] });
    const r = await make({ supabase, graphClient }).processPending();
    expect(r.processed).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.done).toBe(1);
  });

  it('exceção inesperada dentro do laço grava attempts incrementado', async () => {
    const graphClient = { fetchLead: async () => { throw new Error('boom inesperado'); } };
    const supabase = fakeSupabase({ pending: [EVENT] });
    const r = await make({ supabase, graphClient }).processPending();
    expect(r.failed).toBe(1);
    expect(supabase.updates[0].patch.attempts).toBe(1);
    // Todo caminho terminal grava processed_at — este catch é alcançável.
    expect(supabase.updates[0].patch.processed_at).toBeTruthy();
  });
});

// Tenant inelegível PAUSA a fila (evento fica pending), não descarta. E o
// filtro é na consulta: dentro do laço, um backlog de tenant inativo ocuparia
// o lote inteiro a cada tick e sufocaria os tenants ativos.
describe('processPending — elegibilidade de tenant', () => {
  const EVENTO_T2 = { ...EVENT, id: 'e2', leadgen_id: 'lg-2', tenant_id: 't2' };

  it('tenant desativado: evento fica pending, sem Graph e sem self-call', async () => {
    const fetchImpl = vi.fn();
    const fetchLead = vi.fn();
    const supabase = fakeSupabase({ pending: [EVENTO_T2], activeTenants: ['t1'] });
    const r = await make({ supabase, fetchImpl, graphClient: { fetchLead } }).processPending();
    expect(r.processed).toBe(0);
    expect(supabase.updates).toEqual([]);
    expect(fetchLead).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('tenant soft-deletado: mesmo comportamento', async () => {
    const fetchImpl = vi.fn();
    const supabase = fakeSupabase({ pending: [EVENT], activeTenants: ['t1'], deletedTenants: ['t1'] });
    const r = await make({ supabase, fetchImpl }).processPending();
    expect(r.processed).toBe(0);
    expect(supabase.updates).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('tenant ativo no MESMO lote continua sendo processado — sem sufocamento', async () => {
    const supabase = fakeSupabase({ pending: [EVENTO_T2, EVENT], activeTenants: ['t1'] });
    const r = await make({ supabase }).processPending();
    expect(r.processed).toBe(1);
    expect(r.done).toBe(1);
    expect(supabase.updates.map((u) => u.id)).toEqual(['e1']);
  });

  it('nenhum tenant elegível: nem consulta a tabela de eventos', async () => {
    const supabase = fakeSupabase({ pending: [EVENT], activeTenants: [] });
    const r = await make({ supabase }).processPending();
    expect(r).toEqual({ processed: 0, done: 0, retry: 0, failed: 0 });
    expect(supabase.tabelas).not.toContain('meta_leadgen_events');
  });

  it('leitura de elegíveis falhando pula o ciclo em vez de processar às cegas', async () => {
    const supabase = fakeSupabase({ pending: [EVENT], configError: { message: 'timeout' } });
    const r = await make({ supabase }).processPending();
    expect(r.processed).toBe(0);
    expect(supabase.tabelas).not.toContain('meta_leadgen_events');
  });
});
