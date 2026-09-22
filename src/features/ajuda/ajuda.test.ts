import { describe, expect, it } from 'vitest';
import { duvidasAbertas, moduloDaRota, nadaEncontrado, previa, separarPorTipo } from './ajuda';
import type { Artigo, Duvida } from './ajudaService';

describe('de que tela veio a dúvida', () => {
  it('acha o módulo pela rota', () => {
    expect(moduloDaRota('/financeiro')).toBe('financeiro');
    expect(moduloDaRota('/reunioes')).toBe('reunioes');
    expect(moduloDaRota('/bolsao')).toBe('leads');
  });

  it('a sub-rota herda a ajuda da tela-mãe', () => {
    expect(moduloDaRota('/financeiro/conciliacao')).toBe('financeiro');
    expect(moduloDaRota('/metricas/cliente-interessado/geral')).toBe('metricas');
  });

  // `/juridico/proposta` é jurídico, não leads — a ordem da lista importa.
  it('a rota mais específica ganha', () => {
    expect(moduloDaRota('/juridico/proposta')).toBe('juridico');
    expect(moduloDaRota('/cargos')).toBe('gestao-equipe');
  });

  it('não confunde prefixo com pedaço de palavra', () => {
    expect(moduloDaRota('/leadsxpto')).toBe('geral');
    expect(moduloDaRota('/imoveisantigos')).toBe('geral');
  });

  it('aguenta rota desconhecida, vazia e nula', () => {
    expect(moduloDaRota('/uma-tela-nova')).toBe('geral');
    expect(moduloDaRota('')).toBe('geral');
    expect(moduloDaRota(null)).toBe('geral');
  });

  it('não se importa com a caixa', () => {
    expect(moduloDaRota('/Financeiro')).toBe('financeiro');
  });
});

describe('quando a busca não acha', () => {
  // "Nenhum resultado" é um beco sem saída. A ajuda tem uma saída: perguntar.
  it('oferece perguntar, em vez de só dizer que não achou', () => {
    expect(nadaEncontrado('bolsão')).toMatch(/Nada encontrado para “bolsão”.*Pergunte/);
  });

  it('sem termo, fala da tela e não da busca', () => {
    expect(nadaEncontrado('  ')).toMatch(/nada escrito para esta tela.*Pergunte/);
  });
});

describe('separar manual de FAQ', () => {
  const a = (tipo: Artigo['tipo'], titulo: string): Artigo =>
    ({ id: titulo, tipo, modulo: 'geral', titulo, texto: '', da_plataforma: false });

  it('mantém a ordem que a busca devolveu', () => {
    const r = separarPorTipo([a('faq', 'f1'), a('manual', 'm1'), a('faq', 'f2')]);
    expect(r.manual.map((x) => x.titulo)).toEqual(['m1']);
    expect(r.faq.map((x) => x.titulo)).toEqual(['f1', 'f2']);
  });

  it('aguenta nulo', () => {
    expect(separarPorTipo(null)).toEqual({ manual: [], faq: [] });
  });
});

describe('quantas dúvidas esperam alguém', () => {
  const d = (status: Duvida['status']): Duvida => ({
    id: status, pergunta: '', modulo: 'geral', perguntou_em: '', resposta: '',
    respondeu_em: null, status,
  });

  it('conta só as abertas — respondida e publicada já têm dono', () => {
    expect(duvidasAbertas([d('aberta'), d('respondida'), d('publicada'), d('aberta')])).toBe(2);
  });

  it('aguenta nulo', () => {
    expect(duvidasAbertas(null)).toBe(0);
  });
});

describe('a prévia do texto', () => {
  it('não corta no meio da palavra', () => {
    const t = 'conta corrente do corretor com movimentação mensal e saldo acumulado ao longo do tempo';
    const p = previa(t, 20);
    expect(p.endsWith('…')).toBe(true);
    expect(p).not.toMatch(/corre…$/);
    expect(t).toContain(p.replace('…', ''));
  });

  it('devolve inteiro quando cabe', () => {
    expect(previa('curto', 160)).toBe('curto');
  });

  it('junta espaços e quebras de linha', () => {
    expect(previa('uma\n\n  frase   quebrada')).toBe('uma frase quebrada');
  });

  it('aguenta nulo e vazio', () => {
    expect(previa(null)).toBe('');
    expect(previa('')).toBe('');
  });
});
