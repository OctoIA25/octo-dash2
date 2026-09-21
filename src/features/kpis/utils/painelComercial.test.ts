/**
 * Painel comercial (P3.1) — leitura dos contadores.
 *
 * Os números dos casos são os da Lotus, medidos em 21/09/2026: 37 vendas,
 * R$ 14,46 M de VGV, R$ 737 mil de VGC, e **8 vendas com comissão e nenhum
 * VGV** — que é o que faz o ticket médio mentir se ninguém avisar.
 */

import { describe, it, expect } from 'vitest';
import {
  avisoDeClassificacao, avisoDeVgv, contraMeta, percentual, produtividade, reais, variacao,
  type PeriodoComercial,
} from './painelComercial';

const periodo = (over: Partial<PeriodoComercial> = {}): PeriodoComercial => ({
  vendas: 37,
  vgv: 14457184,
  vgc: 737413,
  vendas_com_vgv: 29,
  vendas_sem_vgv: 8,
  ticket_medio: 498524,
  pct_comissao: 4.57,
  nomes_que_venderam: 14,
  nomes_reconhecidos: 3,
  sem_classificacao: 1,
  ...over,
});

describe('reais', () => {
  it('encurta na ordem de grandeza certa', () => {
    expect(reais(14457184)).toBe('R$ 14,5 M');
    expect(reais(737413)).toBe('R$ 737 mil');
    expect(reais(1234)).toBe('R$ 1.234');
  });

  it('ausente é travessão, zero é zero', () => {
    expect(reais(null)).toBe('—');
    expect(reais(0)).toBe('R$ 0');
  });
});

describe('percentual', () => {
  it('formata e admite ausência', () => {
    expect(percentual(4.57, 2)).toBe('4,57%');
    expect(percentual(null)).toBe('—');
  });
});

describe('variacao', () => {
  it('compara com o período anterior', () => {
    expect(variacao(37, 30)).toMatchObject({ direcao: 'subiu', texto: '+23,3%' });
    expect(variacao(30, 37)).toMatchObject({ direcao: 'caiu' });
    expect(variacao(37, 37)).toMatchObject({ direcao: 'igual', texto: 'igual' });
  });

  /**
   * Sair de zero não é crescimento percentual — é novidade. "+100%" ou "+∞"
   * seriam os dois errados, e o segundo quebra a tela.
   */
  it('base zero não vira porcentagem inventada', () => {
    const v = variacao(5, 0);
    expect(v.pct).toBeNull();
    expect(v.texto).toBe('não havia base');
    expect(variacao(0, 0).texto).toBe('igual (zero nos dois)');
  });

  it('sem base não compara', () => {
    expect(variacao(10, null).direcao).toBe('sem_base');
  });
});

describe('contraMeta', () => {
  /** A tabela de metas está vazia na plataforma inteira (medido em 21/09). */
  it('sem meta cadastrada é estado próprio, não 0%', () => {
    const c = contraMeta(37, null);
    expect(c.semMeta).toBe(true);
    expect(c.pct).toBeNull();
    expect(c.texto).toBe('meta não cadastrada');
  });

  it('meta zero ou negativa também não vale', () => {
    expect(contraMeta(37, 0).semMeta).toBe(true);
    expect(contraMeta(37, -5).semMeta).toBe(true);
  });

  it('com meta, diz o quanto já foi', () => {
    expect(contraMeta(37, 50)).toMatchObject({ pct: 74, semMeta: false });
  });
});

describe('produtividade', () => {
  /**
   * O estado real em 21/09: 14 nomes venderam, 3 batem com membro. Dividir 14
   * por 19 daria 74% — redondo, e falso: os 14 não são 14 pessoas.
   */
  it('com nome não reconhecido, NÃO inventa porcentagem', () => {
    const p = produtividade(14, 3, 19);
    expect(p.pct).toBeNull();
    expect(p.texto).toBe('14 nomes venderam');
    expect(p.explicacao).toContain('11 desses nomes não batem');
  });

  it('com tudo reconhecido, a porcentagem é verdade e aparece', () => {
    expect(produtividade(14, 14, 19)).toMatchObject({ pct: 74, texto: '14 de 19 (74%)', explicacao: null });
  });

  /** Dividir por zero daria Infinity na tela. */
  it('sem ninguém ativo não é 0% de produtividade — é falta de cadastro', () => {
    const p = produtividade(3, 0, 0);
    expect(p.pct).toBeNull();
    expect(p.explicacao).toContain('Nenhum membro cadastrado');
  });
});

describe('avisoDeVgv', () => {
  /**
   * O aviso que impede o ticket médio de mentir. Sem ele, R$ 390.735 no lugar
   * de R$ 498.524 — 28% a menos, parecendo exato.
   */
  it('diz quantas vendas ficaram de fora, e que a comissão delas conta', () => {
    const a = avisoDeVgv(periodo());
    expect(a).toContain('8 vendas sem VGV');
    expect(a).toContain('comissão delas continua somando');
  });

  it('sem venda incompleta, não polui a tela', () => {
    expect(avisoDeVgv(periodo({ vendas_sem_vgv: 0 }))).toBeNull();
  });

  it('uma venda só fala no singular', () => {
    expect(avisoDeVgv(periodo({ vendas_sem_vgv: 1 }))).toContain('1 venda sem VGV');
  });
});

describe('avisoDeClassificacao', () => {
  /** Sem este aviso, trocar o filtro faz vendas sumirem sem explicação. */
  it('avisa no "todos" que há venda que some ao filtrar', () => {
    expect(avisoDeClassificacao(periodo(), 'todos')).toContain('não aparecem ao filtrar');
  });

  it('dentro de um filtro o aviso não faz sentido — já sumiram', () => {
    expect(avisoDeClassificacao(periodo(), 'lancamento')).toBeNull();
  });

  it('tudo classificado não avisa nada', () => {
    expect(avisoDeClassificacao(periodo({ sem_classificacao: 0 }), 'todos')).toBeNull();
  });
});
