/**
 * Regressão estrutural da migração que faz o Agente de Recuperação disparar ao
 * arquivar um lead de kenlo_leads (ex.: arquivado na Contact2Sale — decisão D4).
 * Os triggers rodam no Postgres (fora do vitest); estes asserts travam os
 * invariantes que fazem o fluxo ser IDÊNTICO ao arquivamento manual de `leads`
 * (mesmo padrão de ensureConversationMigration.test.js).
 *
 * O que NÃO pode regredir:
 *  - mapeia client_name/client_phone (schema de kenlo_leads), não name/phone;
 *  - UPDATE só enfileira na transição ativo→arquivado (não UPDATE redundante);
 *  - INSERT só enfileira lead FRESCO já arquivado, com gate is_backfill IS NOT
 *    TRUE (sem o gate, o 1º sync recupera toda a base histórica arquivada = spam);
 *  - mesma idempotency_key tenant|lead|archived_at (dedup + reenvio por evento);
 *  - lead_source='contact2sale' dentro do VALUES do INSERT;
 *  - jamais bloqueia o arquivamento (SECURITY DEFINER + EXCEPTION → WARNING).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../../supabase/migrations/20260706_enqueue_recovery_on_archive_kenlo_leads.sql'),
  'utf8',
);

describe('migração enqueue_recovery_on_archive_kenlo_leads', () => {
  it('funções com SECURITY DEFINER e search_path fixo (não escalam nem herdam search_path)', () => {
    for (const fn of [
      'public.enqueue_recovery_from_kenlo_lead(lead public.kenlo_leads)',
      'public.tg_enqueue_recovery_on_archive_kenlo()',
      'public.tg_enqueue_recovery_on_insert_kenlo()',
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION ${fn}`);
    }
    expect((sql.match(/SECURITY DEFINER/g) || []).length).toBe(3);
    expect((sql.match(/SET search_path = public/g) || []).length).toBe(3);
  });

  it('trigger de UPDATE: AFTER UPDATE OF archived_at, só na transição ativo→arquivado', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS tr_kenlo_leads_enqueue_recovery ON public\.kenlo_leads/);
    expect(sql).toMatch(
      /CREATE TRIGGER tr_kenlo_leads_enqueue_recovery\s+AFTER UPDATE OF archived_at ON public\.kenlo_leads\s+FOR EACH ROW/,
    );
    // OLD arquivado OU NEW ativo → não faz nada (evita reenvio em UPDATE redundante).
    expect(sql).toMatch(/IF NEW\.archived_at IS NULL OR OLD\.archived_at IS NOT NULL THEN\s+RETURN NEW;/);
  });

  it('trigger de INSERT: só lead FRESCO já arquivado — gate is_backfill IS NOT TRUE contra spam no 1º sync', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS tr_kenlo_leads_enqueue_recovery_insert ON public\.kenlo_leads/);
    // O WHEN é o que impede a enxurrada: sem ele, o backfill histórico dispararia
    // recovery para cada lead arquivado importado.
    expect(sql).toMatch(
      /CREATE TRIGGER tr_kenlo_leads_enqueue_recovery_insert\s+AFTER INSERT ON public\.kenlo_leads\s+FOR EACH ROW\s+WHEN \(NEW\.archived_at IS NOT NULL AND NEW\.is_backfill IS NOT TRUE\)/,
    );
  });

  it('corpo compartilhado mapeia colunas de kenlo_leads (client_name/client_phone), NÃO name/phone', () => {
    expect(sql).toMatch(/NULLIF\(lead\.client_name, ''\)/);
    expect(sql).toMatch(/NULLIF\(lead\.client_phone, ''\)/);
    // A confusão que quebraria em runtime (42703): kenlo_leads não tem name/phone.
    expect(sql).not.toMatch(/\bNEW\.name\b/);
    expect(sql).not.toMatch(/\bNEW\.phone\b/);
    expect(sql).not.toMatch(/\blead\.name\b/);
    expect(sql).not.toMatch(/\blead\.phone\b/);
  });

  it("marca origem 'contact2sale' DENTRO do VALUES do INSERT (não só num comentário)", () => {
    // Trava o rótulo no lugar certo: bloco INSERT INTO recovery_queue ... VALUES (... 'contact2sale' ...).
    expect(sql).toMatch(/INSERT INTO public\.recovery_queue[\s\S]*?VALUES\s*\([\s\S]*?'contact2sale'[\s\S]*?\)/);
  });

  it('mesma idempotency_key do trigger de leads (tenant|lead|archived_at) com ON CONFLICT DO NOTHING', () => {
    expect(sql).toMatch(/lead\.tenant_id::text \|\| '\|' \|\| lead\.id::text \|\| '\|' \|\| lead\.archived_at::text/);
    expect(sql).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/);
  });

  it('nunca bloqueia o arquivamento: ambos os triggers capturam exceção e retornam NEW', () => {
    expect((sql.match(/EXCEPTION\s+WHEN OTHERS THEN/g) || []).length).toBe(2);
    expect((sql.match(/RAISE WARNING/g) || []).length).toBe(2);
    expect((sql.match(/RETURN NEW;/g) || []).length).toBeGreaterThanOrEqual(4); // 2 por trigger (feliz + handler)
  });
});
