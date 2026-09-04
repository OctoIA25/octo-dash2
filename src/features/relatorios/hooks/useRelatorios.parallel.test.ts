import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Regressão (A10): o carregamento do dashboard de relatórios deve buscar as 4 consultas
 * independentes em PARALELO (Promise.all), não em série. Guarda contra (a) voltar a
 * encadear awaits seriais e (b) remover acidentalmente alguma das 4 consultas.
 * Eram 9: as contagens de venda/valor/imóveis saíram porque mediam leads com
 * outro nome — hoje venda e VGV/VGC vêm de `proposals`, dentro de buscarKPIsGerais.
 * Teste a nível de fonte porque o hook tem múltiplos efeitos/dependências cujo render
 * exigiria mocks frágeis — a equivalência no caminho feliz é mecânica (mesmos setters).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'useRelatorios.ts'), 'utf8');

const DASHBOARD_QUERIES = [
  'buscarMetricasPorEquipe(tenantId)',
  'buscarKPIsGerais(tenantId, inicio, fim)',
  'buscarVendasPorFonte(tenantId)',
  'buscarVendasPorFaixa(tenantId)',
];

describe('A10 — dashboard de relatórios busca em paralelo', () => {
  it('usa await Promise.all([...]) no carregamento geral', () => {
    expect(src.includes('await Promise.all([')).toBe(true);
  });

  it('mantém as 4 consultas dentro do Promise.all', () => {
    const start = src.indexOf('await Promise.all([');
    const block = src.slice(start, src.indexOf('])', start));
    for (const q of DASHBOARD_QUERIES) {
      expect(block.includes(q), `consulta ausente do Promise.all: ${q}`).toBe(true);
    }
  });
});
