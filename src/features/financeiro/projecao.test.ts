import { describe, it, expect } from 'vitest';
import { lerValor, linhaVisivel, montarProjecao, rotuloDaColuna } from './projecao';

const mes = (id: string, v: Record<string, number> = {}) =>
  ({ id, tipo: 'mes' as const, de: '2026-11-01', ate: '2026-11-30', ...v });

describe('montarProjecao — a planilha do chefe', () => {
  it('o saldo final de uma coluna é o inicial da seguinte (os números da imagem de 03/10)', () => {
    const r = montarProjecao({
      saldo_inicial: 150000,
      alerta: null,
      colunas: [
        mes('m0', { comissoes: 180000, parceiros: 5000, custos_fixos: 80000, repasses: 90000, marketing: 15000, provisoes: 10000 }),
        mes('m1', { comissoes: 200000, parceiros: 8000, custos_fixos: 80000, repasses: 100000, marketing: 15000, provisoes: 10000 }),
      ],
    });
    expect(r[0].saldoInicial).toBe(150000);
    expect(r[0].saldoFinal).toBe(140000);
    expect(r[1].saldoInicial).toBe(140000);
    expect(r[1].saldoFinal).toBe(143000);
  });

  it('o estimado conta como saída', () => {
    const [c] = montarProjecao({ saldo_inicial: 0, alerta: null, colunas: [mes('m', { comissoes: 4000, repasses_estimados: 2400 })] });
    expect(c.saidas).toBe(2400);
    expect(c.saldoFinal).toBe(1600);
  });

  it('o alerta acende só ABAIXO do valor, e nunca sem valor', () => {
    const base = { saldo_inicial: 100000, colunas: [mes('m')] };
    expect(montarProjecao({ ...base, alerta: 100000 })[0].abaixoDoAlerta).toBe(false);
    expect(montarProjecao({ ...base, alerta: 100000.01 })[0].abaixoDoAlerta).toBe(true);
    expect(montarProjecao({ ...base, alerta: null })[0].abaixoDoAlerta).toBe(false);
  });

  it('chave ausente vale zero, e centavo não acumula erro', () => {
    const [c] = montarProjecao({ saldo_inicial: 0, alerta: null, colunas: [mes('m', { comissoes: 0.1, parceiros: 0.2 })] });
    expect(c.entradas).toBe(0.3);
    expect(c.saidas).toBe(0);
  });
});

describe('rótulos e linhas', () => {
  it('semana mostra os dias; mês mostra mês/ano', () => {
    expect(rotuloDaColuna({ tipo: 'semana', de: '2026-10-03', ate: '2026-10-07' })).toBe('03–07/10');
    expect(rotuloDaColuna({ tipo: 'mes', de: '2026-11-01', ate: '2026-11-30' })).toBe('nov/26');
  });

  it('Impostos e Outras entradas só aparecem com valor; as linhas da planilha sempre', () => {
    expect(linhaVisivel('impostos', [{}, { impostos: 0 }])).toBe(false);
    expect(linhaVisivel('impostos', [{}, { impostos: 400 }])).toBe(true);
    expect(linhaVisivel('custos_fixos', [{}])).toBe(true);
  });

  it('lê o valor como se digita no Brasil', () => {
    expect(lerValor('R$ 150.000,00')).toBe(150000);
    expect(lerValor('4.000,50')).toBe(4000.5);
    expect(lerValor('100000')).toBe(100000);
    expect(lerValor('  ')).toBeNull();
  });
});
