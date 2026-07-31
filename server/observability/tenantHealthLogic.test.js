import { describe, it, expect } from 'vitest';
import {
  classifyFailure, parseSyncState, deriveSyncCard,
  deriveOutboxCard, deriveWebhooksCard, deriveWhatsappCard, unavailableCard, deriveLiaCard,
  deriveAnthropicCard,
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

describe('deriveLiaCard', () => {
  const NOW = Date.parse('2026-07-12T04:20:00.000Z');
  const base = {
    totalMensagens: 561, msgsIA: 410, msgsCorretor: 151,
    ultimaMsgAt: '2026-07-12T04:05:00.000Z',
    fPending: 20, fSent: 45, fCancelled: 244, fExpired: 10,
    pPendente: 133, pRespondida: 35,
    respostasRows: [
      { criado_em: '2026-07-12T00:00:00.000Z', respondida_em: '2026-07-12T00:10:00.000Z' }, // 10min
      { criado_em: '2026-07-12T00:00:00.000Z', respondida_em: '2026-07-12T00:30:00.000Z' }, // 30min
      { criado_em: '2026-07-12T00:00:00.000Z', respondida_em: '2026-07-12T01:30:00.000Z' }, // 90min
    ],
    visTotal: 89, visConfirmadas: 1,
    interacoes: [1, 5, 64, 2], // avg 18, max 64
    fatos: 298, leadsQualificados: 160,
    now: NOW,
  };

  it('tenant sem LIA (0 mensagens) => ativa:false e nada mais', () => {
    const c = deriveLiaCard({ ...base, totalMensagens: 0 });
    expect(c).toEqual({ available: true, ativa: false });
  });

  it('tenant ativo => ativa:true com todos os blocos', () => {
    const c = deriveLiaCard(base);
    expect(c.available).toBe(true);
    expect(c.ativa).toBe(true);
    expect(c.minutos_desde_ultima_msg).toBe(15); // 04:20 - 04:05
    expect(c.mensagens).toEqual({ total: 561, ia: 410, corretor: 151, proporcao_ia_corretor: 2.72 });
    expect(c.followups).toEqual({ pending: 20, sent: 45, cancelled: 244, expired: 10, taxa_envio: 0.14 });
    expect(c.perguntas.pendente).toBe(133);
    expect(c.perguntas.respondida).toBe(35);
    expect(c.perguntas.taxa_resposta).toBe(0.21);
    expect(c.perguntas.tempo_mediano_min).toBe(30); // mediana de [10,30,90]
    expect(c.visitas).toEqual({ total: 89, confirmadas: 1, taxa_confirmacao: 0.01 });
    expect(c.engajamento).toEqual({ interacao_media: 18, lead_mais_ativo: 64 });
    expect(c.qualificacao).toEqual({ fatos: 298, leads_qualificados: 160 });
  });

  it('proporcao_ia_corretor é null quando corretor não respondeu nada', () => {
    const c = deriveLiaCard({ ...base, msgsCorretor: 0 });
    expect(c.mensagens.proporcao_ia_corretor).toBeNull();
  });

  it('mediana com nº par de respostas = média dos 2 centrais', () => {
    const c = deriveLiaCard({
      ...base,
      respostasRows: [
        { criado_em: '2026-07-12T00:00:00.000Z', respondida_em: '2026-07-12T00:10:00.000Z' }, // 10
        { criado_em: '2026-07-12T00:00:00.000Z', respondida_em: '2026-07-12T00:20:00.000Z' }, // 20
        { criado_em: '2026-07-12T00:00:00.000Z', respondida_em: '2026-07-12T00:30:00.000Z' }, // 30
        { criado_em: '2026-07-12T00:00:00.000Z', respondida_em: '2026-07-12T00:50:00.000Z' }, // 50
      ],
    });
    expect(c.perguntas.tempo_mediano_min).toBe(25); // (20+30)/2
  });

  it('tempo_mediano_min é null sem respostas, e ignora linhas com timestamp inválido', () => {
    expect(deriveLiaCard({ ...base, respostasRows: [] }).perguntas.tempo_mediano_min).toBeNull();
    const c = deriveLiaCard({
      ...base,
      respostasRows: [{ criado_em: 'lixo', respondida_em: null }],
    });
    expect(c.perguntas.tempo_mediano_min).toBeNull();
  });

  it('tempo_mediano_min ignora delta negativo (respondida antes de criada — skew/ordem)', () => {
    const c = deriveLiaCard({
      ...base,
      respostasRows: [
        { criado_em: '2026-07-12T01:00:00.000Z', respondida_em: '2026-07-12T00:30:00.000Z' }, // -30min: descartado
        { criado_em: '2026-07-12T00:00:00.000Z', respondida_em: '2026-07-12T00:20:00.000Z' }, // 20min: vale
      ],
    });
    expect(c.perguntas.tempo_mediano_min).toBe(20); // só a linha válida entra
  });

  it('engajamento null quando não há interações', () => {
    const c = deriveLiaCard({ ...base, interacoes: [] });
    expect(c.engajamento).toEqual({ interacao_media: null, lead_mais_ativo: null });
  });

  it('taxas viram 0 (não NaN) quando denominador é 0', () => {
    const c = deriveLiaCard({
      ...base, totalMensagens: 1, msgsIA: 1, msgsCorretor: 0,
      fPending: 0, fSent: 0, fCancelled: 0, fExpired: 0,
      pPendente: 0, pRespondida: 0, respostasRows: [],
      visTotal: 0, visConfirmadas: 0,
    });
    expect(c.followups.taxa_envio).toBe(0);
    expect(c.perguntas.taxa_resposta).toBe(0);
    expect(c.visitas.taxa_confirmacao).toBe(0);
  });

  it('minutos_desde_ultima_msg é null se não há timestamp', () => {
    const c = deriveLiaCard({ ...base, ultimaMsgAt: null });
    expect(c.minutos_desde_ultima_msg).toBeNull();
  });

  it('minutos_desde_ultima_msg nunca é negativo (timestamp futuro por skew => 0)', () => {
    const c = deriveLiaCard({ ...base, ultimaMsgAt: '2026-07-12T05:00:00.000Z', now: NOW }); // NOW = 04:20, msg no futuro
    expect(c.minutos_desde_ultima_msg).toBe(0);
  });
});

describe('deriveAnthropicCard', () => {
  it('sem linha → not_configured', () => {
    const c = deriveAnthropicCard(null);
    expect(c).toMatchObject({ available: true, status: 'not_configured', percentage: null });
  });
  it('snapshot normal', () => {
    const c = deriveAnthropicCard({
      last_state: 'normal', last_percentage: 12.84, last_usage_usd: 64.2, weekly_limit_usd: 500,
      last_window_start: '2026-07-22T00:00:00Z', last_window_end: '2026-07-29T12:00:00Z',
      last_error: null, last_synced_at: '2026-07-29T12:00:00Z',
    });
    expect(c).toMatchObject({ available: true, status: 'normal', percentage: 12.84, usage_usd: 64.2, limit_usd: 500 });
  });
  it('snapshot warning preserva percentual', () => {
    expect(deriveAnthropicCard({ last_state: 'warning', last_percentage: 15.2, weekly_limit_usd: 500 }).status).toBe('warning');
  });
  it('snapshot error → status error + last_error', () => {
    const c = deriveAnthropicCard({ last_state: 'error', last_error: 'rate_limited', weekly_limit_usd: 500 });
    expect(c.status).toBe('error');
    expect(c.last_error).toBe('rate_limited');
  });
  it('deriveAnthropicCard expõe mode (default api; max passa)', () => {
    expect(deriveAnthropicCard(null).mode).toBe('api');
    expect(deriveAnthropicCard({ last_state: 'normal', mode: 'max' }).mode).toBe('max');
  });
});
