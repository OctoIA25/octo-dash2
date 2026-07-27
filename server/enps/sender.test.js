import { describe, it, expect, vi } from 'vitest';
import { makeSendSurvey } from './sender.js';

const emailContent = { subject: 'Pesquisa eNPS', html: '<p>link</p>', text: 'link' };

function makeDeps(overrides = {}) {
  const sent = [];
  const resolveTransport = vi.fn(async () => ({
    transport: { kind: 'smtp', send: vi.fn(async (m) => { sent.push(m); return { transport: 'smtp', messageId: 'm1' }; }) },
    from: 'no-reply@imob.com',
  }));
  const sendWhatsapp = vi.fn(async () => ({ messageId: 'wa1' }));
  const rateLimiter = { tryRemove: vi.fn(() => true), refill: vi.fn() };
  return { resolveTransport, sendWhatsapp, rateLimiter, sent, ...overrides };
}

describe('sendSurvey', () => {
  it('email: reserva token, envia pelo transporte do tenant e devolve sent', async () => {
    const deps = makeDeps();
    const sendSurvey = makeSendSurvey({}, deps);
    const r = await sendSurvey({ tenantId: 't1', channel: 'email', recipient: 'c@x.com', content: emailContent });
    expect(deps.rateLimiter.tryRemove).toHaveBeenCalledWith('t1');
    expect(deps.resolveTransport).toHaveBeenCalledWith('t1');
    expect(deps.sent[0]).toMatchObject({ from: 'no-reply@imob.com', to: 'c@x.com', subject: 'Pesquisa eNPS' });
    expect(r).toMatchObject({ ok: true, status: 'sent', messageId: 'm1' });
  });

  it('sem token do rate limiter: NÃO chama transporte, devolve throttled', async () => {
    const deps = makeDeps({ rateLimiter: { tryRemove: vi.fn(() => false), refill: vi.fn() } });
    const sendSurvey = makeSendSurvey({}, deps);
    const r = await sendSurvey({ tenantId: 't1', channel: 'email', recipient: 'c@x.com', content: emailContent });
    expect(deps.resolveTransport).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, status: 'throttled', throttled: true });
  });

  it('whatsapp sem template aprovado: mapeia para skipped_no_contact', async () => {
    const err = new Error('sem template'); err.code = 'whatsapp_template_missing';
    const deps = makeDeps({ sendWhatsapp: vi.fn(async () => { throw err; }) });
    const sendSurvey = makeSendSurvey({}, deps);
    const r = await sendSurvey({ tenantId: 't1', channel: 'whatsapp', recipient: '5511999', content: {}, params: ['Ana', 'http://l'] });
    expect(r).toMatchObject({ ok: false, status: 'skipped_no_contact' });
  });

  it('falha genérica do transporte → status failed com a mensagem de erro', async () => {
    const deps = makeDeps();
    deps.resolveTransport = vi.fn(async () => ({ transport: { send: vi.fn(async () => { throw new Error('SMTP down'); }) }, from: 'f@x' }));
    const sendSurvey = makeSendSurvey({}, deps);
    const r = await sendSurvey({ tenantId: 't1', channel: 'email', recipient: 'c@x.com', content: emailContent });
    expect(r).toMatchObject({ ok: false, status: 'failed' });
    expect(r.error).toContain('SMTP down');
  });

  it('provedor pendurado além do timeout → failed por timeout', async () => {
    const deps = makeDeps();
    deps.resolveTransport = vi.fn(async () => ({ transport: { send: () => new Promise(() => {}) }, from: 'f@x' }));
    const sendSurvey = makeSendSurvey({}, { ...deps, sendTimeoutMs: 5 });
    const r = await sendSurvey({ tenantId: 't1', channel: 'email', recipient: 'c@x.com', content: emailContent });
    expect(r).toMatchObject({ ok: false, status: 'failed' });
    expect(r.error).toMatch(/timeout/i);
  });
});
