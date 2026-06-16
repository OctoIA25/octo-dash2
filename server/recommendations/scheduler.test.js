import { describe, it, expect, vi } from 'vitest';
import { computeNextRun, isWithinInterestWindow, runDueSchedules } from './scheduler.js';
import { resolveDelivery } from './channels.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_750_000_000_000; // timestamp fixo (determinístico)

describe('computeNextRun', () => {
  it('weekly = +7 dias', () => {
    expect(computeNextRun(NOW, 'weekly')).toBe(new Date(NOW + 7 * DAY).toISOString());
  });
});

describe('isWithinInterestWindow', () => {
  it('dentro da janela', () => {
    expect(isWithinInterestWindow(new Date(NOW - 3 * DAY).toISOString(), 7, NOW)).toBe(true);
  });
  it('fora da janela', () => {
    expect(isWithinInterestWindow(new Date(NOW - 10 * DAY).toISOString(), 7, NOW)).toBe(false);
  });
  it('sem data → não bloqueia', () => {
    expect(isWithinInterestWindow(null, 7, NOW)).toBe(true);
  });
});

/** Fake Supabase: nó "thenable" que serve tanto p/ SELECT quanto p/ UPDATE. */
function makeFake(schedules) {
  const updates = [];
  const from = () => {
    const node = {
      _update: null,
      select: () => node,
      eq(col, val) {
        if (node._update) updates.push({ where: { [col]: val }, set: node._update });
        return node;
      },
      lte: () => node,
      order: () => node,
      limit: () => Promise.resolve({ data: schedules, error: null }),
      update(set) {
        node._update = set;
        return node;
      },
      then: (resolve) => resolve({ data: null, error: null }),
    };
    return node;
  };
  return { supabase: { from }, updates };
}

const baseSchedule = (over = {}) => ({
  id: 's1',
  tenant_id: 't1',
  lead_id: '42',
  lead_source: 'bolsao',
  lead_name: 'Ana',
  lead_email: 'ana@x.com',
  lead_phone: '5511999998888',
  channels: ['email', 'whatsapp'],
  subject: 'Imóveis',
  email_html: '<html>oi</html>',
  email_text: 'oi',
  whatsapp_body: 'Olá Ana',
  custom_message: 'oi',
  properties: [{ referencia: 'A', titulo: 'Casa A', preco: 500000 }],
  frequency: 'weekly',
  interest_at: new Date(NOW - DAY).toISOString(),
  interest_window_days: 7,
  next_run_at: new Date(NOW - DAY).toISOString(),
  run_count: 1,
  ...over,
});

const baseDeps = (deliver) => ({
  nowMs: NOW,
  deliver,
  resolveDelivery,
  resolveTransport: vi.fn(),
  sendWhatsapp: vi.fn(),
  findDuplicate: vi.fn(),
  getEnvironment: () => 'production',
  logger: { log: () => {}, error: () => {} },
});

describe('runDueSchedules', () => {
  it('envia por cada canal e avança a cadência (+7 dias)', async () => {
    const { supabase, updates } = makeFake([baseSchedule()]);
    const deliver = vi.fn(async () => ({ status: 'sent' }));
    const summary = await runDueSchedules(supabase, baseDeps(deliver));

    expect(deliver).toHaveBeenCalledTimes(2); // email + whatsapp
    expect(summary).toMatchObject({ processed: 1, sent: 2, failed: 0 });
    // cadência avançada
    const cadence = updates.find((u) => u.set.next_run_at);
    expect(cadence.set.next_run_at).toBe(new Date(NOW + 7 * DAY).toISOString());
    expect(cadence.set.run_count).toBe(2);
  });

  it('fora da janela de interesse → desativa e não envia', async () => {
    const { supabase, updates } = makeFake([
      baseSchedule({ interest_at: new Date(NOW - 30 * DAY).toISOString(), interest_window_days: 7 }),
    ]);
    const deliver = vi.fn();
    const summary = await runDueSchedules(supabase, baseDeps(deliver));

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.deactivated).toBe(1);
    expect(updates.some((u) => u.set.active === false)).toBe(true);
  });

  it('canal sem contato é pulado (ex.: whatsapp sem telefone)', async () => {
    const { supabase } = makeFake([baseSchedule({ channels: ['whatsapp'], lead_phone: null })]);
    const deliver = vi.fn();
    const summary = await runDueSchedules(supabase, baseDeps(deliver));

    expect(deliver).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
  });

  it('dedup conta como enviado (não falha)', async () => {
    const { supabase } = makeFake([baseSchedule({ channels: ['email'] })]);
    const deliver = vi.fn(async () => ({ status: 'sent', deduplicated: true }));
    const summary = await runDueSchedules(supabase, baseDeps(deliver));
    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(0);
  });

  it('sem agendamentos vencidos → resumo zerado', async () => {
    const { supabase } = makeFake([]);
    const summary = await runDueSchedules(supabase, baseDeps(vi.fn()));
    expect(summary).toMatchObject({ processed: 0, sent: 0 });
  });
});
