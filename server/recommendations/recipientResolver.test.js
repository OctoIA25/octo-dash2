import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  resolveEnvironment,
  environmentFromEnv,
  resolveTestRecipient,
  resolveRecipient,
  testSubjectPrefix,
  DEFAULT_TEST_RECIPIENT,
} from './recipientResolver.js';

describe('isValidEmail', () => {
  it('valida formato básico', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('invalido')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe('resolveEnvironment', () => {
  it('normaliza valores conhecidos', () => {
    expect(resolveEnvironment('production')).toBe('production');
    expect(resolveEnvironment('PROD')).toBe('production');
    expect(resolveEnvironment('staging')).toBe('homologation');
    expect(resolveEnvironment('homolog')).toBe('homologation');
  });
  it('fail-safe: desconhecido vira development', () => {
    expect(resolveEnvironment('qualquer-coisa')).toBe('development');
    expect(resolveEnvironment(undefined)).toBe('development');
  });
});

describe('environmentFromEnv', () => {
  it('APP_ENV tem precedência sobre NODE_ENV', () => {
    expect(environmentFromEnv({ APP_ENV: 'production', NODE_ENV: 'development' })).toBe('production');
    expect(environmentFromEnv({ NODE_ENV: 'production' })).toBe('production');
    expect(environmentFromEnv({})).toBe('development');
  });
});

describe('resolveTestRecipient', () => {
  it('precedência: configurado > env > fallback', () => {
    expect(resolveTestRecipient('cfg@x.com', { EMAIL_TEST_RECIPIENT: 'env@x.com' })).toBe('cfg@x.com');
    expect(resolveTestRecipient('', { EMAIL_TEST_RECIPIENT: 'env@x.com' })).toBe('env@x.com');
    expect(resolveTestRecipient('', {})).toBe(DEFAULT_TEST_RECIPIENT);
    expect(resolveTestRecipient('invalido', {})).toBe(DEFAULT_TEST_RECIPIENT);
  });
});

describe('resolveRecipient — proteção entre ambientes', () => {
  const env0 = {};

  it('produção: envia para o lead real', () => {
    const r = resolveRecipient({
      environment: 'production',
      leadEmail: 'lead@cliente.com',
      configuredTestEmail: 'teste@x.com',
      processEnv: env0,
    });
    expect(r.recipient).toBe('lead@cliente.com');
    expect(r.redirected).toBe(false);
  });

  it('produção sem e-mail do lead: erro (não envia)', () => {
    const r = resolveRecipient({ environment: 'production', leadEmail: null, processEnv: env0 });
    expect(r.recipient).toBeNull();
    expect(r.reason).toBe('missing_lead_email');
  });

  it('desenvolvimento: redireciona para o e-mail de teste', () => {
    const r = resolveRecipient({
      environment: 'development',
      leadEmail: 'lead@cliente.com',
      configuredTestEmail: 'teste@x.com',
      processEnv: env0,
    });
    expect(r.recipient).toBe('teste@x.com');
    expect(r.redirected).toBe(true);
    expect(r.intendedEmail).toBe('lead@cliente.com');
  });

  it('homologação: também redireciona', () => {
    const r = resolveRecipient({
      environment: 'homologation',
      leadEmail: 'lead@cliente.com',
      configuredTestEmail: 'teste@x.com',
      processEnv: env0,
    });
    expect(r.recipient).toBe('teste@x.com');
    expect(r.redirected).toBe(true);
  });

  it('modo teste: sempre vai para o e-mail de teste, mesmo em produção', () => {
    const r = resolveRecipient({
      environment: 'production',
      leadEmail: 'lead@cliente.com',
      configuredTestEmail: 'teste@x.com',
      isTest: true,
      processEnv: env0,
    });
    expect(r.recipient).toBe('teste@x.com');
    expect(r.redirected).toBe(true);
    expect(r.isTest).toBe(true);
  });

  it('usa fallback embutido quando nada configurado fora de produção', () => {
    const r = resolveRecipient({ environment: 'development', leadEmail: 'lead@x.com', processEnv: {} });
    expect(r.recipient).toBe(DEFAULT_TEST_RECIPIENT);
  });
});

describe('testSubjectPrefix', () => {
  it('vazio quando não redirecionado', () => {
    expect(testSubjectPrefix({ redirected: false })).toBe('');
  });
  it('prefixo de teste e de redirecionamento', () => {
    expect(testSubjectPrefix({ redirected: true, isTest: true, intendedEmail: 'l@x.com' })).toBe(
      '[TESTE → l@x.com] ',
    );
    expect(testSubjectPrefix({ redirected: true, isTest: false, intendedEmail: null })).toBe(
      '[REDIRECIONADO → lead sem e-mail] ',
    );
  });
});
