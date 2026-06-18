import type { Imovel } from '../services/kenloService';

export interface ImoveisMetrics {
  total: number;
  casas: number;
  apartamentos: number;
  terrenos: number;
  comerciais: number;
  rurais: number;
  venda: number;
  locacao: number;
  vendaLocacao: number;
  valorTotalVenda: number;
  valorTotalLocacao: number;
}

/**
 * Calcula as métricas agregadas dos imóveis em UMA ÚNICA passada (O(n)), substituindo
 * as ~11 passagens separadas (`.filter().length` × 9 + `.reduce()` × 2 = O(11n)).
 *
 * Função PURA (sem React/IO) — fácil de testar e provar equivalência. O resultado é
 * idêntico ao cálculo multi-passada anterior, campo a campo.
 */
export function computeImoveisMetrics(imoveis: Imovel[]): ImoveisMetrics {
  const metrics: ImoveisMetrics = {
    total: 0,
    casas: 0,
    apartamentos: 0,
    terrenos: 0,
    comerciais: 0,
    rurais: 0,
    venda: 0,
    locacao: 0,
    vendaLocacao: 0,
    valorTotalVenda: 0,
    valorTotalLocacao: 0,
  };

  if (!imoveis || imoveis.length === 0) return metrics;

  metrics.total = imoveis.length;

  for (const imovel of imoveis) {
    switch (imovel.tipoSimplificado) {
      case 'casa': metrics.casas++; break;
      case 'apartamento': metrics.apartamentos++; break;
      case 'terreno': metrics.terrenos++; break;
      case 'comercial': metrics.comerciais++; break;
      case 'rural': metrics.rurais++; break;
    }

    if (imovel.finalidade === 'venda' || imovel.finalidade === 'venda_locacao') metrics.venda++;
    if (imovel.finalidade === 'locacao' || imovel.finalidade === 'venda_locacao') metrics.locacao++;
    if (imovel.finalidade === 'venda_locacao') metrics.vendaLocacao++;

    metrics.valorTotalVenda += imovel.valor_venda;
    metrics.valorTotalLocacao += imovel.valor_locacao;
  }

  return metrics;
}
