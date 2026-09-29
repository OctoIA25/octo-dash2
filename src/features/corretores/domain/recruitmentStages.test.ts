import { describe, it, expect } from 'vitest';
import {
  contarEtapas, nivelAlcancado, ESTAGIO_POR_LABEL, EVENTO_PARA_ESTAGIO,
  podeMover, COR_ESTAGIO, classeDoStatus, ESTAGIOS, rotuloDoEvento,
} from './recruitmentStages';

describe('estágios do recrutamento', () => {
  it('conta cumulativo: quem está no Onboard não some das etapas anteriores', () => {
    // O caso do print: uma pessoa operando e ninguém parado no meio.
    expect(contarEtapas([{ estagio: 'onboard' }])).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('mostra a queda entre as etapas', () => {
    const candidatos = [
      { estagio: 'lead' }, { estagio: 'lead' },
      { estagio: 'interacao' },
      { estagio: 'reuniao_realizada' },
      { estagio: 'onboard' },
    ];
    //            lead int qual reun matr onb
    expect(contarEtapas(candidatos)).toEqual([5, 3, 2, 2, 1, 1]);
  });

  it('perdido conta só como entrada — o estágio não guarda onde parou', () => {
    expect(contarEtapas([{ estagio: 'perdido' }])).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('estágio desconhecido ou ausente não quebra a contagem', () => {
    expect(nivelAlcancado(undefined)).toBe(0);
    expect(contarEtapas([{ estagio: 'vai_saber' }, {}])).toEqual([2, 0, 0, 0, 0, 0]);
  });

  it('label e id são reversíveis', () => {
    expect(ESTAGIO_POR_LABEL['Reunião realizada']).toBe('reuniao_realizada');
    expect(ESTAGIO_POR_LABEL['Perdido']).toBe('perdido');
  });

  it('não existe evento que devolva alguém para Lead', () => {
    expect(EVENTO_PARA_ESTAGIO.lead).toBeNull();
    expect(EVENTO_PARA_ESTAGIO.onboard).toEqual({ tipo: 'marco_ativacao', payload: { marco: 'primeiro_plantao' } });
  });
});

describe('podeMover — a regra do arrastar no Kanban (29/09: para trás também vai)', () => {
  it('mesma etapa: não move e não avisa', () => {
    expect(podeMover('lead', 'lead')).toEqual({ ok: false, motivo: null });
    expect(podeMover('perdido', 'perdido')).toEqual({ ok: false, motivo: null });
  });

  it('para frente avança, mesmo pulando etapas', () => {
    expect(podeMover('lead', 'interacao')).toEqual({ ok: true, sentido: 'avanca' });
    expect(podeMover('lead', 'matricula')).toEqual({ ok: true, sentido: 'avanca' });
  });

  it('para trás volta — inclusive para Lead', () => {
    expect(podeMover('qualificado', 'interacao')).toEqual({ ok: true, sentido: 'volta' });
    expect(podeMover('interacao', 'lead')).toEqual({ ok: true, sentido: 'volta' });
    expect(podeMover('onboard', 'matricula')).toEqual({ ok: true, sentido: 'volta' });
  });

  it('sair de Perdido reabre, para qualquer etapa do funil', () => {
    expect(podeMover('perdido', 'lead')).toEqual({ ok: true, sentido: 'reabre' });
    expect(podeMover('perdido', 'onboard')).toEqual({ ok: true, sentido: 'reabre' });
  });

  it('entrar em Perdido encerra, de qualquer etapa', () => {
    expect(podeMover('lead', 'perdido')).toEqual({ ok: true, sentido: 'encerra' });
    expect(podeMover('onboard', 'perdido')).toEqual({ ok: true, sentido: 'encerra' });
  });
});

describe('rotuloDoEvento — a timeline diz para onde voltou', () => {
  it('evento comum usa o mapa fixo', () => {
    expect(rotuloDoEvento('reuniao_realizada')).toBe('Reunião realizada');
    expect(rotuloDoEvento('sei_la')).toBe('sei_la');
  });
  it('estagio_retrocedido lê payload.para', () => {
    expect(rotuloDoEvento('estagio_retrocedido', { para: 'qualificado' })).toBe('Voltou para Qualificado');
    expect(rotuloDoEvento('estagio_retrocedido', { para: 'lead', de: 'perdido' })).toBe('Voltou para Lead');
  });
  it('sem payload não quebra', () => {
    expect(rotuloDoEvento('estagio_retrocedido')).toBe('Voltou de etapa');
  });
});

describe('cores das etapas — uma fonte só para badge e coluna', () => {
  it('toda etapa (e perdido) tem cor de coluna', () => {
    for (const e of ESTAGIOS) expect(COR_ESTAGIO[e.id]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(COR_ESTAGIO.perdido).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('classe do badge continua vindo pelo label, com fallback cinza', () => {
    expect(classeDoStatus('Lead')).toContain('#88C0E5');
    expect(classeDoStatus('Perdido')).toContain('red');
    expect(classeDoStatus('sei lá')).toContain('gray');
  });
});
