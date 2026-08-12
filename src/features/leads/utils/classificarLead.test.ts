import { describe, expect, it } from 'vitest';
import {
  atuacoesDe,
  classificarLead,
  filtrarPorAtuacao,
  normalizar,
  opcoesFiltroBolsao,
  type LinhaClassificavel,
} from './classificarLead';

describe('classificarLead — Santa Ângela é integração só de lançamentos', () => {
  it('classifica como lancamento com código de empreendimento', () => {
    expect(classificarLead('RESERVA CASTANHEIRA', 'Santa Angela')).toBe('lancamento');
  });

  it('classifica como lancamento MESMO SEM código — 111 leads reais estão assim', () => {
    expect(classificarLead(null, 'Santa Angela')).toBe('lancamento');
    expect(classificarLead('', 'Santa Angela')).toBe('lancamento');
  });

  it('classifica como lancamento mesmo com lixo no campo de código', () => {
    // CPF vazado no campo, caso real da era pré-fix de 05/ago
    expect(classificarLead('32328077803', 'Santa Angela')).toBe('lancamento');
  });

  it('reconhece o portal ignorando caixa, acento e espaço', () => {
    expect(classificarLead(null, 'santa angela')).toBe('lancamento');
    expect(classificarLead(null, 'Santa Ângela')).toBe('lancamento');
    expect(classificarLead(null, '  SANTA   ANGELA ')).toBe('lancamento');
  });

  it('não casa por prefixo — outro portal que apenas comece igual não entra', () => {
    expect(classificarLead('AP001', 'Santa Angela Locação')).not.toBe('lancamento');
  });
});

describe('classificarLead — ZAP/OLX têm código opaco', () => {
  it.each([
    ['S1KUFJ', 'ZAP Imóveis'],
    ['22AUFJ', 'Grupo OLX'],
    ['I0J1GD', 'zapimoveis_webhook'],
  ])('%s de %s vira indefinido', (codigo, portal) => {
    expect(classificarLead(codigo, portal)).toBe('indefinido');
  });
});

describe('classificarLead — catálogo próprio', () => {
  it.each([
    ['AP001', 'Manual'],
    ['CA1045', 'Kenlo'],
    ['AP1234', 'Site Imobiliária Japi'],
  ])('%s de %s vira pronto', (codigo, portal) => {
    expect(classificarLead(codigo, portal)).toBe('pronto');
  });
});

describe('classificarLead — sem código', () => {
  it.each([null, undefined, '', '   '])('%p de portal comum vira indefinido', (codigo) => {
    expect(classificarLead(codigo, 'Lia (Japi Lançamentos)')).toBe('indefinido');
  });

  it('sem código e sem portal vira indefinido', () => {
    expect(classificarLead(null, null)).toBe('indefinido');
  });

  it('portal desconhecido sem código não vira pronto', () => {
    expect(classificarLead(null, 'Portal Novo')).toBe('indefinido');
  });
});

describe('filtrarPorAtuacao', () => {
  const LINHAS: LinhaClassificavel[] = [
    { codigo: 'RESERVA CASTANHEIRA', portal: 'Santa Angela' },   // lancamento
    { codigo: null, portal: 'Santa Angela' },                    // lancamento (sem código)
    { codigo: 'AP001', portal: 'Manual' },                       // pronto
    { codigo: 'S1KUFJ', portal: 'ZAP Imóveis' },                 // indefinido
    { codigo: null, portal: 'Lia (Japi Lançamentos)' },          // indefinido
  ];

  it('corretor só de lançamentos não vê pronto', () => {
    const r = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['lancamentos'] });
    expect(r).toHaveLength(4);
    expect(r.some((l) => l.codigo === 'AP001')).toBe(false);
  });

  it('corretor de prontos não vê lancamento — inclusive o Santa Ângela sem código', () => {
    const r = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['prontos'] });
    expect(r).toHaveLength(3);
    expect(r.some((l) => l.portal === 'Santa Angela')).toBe(false);
  });

  it('só alugados vê o mesmo que prontos — lead de aluguel ainda não é classificável', () => {
    const alugados = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['alugados'] });
    const prontos = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['prontos'] });
    expect(alugados).toEqual(prontos);
  });

  it('combinação lançamentos+alugados vê tudo que não é... nada: vê tudo', () => {
    // 'alugados' cobre o lado pronto (sem sinal de aluguel ainda) e
    // 'lancamentos' cobre o lado lançamento.
    const r = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['lancamentos', 'alugados'] });
    expect(r).toHaveLength(LINHAS.length);
  });

  it('todas as atuações marcadas não filtra nada', () => {
    expect(
      filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['lancamentos', 'prontos', 'alugados'] }),
    ).toHaveLength(LINHAS.length);
  });

  it('inativo (admin/owner/team_leader) não filtra nada, mesmo com atuação marcada', () => {
    expect(filtrarPorAtuacao(LINHAS, { ativo: false, atuacoes: ['lancamentos'] })).toHaveLength(LINHAS.length);
  });

  it('indefinido aparece para os dois lados', () => {
    const lanc = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['lancamentos'] });
    const pron = filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['prontos'] });
    expect(lanc.some((l) => l.codigo === 'S1KUFJ')).toBe(true);
    expect(pron.some((l) => l.codigo === 'S1KUFJ')).toBe(true);
  });

  it('não muta a lista recebida', () => {
    const original = [...LINHAS];
    filtrarPorAtuacao(LINHAS, { ativo: true, atuacoes: ['lancamentos'] });
    expect(LINHAS).toEqual(original);
  });
});

describe('atuacoesDe', () => {
  it('aceita o formato novo (array), na ordem canônica e sem lixo', () => {
    expect(atuacoesDe({ atuacao: ['alugados'] })).toEqual(['alugados']);
    expect(atuacoesDe({ atuacao: ['prontos', 'lancamentos'] })).toEqual(['lancamentos', 'prontos']);
    expect(atuacoesDe({ atuacao: ['lancamentos', 'zzz'] })).toEqual(['lancamentos']);
  });

  it('legado string: lancamentos restringe; prontos era "tudo menos lançamento"', () => {
    expect(atuacoesDe({ atuacao: 'lancamentos' })).toEqual(['lancamentos']);
    expect(atuacoesDe({ atuacao: 'prontos' })).toEqual(['prontos', 'alugados']);
  });

  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['objeto vazio', {}],
    ['legado ambos', { atuacao: 'ambos' }],
    ['valor desconhecido', { atuacao: 'lancamento' }],
    ['string vazia', { atuacao: '' }],
    ['não-string', { atuacao: 42 }],
    ['array vazio', { atuacao: [] }],
    ['array só de lixo', { atuacao: ['x', 'y'] }],
  ])('%s vira todas as atuações', (_nome, permissions) => {
    expect(atuacoesDe(permissions as Record<string, unknown> | null | undefined))
      .toEqual(['lancamentos', 'prontos', 'alugados']);
  });
});

describe('opcoesFiltroBolsao — quem é filtrado', () => {
  const TODAS = ['lancamentos', 'prontos', 'alugados'];

  it.each([
    ['admin/owner/team_leader com lançamentos', { atuacao: ['lancamentos'] }],
    ['admin/owner/team_leader com prontos', { atuacao: 'prontos' }],
    ['admin/owner/team_leader sem atuação', undefined],
  ])('%s nunca é filtrado', (_nome, permissions) => {
    const r = opcoesFiltroBolsao({ isCorretor: false, permissions });
    expect(r.ativo).toBe(false);
  });

  it.each([
    ['todas marcadas', { atuacao: TODAS }],
    ['ausente', undefined],
    ['nulo', null],
    ['legado ambos', { atuacao: 'ambos' }],
    ['valor inválido', { atuacao: 'lancamento' }],
    ['array vazio', { atuacao: [] }],
    ['array só de lixo', { atuacao: ['x'] }],
  ])('corretor com %s não é filtrado (atende tudo)', (_nome, permissions) => {
    const r = opcoesFiltroBolsao({ isCorretor: true, permissions });
    expect(r.ativo).toBe(false);
    expect(r.atuacoes).toEqual(TODAS);
  });

  it('corretor só de lançamentos é filtrado, com a atuação certa', () => {
    expect(opcoesFiltroBolsao({ isCorretor: true, permissions: { atuacao: ['lancamentos'] } }))
      .toEqual({ ativo: true, atuacoes: ['lancamentos'] });
  });

  it('corretor só de prontos é filtrado, com a atuação certa', () => {
    expect(opcoesFiltroBolsao({ isCorretor: true, permissions: { atuacao: ['prontos'] } }))
      .toEqual({ ativo: true, atuacoes: ['prontos'] });
  });

  it('legado string "prontos" expande para prontos+alugados e continua filtrando', () => {
    expect(opcoesFiltroBolsao({ isCorretor: true, permissions: { atuacao: 'prontos' } }))
      .toEqual({ ativo: true, atuacoes: ['prontos', 'alugados'] });
  });

  it('combinação parcial (lançamentos+prontos) ainda filtra', () => {
    const r = opcoesFiltroBolsao({ isCorretor: true, permissions: { atuacao: ['lancamentos', 'prontos'] } });
    expect(r.ativo).toBe(true);
  });

  it('ligado ao filtro: corretor de prontos não vê Santa Ângela; admin vê', () => {
    const linhas: LinhaClassificavel[] = [
      { codigo: null, portal: 'Santa Angela' },
      { codigo: 'AP001', portal: 'Manual' },
    ];
    const permissions = { atuacao: ['prontos'] };

    const doCorretor = filtrarPorAtuacao(linhas, opcoesFiltroBolsao({ isCorretor: true, permissions }));
    const doAdmin = filtrarPorAtuacao(linhas, opcoesFiltroBolsao({ isCorretor: false, permissions }));

    expect(doCorretor).toHaveLength(1);
    expect(doAdmin).toHaveLength(2);
  });
});

describe('normalizar', () => {
  it('minúsculas, sem acento, espaços colapsados', () => {
    expect(normalizar('  Anhangabaú   DESIGN ')).toBe('anhangabau design');
  });

  it.each([null, undefined])('%p vira string vazia', (v) => {
    expect(normalizar(v)).toBe('');
  });
});
