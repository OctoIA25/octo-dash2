/**
 * O gasto da Meta dentro do Financeiro (P3.5).
 *
 * O caso que carrega o arquivo é o de mostrar OS DOIS números. Trocar o valor
 * digitado em silêncio faria o gestor achar que alguém mexeu no dele.
 */

import { describe, it, expect } from 'vitest';
import { avisoDeSubstituicao, vemDaMeta } from './gastoNoFinanceiro';

describe('vemDaMeta', () => {
  it('reconhece as origens que a conta de anúncios cobre', () => {
    expect(vemDaMeta('Instagram')).toBe(true);
    expect(vemDaMeta('facebook')).toBe(true);
    expect(vemDaMeta(' Meta Ads ')).toBe(true);
  });

  /** ZAP continua digitado: ninguém tem esse número automaticamente. */
  it('não toma conta do que não é Meta', () => {
    expect(vemDaMeta('ZAP Imóveis')).toBe(false);
    expect(vemDaMeta('Indicação')).toBe(false);
    expect(vemDaMeta('')).toBe(false);
  });
});

describe('avisoDeSubstituicao', () => {
  /**
   * Os números reais: o gestor digitava algo por Instagram e Facebook, e a
   * Meta cobrou R$ 3.333,64 em setembro.
   */
  it('mostra o real E o digitado, com a direção da diferença', () => {
    const a = avisoDeSubstituicao({ Instagram: 1000, Facebook: 500 }, 3333.64);
    expect(a?.real).toBe(3333.64);
    expect(a?.digitado).toBe(1500);
    expect(a?.texto).toContain('R$ 3.333,64');
    expect(a?.texto).toContain('R$ 1.500,00');
    expect(a?.texto).toContain('o gasto real é maior');
    expect(a?.texto).toContain('continua guardado');
  });

  it('diz quando o real é menor', () => {
    expect(avisoDeSubstituicao({ Instagram: 9000 }, 3333.64)?.texto).toContain('o gasto real é menor');
  });

  /** Sem nada digitado antes, não há o que comparar — só o número novo. */
  it('sem valor digitado, só anuncia o número real', () => {
    const a = avisoDeSubstituicao({ Instagram: 0 }, 3333.64);
    expect(a?.texto).toContain('deixa de ser digitado');
    expect(a?.texto).not.toContain('Substitui');
  });

  it('origem que não é Meta não entra na conta', () => {
    const a = avisoDeSubstituicao({ 'ZAP Imóveis': 800, Instagram: 200 }, 3333.64);
    expect(a?.digitado).toBe(200);
    expect(a?.origens).toEqual(['Instagram']);
  });

  /** Sem gasto lido, a tela continua como era: nada é travado à toa. */
  it('sem gasto da Meta, não há aviso nem substituição', () => {
    expect(avisoDeSubstituicao({ Instagram: 1000 }, null)).toBeNull();
    expect(avisoDeSubstituicao({ Instagram: 1000 }, 0)).toBeNull();
  });
});
