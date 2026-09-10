/**
 * Regra da cadência — o que estes testes protegem:
 *  - as três origens de "foi respondido" e a ordem de precedência entre elas;
 *  - a janela de 72h e o corte no envio seguinte (uma resposta nunca conta duas vezes);
 *  - a separação entre taxa_resposta (o que saiu) e retornos_espontaneos (o que
 *    foi cancelado porque o lead voltou) — misturar as duas infla a métrica;
 *  - denominador zero devolve null, não 0%.
 */
import { describe, it, expect } from 'vitest';
import { resumirCadencia, casarRespostas, mediana } from './compute.js';

const AGORA = Date.parse('2026-09-10T12:00:00Z');

/** Follow-up enviado, com os campos que o resumo realmente lê. */
const enviado = (over = {}) => ({
  id: 'fw',
  status: 'sent',
  sent_at: '2026-09-01T10:00:00Z',
  attempt_number: 1,
  tag: 'pos_apresentacao',
  ...over,
});

describe('casarRespostas — dois ponteiros', () => {
  it('casa cada envio com a primeira mensagem posterior', () => {
    expect(casarRespostas([100, 500], [120, 600])).toEqual([120, 600]);
  });

  it('não credita a mesma resposta a dois envios', () => {
    // 120 pertence à janela do envio 100; o envio 500 fica sem resposta.
    expect(casarRespostas([100, 500], [120])).toEqual([120, null]);
  });

  it('ignora mensagem anterior ao envio', () => {
    expect(casarRespostas([100], [50])).toEqual([null]);
  });

  it('mensagem exatamente no instante do envio não conta como resposta', () => {
    expect(casarRespostas([100], [100])).toEqual([null]);
  });

  it('corta a janela no envio seguinte, mesmo dentro das 72h', () => {
    const envio = Date.parse('2026-09-01T10:00:00Z');
    const seguinte = envio + 60_000;
    const resposta = envio + 120_000; // depois do 2º envio
    expect(casarRespostas([envio, seguinte], [resposta])).toEqual([null, resposta]);
  });

  it('resposta além de 72h não conta', () => {
    const envio = Date.parse('2026-09-01T10:00:00Z');
    expect(casarRespostas([envio], [envio + 73 * 3600_000])).toEqual([null]);
  });

  it('aguenta lista vazia dos dois lados', () => {
    expect(casarRespostas([], [1, 2])).toEqual([]);
    expect(casarRespostas([1], [])).toEqual([null]);
  });
});

describe('detecção de resposta — precedência', () => {
  it('replied_at declarado vence a inbound do WhatsApp', () => {
    const { timeline } = resumirCadencia({
      followups: [enviado({ replied_at: '2026-09-01T10:05:00Z' })],
      inboundTimes: ['2026-09-01T10:45:00Z'],
      now: AGORA,
    });
    expect(timeline[0].respondeu).toBe(true);
    expect(timeline[0].tempo_ate_resposta_min).toBe(5);
  });

  it('cancelamento por lead_returned conta como resposta sem inbound nenhuma', () => {
    const { resumo, timeline } = resumirCadencia({
      followups: [{
        id: 'c', status: 'cancelled', cancelled_reason: 'lead_returned',
        cancelled_at: '2026-09-02T09:00:00Z', scheduled_at: '2026-09-02T10:00:00Z',
        attempt_number: 1,
      }],
      now: AGORA,
    });
    expect(timeline[0].respondeu).toBe(true);
    expect(resumo.retornos_espontaneos).toBe(1);
    // Nunca saiu: não entra no denominador da taxa.
    expect(resumo.enviadas).toBe(0);
    expect(resumo.taxa_resposta).toBeNull();
  });

  it('lead_returned sem cancelled_at ainda conta como resposta (sem instante)', () => {
    const { timeline } = resumirCadencia({
      followups: [{ id: 'c', status: 'cancelled', cancelled_reason: 'lead_returned' }],
      now: AGORA,
    });
    expect(timeline[0].respondeu).toBe(true);
    expect(timeline[0].respondido_em).toBeNull();
  });

  it('cancelamento por outro motivo não é resposta', () => {
    const { resumo, timeline } = resumirCadencia({
      followups: [{ id: 'c', status: 'cancelled', cancelled_reason: 'corretor_assumiu' }],
      now: AGORA,
    });
    expect(timeline[0].respondeu).toBe(false);
    expect(timeline[0].resultado).toBe('cancelado');
    expect(resumo.retornos_espontaneos).toBe(0);
  });

  it('outcome declarado pela LIA vence o derivado', () => {
    const { timeline } = resumirCadencia({
      followups: [enviado({ outcome: 'visita_agendada' })],
      now: AGORA,
    });
    expect(timeline[0].resultado).toBe('visita_agendada');
    expect(timeline[0].respondeu).toBe(true);
  });

  it('status desconhecido não vira cancelado por acidente', () => {
    const { timeline } = resumirCadencia({
      followups: [{ id: 'x', status: 'inventado' }],
      now: AGORA,
    });
    expect(timeline[0].resultado).toBe('desconhecido');
  });
});

describe('resumo — denominadores', () => {
  it('taxa é null quando nada saiu, não 0%', () => {
    const { resumo } = resumirCadencia({
      followups: [{ id: 'p', status: 'pending', scheduled_at: '2026-09-11T10:00:00Z' }],
      now: AGORA,
    });
    expect(resumo.enviadas).toBe(0);
    expect(resumo.taxa_resposta).toBeNull();
    expect(resumo.pendentes).toBe(1);
  });

  it('conta por tentativa só o que saiu', () => {
    const { resumo } = resumirCadencia({
      followups: [
        enviado({ id: '1', attempt_number: 1, sent_at: '2026-09-01T10:00:00Z' }),
        enviado({ id: '2', attempt_number: 2, sent_at: '2026-09-05T10:00:00Z' }),
        { id: '3', status: 'pending', attempt_number: 3, scheduled_at: '2026-09-20T10:00:00Z' },
      ],
      inboundTimes: ['2026-09-05T10:30:00Z'],
      now: AGORA,
    });
    expect(resumo.por_tentativa).toEqual([
      { attempt_number: 1, enviadas: 1, respondidas: 0 },
      { attempt_number: 2, enviadas: 1, respondidas: 1 },
    ]);
    expect(resumo.taxa_resposta).toBe(50);
  });

  it('agrupa por tag ordenando pelas mais usadas', () => {
    const { resumo } = resumirCadencia({
      followups: [
        enviado({ id: '1', tag: 'a', sent_at: '2026-09-01T10:00:00Z' }),
        enviado({ id: '2', tag: 'b', sent_at: '2026-09-02T10:00:00Z' }),
        enviado({ id: '3', tag: 'b', sent_at: '2026-09-03T10:00:00Z' }),
      ],
      now: AGORA,
    });
    expect(resumo.por_tag.map((t) => t.tag)).toEqual(['b', 'a']);
  });

  it('mediana do tempo de resposta usa só quem respondeu', () => {
    const { resumo } = resumirCadencia({
      followups: [
        enviado({ id: '1', sent_at: '2026-09-01T10:00:00Z' }),
        enviado({ id: '2', sent_at: '2026-09-03T10:00:00Z' }),
      ],
      inboundTimes: ['2026-09-01T10:10:00Z', '2026-09-03T10:30:00Z'],
      now: AGORA,
    });
    expect(resumo.tempo_resposta_min).toEqual({ mediana: 20, amostra: 2 });
  });
});

describe('próxima cadência', () => {
  it('escolhe a pendente futura mais próxima', () => {
    const { resumo } = resumirCadencia({
      followups: [
        { id: 'a', status: 'pending', scheduled_at: '2026-09-20T10:00:00Z', attempt_number: 3 },
        { id: 'b', status: 'pending', scheduled_at: '2026-09-11T10:00:00Z', attempt_number: 2 },
      ],
      now: AGORA,
    });
    expect(resumo.proxima).toMatchObject({ attempt_number: 2, atrasada: false });
  });

  it('pendente vencida aparece marcada como atrasada em vez de sumir', () => {
    const { resumo } = resumirCadencia({
      followups: [{ id: 'a', status: 'pending', scheduled_at: '2026-09-01T10:00:00Z' }],
      now: AGORA,
    });
    expect(resumo.proxima).toMatchObject({ atrasada: true });
  });

  it('sem pendente, não há próxima', () => {
    const { resumo } = resumirCadencia({ followups: [enviado()], now: AGORA });
    expect(resumo.proxima).toBeNull();
  });
});

describe('silêncio e ordenação', () => {
  it('dias em silêncio saem da interação mais recente entre todas as fontes', () => {
    const { resumo } = resumirCadencia({
      followups: [enviado({ last_lead_msg_at: '2026-09-01T00:00:00Z' })],
      inboundTimes: ['2026-09-08T12:00:00Z'],
      leadExtra: { last_seen: '2026-09-05T00:00:00Z', interaction_count: 7 },
      now: AGORA,
    });
    expect(resumo.dias_em_silencio).toBe(2);
    expect(resumo.interaction_count).toBe(7);
  });

  it('sem sinal nenhum, silêncio é null e não zero', () => {
    const { resumo } = resumirCadencia({
      followups: [{ id: 'p', status: 'pending', scheduled_at: '2026-09-20T10:00:00Z' }],
      now: AGORA,
    });
    expect(resumo.dias_em_silencio).toBeNull();
    expect(resumo.ultima_interacao_lead).toBeNull();
  });

  it('timeline sai do mais recente para o mais antigo', () => {
    const { timeline } = resumirCadencia({
      followups: [
        enviado({ id: 'velho', sent_at: '2026-09-01T10:00:00Z' }),
        enviado({ id: 'novo', sent_at: '2026-09-08T10:00:00Z' }),
      ],
      now: AGORA,
    });
    expect(timeline.map((t) => t.id)).toEqual(['novo', 'velho']);
  });

  it('data inválida não contamina o resumo com NaN', () => {
    const { resumo } = resumirCadencia({
      followups: [enviado({ sent_at: 'não é data' })],
      inboundTimes: ['tampouco'],
      now: AGORA,
    });
    expect(resumo.dias_em_silencio).toBeNull();
    expect(resumo.total).toBe(1);
  });

  it('lista vazia devolve resumo zerado sem quebrar', () => {
    const { resumo, timeline } = resumirCadencia({ now: AGORA });
    expect(timeline).toEqual([]);
    expect(resumo).toMatchObject({ total: 0, enviadas: 0, taxa_resposta: null, proxima: null });
  });
});

describe('mediana', () => {
  it('ímpar pega o do meio; par arredonda a média', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 5])).toBe(3);
    expect(mediana([])).toBeNull();
  });
});
