/**
 * Regressão estrutural da migração que cria conversa WhatsApp para todo lead.
 * O trigger roda no Postgres (fora do alcance do vitest); estes asserts travam
 * os invariantes — remover ON CONFLICT, um dos triggers, a canonicalização ou
 * o guard de telefone quebra aqui antes do deploy (mesmo padrão source-scan de
 * proxy-production.brokers-assign.test.js).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../../supabase/migrations/20260702_ensure_whatsapp_conversation_on_lead_created.sql'),
  'utf8',
);

describe('migração ensure_whatsapp_conversation_on_lead_created', () => {
  it('cria a função com SECURITY DEFINER e search_path fixo', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.ensure_whatsapp_conversation_for_lead()');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
  });

  it('instala trigger BEFORE INSERT nas DUAS tabelas de lead (todas as origens)', () => {
    // leads: modal manual, Zap, Santa Ângela; kenlo_leads: API /api/v1/leads*,
    // batch/import e sync Kenlo. Juntas cobrem 100% dos caminhos de criação.
    // BEFORE (não AFTER) porque o trigger também escreve o link na descrição (NEW).
    for (const tabela of ['public\\.leads', 'public\\.kenlo_leads']) {
      expect(sql).toMatch(new RegExp(
        `CREATE TRIGGER tr_ensure_whatsapp_conversation\\s+BEFORE INSERT ON ${tabela}\\s+FOR EACH ROW`,
      ));
      expect(sql).toMatch(new RegExp(`DROP TRIGGER IF EXISTS tr_ensure_whatsapp_conversation ON ${tabela}`));
    }
  });

  it('anexa o link da conversa ao FINAL da descrição do lead, sem duplicar', () => {
    // Base configurável (sem ela o link é omitido, conversa criada normalmente).
    expect(sql).toMatch(/current_setting\('app\.dash_base_url', true\)/);
    expect(sql).toMatch(/IF v_base <> ''/);
    // leads.comments e kenlo_leads.message, cada um no seu branch.
    expect(sql).toMatch(/NEW\.comments :=/);
    expect(sql).toMatch(/NEW\.message :=/);
    // Idempotência: só anexa se ainda não houver link de conversa no texto.
    expect(sql).toMatch(/position\('\/chat\?phone=' IN NEW\.comments\) = 0/);
    expect(sql).toMatch(/position\('\/chat\?phone=' IN NEW\.message\) = 0/);
  });

  it('lê telefone/nome das duas variantes de coluna (leads e kenlo_leads)', () => {
    expect(sql).toMatch(/COALESCE\(v_row->>'phone',\s*v_row->>'client_phone'/);
    expect(sql).toMatch(/COALESCE\(v_row->>'name',\s*v_row->>'client_name'/);
  });

  it('canonicaliza como server/utils/phone.js: remove DDI duplicado, insere 9º dígito, prefixa 55', () => {
    expect(sql).toMatch(/regexp_replace/);                    // só dígitos
    expect(sql).toMatch(/> 11 AND v_phone LIKE '55%'/);       // remove DDI duplicado
    expect(sql).toMatch(/\|\| '9' \|\|/);                     // insere 9º dígito nos de 10
    expect(sql).toMatch(/'55' \|\| v_phone/);                 // DDI no resultado final
  });

  it('procura variantes históricas do número antes de criar (wa_id sem 9º dígito, sem DDI, com "+")', () => {
    expect(sql).toMatch(/v_variants/);
    expect(sql).toMatch(/contact_phone = ANY\(v_variants\)/);
    expect(sql).toMatch(/array_agg\('\+' \|\| v\)/);
  });

  it('entre múltiplas formas do mesmo número, prefere a conversa com histórico', () => {
    expect(sql).toMatch(/ORDER BY last_message_at DESC NULLS LAST, created_at/);
  });

  it('é idempotente e à prova de corrida: ON CONFLICT na chave tenant+telefone', () => {
    expect(sql).toContain('ON CONFLICT (tenant_id, contact_phone) DO UPDATE');
  });

  it('vínculo lead↔conversa preenche sem sobrescrever, com tabela de origem', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS lead_source_table/);
    expect(sql).toMatch(/COALESCE\(lead_id, NEW\.id\)/);
    expect(sql).toMatch(/COALESCE\(lead_source_table, TG_TABLE_NAME\)/);
    expect(sql).toMatch(/COALESCE\(whatsapp_conversations\.lead_id, EXCLUDED\.lead_id\)/);
  });

  it('nunca derruba a criação do lead: EXCEPTION vira WARNING e RETURN NEW', () => {
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN[\s\S]*RAISE WARNING[\s\S]*RETURN NEW/);
  });

  it('ignora leads sem telefone utilizável ou sem tenant (guard antes do INSERT)', () => {
    expect(sql).toMatch(/length\(v_phone\) < 10 OR NEW\.tenant_id IS NULL/);
  });
});
