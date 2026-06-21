import { describe, it, expect, vi } from 'vitest';
import { interpretCommand, normalizePlan, __test__ } from './interpreter.js';

const { extractPlan } = __test__;

/** Transporte n8n fake: devolve a resposta crua dada (objeto/string/wrapper). */
const fakeTransport = (raw) => vi.fn(async () => raw);

describe('interpreter.normalizePlan — validação do plano', () => {
  it('cliente único → explicit_list', () => {
    const r = normalizePlan({
      action: 'send_whatsapp',
      segment: { type: 'explicit_list', names: ['João Silva'] },
      params: { message: 'Olá!' },
    });
    expect(r.ok).toBe(true);
    expect(r.operation.segment).toEqual({ type: 'explicit_list', names: ['João Silva'] });
    expect(r.operation.params.message).toBe('Olá!');
    expect(r.operation.needsMessage).toBe(false);
  });

  it('arquivados há mais de 30 dias → archived_period com days', () => {
    const r = normalizePlan({
      action: 'send_whatsapp',
      segment: { type: 'archived_period', days: 30 },
      params: {},
    });
    expect(r.operation.segment).toEqual({ type: 'archived_period', days: 30 });
    expect(r.operation.needsMessage).toBe(true); // sem mensagem → precisa pedir
  });

  it('sem atendimento nos últimos 15 dias → no_contact', () => {
    const r = normalizePlan({
      action: 'send_whatsapp',
      segment: { type: 'no_contact', days: 15 },
      params: { message: 'oi' },
    });
    expect(r.operation.segment).toEqual({ type: 'no_contact', days: 15 });
  });

  it('da corretora X → by_broker', () => {
    const r = normalizePlan({
      action: 'send_whatsapp',
      segment: { type: 'by_broker', broker: 'Imobiliária X' },
      params: { message: 'oi' },
    });
    expect(r.operation.segment).toEqual({ type: 'by_broker', broker: 'Imobiliária X' });
  });

  it('interessados em apartamentos → interest', () => {
    const r = normalizePlan({
      action: 'send_whatsapp',
      segment: { type: 'interest', interest: 'apartamento' },
      params: { message: 'oi' },
    });
    expect(r.operation.segment).toEqual({ type: 'interest', interest: 'apartamento' });
  });

  it('descarta campos irrelevantes ao tipo do segmento', () => {
    const r = normalizePlan({
      action: 'send_whatsapp',
      segment: { type: 'archived', days: 99, broker: 'ruído' },
      params: { message: 'oi' },
    });
    expect(r.operation.segment).toEqual({ type: 'archived' });
  });

  it('ação vazia → unsupported_intent com clarification', () => {
    const r = normalizePlan({ action: '', clarification: 'Não entendi o pedido.' });
    expect(r).toMatchObject({ ok: false, error: 'unsupported_intent', clarification: 'Não entendi o pedido.' });
  });

  it('ação não suportada → erro', () => {
    const r = normalizePlan({ action: 'create_task', segment: { type: 'archived' } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unsupported_action');
  });

  it('segmento inválido → erro', () => {
    const r = normalizePlan({ action: 'send_whatsapp', segment: { type: 'banana' } });
    expect(r).toMatchObject({ ok: false, error: 'invalid_segment' });
  });
});

describe('interpreter.extractPlan — parser robusto da resposta do n8n', () => {
  it('objeto-plano direto', () => {
    expect(extractPlan({ action: 'send_whatsapp', segment: { type: 'archived' } })).toMatchObject({
      action: 'send_whatsapp',
    });
  });
  it('string JSON', () => {
    expect(extractPlan('{"action":"send_whatsapp","segment":{"type":"archived"}}')).toMatchObject({
      action: 'send_whatsapp',
    });
  });
  it('aninhado em wrappers (output/data/response)', () => {
    expect(extractPlan({ output: { action: 'send_whatsapp', segment: { type: 'archived' } } })).toMatchObject({
      action: 'send_whatsapp',
    });
    expect(extractPlan({ data: '{"action":"send_whatsapp","segment":{"type":"archived"}}' })).toMatchObject({
      action: 'send_whatsapp',
    });
  });
  it('lixo → null', () => {
    expect(extractPlan('não é json')).toBeNull();
    expect(extractPlan(null)).toBeNull();
    expect(extractPlan({ foo: 'bar' })).toBeNull();
  });
});

describe('interpreter.interpretCommand — fluxo via n8n (transport injetado)', () => {
  it('comando vazio é rejeitado sem chamar o n8n', async () => {
    const transport = fakeTransport({});
    const r = await interpretCommand('   ', { transport });
    expect(r).toEqual({ ok: false, error: 'empty_command' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('traduz comando real (n8n devolve plano top-level message)', async () => {
    const transport = fakeTransport({
      action: 'send_whatsapp',
      segment: { type: 'archived' },
      message: 'Temos novidades para você!',
    });
    const r = await interpretCommand('Mande uma mensagem para todos os clientes arquivados', { transport });
    expect(r.ok).toBe(true);
    expect(r.operation.action).toBe('send_whatsapp');
    expect(r.operation.segment.type).toBe('archived');
    expect(r.operation.params.message).toBe('Temos novidades para você!');
    expect(transport).toHaveBeenCalledOnce();
    // passou o comando ao transporte
    expect(transport.mock.calls[0][0]).toContain('arquivados');
  });

  it('n8n devolve plano em wrapper (output)', async () => {
    const transport = fakeTransport({ output: { action: 'send_whatsapp', segment: { type: 'archived' }, message: 'oi' } });
    const r = await interpretCommand('arquivados', { transport });
    expect(r.ok).toBe(true);
  });

  it('falha do n8n é tratada como n8n_error', async () => {
    const transport = vi.fn(async () => { throw new Error('timeout'); });
    const r = await interpretCommand('envie msg', { transport });
    expect(r).toMatchObject({ ok: false, error: 'n8n_error' });
  });

  it('resposta sem plano válido → invalid_plan', async () => {
    const transport = fakeTransport({ foo: 'bar' });
    const r = await interpretCommand('algo', { transport });
    expect(r).toMatchObject({ ok: false, error: 'invalid_plan' });
  });
});
