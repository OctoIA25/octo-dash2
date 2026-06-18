import { describe, it, expect } from 'vitest';
import { computeImoveisMetrics, type ImoveisMetrics } from './imoveisMetrics';
import type { Imovel } from '../services/kenloService';

// Implementação de REFERÊNCIA = exatamente o cálculo multi-passada original
// (useImoveisData.ts antes do M5). O teste prova que a versão de passada única
// produz resultado idêntico, campo a campo.
function referenceMetrics(imoveis: Imovel[]): ImoveisMetrics {
  if (!imoveis || imoveis.length === 0) {
    return {
      total: 0, casas: 0, apartamentos: 0, terrenos: 0, comerciais: 0, rurais: 0,
      venda: 0, locacao: 0, vendaLocacao: 0, valorTotalVenda: 0, valorTotalLocacao: 0,
    };
  }
  return {
    total: imoveis.length,
    casas: imoveis.filter((i) => i.tipoSimplificado === 'casa').length,
    apartamentos: imoveis.filter((i) => i.tipoSimplificado === 'apartamento').length,
    terrenos: imoveis.filter((i) => i.tipoSimplificado === 'terreno').length,
    comerciais: imoveis.filter((i) => i.tipoSimplificado === 'comercial').length,
    rurais: imoveis.filter((i) => i.tipoSimplificado === 'rural').length,
    venda: imoveis.filter((i) => i.finalidade === 'venda' || i.finalidade === 'venda_locacao').length,
    locacao: imoveis.filter((i) => i.finalidade === 'locacao' || i.finalidade === 'venda_locacao').length,
    vendaLocacao: imoveis.filter((i) => i.finalidade === 'venda_locacao').length,
    valorTotalVenda: imoveis.reduce((sum, i) => sum + i.valor_venda, 0),
    valorTotalLocacao: imoveis.reduce((sum, i) => sum + i.valor_locacao, 0),
  };
}

// Constrói um Imovel mínimo (só os campos lidos pela métrica) tipado como Imovel.
const mk = (
  tipoSimplificado: Imovel['tipoSimplificado'],
  finalidade: Imovel['finalidade'],
  valor_venda: number,
  valor_locacao: number,
): Imovel => ({ tipoSimplificado, finalidade, valor_venda, valor_locacao } as unknown as Imovel);

const TIPOS: Imovel['tipoSimplificado'][] = ['casa', 'apartamento', 'terreno', 'comercial', 'rural', 'outro'];
const FINS: Imovel['finalidade'][] = ['venda', 'locacao', 'venda_locacao'];

describe('computeImoveisMetrics — equivalência com o cálculo original', () => {
  it('array vazio retorna tudo zero', () => {
    expect(computeImoveisMetrics([])).toEqual(referenceMetrics([]));
  });

  it('caso conferido à mão', () => {
    const imoveis = [
      mk('casa', 'venda', 100, 0),
      mk('casa', 'locacao', 0, 50),
      mk('apartamento', 'venda_locacao', 200, 30),
      mk('terreno', 'venda', 300, 0),
      mk('outro', 'locacao', 0, 10),
    ];
    // locacao conta 'locacao' OU 'venda_locacao' → casa-locacao + apto-venda_locacao + outro-locacao = 3
    expect(computeImoveisMetrics(imoveis)).toEqual({
      total: 5, casas: 2, apartamentos: 1, terrenos: 1, comerciais: 0, rurais: 0,
      venda: 3, locacao: 3, vendaLocacao: 1, valorTotalVenda: 600, valorTotalLocacao: 90,
    });
  });

  it('equivale à implementação original em dataset combinatório', () => {
    const imoveis: Imovel[] = [];
    let n = 0;
    for (const t of TIPOS) {
      for (const f of FINS) {
        // quantidade variável por combinação para exercitar contagens distintas
        const repeat = (n % 3) + 1;
        for (let k = 0; k < repeat; k++) imoveis.push(mk(t, f, n * 10, n * 5));
        n++;
      }
    }
    expect(computeImoveisMetrics(imoveis)).toEqual(referenceMetrics(imoveis));
  });

  it('soma de valores idêntica (incl. zeros)', () => {
    const imoveis = [mk('casa', 'venda', 0, 0), mk('rural', 'venda_locacao', 1234.56, 78.9)];
    const a = computeImoveisMetrics(imoveis);
    const b = referenceMetrics(imoveis);
    expect(a.valorTotalVenda).toBe(b.valorTotalVenda);
    expect(a.valorTotalLocacao).toBe(b.valorTotalLocacao);
  });
});
