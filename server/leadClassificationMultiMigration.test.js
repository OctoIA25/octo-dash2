/**
 * Regressão estrutural da migration que tornou a classificação multi-valor.
 *
 * O que NÃO pode regredir: os 4 triggers derrubados para o `ALTER TYPE` passar
 * (o Postgres recusa mudar o tipo de coluna citada em definição de trigger —
 * 0A000) têm que VOLTAR na mesma migration. Um DROP sem o CREATE
 * correspondente apaga em silêncio o guard de origem (o browser voltaria a se
 * passar pela Lia) e o espelho do bolsão — sem erro nenhum na aplicação.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../supabase/migrations/20260818_lead_classification_multi.sql'),
  'utf8',
);

const DERRUBADOS = [
  ['tr_leads_classification_guard', 'public.leads'],
  ['tr_kenlo_leads_classification_guard', 'public.kenlo_leads'],
  ['tr_leads_classification_to_bolsao', 'public.leads'],
  ['tr_kenlo_leads_classification_to_bolsao', 'public.kenlo_leads'],
];

describe('migration 20260818_lead_classification_multi', () => {
  it.each(DERRUBADOS)('%s é derrubado E recriado', (trigger, tabela) => {
    expect(sql).toContain(`DROP TRIGGER IF EXISTS ${trigger}`);
    expect(sql).toMatch(
      new RegExp(`CREATE TRIGGER ${trigger}\\s+(BEFORE|AFTER) UPDATE OF classification ON ${tabela.replace('.', '\\.')}`),
    );
  });

  it('o guard continua condicionado à mudança real do valor', () => {
    // Sem o WHEN, o upsert do crmSync reescreveria o source da Lia a cada sync.
    const ocorrencias = sql.match(/WHEN \(NEW\.classification IS DISTINCT FROM OLD\.classification\)/g) || [];
    expect(ocorrencias.length).toBe(4);
  });

  it('a classificação automática segue single-valued — ARRAY de um elemento só', () => {
    expect(sql).toMatch(/NEW\.classification\s*:=\s*ARRAY\[public\.classificar_lead\(/);
    expect(sql).not.toMatch(/CREATE TRIGGER tr_\w*_classificar\s+BEFORE (INSERT OR )?UPDATE/);
  });

  it('o CHECK novo fecha o vocabulário e proíbe array vazio', () => {
    expect(sql).toMatch(/classification <@ ARRAY\['lancamento', 'pronto', 'locacao', 'indefinido'\]::text\[\]/);
    expect(sql).toMatch(/array_length\(classification, 1\) >= 1/);
  });

  it('o ALTER TYPE é condicional — rodar duas vezes não vira text[][]', () => {
    expect(sql).toMatch(/data_type <> 'ARRAY'/);
  });
});
