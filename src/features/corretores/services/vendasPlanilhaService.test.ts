/**
 * Vendas do corretor segundo a PLANILHA de comissionamento.
 *
 * Número de outra fonte, não o da Dash: a planilha conta vendas que o CRM não
 * conhece (terceiros, parcerias). Os dois convivem na tela com rótulo, porque
 * esconder a origem faz alguém decidir com o número errado.
 *
 * A planilha só tem granularidade de MÊS. Período que pega parte de um mês
 * conta o mês inteiro, e é isso que o teste fixa.
 */
import { describe, expect, it } from 'vitest';
import { linhaEhDoCorretor, resumirVendasPlanilha } from './vendasPlanilhaService';

const linha = (mes: number, vendas: number, atualizado = '2026-09-23T12:00:00Z') => ({
  ano: 2026, mes, vendas, atualizado_em: atualizado, user_id: 'u1', nome_planilha: 'Fernanda Souza',
});

const setembro = { inicio: '2026-09-01', fim: '2026-09-30' };

describe('resumirVendasPlanilha', () => {
  it('soma o mês do período e o ano inteiro', () => {
    const r = resumirVendasPlanilha([linha(1, 1), linha(8, 2), linha(9, 3)], setembro);

    expect(r).toMatchObject({ noPeriodo: 3, noAno: 6 });
  });

  it('período de vários meses soma todos eles', () => {
    const r = resumirVendasPlanilha([linha(7, 1), linha(8, 2), linha(9, 3)], { inicio: '2026-08-01', fim: '2026-09-30' });

    expect(r?.noPeriodo).toBe(5);
  });

  it('período que pega parte do mês conta o mês inteiro — a planilha não tem dia', () => {
    const r = resumirVendasPlanilha([linha(9, 3)], { inicio: '2026-09-10', fim: '2026-09-12' });

    expect(r?.noPeriodo).toBe(3);
  });

  it('mostra quando foi a última leitura da planilha', () => {
    const r = resumirVendasPlanilha(
      [linha(8, 1, '2026-09-22T10:00:00Z'), linha(9, 2, '2026-09-23T15:30:00Z')],
      setembro,
    );

    expect(r?.atualizadoEm).toBe('2026-09-23T15:30:00Z');
  });

  it('sem linha nenhuma, não inventa zero: devolve nada e a tela esconde o campo', () => {
    expect(resumirVendasPlanilha([], setembro)).toBeNull();
  });

  it('ano diferente do período fica fora da conta do ano', () => {
    const r = resumirVendasPlanilha([{ ...linha(9, 3), ano: 2025 }, linha(9, 2)], setembro);

    expect(r).toMatchObject({ noPeriodo: 2, noAno: 2 });
  });
});

describe('linhaEhDoCorretor', () => {
  const l = linha(9, 1);

  it('casa pelo identificador quando a planilha já foi reconhecida', () => {
    expect(linhaEhDoCorretor(l, { userId: 'u1', nome: 'Outro Nome' })).toBe(true);
    expect(linhaEhDoCorretor(l, { userId: 'u2', nome: 'Fernanda Souza' })).toBe(false);
  });

  it('sem identificador, casa por nome sem acento e sem caixa', () => {
    expect(linhaEhDoCorretor({ ...l, user_id: null }, { nome: 'FERNANDA SOUZA' })).toBe(true);
    expect(linhaEhDoCorretor({ ...l, user_id: null }, { nome: 'fernanda  souza ' })).toBe(true);
    expect(linhaEhDoCorretor({ ...l, user_id: null }, { nome: 'Fernanda Lima' })).toBe(false);
  });

  it('sem nome e sem identificador não casa com ninguém', () => {
    expect(linhaEhDoCorretor({ ...l, user_id: null }, { nome: '' })).toBe(false);
  });
});
