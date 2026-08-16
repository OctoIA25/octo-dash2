/**
 * Regressão estrutural dos triggers de classificação.
 *
 * O que NÃO pode regredir:
 *  - classificação automática SÓ em BEFORE INSERT (se rodar em UPDATE,
 *    sobrescreve a Lia em silêncio e não há histórico para recuperar);
 *  - o guard de origem NÃO é SECURITY DEFINER (seria, e current_user viraria o
 *    dono da função — o guard nunca detectaria o chamador real);
 *  - o guard só dispara quando a classificação MUDA de fato (sem isso, o
 *    upsert do crmSync reescreve o source da Lia para 'dashboard' a cada sync);
 *  - o espelho do bolsão é herdado no INSERT do PRÓPRIO bolsão, não por um
 *    AFTER INSERT nas fontes (ordem alfabética de trigger é frágil e falha calada).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../supabase/migrations/20260815_lead_classification_triggers.sql'),
  'utf8',
);

describe('migration 20260815_lead_classification_triggers', () => {
  it('classificação automática só em BEFORE INSERT — nunca em UPDATE', () => {
    expect(sql).toMatch(/CREATE TRIGGER tr_leads_classificar\s+BEFORE INSERT ON public\.leads/);
    expect(sql).toMatch(/CREATE TRIGGER tr_kenlo_leads_classificar\s+BEFORE INSERT ON public\.kenlo_leads/);
    expect(sql).not.toMatch(/CREATE TRIGGER tr_\w*_classificar\s+BEFORE (INSERT OR )?UPDATE/);
  });

  it('o trigger de entrada ignora o que o cliente mandar e grava automatic', () => {
    expect(sql).toMatch(/NEW\.classification\s*:=\s*public\.classificar_lead\(/);
    expect(sql).toMatch(/NEW\.classification_source\s*:=\s*'automatic'/);
  });

  it('o guard de origem NÃO é SECURITY DEFINER', () => {
    const guard = sql.slice(sql.indexOf('tg_classification_source_guard'));
    const corpo = guard.slice(0, guard.indexOf('$$;') + 3);
    expect(corpo).not.toContain('SECURITY DEFINER');
    expect(corpo).toContain("NEW.classification_source := 'dashboard'");
  });

  it('o guard só dispara quando a classificação muda de verdade', () => {
    const ocorrencias = sql.match(/WHEN \(NEW\.classification IS DISTINCT FROM OLD\.classification\)/g) || [];
    expect(ocorrencias.length).toBeGreaterThanOrEqual(4); // 2 guards + 2 espelhos
  });

  it('o espelho é herdado no BEFORE INSERT do próprio bolsao', () => {
    expect(sql).toMatch(/CREATE TRIGGER tr_bolsao_herda_classificacao\s+BEFORE INSERT ON public\.bolsao/);
  });

  it('as funções de trigger com escrita cruzada têm SECURITY DEFINER e search_path fixo', () => {
    for (const fn of [
      'public.tg_bolsao_herda_classificacao()',
      'public.tg_leads_classification_to_bolsao()',
      'public.tg_kenlo_leads_classification_to_bolsao()',
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION ${fn}`);
    }
    expect((sql.match(/SET search_path = public/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('NÃO recria nenhuma função de mirror existente', () => {
    expect(sql).not.toContain('tg_mirror_leads_to_bolsao');
    expect(sql).not.toContain('tg_mirror_kenlo_leads_to_bolsao');
  });
});
