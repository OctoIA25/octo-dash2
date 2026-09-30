import { describe, it, expect } from 'vitest';
import { Info, Megaphone } from 'lucide-react';
import { acentoDoAviso, destinoDoLink, detalheDe, duracaoDoAviso, iniciaisDe, rotaDe, rotuloDoLink, tipoDe } from './notificationKinds';

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
  it('comunicado para uma equipe: quem mandou (cargo e equipe) → a equipe', () => {
    expect(rotaDe({
      type: 'comunicado',
      metadata: {
        remetente: { tipo: 'usuario', nome: 'Gil Moraes', cargo: 'Gerência', equipe: 'Equipe Jardins' },
        publico: 'Equipe Jardins', prioridade: 'importante',
        destinatario: { nome: 'Rafaela Nunes', cargo: 'Corretor', equipe: 'Equipe Jardins' },
      },
    })).toEqual({
      origem: { tipo: 'usuario', nome: 'Gil Moraes', papel: 'Gerência', detalhe: 'Gerência da Equipe Jardins', iniciais: 'GM' },
      destino: { nome: 'Equipe Jardins' },
      sobre: undefined,
      importante: true,
    });
  });

  it('aviso do sistema diz qual pessoa recebeu, com cargo e equipe', () => {
    expect(rotaDe({
      type: 'blocked',
      metadata: { destinatario: { nome: 'Rafaela Nunes', cargo: 'Corretor', equipe: 'Equipe Jardins' } },
    })).toEqual({
      origem: { tipo: 'sistema', nome: 'Distribuição' },
      destino: { nome: 'Rafaela Nunes', detalhe: 'Corretor da Equipe Jardins' },
      sobre: undefined,
      importante: false,
    });
  });

  it('"Você" dá lugar ao nome de quem recebeu', () => {
    expect(rotaDe({
      type: 'alerta',
      metadata: { remetente: { tipo: 'lia', nome: 'LIA' }, publico: 'Você', destinatario: { nome: 'Rafaela Nunes', cargo: 'Corretor' } },
    }).destino).toEqual({ nome: 'Rafaela Nunes', detalhe: 'Corretor' });
  });

  it('cópia do gestor: para o gestor, sobre o corretor (com cargo e equipe)', () => {
    const rota = rotaDe({
      type: 'alerta',
      metadata: {
        remetente: { tipo: 'lia', nome: 'LIA' }, publico: 'Você, como gestor', sobre: 'Rafaela Nunes',
        destinatario: { nome: 'Gil Moraes', cargo: 'Gerência', equipe: 'Equipe Jardins' },
        sobre_perfil: { nome: 'Rafaela Nunes', cargo: 'Corretor', equipe: 'Equipe Jardins' },
      },
    });
    expect(rota.origem).toEqual({ tipo: 'lia', nome: 'LIA' });
    expect(rota.destino).toEqual({ nome: 'Gil Moraes', detalhe: 'Gerência da Equipe Jardins' });
    expect(rota.sobre).toEqual({ nome: 'Rafaela Nunes', detalhe: 'Corretor da Equipe Jardins' });
  });

  it('sem retrato (linha antiga): cai no público gravado ou em nada, sem quebrar', () => {
    expect(rotaDe({ type: 'alerta', metadata: { publico: 'Você', sobre: 'Téo B1' } })).toEqual({
      origem: { tipo: 'sistema', nome: 'Alerta' }, destino: { nome: 'Você' }, sobre: { nome: 'Téo B1', detalhe: undefined }, importante: false,
    });
    expect(rotaDe({ type: 'activity_pending', metadata: {} })).toEqual({
      origem: { tipo: 'sistema', nome: 'Agenda' }, destino: undefined, sobre: undefined, importante: false,
    });
    expect(rotaDe({ type: 'info', metadata: null }).origem).toEqual({ tipo: 'sistema', nome: 'Sistema' });
    expect(rotaDe({ type: 'info', metadata: 'lixo' as never }).origem).toEqual({ tipo: 'sistema', nome: 'Sistema' });
  });
});

describe('detalheDe', () => {
  it('cargo e equipe em texto corrido', () => {
    expect(detalheDe({ cargo: 'Corretor', equipe: 'Equipe Jardins' })).toBe('Corretor da Equipe Jardins');
    expect(detalheDe({ cargo: 'Diretoria' })).toBe('Diretoria');
    expect(detalheDe({ equipe: 'Equipe Centro' })).toBe('Equipe Centro');
    expect(detalheDe({ nome: 'Só nome' })).toBeUndefined();
    expect(detalheDe(undefined)).toBeUndefined();
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
