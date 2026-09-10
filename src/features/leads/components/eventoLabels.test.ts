import { describe, it, expect } from 'vitest';
import { descreverEvento, rotuloDoAtor } from './eventoLabels';
import type { EventoLead } from '../services/historicoLeadService';

const ev = (over: Partial<EventoLead> = {}): EventoLead => ({
  id: 'e1',
  tipo: 'lead.created',
  descricao: null,
  de: null,
  para: null,
  ator: { tipo: 'sistema', nome: null, user_id: null },
  metadata: {},
  quando: '2026-09-01T10:00:00Z',
  derivado: false,
  ...over,
});

describe('descreverEvento', () => {
  it('descreve os eventos da dash em português de gente', () => {
    expect(descreverEvento(ev({ tipo: 'lead.created', para: 'ZAP' }))).toMatchObject({
      titulo: 'Lead criado',
      detalhe: 'via ZAP',
    });
    expect(descreverEvento(ev({ tipo: 'lead.assigned', para: 'João', de: 'Maria' }))).toMatchObject({
      titulo: 'Entregue para João',
      detalhe: 'antes com Maria',
    });
    expect(
      descreverEvento(ev({ tipo: 'lead.stage_changed', de: 'Novos Leads', para: 'Interação' })),
    ).toMatchObject({ titulo: 'Etapa: Interação' });
  });

  it('nunca esconde tipo desconhecido — humaniza', () => {
    // O app da LIA cria tipo novo sem avisar; sumir com a linha é pior.
    expect(descreverEvento(ev({ tipo: 'lia.contato_realizado' })).titulo).toBe('Contato realizado');
    expect(descreverEvento(ev({ tipo: 'tipo_que_ninguem_previu' })).titulo).toBe(
      'Tipo que ninguem previu',
    );
  });

  it('a descrição enviada pela LIA vence o rótulo genérico', () => {
    const d = descreverEvento(
      ev({ tipo: 'lia.contato_realizado', descricao: 'Primeiro contato por WhatsApp', metadata: { etapa: '1' } }),
    );
    expect(d).toMatchObject({ titulo: 'Primeiro contato por WhatsApp', detalhe: 'etapa 1' });
  });

  it('mostra a origem da classificação, que é o que separa LIA de dashboard', () => {
    expect(
      descreverEvento(ev({ tipo: 'lead.classified', para: 'lancamento', metadata: { origem: 'lia' } })),
    ).toMatchObject({ titulo: 'Classificado como lancamento', detalhe: 'por lia' });
  });

  it('todo evento tem cor de ponto, inclusive o desconhecido', () => {
    expect(descreverEvento(ev({ tipo: 'qualquer.coisa' })).dot).toBeTruthy();
  });
});

describe('rotuloDoAtor', () => {
  it('traduz a ausência de auth.uid() para "Sistema"', () => {
    expect(rotuloDoAtor({ tipo: 'sistema', nome: null, user_id: null })).toBe('Sistema');
    expect(rotuloDoAtor({ tipo: 'lia', nome: null, user_id: null })).toBe('LIA');
    expect(rotuloDoAtor({ tipo: 'usuario', nome: 'Ana', user_id: 'u1' })).toBe('Ana');
  });
});
