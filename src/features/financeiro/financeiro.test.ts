import { describe, expect, it } from 'vitest';
import {
  avisoDeVencidos, avisoSemConta, csvParaContador, dreFecha, eAutomatico,
  nomeDoArquivo, primeiroDiaNoVermelho, saldoAoFim,
  type Dre, type FluxoDeCaixa, type LinhaDaExportacao,
} from './financeiro';

const dre = (over: Partial<Dre> = {}): Dre => ({
  de: '2026-09-01', ate: '2026-09-30',
  linhas: [
    { codigo: '1.1', nome: 'Comissões de venda', tipo: 'receita', lancamentos: 3, total: 30000 },
    { codigo: '2.1', nome: 'Repasses a corretores', tipo: 'despesa', lancamentos: 3, total: 18000 },
    { codigo: '2.5', nome: 'Impostos', tipo: 'despesa', lancamentos: 1, total: 1800 },
  ],
  totais: { receitas: 30000, despesas: 19800, resultado: 10200, lancamentos: 7, sem_conta: 0 },
  ...over,
});

describe('o DRE fecha com a soma das próprias linhas', () => {
  it('confere quando fecha', () => {
    expect(dreFecha(dre()).fecha).toBe(true);
  });

  it('acusa a receita que não bate, com os dois valores', () => {
    const r = dreFecha(dre({ totais: { ...dre().totais, receitas: 25000 } }));
    expect(r.fecha).toBe(false);
    expect(r.campo).toBe('receitas');
    expect(r.soma).toBe(30000);
    expect(r.rodape).toBe(25000);
  });

  it('acusa a despesa que não bate', () => {
    expect(dreFecha(dre({ totais: { ...dre().totais, despesas: 100 } })).campo).toBe('despesas');
  });

  it('acusa o resultado que não é receitas menos despesas', () => {
    expect(dreFecha(dre({ totais: { ...dre().totais, resultado: 999 } })).campo).toBe('resultado');
  });

  it('tolera um centavo de arredondamento', () => {
    expect(dreFecha(dre({ totais: { ...dre().totais, receitas: 30000.005 } })).fecha).toBe(true);
  });
});

describe('os avisos do que a tela não sabe', () => {
  it('cala quando todo lançamento tem conta', () => {
    expect(avisoSemConta({ sem_conta: 0, lancamentos: 9 })).toBeNull();
  });

  it('diz quantos estão sem conta e o que acontece com eles', () => {
    const t = avisoSemConta({ sem_conta: 2, lancamentos: 9 })!;
    expect(t).toContain('2 de 9');
    expect(t).toContain('Sem conta no plano');
  });

  it('não pinta "0 vencidos" de vermelho — treina a ignorar o vermelho', () => {
    expect(avisoDeVencidos({ vencidos: 0, valor_vencido: 0 })).toBeNull();
  });

  it('concorda em número quando é um só', () => {
    expect(avisoDeVencidos({ vencidos: 1, valor_vencido: 500 })).toContain('1 lançamento vencido');
    expect(avisoDeVencidos({ vencidos: 3, valor_vencido: 500 })).toContain('3 lançamentos vencidos');
  });
});

describe('o lançamento automático', () => {
  it('não se edita aqui: ele pertence à venda', () => {
    expect(eAutomatico({ origem: 'venda' })).toBe(true);
    expect(eAutomatico({ origem: 'repasse' })).toBe(true);
    expect(eAutomatico({ origem: 'imposto' })).toBe(true);
    expect(eAutomatico({ origem: 'manual' })).toBe(false);
  });
});

describe('o fluxo de caixa', () => {
  const fluxo = (over: Partial<FluxoDeCaixa> = {}): FluxoDeCaixa => ({
    de: '2026-10-01', ate: '2026-10-03', granularidade: 'dia', saldo_inicial: 1000,
    linhas: [
      { quando: '2026-10-01', previsto_entrada: 0, previsto_saida: 300, entrada: 0, saida: 300, previsto_liquido: -300, realizado_liquido: -300, saldo: 700 },
      { quando: '2026-10-02', previsto_entrada: 0, previsto_saida: 900, entrada: 0, saida: 0, previsto_liquido: -900, realizado_liquido: 0, saldo: 700 },
      { quando: '2026-10-03', previsto_entrada: 2000, previsto_saida: 0, entrada: 0, saida: 0, previsto_liquido: 2000, realizado_liquido: 0, saldo: 700 },
    ],
    ...over,
  });

  it('o saldo do período é o do último ponto', () => {
    expect(saldoAoFim(fluxo())).toBe(700);
  });

  it('sem série, o saldo é o inicial — e não zero', () => {
    expect(saldoAoFim(fluxo({ linhas: [] }))).toBe(1000);
  });

  it('diz em que dia o previsto fica negativo', () => {
    // 1000 − 300 = 700; 700 − 900 = −200 no dia 2.
    expect(primeiroDiaNoVermelho(fluxo())).toBe('2026-10-02');
  });

  it('cala quando o previsto nunca fica negativo', () => {
    expect(primeiroDiaNoVermelho(fluxo({ saldo_inicial: 100000 }))).toBeNull();
  });
});

describe('o CSV que o contador abre no Excel', () => {
  const linha = (over: Partial<LinhaDaExportacao> = {}): LinhaDaExportacao => ({
    competencia: '2026-09-01', tipo: 'Receber', conta_codigo: '1.1',
    conta_nome: 'Comissões de venda', descricao: 'Comissão · Reserva Castanheira',
    centro_custo: 'Reserva Castanheira', valor: 30000, vencimento: '2026-10-10',
    pago_em: null, valor_pago: null, status: 'aberto', origem: 'venda',
    anexo: '', observacao: '', ...over,
  });

  it('começa com BOM — sem ele o Excel abre "Comissão" como "ComissÃ£o"', () => {
    expect(csvParaContador([linha()]).charCodeAt(0)).toBe(0xfeff);
  });

  it('separa por ponto e vírgula, porque a vírgula é o decimal em português', () => {
    const csv = csvParaContador([linha()]);
    const cabecalho = csv.replace('﻿', '').split('\r\n')[0];
    expect(cabecalho.split(';')).toHaveLength(14);
    expect(cabecalho).toContain('Competência');
  });

  it('escreve o valor com vírgula decimal, para o Excel somar a coluna', () => {
    const corpo = csvParaContador([linha({ valor: 1234.5 })]).split('\r\n')[1];
    expect(corpo).toContain('1234,50');
    expect(corpo).not.toContain('1234.50');
  });

  it('escreve a data em dd/mm/aaaa', () => {
    const corpo = csvParaContador([linha()]).split('\r\n')[1];
    expect(corpo).toContain('01/09/2026');
    expect(corpo).toContain('10/10/2026');
  });

  it('deixa a célula vazia quando não há data, em vez de escrever "null"', () => {
    const corpo = csvParaContador([linha({ pago_em: null, valor_pago: null })]).split('\r\n')[1];
    expect(corpo).not.toContain('null');
    expect(corpo.endsWith(';;')).toBe(true);
  });

  it('protege o histórico que tem ponto e vírgula dentro', () => {
    const corpo = csvParaContador([linha({ descricao: 'Aluguel; sala 2' })]).split('\r\n')[1];
    expect(corpo).toContain('"Aluguel; sala 2"');
    expect(corpo.split(';')).toHaveLength(15); // o ; protegido não vira coluna nova
  });

  it('dobra a aspa de dentro do texto', () => {
    const corpo = csvParaContador([linha({ descricao: 'Sala "A"' })]).split('\r\n')[1];
    expect(corpo).toContain('"Sala ""A"""');
  });

  it('sai com cabeçalho mesmo sem linha nenhuma', () => {
    const csv = csvParaContador([]);
    expect(csv.replace('﻿', '').split('\r\n')[0]).toContain('Competência');
  });
});

describe('o nome do arquivo', () => {
  it('usa o mês quando o recorte é de um mês só', () => {
    expect(nomeDoArquivo('2026-09-01', '2026-09-30')).toBe('financeiro-2026-09.csv');
  });

  it('usa as duas datas quando atravessa meses', () => {
    expect(nomeDoArquivo('2026-09-01', '2026-10-31')).toBe('financeiro-2026-09-01-a-2026-10-31.csv');
  });
});
