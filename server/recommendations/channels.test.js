import { describe, it, expect } from 'vitest';
import { resolveDelivery, normalizePhone, deriveStatus } from './channels.js';

const env0 = {};

describe('normalizePhone', () => {
  it('mantém só dígitos', () => {
    expect(normalizePhone('+55 (11) 99999-1234')).toBe('5511999991234');
    expect(normalizePhone(null)).toBe('');
  });
});

describe('resolveDelivery — email (delega ao recipientResolver)', () => {
  it('produção → lead real, sem simular', () => {
    const d = resolveDelivery({ channel: 'email', environment: 'production', leadEmail: 'l@x.com', processEnv: env0 });
    expect(d).toMatchObject({ channel: 'email', recipient: 'l@x.com', simulate: false, redirected: false });
  });
  it('dev → redireciona para o e-mail de teste (mas envia)', () => {
    const d = resolveDelivery({ channel: 'email', environment: 'development', leadEmail: 'l@x.com', configuredTestEmail: 't@x.com', processEnv: env0 });
    expect(d).toMatchObject({ recipient: 't@x.com', redirected: true, simulate: false });
  });
});

describe('resolveDelivery — whatsapp', () => {
  it('produção → telefone real, sem simular', () => {
    const d = resolveDelivery({ channel: 'whatsapp', environment: 'production', leadPhone: '55 11 98888-7777', processEnv: env0 });
    expect(d).toMatchObject({ channel: 'whatsapp', recipient: '5511988887777', simulate: false, redirected: false });
  });
  it('dev → SIMULA (não envia), mas mantém o número pretendido', () => {
    const d = resolveDelivery({ channel: 'whatsapp', environment: 'development', leadPhone: '5511988887777', processEnv: env0 });
    expect(d).toMatchObject({ recipient: '5511988887777', simulate: true });
  });
  it('teste → simula em qualquer ambiente', () => {
    const d = resolveDelivery({ channel: 'whatsapp', environment: 'production', leadPhone: '5511988887777', isTest: true, processEnv: env0 });
    expect(d.simulate).toBe(true);
  });
  it('sem telefone → erro missing_lead_phone', () => {
    const d = resolveDelivery({ channel: 'whatsapp', environment: 'production', leadPhone: '', processEnv: env0 });
    expect(d.recipient).toBeNull();
    expect(d.reason).toBe('missing_lead_phone');
  });
});

describe('resolveDelivery — canal não suportado', () => {
  it('retorna erro', () => {
    const d = resolveDelivery({ channel: 'sms', environment: 'production', processEnv: env0 });
    expect(d.reason).toBe('unsupported_channel');
  });
});

describe('deriveStatus', () => {
  it('mapeia falha/teste/simulado/enviado', () => {
    expect(deriveStatus({ failed: true })).toBe('failed');
    expect(deriveStatus({ isTest: true })).toBe('test');
    expect(deriveStatus({ simulate: true })).toBe('simulated');
    expect(deriveStatus({ sent: { simulated: true } })).toBe('simulated');
    expect(deriveStatus({ sent: { simulated: false } })).toBe('sent');
  });
});
