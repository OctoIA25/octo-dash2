/**
 * "Nenhuma venda neste recorte" era falso — havia 37.
 *
 * A Conferência abre no mês corrente. A planilha da Lotus parou de receber
 * venda em 01/09, e as 37 são de janeiro a agosto. O chefe abriu a tela em
 * 28/09 e leu "Nenhuma venda da planilha neste recorte" — com R$ 14,4 milhões
 * guardados logo atrás.
 */
import { describe, it, expect } from 'vitest';
import { ondeEstaoAsVendas } from '../ondeEstaoAsVendas';

const venda = (d: string | null) => ({ data_assinatura: d });

describe('onde estão as vendas que o recorte não mostrou', () => {
  it('diz quantas são e o intervalo — o caso da Lotus', () => {
    const r = ondeEstaoAsVendas([venda('2026-01-15'), venda('2026-08-20'), venda('2026-04-02')]);
    expect(r).toEqual({ quantas: 3, periodo: 'de janeiro de 2026 a agosto de 2026' });
  });

  it('mês único não vira intervalo repetido', () => {
    const r = ondeEstaoAsVendas([venda('2026-03-01'), venda('2026-03-28')]);
    expect(r?.periodo).toBe('em março de 2026');
  });

  /*
   * Sem venda nenhuma, a frase antiga É a verdadeira. Trocar por "a planilha
   * tem 0 vendas" seria pior: a tela passaria a explicar uma ausência que já
   * estava clara.
   */
  it('planilha vazia devolve nulo, e a frase antiga fica', () => {
    expect(ondeEstaoAsVendas([])).toBeNull();
  });

  /*
   * Há vendas, mas sem data utilizável. Dizer o intervalo seria inventar;
   * dizer a quantidade não é.
   */
  it('sem data utilizável, diz a quantidade e admite que não sabe o período', () => {
    const r = ondeEstaoAsVendas([venda(null), venda(''), venda('data errada')]);
    expect(r).toEqual({ quantas: 3, periodo: 'sem data de assinatura' });
  });

  /*
   * O fuso. `new Date('2026-01-01')` no Brasil vira 31/12/2025, e a frase
   * citaria dezembro do ano anterior. Por isso a data é fatiada, não parseada.
   */
  it('01 de janeiro não vira dezembro do ano anterior', () => {
    expect(ondeEstaoAsVendas([venda('2026-01-01')])?.periodo).toBe('em janeiro de 2026');
  });

  it('aceita data com hora junto', () => {
    expect(ondeEstaoAsVendas([venda('2026-07-04T23:30:00Z')])?.periodo).toBe('em julho de 2026');
  });
});
