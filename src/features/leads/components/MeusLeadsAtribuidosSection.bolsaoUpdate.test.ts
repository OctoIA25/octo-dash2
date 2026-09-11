import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Regressão: "Assumir do bolsão" no Kanban de Meus Leads escrevia
 * `assumed_by`/`assumed_at` — colunas que a tabela `bolsao` não tem. O PostgREST
 * responde "Could not find the 'assumed_at' column of 'bolsao' in the schema
 * cache" e o clique falha.
 *
 * Sem migrations do CREATE TABLE no repo, a fonte de verdade prática são os
 * writes de `bolsaoService` (todos contra BOLSAO_TABLE, em produção há tempo).
 * Guarda a nível de fonte: qualquer coluna nova inventada no componente quebra
 * aqui até existir também no serviço (e, portanto, na tabela).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

/** Chaves dos objetos passados a `.update({ ... })` no trecho recebido. */
const updateKeys = (src: string): string[] =>
  [...src.matchAll(/\.update\(\{([^}]*)\}/g)]
    .flatMap((m) => [...m[1].matchAll(/(\w+)\s*:/g)].map((k) => k[1]));

const componente = read('MeusLeadsAtribuidosSection.tsx');
const handler = componente.slice(
  componente.indexOf('const handleAssumirDoBolsao'),
  componente.indexOf('const sensors'),
);
const colunasConhecidas = new Set(updateKeys(read('../services/bolsaoService.ts')));

describe('handleAssumirDoBolsao — payload do update em bolsao', () => {
  it('só escreve colunas que bolsaoService também escreve', () => {
    const keys = updateKeys(handler);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !colunasConhecidas.has(k))).toEqual([]);
  });

  it('não escreve assumed_by/assumed_at (não existem em bolsao)', () => {
    expect(updateKeys(handler)).not.toContain('assumed_by');
    expect(updateKeys(handler)).not.toContain('assumed_at');
  });
});
