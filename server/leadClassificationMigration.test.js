/**
 * Regressão estrutural da migration de classificação de lead.
 * Os asserts de comportamento da regra rodam DENTRO da migration (bloco DO),
 * no Postgres real. Este arquivo trava o que o vitest consegue ver: que a
 * função é pura, que as colunas têm CHECK, e que nada de mirror foi recriado.
 * Mesmo padrão de recoveryOnArchiveMigration.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../supabase/migrations/20260815_add_lead_classification.sql'),
  'utf8',
);

describe('migration 20260815_add_lead_classification', () => {
  it('a função de classificação é IMMUTABLE — sem query, sem relógio', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.classificar_lead\([\s\S]*?IMMUTABLE/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.classificar_lead_estagio\([\s\S]*?IMMUTABLE/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.classificar_lead_transacao\([\s\S]*?IMMUTABLE/);
  });

  it('as três colunas entram nas duas tabelas fonte, e só o valor no espelho', () => {
    for (const t of ['public.leads', 'public.kenlo_leads']) {
      expect(sql).toContain(`ALTER TABLE ${t}`);
    }
    for (const c of ['classification', 'classification_source', 'classification_updated_at']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
    }
    expect(sql).toMatch(/ALTER TABLE public\.bolsao[\s\S]*?ADD COLUMN IF NOT EXISTS classification text/);
  });

  it('CHECK fecha os valores dos dois campos', () => {
    expect(sql).toMatch(/IN \('lancamento', ?'pronto', ?'locacao', ?'indefinido'\)/);
    expect(sql).toMatch(/IN \('automatic', ?'lia', ?'dashboard'\)/);
  });

  it('a regra é provada por asserts na própria migration', () => {
    expect(sql).toMatch(/DO \$\$[\s\S]*ASSERT[\s\S]*\$\$/);
    // ambíguo (venda E locação) é indefinido, não locacao — 250 leads reais
    // \s* antes do '=': os asserts da migration são alinhados em coluna.
    expect(sql).toMatch(/ASSERT public\.classificar_lead\([^)]*true, ?true\)\s*= 'indefinido'/);
  });

  it('NÃO recria nenhuma função de mirror do bolsão', () => {
    expect(sql).not.toContain('tg_mirror_leads_to_bolsao');
    expect(sql).not.toContain('tg_mirror_kenlo_leads_to_bolsao');
  });

  it('esta migration não cria trigger nenhum — triggers são a Task 2', () => {
    expect(sql).not.toMatch(/CREATE TRIGGER/);
  });
});

const backfill = readFileSync(
  path.join(__dirname, '../supabase/migrations/20260815_backfill_lead_classification.sql'),
  'utf8',
);

describe('migration 20260815_backfill_lead_classification', () => {
  it('só toca linha ainda não classificada — nunca pisa na Lia', () => {
    const updates = backfill.match(/UPDATE public\.(leads|kenlo_leads)[\s\S]*?;/g) || [];
    expect(updates.length).toBe(2);
    for (const u of updates) expect(u).toMatch(/WHERE classification IS NULL/);
  });

  it('cada UPDATE em sua própria transação, com lock_timeout', () => {
    expect((backfill.match(/BEGIN;/g) || []).length).toBe(4);
    expect((backfill.match(/COMMIT;/g) || []).length).toBe(4);
    expect((backfill.match(/SET LOCAL lock_timeout/g) || []).length).toBe(4);
  });

  it('o backfill do espelho é espelho de verdade (IS DISTINCT FROM), não só-NULL', () => {
    const bolsaoUpdates = backfill.match(/UPDATE public\.bolsao[\s\S]*?;/g) || [];
    expect(bolsaoUpdates.length).toBe(2);
    for (const u of bolsaoUpdates) expect(u).toMatch(/IS DISTINCT FROM/);
  });

  it('avisa para pausar os schedulers — risco de deadlock', () => {
    expect(backfill).toMatch(/KENLO_SYNC_SCHEDULER/);
    expect(backfill).toMatch(/CONTACT2SALE_SYNC_SCHEDULER/);
    expect(backfill).toMatch(/SANTA_ANGELA_SYNC_SCHEDULER/);
  });
});
