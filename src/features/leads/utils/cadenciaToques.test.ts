import { describe, it, expect } from 'vitest';
import { montarQuadrados, proximoToque, nomeCurto, TOTAL_QUADRADOS } from './cadenciaToques';
import type { ToqueCorretor } from '../services/toquesService';
import type { CadenciaEvento } from '../services/cadenciaService';

const lia = (over: Partial<CadenciaEvento>): CadenciaEvento => ({
  id: 'l1', tag: null, attempt_number: 1, channel: null, status: 'sent', resultado: 'sem_resposta',
  respondeu: false, scheduled_at: null, sent_at: null, respondido_em: null, tempo_ate_resposta_min: null,
  motivo: null, cancelled_reason: null, template_name: null, ...over,
});

const toque = (over: Partial<ToqueCorretor>): ToqueCorretor => ({
  id: 't1', canal: 'ligacao', resultado: 'nao_respondeu', observacao: null, proximo_toque_em: null,
  executado_em: '2026-09-10T10:00:00Z', executado_por: 'u1', executado_por_nome: 'Ana Souza', ...over,
});

describe('montarQuadrados', () => {
  it('intercala LIA e corretor pela data e numera a partir de 1', () => {
    const q = montarQuadrados(
      [toque({ id: 't1', executado_em: '2026-09-11T10:00:00Z' })],
      [
        // A timeline da LIA chega do mais recente para o mais antigo.
        lia({ id: 'l2', sent_at: '2026-09-12T10:00:00Z' }),
        lia({ id: 'l1', sent_at: '2026-09-10T10:00:00Z' }),
      ],
    );
    expect(q.map((x) => [x.numero, x.chave])).toEqual([[1, 'lia:l1'], [2, 'corretor:t1'], [3, 'lia:l2']]);
  });

  it('LIA só ocupa quadrado quando a mensagem saiu', () => {
    const q = montarQuadrados([], [
      lia({ id: 'agendada', status: 'pending', scheduled_at: '2026-09-10T10:00:00Z' }),
      lia({ id: 'cancelada', status: 'cancelled', cancelled_reason: 'lead_returned', scheduled_at: '2026-09-10T11:00:00Z' }),
      lia({ id: 'expirada', status: 'expired', scheduled_at: '2026-09-10T12:00:00Z' }),
      lia({ id: 'enviada', status: 'sent', sent_at: '2026-09-10T13:00:00Z' }),
    ]);
    expect(q.map((x) => x.chave)).toEqual(['lia:enviada']);
  });

  it('traduz o resultado da LIA para o vocabulário dos quadrados', () => {
    const q = montarQuadrados([], [
      lia({ id: 'a', sent_at: '2026-09-10T10:00:00Z', respondeu: true, resultado: 'respondido' }),
      lia({ id: 'b', sent_at: '2026-09-10T11:00:00Z', respondeu: false, resultado: 'sem_resposta' }),
      lia({ id: 'c', sent_at: '2026-09-10T12:00:00Z', respondeu: false, resultado: 'opt_out' }),
    ]);
    expect(q.map((x) => x.resultado)).toEqual(['respondeu', 'nao_respondeu', 'nao_contatar']);
  });

  it('toque da LIA sem canal declarado é WhatsApp e aparece como LIA', () => {
    const [q] = montarQuadrados([], [lia({ sent_at: '2026-09-10T10:00:00Z' })]);
    expect(q).toMatchObject({ origem: 'lia', canal: 'whatsapp', quem: 'LIA' });
  });

  it('não corta nada: o 11º toque continua na lista (a tela mostra "+N")', () => {
    const muitos = Array.from({ length: TOTAL_QUADRADOS + 1 }, (_, i) =>
      toque({ id: `t${i}`, executado_em: new Date(Date.UTC(2026, 8, 1 + i)).toISOString() }));
    expect(montarQuadrados(muitos, undefined)).toHaveLength(11);
  });
});

describe('proximoToque', () => {
  it('vale o que o ÚLTIMO toque do corretor definiu — inclusive "sem próximo"', () => {
    const q = montarQuadrados(
      [
        toque({ id: 't1', executado_em: '2026-09-10T10:00:00Z', proximo_toque_em: '2026-09-11T12:00:00Z' }),
        toque({ id: 't2', executado_em: '2026-09-11T10:00:00Z', proximo_toque_em: null }),
      ],
      [],
    );
    expect(proximoToque(q)).toBeNull();
  });

  it('toque da LIA depois não apaga o próximo toque do corretor', () => {
    const q = montarQuadrados(
      [toque({ executado_em: '2026-09-10T10:00:00Z', proximo_toque_em: '2026-09-12T12:00:00Z' })],
      [lia({ sent_at: '2026-09-11T10:00:00Z' })],
    );
    expect(proximoToque(q)).toBe('2026-09-12T12:00:00Z');
  });
});

describe('nomeCurto', () => {
  it('primeiro nome, ou a parte antes do @, nunca vazio', () => {
    expect(nomeCurto('Ana Paula Souza')).toBe('Ana');
    expect(nomeCurto('rogerio.lima@imob.com')).toBe('rogerio.lima');
    expect(nomeCurto(null)).toBe('—');
  });
});
