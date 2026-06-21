import { describe, it, expect, vi } from 'vitest';
import { runDueRecovery } from './recoveryWorker.js';
import { deliverRecommendation } from './index.js';
import { resolveDelivery } from './channels.js';

const NOW = 1_750_000_000_000; // timestamp fixo (determinístico).

/**
 * Fake do Supabase para o worker de recuperação. Modela as três tabelas tocadas:
 *  - recovery_queue: SELECT pendente + claim (UPDATE pending→processing) + finalize
 *  - tenant_recommendation_config: SELECT da config do tenant
 *  - lead_recommendations: dedup (findRecentDuplicate) + INSERT do histórico
 *
 * `queue` é mutável: o claim altera status in-place, então uma 2ª chamada de
 * runDueRecovery não re-pega o mesmo item (testa idempotência do worker).
 */
function makeFake({ queue = [], config = null, history = [] } = {}) {
  const historyInserts = [];

  const from = (table) => {
    if (table === 'recovery_queue') {
      return makeQueueNode(queue);
    }
    if (table === 'tenant_recommendation_config') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: config, error: null }) }),
        }),
      };
    }
    if (table === 'lead_recommendations') {
      return {
        // findRecentDuplicate: .select().eq().eq().gte().in().order().limit().maybeSingle()
        select: () => {
          const node = {
            eq: () => node,
            gte: () => node,
            in: () => node,
            order: () => node,
            limit: () => node,
            maybeSingle: async () => ({ data: history.shift() || null, error: null }),
          };
          return node;
        },
        insert: (row) => {
          historyInserts.push(row);
          return { select: () => ({ single: async () => ({ data: { id: 'hist-1' }, error: null }) }) };
        },
      };
    }
    throw new Error(`tabela inesperada: ${table}`);
  };

  return { supabase: { from }, queue, historyInserts };
}

/** Nó da recovery_queue: roteia SELECT-pendente, claim e finalize sobre o array. */
function makeQueueNode(queue) {
  return {
    // SELECT '*' .eq('status','pending').order().limit().maybeSingle()  → próximo pendente
    select: () => {
      const node = {
        _eqStatus: null,
        eq(col, val) {
          if (col === 'status') node._eqStatus = val;
          return node;
        },
        order: () => node,
        limit: () => node,
        maybeSingle: async () => {
          const found = queue.find((q) => q.status === (node._eqStatus ?? 'pending'));
          return { data: found ? { ...found } : null, error: null };
        },
      };
      return node;
    },
    // UPDATE(set).eq('id',id)[.eq('status','pending')] [.select().maybeSingle()]
    update(set) {
      const ctx = { id: null, requireStatus: undefined };
      const node = {
        eq(col, val) {
          if (col === 'id') ctx.id = val;
          if (col === 'status') ctx.requireStatus = val;
          return node;
        },
        // claim: precisa devolver a linha → caminho com .select().maybeSingle()
        select: () => ({
          maybeSingle: async () => {
            const row = queue.find((q) => q.id === ctx.id);
            if (!row) return { data: null, error: null };
            if (ctx.requireStatus !== undefined && row.status !== ctx.requireStatus) {
              return { data: null, error: null }; // claim perdido p/ outro tick
            }
            Object.assign(row, set);
            return { data: { ...row }, error: null };
          },
        }),
        // finalize: UPDATE sem .select() → o worker faz `await` direto no nó.
        then: (resolve) => {
          const row = queue.find((q) => q.id === ctx.id);
          if (row) Object.assign(row, set);
          return resolve({ data: null, error: null });
        },
      };
      return node;
    },
  };
}

/** Deps reais (deliver/resolveDelivery) + WhatsApp injetado (sem rede). */
function makeDeps({ env = 'production', sendWhatsapp } = {}) {
  return {
    nowMs: NOW,
    deliver: deliverRecommendation,
    resolveDelivery,
    resolveTransport: async () => ({ transport: { kind: 'simulated', send: async () => ({}) }, from: 'x' }),
    sendWhatsapp: sendWhatsapp || vi.fn(async () => ({ messageId: 'wamid.1' })),
    findDuplicate: async () => null, // sem duplicata por padrão
    getEnvironment: () => env,
    logger: { log: () => {}, error: () => {} },
  };
}

const enabledConfig = (over = {}) => ({
  recovery_agent_enabled: true,
  recovery_message: 'Sentimos sua falta!',
  recovery_properties: [{ referencia: 'AP-1', titulo: 'Cobertura', preco: 900000 }],
  company_name: 'Imob X',
  ...over,
});

const pendingItem = (over = {}) => ({
  id: 'q1',
  tenant_id: 't1',
  lead_id: '42',
  lead_source: 'crm',
  lead_name: 'Ana',
  lead_phone: '5511999998888',
  archived_at: new Date(NOW).toISOString(),
  status: 'pending',
  attempts: 0,
  ...over,
});

describe('runDueRecovery — Agente de Recuperação', () => {
  it('envia a mensagem e a lista configuradas quando o agente está habilitado', async () => {
    const sendWhatsapp = vi.fn(async () => ({ messageId: 'wamid.1' }));
    const { supabase, queue, historyInserts } = makeFake({
      queue: [pendingItem()],
      config: enabledConfig(),
    });

    const summary = await runDueRecovery(supabase, makeDeps({ sendWhatsapp }));

    expect(summary.sent).toBe(1);
    expect(summary.skipped).toBe(0);
    // WhatsApp foi disparado para o telefone do lead.
    expect(sendWhatsapp).toHaveBeenCalledTimes(1);
    expect(sendWhatsapp.mock.calls[0][0].to).toBe('5511999998888');
    // Histórico registra a mensagem configurada e a lista de imóveis (snapshot).
    expect(historyInserts).toHaveLength(1);
    expect(historyInserts[0].custom_message).toBe('Sentimos sua falta!');
    expect(historyInserts[0].property_count).toBe(1);
    expect(historyInserts[0].properties[0].referencia).toBe('AP-1');
    // Item da fila concluído.
    expect(queue[0].status).toBe('done');
  });

  it('NÃO executa quando o agente está desabilitado (status=skipped)', async () => {
    const sendWhatsapp = vi.fn();
    const { supabase, queue } = makeFake({
      queue: [pendingItem()],
      config: enabledConfig({ recovery_agent_enabled: false }),
    });

    const summary = await runDueRecovery(supabase, makeDeps({ sendWhatsapp }));

    expect(summary.skipped).toBe(1);
    expect(summary.sent).toBe(0);
    expect(sendWhatsapp).not.toHaveBeenCalled();
    expect(queue[0].status).toBe('skipped');
    expect(queue[0].error).toBe('recovery_agent_disabled');
  });

  it('pula quando não há imóveis configurados', async () => {
    const { supabase, queue } = makeFake({
      queue: [pendingItem()],
      config: enabledConfig({ recovery_properties: [] }),
    });

    const summary = await runDueRecovery(supabase, makeDeps());

    expect(summary.skipped).toBe(1);
    expect(queue[0].error).toBe('no_properties_configured');
  });

  it('pula quando o lead não tem telefone (WhatsApp impossível)', async () => {
    const sendWhatsapp = vi.fn();
    const { supabase, queue } = makeFake({
      queue: [pendingItem({ lead_phone: null })],
      config: enabledConfig(),
    });

    const summary = await runDueRecovery(supabase, makeDeps({ sendWhatsapp }));

    expect(summary.skipped).toBe(1);
    expect(sendWhatsapp).not.toHaveBeenCalled();
    expect(queue[0].error).toBe('missing_lead_phone');
  });

  it('não envia duas vezes: 2ª execução não re-processa item já concluído', async () => {
    const sendWhatsapp = vi.fn(async () => ({ messageId: 'wamid.1' }));
    const { supabase, queue } = makeFake({
      queue: [pendingItem()],
      config: enabledConfig(),
    });

    await runDueRecovery(supabase, makeDeps({ sendWhatsapp }));
    const second = await runDueRecovery(supabase, makeDeps({ sendWhatsapp }));

    // A 2ª passada não acha pendentes → nada processado.
    expect(second.processed).toBe(0);
    expect(sendWhatsapp).toHaveBeenCalledTimes(1);
    expect(queue[0].status).toBe('done');
  });

  it('em ambiente de teste, simula o WhatsApp (não dispara para número real)', async () => {
    const sendWhatsapp = vi.fn();
    const { supabase, queue, historyInserts } = makeFake({
      queue: [pendingItem()],
      config: enabledConfig(),
    });

    const summary = await runDueRecovery(supabase, makeDeps({ env: 'development', sendWhatsapp }));

    // resolveDelivery marca simulate fora de produção → deliver não chama a rede.
    expect(sendWhatsapp).not.toHaveBeenCalled();
    expect(summary.sent).toBe(1);
    expect(historyInserts[0].status).toBe('simulated');
    expect(queue[0].status).toBe('done');
  });

  it('marca failed quando o envio do WhatsApp lança erro', async () => {
    const sendWhatsapp = vi.fn(async () => {
      throw new Error('Meta API HTTP 500');
    });
    const { supabase, queue } = makeFake({
      queue: [pendingItem()],
      config: enabledConfig(),
    });

    const summary = await runDueRecovery(supabase, makeDeps({ sendWhatsapp }));

    expect(summary.failed).toBe(1);
    expect(queue[0].status).toBe('failed');
    expect(queue[0].error).toContain('Meta API HTTP 500');
  });

  it('fila vazia → não faz nada', async () => {
    const { supabase } = makeFake({ queue: [], config: enabledConfig() });
    const summary = await runDueRecovery(supabase, makeDeps());
    expect(summary).toMatchObject({ processed: 0, sent: 0, skipped: 0, failed: 0 });
  });
});
