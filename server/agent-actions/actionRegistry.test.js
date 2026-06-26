import { describe, it, expect, vi } from 'vitest';
import {
  getAction,
  listActionTypes,
  buildToolDefinitions,
  registerAction,
} from './actionRegistry.js';

describe('actionRegistry — executor extensível baseado em ações', () => {
  it('registra send_whatsapp e expõe seus tipos', () => {
    expect(listActionTypes()).toContain('send_whatsapp');
    expect(getAction('send_whatsapp')).toBeTruthy();
    expect(getAction('inexistente')).toBeNull();
  });

  it('buildToolDefinitions gera tool no formato OpenAI function-calling', () => {
    const tools = buildToolDefinitions();
    const wa = tools.find((t) => t.function.name === 'send_whatsapp');
    expect(wa.type).toBe('function');
    expect(wa.function.parameters.type).toBe('object');
    expect(wa.function.description).toMatch(/whatsapp/i);
  });

  it('é extensível: registerAction adiciona nova ação sem editar o registry', () => {
    registerAction({ type: 'add_tag', description: 'x', requiredRoles: ['admin'], toolSchema: { type: 'object', properties: {} } });
    expect(listActionTypes()).toContain('add_tag');
  });

  describe('send_whatsapp.checkEligibility', () => {
    const action = getAction('send_whatsapp');

    it('inelegível sem telefone', () => {
      expect(action.checkEligibility({ name: 'João', phone: '' })).toEqual({
        eligible: false,
        reason: 'no_whatsapp',
      });
    });

    it('elegível com telefone válido', () => {
      expect(action.checkEligibility({ name: 'João', phone: '5511999990000' })).toEqual({
        eligible: true,
      });
    });
  });
});

// Teste real de deliverItem com assinatura (supabase, item, deps).
describe('send_whatsapp.deliverItem (assinatura correta)', () => {
  const action = getAction('send_whatsapp');
  const supabase = { __fake: true };
  const item = {
    tenant_id: 't1',
    run_id: 'run-1',
    lead_id: 'lead-9',
    lead_name: 'João',
    lead_source: 'crm',
    lead_phone: '5511999990000',
    payload: { templateParams: ['Olá, temos novidades!'] },
  };

  it('produção: envia e devolve done com messageId', async () => {
    const deliverRecommendation = vi.fn(async () => ({ ok: true, messageId: 'wamid.1' }));
    const r = await action.deliverItem(supabase, item, {
      deliverRecommendation,
      schedulerDeps: { dep: true },
      getEnvironment: () => 'production',
      processEnv: { NODE_ENV: 'production' },
    });
    expect(r).toEqual({ status: 'done', messageId: 'wamid.1' });

    const [calledSupabase, calledParams, calledDeps] = deliverRecommendation.mock.calls[0];
    expect(calledSupabase).toBe(supabase);
    expect(calledParams.channel).toBe('whatsapp');
    expect(calledParams.tenantId).toBe('t1');
    expect(calledParams.whatsappParams).toEqual(['Olá, temos novidades!']);
    expect(calledParams.idempotencyRefs).toEqual(['run:run-1']);
    expect(calledParams.sanitizedProps).toEqual([]);
    expect(calledParams.delivery.recipient).toBe('5511999990000');
    expect(calledDeps).toEqual({ dep: true });
  });

  it('sem telefone: skipped sem chamar envio', async () => {
    const deliverRecommendation = vi.fn();
    const r = await action.deliverItem(
      supabase,
      { ...item, lead_phone: '' },
      { deliverRecommendation, schedulerDeps: {}, getEnvironment: () => 'production' },
    );
    expect(r.status).toBe('skipped');
    expect(deliverRecommendation).not.toHaveBeenCalled();
  });

  it('dedup do núcleo: marca done com deduplicated', async () => {
    const deliverRecommendation = vi.fn(async () => ({ ok: true, deduplicated: true, messageId: 'wamid.x' }));
    const r = await action.deliverItem(supabase, item, {
      deliverRecommendation,
      schedulerDeps: {},
      getEnvironment: () => 'production',
    });
    expect(r).toEqual({ status: 'done', deduplicated: true, messageId: 'wamid.x' });
  });

  it('falha de envio: failed com erro', async () => {
    const deliverRecommendation = vi.fn(async () => ({ ok: false, errorMessage: 'meta down' }));
    const r = await action.deliverItem(supabase, item, {
      deliverRecommendation,
      schedulerDeps: {},
      getEnvironment: () => 'production',
    });
    expect(r).toEqual({ status: 'failed', error: 'meta down' });
  });
});

describe('buildPayload com variableMapping', () => {
  const lead = { id: 'l1', name: 'João', phone: '551199', assignedAgent: 'Maria' };
  it('usa o resolver quando há variableMapping + templateVariables', () => {
    const action = getAction('send_whatsapp');
    const p = action.buildPayload({ message: 'ignorado', variableMapping: { 1: { type: 'lead_field', value: 'name' }, 2: { type: 'fixed', value: 'jan' } }, templateVariables: ['1', '2'] }, lead);
    expect(p.templateParams).toEqual(['João', 'jan']);
  });
  it('sem variableMapping → [message] (retrocompat)', () => {
    const action = getAction('send_whatsapp');
    const p = action.buildPayload({ message: 'Olá pessoal' }, lead);
    expect(p.templateParams).toEqual(['Olá pessoal']);
  });
  it('templateVariables vazio → [message] (texto sem variável)', () => {
    const action = getAction('send_whatsapp');
    const p = action.buildPayload({ message: 'Oi', variableMapping: {}, templateVariables: [] }, lead);
    expect(p.templateParams).toEqual(['Oi']);
  });
});
