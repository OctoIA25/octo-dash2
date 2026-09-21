/**
 * Custo de IA (P2.8) — leitura dos números.
 *
 * Os casos giram todos na mesma regra: **ausência nunca vira zero**. Em
 * 21/09/2026, das 19 chamadas de IA registradas, nenhuma tinha uso — e a tela
 * precisava dizer isso, em vez de anunciar uma IA de graça.
 */

import { describe, it, expect } from 'vitest';
import {
  confianca, custoPorDocumento, custoPorLead, dinheiro, sobreAFatura, tokens,
  type TotalDeCusto,
} from './custoDeIa';

const total = (over: Partial<TotalDeCusto> = {}): TotalDeCusto => ({
  chamadas: 100,
  com_uso: 100,
  sem_uso: 0,
  sem_preco: 0,
  tokens_entrada: 500000,
  tokens_saida: 120000,
  tokens_cache: 80000,
  custo_usd: 3.42,
  leads_atendidos: 57,
  documentos: 4,
  precos_nao_conferidos: 0,
  ...over,
});

describe('dinheiro', () => {
  it('mostra centavo de centavo, que é a ordem de grandeza de uma chamada', () => {
    expect(dinheiro(0.00725)).toBe('US$ 0,0073');
    expect(dinheiro(3.42)).toBe('US$ 3,42');
  });

  /** "—" é "ninguém contou"; "US$ 0,00" é "rodou e não custou". */
  it('não informado é travessão, e zero é zero', () => {
    expect(dinheiro(null)).toBe('—');
    expect(dinheiro(undefined)).toBe('—');
    expect(dinheiro(0)).toBe('US$ 0,00');
  });
});

describe('tokens', () => {
  it('encurta número grande', () => {
    expect(tokens(1_450_000)).toBe('1,5 M');
    expect(tokens(12_300)).toBe('12,3 mil');
    expect(tokens(840)).toBe('840');
    expect(tokens(null)).toBe('0');
  });
});

describe('custoPorLead e custoPorDocumento', () => {
  it('dividem quando dá', () => {
    expect(custoPorLead(total())).toBeCloseTo(3.42 / 57, 6);
    expect(custoPorDocumento(total())).toBeCloseTo(3.42 / 4, 6);
  });

  /** Dividir por zero lead daria Infinity na tela. */
  it('sem lead atendido, não há custo por lead', () => {
    expect(custoPorLead(total({ leads_atendidos: 0 }))).toBeNull();
    expect(custoPorDocumento(total({ documentos: 0 }))).toBeNull();
  });

  it('sem custo calculável, não inventa divisão', () => {
    expect(custoPorLead(total({ custo_usd: null }))).toBeNull();
  });
});

describe('confianca', () => {
  /** O estado real em 21/09: 19 chamadas, nenhuma com uso. */
  it('nenhuma chamada reportando uso é alerta, e explica o que fazer', () => {
    const c = confianca(total({ chamadas: 19, com_uso: 0, sem_uso: 19, custo_usd: null }));
    expect(c.cobertura).toBe(0);
    expect(c.alerta).toBe(true);
    expect(c.texto).toContain('Nenhuma das 19');
    expect(c.texto).toContain('usage');
  });

  /**
   * O caso perigoso: metade reporta. O custo aparece, parece completo, e é
   * metade do real. A frase tem que dizer isso.
   */
  it('cobertura parcial avisa que o custo real é maior', () => {
    const c = confianca(total({ chamadas: 100, com_uso: 40, sem_uso: 60 }));
    expect(c.cobertura).toBe(40);
    expect(c.alerta).toBe(true);
    expect(c.texto).toContain('o real é maior');
  });

  it('modelo sem preço também é alerta', () => {
    const c = confianca(total({ sem_preco: 3 }));
    expect(c.alerta).toBe(true);
    expect(c.texto).toContain('sem preço cadastrado');
  });

  it('tudo reportado e precificado não alarma', () => {
    const c = confianca(total());
    expect(c).toMatchObject({ cobertura: 100, alerta: false });
  });

  it('período sem chamada nenhuma não é alerta — é silêncio', () => {
    expect(confianca(total({ chamadas: 0, com_uso: 0 })).alerta).toBe(false);
    expect(confianca(null).alerta).toBe(false);
  });
});

describe('sobreAFatura', () => {
  /**
   * O achado de 21/09: a Lotus está em assinatura, onde NÃO existe fatura por
   * token. Dizer "bate com a fatura" ali seria prometer o impossível.
   */
  it('assinatura diz que não há fatura por token', () => {
    const t = sobreAFatura('max', 8);
    expect(t).toContain('assinatura');
    expect(t).toContain('não há fatura por token');
    expect(t).toContain('8%');
  });

  it('cobrança por token promete a conferência, e diz onde a diferença nasce', () => {
    expect(sobreAFatura('api', null)).toContain('deve bater com a fatura');
  });

  it('sem provedor configurado não promete nada', () => {
    expect(sobreAFatura(null, null)).toContain('não configurado');
  });
});
