import { describe, it, expect } from 'vitest';
import { Info, Megaphone } from 'lucide-react';
import { destinoDoLink, duracaoDoAviso, etiquetasDe, tipoDe } from './notificationKinds';

describe('tipoDe', () => {
  it('cada tipo conhecido cai na aba certa', () => {
    expect(tipoDe('comunicado')).toMatchObject({ categoria: 'comunicado', icone: Megaphone, tom: 'azul' });
    expect(tipoDe('alerta').categoria).toBe('alerta');
    expect(tipoDe('activity_pending')).toMatchObject({ categoria: 'alerta', origem: 'Agenda' });
    expect(tipoDe('blocked')).toMatchObject({ categoria: 'alerta', tom: 'rosa' });
    expect(tipoDe('cadencia_toque')).toMatchObject({ categoria: 'alerta', origem: 'Cadência' });
  });

  it('info, warning, desconhecido e vazio caem em Sistema', () => {
    for (const t of ['info', 'warning', 'qualquer', undefined, '']) {
      expect(tipoDe(t)).toMatchObject({ categoria: 'sistema', icone: Info, origem: 'Sistema' });
    }
  });

  it('nome de propriedade do Object não vira tipo', () => {
    for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(tipoDe(t).categoria).toBe('sistema');
    }
  });
});

describe('etiquetasDe', () => {
  it('comunicado: cargo · nome, público e Importante', () => {
    expect(etiquetasDe({
      type: 'comunicado',
      metadata: { remetente: { tipo: 'usuario', nome: 'Ana Souza', cargo: 'Diretoria' }, publico: 'Equipe Prontos', prioridade: 'importante' },
    })).toEqual([
      { texto: 'Diretoria · Ana Souza' },
      { texto: 'Para: Equipe Prontos' },
      { texto: 'Importante', destaque: true },
    ]);
  });

  it('cópia do gestor mostra sobre quem é', () => {
    expect(etiquetasDe({
      type: 'alerta',
      metadata: { remetente: { tipo: 'lia', nome: 'LIA' }, publico: 'Você, como gestor', sobre: 'João Silva' },
    })).toEqual([{ texto: 'LIA' }, { texto: 'Para: Você, como gestor' }, { texto: 'Sobre: João Silva' }]);
  });

  it('as notificações antigas (metadata vazio ou nulo) ganham a origem do tipo', () => {
    expect(etiquetasDe({ type: 'activity_pending', metadata: {} })).toEqual([{ texto: 'Agenda' }]);
    expect(etiquetasDe({ type: 'info', metadata: null as never })).toEqual([{ texto: 'Sistema' }]);
  });
});

describe('duracaoDoAviso', () => {
  it('cadência 60 s; alerta e importante 10 s; o resto 6 s', () => {
    expect(duracaoDoAviso({ type: 'cadencia_toque', metadata: {} })).toBe(60_000);
    expect(duracaoDoAviso({ type: 'blocked', metadata: {} })).toBe(10_000);
    expect(duracaoDoAviso({ type: 'comunicado', metadata: { prioridade: 'importante' } })).toBe(10_000);
    expect(duracaoDoAviso({ type: 'comunicado', metadata: {} })).toBe(6_000);
    expect(duracaoDoAviso({ type: 'info', metadata: {} })).toBe(6_000);
  });
});

describe('destinoDoLink', () => {
  it('lead abre na própria página de notificações (a rota /lead/:id não usa o UUID)', () => {
    expect(destinoDoLink('lead', '8f0c2b1e-1111-4222-8333-444455556666'))
      .toBe('/notificacoes?lead=8f0c2b1e-1111-4222-8333-444455556666');
    expect(destinoDoLink('lead', 'a b&c')).toBe('/notificacoes?lead=a%20b%26c');
  });

  it('cada tipo com tela certa', () => {
    expect(destinoDoLink('mkt_demanda', 'x')).toBe('/marketing/demandas');
    expect(destinoDoLink('recrutamento', 'x')).toBe('/recrutamento');
    expect(destinoDoLink('bolsao', 'x')).toBe('/bolsao');
    expect(destinoDoLink('imovel', 'x')).toBe('/imoveis');
    expect(destinoDoLink('condominio', 'x')).toBe('/imoveis');
    expect(destinoDoLink('agenda_event', 'x')).toBe('/atividades');
  });

  it('sem tipo, sem id, tipo desconhecido ou nome do Object: não clicável', () => {
    expect(destinoDoLink(undefined, 'x')).toBeNull();
    expect(destinoDoLink('lead', undefined)).toBeNull();
    expect(destinoDoLink('portal', 'x')).toBeNull();
    expect(destinoDoLink('toString', 'x')).toBeNull();
    expect(destinoDoLink('constructor', 'x')).toBeNull();
  });
});
