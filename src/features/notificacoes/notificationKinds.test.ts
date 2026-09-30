import { describe, it, expect } from 'vitest';
import { Info, Megaphone } from 'lucide-react';
import { acentoDoAviso, destinoDoLink, duracaoDoAviso, iniciaisDe, rotaDe, rotuloDoLink, tipoDe } from './notificationKinds';

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

describe('rotaDe', () => {
  it('comunicado de uma pessoa: nome, cargo, iniciais e para quem foi', () => {
    expect(rotaDe({
      type: 'comunicado',
      metadata: { remetente: { tipo: 'usuario', nome: 'Ana Souza', cargo: 'Diretoria' }, publico: 'Equipe Prontos', prioridade: 'importante' },
    })).toEqual({
      origem: { tipo: 'usuario', nome: 'Ana Souza', papel: 'Diretoria', iniciais: 'AS' },
      destino: 'Equipe Prontos',
      importante: true,
    });
  });

  it('alerta da LIA com cópia ao gestor diz de quem é o problema', () => {
    expect(rotaDe({
      type: 'alerta',
      metadata: { remetente: { tipo: 'lia', nome: 'LIA' }, publico: 'Você, como gestor', sobre: 'João Silva' },
    })).toEqual({ origem: { tipo: 'lia', nome: 'LIA' }, destino: 'Você, como gestor de João Silva', importante: false });
  });

  it('cópia do cron (sem publico) também diz de quem é', () => {
    expect(rotaDe({ type: 'blocked', metadata: { sobre: 'Téo B1', copia_gestor: true } as never }).destino)
      .toBe('Você, como gestor de Téo B1');
  });

  it('as notificações antigas (metadata vazio, nulo ou não-objeto) mostram a origem do tipo', () => {
    expect(rotaDe({ type: 'activity_pending', metadata: {} })).toEqual({
      origem: { tipo: 'sistema', nome: 'Agenda' }, destino: undefined, importante: false,
    });
    expect(rotaDe({ type: 'info', metadata: null }).origem).toEqual({ tipo: 'sistema', nome: 'Sistema' });
    expect(rotaDe({ type: 'info', metadata: 'lixo' as never }).origem).toEqual({ tipo: 'sistema', nome: 'Sistema' });
  });
});

describe('iniciaisDe', () => {
  it('primeira e última palavra', () => {
    expect(iniciaisDe('Gil Gerente')).toBe('GG');
    expect(iniciaisDe('  maria da silva ')).toBe('MS');
    expect(iniciaisDe('Ana')).toBe('A');
    expect(iniciaisDe('dono@octo.dev')).toBe('D');
    expect(iniciaisDe('   ')).toBe('?');
  });
});

describe('acentoDoAviso', () => {
  it('faixa só onde há urgência', () => {
    expect(acentoDoAviso({ type: 'blocked', metadata: {} })).toBe('bg-rose-500');
    expect(acentoDoAviso({ type: 'activity_pending', metadata: {} })).toBe('bg-amber-500');
    expect(acentoDoAviso({ type: 'comunicado', metadata: { prioridade: 'importante' } })).toBe('bg-amber-500');
    expect(acentoDoAviso({ type: 'comunicado', metadata: {} })).toBeNull();
    expect(acentoDoAviso({ type: 'info', metadata: {} })).toBeNull();
  });
});

describe('rotuloDoLink', () => {
  it('o botão diz o que acontece', () => {
    expect(rotuloDoLink('lead')).toBe('Abrir lead');
    expect(rotuloDoLink('agenda_event')).toBe('Ver atividades');
    expect(rotuloDoLink('mkt_demanda')).toBe('Ver demanda');
    expect(rotuloDoLink('portal')).toBe('Abrir');
    expect(rotuloDoLink('toString')).toBe('Abrir');
    expect(rotuloDoLink(undefined)).toBe('Abrir');
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
