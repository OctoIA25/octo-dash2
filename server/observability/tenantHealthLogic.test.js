import { describe, it, expect } from 'vitest';
import {
  classifyFailure, parseSyncState, deriveSyncCard,
  deriveOutboxCard, deriveWebhooksCard, deriveWhatsappCard, unavailableCard,
} from './tenantHealthLogic.js';

describe('classifyFailure', () => {
  it('classifica fornecedor externo por keyword', () => {
    expect(classifyFailure('HTTP 429 Too Many Requests')).toBe('external');
    expect(classifyFailure('request timeout')).toBe('external');
    expect(classifyFailure('503 Service Unavailable')).toBe('external');
    expect(classifyFailure('ECONNREFUSED')).toBe('external');
  });
  it('classifica problema de config do tenant', () => {
    expect(classifyFailure('401 unauthorized')).toBe('config');
    expect(classifyFailure('invalid token')).toBe('config');
    expect(classifyFailure('API key inválida')).toBe('config');
  });
  it('default interno para erro desconhecido', () => {
    expect(classifyFailure('something exploded')).toBe('internal');
  });
  it('null quando não há texto', () => {
    expect(classifyFailure(null)).toBeNull();
    expect(classifyFailure('')).toBeNull();
    expect(classifyFailure(undefined)).toBeNull();
  });
});

describe('parseSyncState', () => {
  it('faz parse de string JSON', () => {
    expect(parseSyncState('{"status":"done","fetched":3}')).toMatchObject({ status: 'done', fetched: 3 });
  });
  it('aceita objeto já parseado', () => {
    expect(parseSyncState({ status: 'error' })).toMatchObject({ status: 'error' });
  });
  it('null em entrada vazia ou JSON inválido', () => {
    expect(parseSyncState(null)).toBeNull();
    expect(parseSyncState('{corrompido')).toBeNull();
  });
  it('deriva stalled quando running excede STALLED_MS', () => {
    const old = new Date(1000).toISOString();
    const s = parseSyncState({ status: 'running', started_at: old }, 1000 + 11 * 60 * 1000);
    expect(s.stalled).toBe(true);
  });
  it('não marca stalled quando running é recente', () => {
    const s = parseSyncState({ status: 'running', heartbeat_at: new Date(1000).toISOString() }, 1000 + 60 * 1000);
    expect(s.stalled).toBeUndefined();
  });
});

describe('deriveSyncCard', () => {
  it('sem config → inactive', () => {
    expect(deriveSyncCard(null)).toMatchObject({ status: 'inactive', failure_origin: null });
  });
  it('status != active → inactive', () => {
    expect(deriveSyncCard({ status: 'inactive' })).toMatchObject({ status: 'inactive' });
  });
  it('ciclo done sem erros → ok, sem origem', () => {
    const card = deriveSyncCard({ status: 'active', last_sync_at: 'x', sync_state: JSON.stringify({ status: 'done', fetched: 5, errors: 0 }) });
    expect(card).toMatchObject({ status: 'ok', failure_origin: null });
    expect(card.details.fetched).toBe(5);
  });
  it('ciclo com erro de timeout → error + origem external', () => {
    const card = deriveSyncCard({ status: 'active', sync_state: JSON.stringify({ status: 'error', error_message: 'timeout' }) });
    expect(card.status).toBe('error');
    expect(card.failure_origin).toBe('external');
    expect(card.last_error).toBe('timeout');
  });
  it('errors > 0 conta como error mesmo com status done', () => {
    const card = deriveSyncCard({ status: 'active', sync_state: JSON.stringify({ status: 'done', errors: 2 }) });
    expect(card.status).toBe('error');
  });
  it('running preso (stalled) → degraded', () => {
    const old = new Date(1000).toISOString();
    const card = deriveSyncCard({ status: 'active', sync_state: JSON.stringify({ status: 'running', started_at: old }) }, 1000 + 11 * 60 * 1000);
    expect(card.status).toBe('degraded');
  });
});

describe('deriveOutboxCard / deriveWebhooksCard / deriveWhatsappCard', () => {
  it('outbox sem falha → ok', () => {
    expect(deriveOutboxCard({ pending: 3, failed: 0 })).toMatchObject({ status: 'ok', queue_pending: 3, failure_origin: null });
  });
  it('outbox com falha → error + origem', () => {
    expect(deriveOutboxCard({ pending: 0, failed: 2, lastError: 'timeout' })).toMatchObject({ status: 'error', failure_origin: 'external' });
  });
  it('outbox com falha e erro desconhecido → internal', () => {
    expect(deriveOutboxCard({ pending: 0, failed: 1, lastError: null }).failure_origin).toBe('internal');
  });
  it('webhooks recentes falhando → error', () => {
    expect(deriveWebhooksCard({ recentFailures: 4, lastError: '500' })).toMatchObject({ status: 'error', recent_failures: 4, failure_origin: 'external' });
  });
  it('webhooks sem falha → ok', () => {
    expect(deriveWebhooksCard({ recentFailures: 0 })).toMatchObject({ status: 'ok', failure_origin: null });
  });
  it('whatsapp inativo → inactive', () => {
    expect(deriveWhatsappCard({ active: false })).toMatchObject({ status: 'inactive', failure_origin: null });
  });
  it('whatsapp ativo com falha → error', () => {
    expect(deriveWhatsappCard({ active: true, queued: 1, failed: 3 })).toMatchObject({ status: 'error', failed: 3 });
  });
  it('whatsapp ativo sem falha → ok', () => {
    expect(deriveWhatsappCard({ active: true, queued: 0, failed: 0 })).toMatchObject({ status: 'ok' });
  });
});

describe('unavailableCard', () => {
  it('available:false com erro genérico (não vaza detalhe)', () => {
    expect(unavailableCard()).toEqual({ available: false, status: 'unknown', failure_origin: 'internal', error: 'query failed' });
  });
});
