import { describe, it, expect } from 'vitest';
import { computeEscalationMetrics, percentile } from './escalations.js';

// Fábrica de linha no shape real de lia_perguntas_corretor (validado no banco):
// criado_em sempre presente; respondida_em só quando status='respondida'.
const row = ({ lead_id = 'L1', criado_em, respondida_em = null, status = 'respondida' }) => ({
  lead_id,
  criado_em,
  respondida_em,
  status,
});

describe('percentile — interpolação linear sobre valores ordenados', () => {
  it('p50 de [10,20,30,40] = 25 (média dos centrais)', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
  });

  it('p95 interpola entre as duas maiores amostras', () => {
    // rank = 0.95*(n-1) = 0.95*3 = 2.85 → 30 + 0.85*(40-30) = 38.5
    expect(percentile([10, 20, 30, 40], 0.95)).toBeCloseTo(38.5, 10);
  });

  it('lista vazia → null (nunca inventa zero)', () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  it('um elemento → o próprio valor em qualquer percentil', () => {
    expect(percentile([42], 0.95)).toBe(42);
  });
});

describe('computeEscalationMetrics — escalonamentos IA→corretor derivados de lia_perguntas_corretor', () => {
  it('conta escalonamentos e resolve por status, sem contar pendente como resolvido', () => {
    const rows = [
      row({ criado_em: '2026-07-01T00:00:00Z', respondida_em: '2026-07-01T01:00:00Z', status: 'respondida' }),
      row({ criado_em: '2026-07-02T00:00:00Z', respondida_em: null, status: 'pendente' }),
    ];
    const m = computeEscalationMetrics(rows, new Set());
    expect(m.total).toBe(2);
    expect(m.resolved).toBe(1);
    expect(m.pending).toBe(1);
  });

  it('tempo de resposta usa criado_em→respondida_em em P50/P95, NUNCA média, e ignora pendentes', () => {
    // deltas: 60min, 120min, 180min (a pendente não entra)
    const rows = [
      row({ criado_em: '2026-07-01T00:00:00Z', respondida_em: '2026-07-01T01:00:00Z' }),
      row({ criado_em: '2026-07-01T00:00:00Z', respondida_em: '2026-07-01T02:00:00Z' }),
      row({ criado_em: '2026-07-01T00:00:00Z', respondida_em: '2026-07-01T03:00:00Z' }),
      row({ criado_em: '2026-07-01T00:00:00Z', respondida_em: null, status: 'pendente' }),
    ];
    const m = computeEscalationMetrics(rows, new Set());
    expect(m.response_time.samples).toBe(3);
    expect(m.response_time.p50_minutes).toBe(120);
    // p95 de [60,120,180]: rank=0.95*2=1.9 → 120 + 0.9*(180-120) = 174
    expect(m.response_time.p95_minutes).toBeCloseTo(174, 10);
    expect(m.response_time).not.toHaveProperty('avg_minutes');
  });

  it('deltas negativos (respondida antes de criada — relógio do n8n) são descartados', () => {
    const rows = [
      row({ criado_em: '2026-07-01T02:00:00Z', respondida_em: '2026-07-01T01:00:00Z' }), // -60min
      row({ criado_em: '2026-07-01T00:00:00Z', respondida_em: '2026-07-01T01:00:00Z' }), // +60min
    ];
    const m = computeEscalationMetrics(rows, new Set());
    expect(m.response_time.samples).toBe(1);
    expect(m.response_time.p50_minutes).toBe(60);
  });

  it('sem resolvidos → percentis null (insufficient_data, não zero)', () => {
    const rows = [row({ criado_em: '2026-07-01T00:00:00Z', respondida_em: null, status: 'pendente' })];
    const m = computeEscalationMetrics(rows, new Set());
    expect(m.response_time.samples).toBe(0);
    expect(m.response_time.p50_minutes).toBeNull();
    expect(m.response_time.p95_minutes).toBeNull();
  });

  it('fechamento conta leads DISTINTOS escalonados que fecharam, não linhas', () => {
    // L1 aparece 2x (2 perguntas), L2 1x. closedLeadIds tem L1 → 1 de 2 leads distintos fechou.
    const rows = [
      row({ lead_id: 'L1', criado_em: '2026-07-01T00:00:00Z' }),
      row({ lead_id: 'L1', criado_em: '2026-07-02T00:00:00Z' }),
      row({ lead_id: 'L2', criado_em: '2026-07-03T00:00:00Z' }),
    ];
    const m = computeEscalationMetrics(rows, new Set(['L1']));
    expect(m.closure.escalated_leads).toBe(2);
    expect(m.closure.closed_leads).toBe(1);
    expect(m.closure.rate).toBeCloseTo(0.5, 10);
  });

  it('sem leads escalonados → taxa de fechamento null (não 0/0)', () => {
    const m = computeEscalationMetrics([], new Set());
    expect(m.total).toBe(0);
    expect(m.closure.escalated_leads).toBe(0);
    expect(m.closure.rate).toBeNull();
  });

  it('lead_id nulo/vazio não entra na contagem de fechamento', () => {
    const rows = [
      row({ lead_id: null, criado_em: '2026-07-01T00:00:00Z' }),
      row({ lead_id: 'L2', criado_em: '2026-07-02T00:00:00Z' }),
    ];
    const m = computeEscalationMetrics(rows, new Set(['L2']));
    expect(m.closure.escalated_leads).toBe(1);
    expect(m.closure.closed_leads).toBe(1);
  });
});
