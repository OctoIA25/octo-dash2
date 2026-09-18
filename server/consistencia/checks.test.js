/**
 * Cada caso aqui é um defeito que ESTA SESSÃO encontrou em produção. Se a
 * checagem não pega o defeito que já aconteceu, ela não vai pegar o próximo.
 */
import { describe, it, expect } from 'vitest';
import {
  COLUNAS_QUE_VIRAM_NUMERO,
  checaColunasVazias,
  checaContatados,
  checaEncaminhados,
  checaSomaDoFunil,
  checaVendaFonteUnica,
  montaRelatorio,
} from './checks.js';

describe('soma do funil', () => {
  it('passa quando cada lead está em exatamente uma etapa', () => {
    expect(checaSomaDoFunil({ porEtapa: { novos: 4147, interacao: 1017 }, totalLeads: 5164 }).ok).toBe(true);
  });

  // O defeito real: o card "Pré-Atendimento" filtrava por etapas que a base
  // nunca gravou e deixava 596 leads de fora.
  it('acusa quando uma etapa some do funil', () => {
    const v = checaSomaDoFunil({ porEtapa: { interacao: 1004 }, totalLeads: 1600 });
    expect(v.ok).toBe(false);
    expect(v.detalhe).toContain('596');
  });

  it('acusa quando um lead é contado duas vezes', () => {
    expect(checaSomaDoFunil({ porEtapa: { a: 3, b: 3 }, totalLeads: 5 }).ok).toBe(false);
  });
});

describe('encaminhados aos corretores', () => {
  // Na Imobiliária Japi o card anunciava 2.553 encaminhados com ZERO leads
  // tendo corretor — porque ele mostrava o total.
  it('marca como suspeito quando o contador é igual ao total', () => {
    const v = checaEncaminhados({ comCorretor: 2553, totalLeads: 2553 });
    expect(v.ok).toBe(true);
    expect(v.detalhe).toContain('igual ao total');
  });

  it('acusa contador maior que a base', () => {
    expect(checaEncaminhados({ comCorretor: 10, totalLeads: 5 }).ok).toBe(false);
  });

  it('número normal passa sem ressalva', () => {
    const v = checaEncaminhados({ comCorretor: 1577, totalLeads: 1660 });
    expect(v.ok).toBe(true);
    expect(v.detalhe).toBe('');
  });

  it('base vazia não vira suspeita', () => {
    expect(checaEncaminhados({ comCorretor: 0, totalLeads: 0 }).detalhe).toBe('');
  });
});

describe('contatados', () => {
  it('acusa numerador maior que denominador (taxa acima de 100%)', () => {
    const v = checaContatados({ contatados: 30, totalLeads: 24 });
    expect(v.ok).toBe(false);
    expect(v.detalhe).toContain('100%');
  });

  it('passa no caso normal', () => {
    expect(checaContatados({ contatados: 264, totalLeads: 320 }).ok).toBe(true);
  });
});

describe('venda: fonte única', () => {
  it('passa quando a view bate com a origem', () => {
    expect(checaVendaFonteUnica({ naView: 36, naOrigem: 36 }).ok).toBe(true);
  });

  it('acusa divergência entre a view e proposals', () => {
    const v = checaVendaFonteUnica({ naView: 30, naOrigem: 36 });
    expect(v.ok).toBe(false);
    expect(v.detalhe).toContain('divergiu');
  });

  // A view não existe em todo ambiente. Não poder verificar não é falhar —
  // senão o painel de saúde acusaria erro onde não há.
  it('sem a view, não verificável — e isso não é falha', () => {
    const v = checaVendaFonteUnica({ naView: null, naOrigem: 36 });
    expect(v.ok).toBe(true);
    expect(v.detalhe).toContain('não verificável');
  });
});

describe('colunas que viram número', () => {
  /**
   * A causa raiz de quase tudo o que esta sessão consertou: `final_sale_value`,
   * `visit_date`, `property_value` e `property_type` estão 100% vazias, e cada
   * uma alimentava contadores que mostravam zero sem nenhum erro aparecer.
   */
  it('acusa coluna 100% vazia que alimenta contador', () => {
    const v = checaColunasVazias([
      { tabela: 'leads', coluna: 'property_value', porque: 'valor do imóvel', preenchidas: 0, total: 5235 },
    ]);
    expect(v.ok).toBe(false);
    expect(v.detalhe).toContain('leads.property_value');
  });

  it('uma linha preenchida já basta para não acusar', () => {
    expect(checaColunasVazias([{ tabela: 'leads', coluna: 'x', porque: 'p', preenchidas: 1, total: 5235 }]).ok).toBe(true);
  });

  // Tabela vazia é imobiliária nova, não defeito: sem linha nenhuma, não há
  // coluna vazia a denunciar.
  it('tabela sem linhas não é acusada', () => {
    expect(checaColunasVazias([{ tabela: 'leads', coluna: 'x', porque: 'p', preenchidas: 0, total: 0 }]).ok).toBe(true);
  });

  it('a lista de colunas vigiadas não está vazia', () => {
    expect(COLUNAS_QUE_VIRAM_NUMERO.length).toBeGreaterThan(0);
    for (const c of COLUNAS_QUE_VIRAM_NUMERO) {
      expect(c.porque, `${c.tabela}.${c.coluna} sem motivo escrito`).toBeTruthy();
    }
  });
});

describe('relatório', () => {
  const base = {
    porEtapa: { a: 3, b: 2 }, totalLeads: 5, comCorretor: 2, contatados: 4,
    naView: 7, naOrigem: 7, preenchimento: [],
  };

  it('ok só quando TODAS passam', () => {
    expect(montaRelatorio(base).ok).toBe(true);
    expect(montaRelatorio({ ...base, contatados: 99 }).ok).toBe(false);
  });

  it('devolve uma linha por checagem, com nome legível', () => {
    const r = montaRelatorio(base);
    expect(r.checagens).toHaveLength(5);
    for (const c of r.checagens) expect(c.nome.length).toBeGreaterThan(10);
  });
});
