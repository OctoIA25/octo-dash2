import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Regressão (A9-resto): dentro de saveKenloLeads, getCorretorByPropertyCode e
 * findCorretorInSystem (que re-consultam o banco) devem ser chamadas via memoizers
 * (resolveCorretorPor*) — 1× por input único, não 1× por lead. Guarda contra voltar a
 * chamá-las diretamente no loop (N+1). Teste a nível de fonte (saveKenloLeads tem
 * superfície de mock grande; a memoização preserva o resultado por construção).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'kenloLeadsService.ts'), 'utf8');

const start = src.indexOf('export const saveKenloLeads');
const next = src.indexOf('\nexport ', start + 10);
const saveFn = src.slice(start, next === -1 ? undefined : next);

describe('A9 — saveKenloLeads memoiza resolução de corretor', () => {
  it('usa os memoizers no loop', () => {
    expect(saveFn.includes('resolveCorretorPorNome(')).toBe(true);
    expect(saveFn.includes('resolveCorretorPorCodigo(')).toBe(true);
  });

  it('chama as funções pesadas só 1× (dentro dos memoizers), não por-lead', () => {
    expect((saveFn.match(/findCorretorInSystem\(/g) || []).length).toBe(1);
    expect((saveFn.match(/getCorretorByPropertyCode\(/g) || []).length).toBe(1);
  });
});
