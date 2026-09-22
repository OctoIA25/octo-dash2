import { describe, it, expect } from 'vitest';
import {
  calcularFluxo, dividirCentavos, somarMeses, parcelaPrice,
  type Condicao, type Entradas,
} from '../fluxo';

/**
 * Uma condição de teste solta, e de propósito: NÃO é a tabela de nenhuma
 * construtora. A tabela real (Santa Ângela) é dado que o Erick ainda vai
 * passar; o que se testa aqui é o motor, que não conhece construtora nenhuma.
 */
const condicao = (over: Partial<Condicao> = {}): Condicao => ({
  nome: 'Tabela de teste',
  mensais_tipo: 'fixas',
  permite_balao: true,
  entrada_min_pct: 20,
  ato_min_valor: 10_000,
  mensais_max_qtd: 36,
  balao_max_qtd: 2,
  balao_meses_permitidos: [12, 24],
  financiamento_pct_max: 70,
  juros_pos_chaves_am: 1,
  ...over,
});

const entradas = (over: Partial<Entradas> = {}): Entradas => ({
  valorUnidadeCentavos: 40_000_000, // R$ 400.000,00
  rendaFamiliarCentavos: 1_000_000, // R$ 10.000,00
  atoCentavos: 4_000_000,           // R$ 40.000,00
  atoData: '2026-10-05',
  mensaisQtd: 36,
  baloes: [],
  fgtsCentavos: 0,
  financiadoCentavos: 20_000_000,   // R$ 200.000,00
  ...over,
});

describe('dividirCentavos', () => {
  it('não perde nem inventa centavo', () => {
    for (const [total, n] of [[100, 3], [10_000_01, 7], [1, 5], [999_999_999, 13]] as const) {
      const p = dividirCentavos(total, n);
      expect(p).toHaveLength(n);
      expect(p.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('coloca o resto nas primeiras, nunca na última', () => {
    // R$ 1,00 em 3 = 34 + 33 + 33. A última nunca é a maior: tabela de
    // construtora imprime a última como a menor, ou igual.
    expect(dividirCentavos(100, 3)).toEqual([34, 33, 33]);
    const p = dividirCentavos(100, 3);
    expect(p[p.length - 1]).toBeLessThanOrEqual(p[0]);
  });

  it('devolve lista vazia para zero parcelas, sem dividir por zero', () => {
    expect(dividirCentavos(1000, 0)).toEqual([]);
  });
});

describe('somarMeses', () => {
  it('não estoura o fim do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29'); // bissexto
    expect(somarMeses('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('atravessa o ano', () => {
    expect(somarMeses('2026-10-05', 3)).toBe('2027-01-05');
    expect(somarMeses('2026-10-05', 36)).toBe('2029-10-05');
  });
});

describe('parcelaPrice', () => {
  it('sem juros, divide igual', () => {
    expect(parcelaPrice(120_000, 0, 12)).toBe(10_000);
  });

  it('com juros, a parcela é maior que a divisão simples', () => {
    const p = parcelaPrice(10_000_000, 1, 60);
    expect(p).toBeGreaterThan(10_000_000 / 60);
    // Price de R$ 100.000 a 1% a.m. em 60 meses ≈ R$ 2.224,44.
    expect(p).toBeGreaterThan(222_000);
    expect(p).toBeLessThan(223_000);
  });
});

describe('calcularFluxo', () => {
  it('o fluxo fecha no centavo com o valor da unidade', () => {
    const f = calcularFluxo(entradas(), condicao());
    const soma = f.parcelas
      .filter((p) => p.tipo !== 'pos_chaves')
      .reduce((s, p) => s + p.valorCentavos, 0);
    expect(soma).toBe(40_000_000);
    expect(f.avisos.find((a) => a.campo === 'total')).toBeUndefined();
  });

  it('as mensais absorvem o resto, e o pós-chaves não se move sozinho', () => {
    const f = calcularFluxo(entradas({ posChavesCentavos: 2_000_000, posChavesQtd: 10 }), condicao());
    expect(f.saldoPosChavesCentavos).toBe(2_000_000);
    const mensais = f.parcelas.filter((p) => p.tipo === 'mensal');
    // 400.000 − 40.000 ato − 200.000 financiado − 20.000 pós = 140.000 em 36.
    expect(mensais.reduce((s, p) => s + p.valorCentavos, 0)).toBe(14_000_000);
  });

  it('o pós-chaves com juros gera parcelas MAIORES que a divisão simples', () => {
    const f = calcularFluxo(entradas({ posChavesCentavos: 6_000_000, posChavesQtd: 60 }), condicao());
    const pos = f.parcelas.filter((p) => p.tipo === 'pos_chaves');
    expect(pos).toHaveLength(60);
    expect(pos[0].valorCentavos).toBeGreaterThan(6_000_000 / 60);
  });

  it('pós-chaves sem prazo vira valor único, e diz isso', () => {
    const f = calcularFluxo(entradas({ posChavesCentavos: 3_000_000, posChavesQtd: 0 }), condicao());
    const pos = f.parcelas.filter((p) => p.tipo === 'pos_chaves');
    expect(pos).toHaveLength(1);
    expect(pos[0].valorCentavos).toBe(3_000_000);
    expect(f.avisos.some((a) => a.campo === 'pos_chaves')).toBe(true);
  });

  it('pós-chaves sem juros cadastrados avisa em vez de fingir que é zero', () => {
    const f = calcularFluxo(
      entradas({ posChavesCentavos: 3_000_000, posChavesQtd: 12 }),
      condicao({ juros_pos_chaves_am: null }),
    );
    expect(f.avisos.some((a) => a.campo === 'pos_chaves')).toBe(true);
    const pos = f.parcelas.filter((p) => p.tipo === 'pos_chaves');
    expect(pos.reduce((s, p) => s + p.valorCentavos, 0)).toBe(3_000_000);
  });

  it('RECUSA mensais decrescentes em vez de chutar a regra', () => {
    const f = calcularFluxo(entradas(), condicao({ mensais_tipo: 'decrescentes' }));
    expect(f.parcelas).toHaveLength(0);
    expect(f.impedimentos).toHaveLength(1);
    expect(f.impedimentos[0].campo).toBe('mensais_tipo');
  });

  it('decrescentes sem nenhuma mensal não impede — não há o que decrescer', () => {
    const f = calcularFluxo(
      entradas({ mensaisQtd: 0, atoCentavos: 20_000_000 }),
      condicao({ mensais_tipo: 'decrescentes' }),
    );
    expect(f.impedimentos).toHaveLength(0);
  });

  it('sem valor de unidade, recusa', () => {
    const f = calcularFluxo(entradas({ valorUnidadeCentavos: 0 }), condicao());
    expect(f.impedimentos.some((i) => i.campo === 'valor')).toBe(true);
    expect(f.parcelas).toHaveLength(0);
  });

  it('acusa entrada abaixo do mínimo da tabela', () => {
    // Financia 90%: a entrada cai para 10%, abaixo dos 20% exigidos.
    const f = calcularFluxo(entradas({ financiadoCentavos: 36_000_000 }), condicao());
    expect(f.avisos.some((a) => a.campo === 'entrada')).toBe(true);
  });

  it('acusa ato abaixo do mínimo', () => {
    const f = calcularFluxo(entradas({ atoCentavos: 500_000 }), condicao());
    expect(f.avisos.some((a) => a.campo === 'ato')).toBe(true);
  });

  it('acusa mais mensais do que a tabela permite', () => {
    const f = calcularFluxo(entradas({ mensaisQtd: 48 }), condicao());
    expect(f.avisos.some((a) => a.campo === 'mensais')).toBe(true);
  });

  it('acusa balão em tabela que não permite balão', () => {
    const f = calcularFluxo(
      entradas({ baloes: [{ mes: 12, valorCentavos: 1_000_000 }] }),
      condicao({ permite_balao: false }),
    );
    expect(f.avisos.some((a) => a.campo === 'baloes')).toBe(true);
  });

  it('acusa balão em mês não permitido, e aceita no permitido', () => {
    const fora = calcularFluxo(entradas({ baloes: [{ mes: 7, valorCentavos: 1_000_000 }] }), condicao());
    expect(fora.avisos.some((a) => a.campo === 'baloes')).toBe(true);

    const dentro = calcularFluxo(entradas({ baloes: [{ mes: 12, valorCentavos: 1_000_000 }] }), condicao());
    expect(dentro.avisos.some((a) => a.campo === 'baloes')).toBe(false);
  });

  it('acusa balões demais', () => {
    const f = calcularFluxo(entradas({
      baloes: [
        { mes: 12, valorCentavos: 500_000 },
        { mes: 24, valorCentavos: 500_000 },
        { mes: 12, valorCentavos: 500_000 },
      ],
    }), condicao());
    expect(f.avisos.some((a) => a.campo === 'baloes' && a.texto.includes('até 2'))).toBe(true);
  });

  it('acusa financiamento acima do teto da tabela', () => {
    const f = calcularFluxo(entradas({ financiadoCentavos: 32_000_000 }), condicao());
    expect(f.avisos.some((a) => a.campo === 'financiamento')).toBe(true);
  });

  it('acusa quando as partes já passam do valor da unidade', () => {
    const f = calcularFluxo(entradas({ atoCentavos: 30_000_000, financiadoCentavos: 20_000_000 }), condicao());
    expect(f.avisos.some((a) => a.campo === 'total')).toBe(true);
    expect(f.parcelas.filter((p) => p.tipo === 'mensal')).toHaveLength(0);
    // Sem a trava do zero, o saldo a prazo fica NEGATIVO e come o ato: o total
    // até as chaves sairia menor que o próprio ato já pago. Número menor que a
    // realidade é o pior tipo de erro numa proposta.
    expect(f.totalAteChavesCentavos).toBe(30_000_000);
  });

  it('calcula o % da renda e avisa acima de 30%', () => {
    const confortavel = calcularFluxo(entradas(), condicao());
    // 140.000 / 36 ≈ R$ 3.888,89 sobre renda de R$ 10.000 = 38,9%.
    expect(confortavel.pctDaRenda).toBeGreaterThan(30);
    expect(confortavel.avisos.some((a) => a.campo === 'renda')).toBe(true);

    const folgado = calcularFluxo(entradas({ rendaFamiliarCentavos: 3_000_000 }), condicao());
    expect(folgado.pctDaRenda).toBeLessThan(30);
    expect(folgado.avisos.some((a) => a.campo === 'renda')).toBe(false);
  });

  it('sem renda declarada, não inventa percentual', () => {
    const f = calcularFluxo(entradas({ rendaFamiliarCentavos: null }), condicao());
    expect(f.pctDaRenda).toBeNull();
    expect(f.avisos.some((a) => a.campo === 'renda')).toBe(false);
  });

  it('as chaves saem na última mensal, ou depois do último balão', () => {
    const normal = calcularFluxo(entradas(), condicao());
    expect(normal.dataDasChaves).toBe(somarMeses('2026-10-05', 36));

    const comBalaoTardio = calcularFluxo(
      entradas({ mensaisQtd: 12, baloes: [{ mes: 24, valorCentavos: 1_000_000 }] }),
      condicao({ balao_meses_permitidos: [24] }),
    );
    expect(comBalaoTardio.dataDasChaves).toBe(somarMeses('2026-10-05', 24));
  });

  it('o total até as chaves não conta financiamento nem FGTS', () => {
    const f = calcularFluxo(entradas({ fgtsCentavos: 3_000_000 }), condicao());
    // 40.000 ato + (400.000 − 40.000 − 200.000 − 30.000) = 40.000 + 130.000.
    expect(f.totalAteChavesCentavos).toBe(4_000_000 + 13_000_000);
  });

  it('as parcelas saem em ordem de mês', () => {
    const f = calcularFluxo(entradas({ baloes: [{ mes: 12, valorCentavos: 1_000_000 }] }), condicao());
    const meses = f.parcelas.map((p) => p.mes);
    expect(meses).toEqual([...meses].sort((a, b) => a - b));
    expect(f.parcelas[0].tipo).toBe('ato');
  });
});
