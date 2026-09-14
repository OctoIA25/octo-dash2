/**
 * Regressão estrutural da migration de rascunho de imóvel.
 * O trigger roda no Postgres, fora do alcance do vitest; a sanidade de catálogo
 * roda DENTRO da migration (bloco DO). Este arquivo trava as regras do guard de
 * status_aprovacao por leitura do SQL — mesmo padrão de
 * leadClassificationMigration.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../supabase/migrations/20260915_imovel_rascunho.sql'),
  'utf8',
);

// Só o código executável: o cabeçalho/ROLLBACK comentado não pode satisfazer asserts.
const code = sql.replace(/^\s*--.*$/gm, '');

const funcao = (nome) => {
  const m = code.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}\\(\\)[\\s\\S]*?\\$\\$;`));
  return m ? m[0] : '';
};
const guard = funcao('tg_guard_status_aprovacao');

describe('migration 20260915_imovel_rascunho', () => {
  it('roda numa transação com lock_timeout', () => {
    expect(code).toMatch(/^BEGIN;/m);
    expect(code).toMatch(/^COMMIT;\s*$/m);
    expect(code).toMatch(/SET LOCAL lock_timeout = '\d+s';/);
  });

  it('CHECK de status_aprovacao passa a aceitar rascunho (sem perder os antigos)', () => {
    const check = code.match(/ADD CONSTRAINT imoveis_locais_status_aprovacao_check\s+CHECK \(([^;]*?)\)\s*,/);
    expect(check).not.toBeNull();
    for (const v of ['rascunho', 'aguardando', 'aprovado', 'nao_aprovado']) {
      expect(check[1]).toContain(`'${v}'`);
    }
    expect(code).toContain('DROP CONSTRAINT IF EXISTS imoveis_locais_status_aprovacao_check');
  });

  it('status_aprovacao vira NOT NULL — `.neq(rascunho)` não descarta linha NULL', () => {
    expect(code).toMatch(/ALTER COLUMN status_aprovacao SET NOT NULL/);
  });

  it('condominios não é alterado: nem tabela, nem CHECK', () => {
    expect(code).not.toMatch(/ALTER TABLE public\.condominios/);
    expect(code).not.toMatch(/DROP TRIGGER[^;]*ON public\.condominios/);
  });

  it('atualizado_por: coluna + carimbo por trigger BEFORE INSERT OR UPDATE', () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS atualizado_por UUID/i);
    const carimbo = funcao('imoveis_locais_carimbar_atualizado_por');
    expect(carimbo).toContain('NEW.atualizado_por := COALESCE(auth.uid(), NEW.atualizado_por);');
    expect(carimbo).toContain('SET search_path = public');
    expect(carimbo).not.toContain('SECURITY DEFINER');
    expect(code).toMatch(
      /CREATE TRIGGER tg_imoveis_locais_atualizado_por\s+BEFORE INSERT OR UPDATE ON public\.imoveis_locais\s+FOR EACH ROW EXECUTE FUNCTION public\.imoveis_locais_carimbar_atualizado_por\(\);/,
    );
  });

  describe('guard tg_guard_status_aprovacao', () => {
    it('continua SECURITY DEFINER, search_path fixo e service_role passa direto', () => {
      expect(guard).toContain('SECURITY DEFINER');
      expect(guard).toContain('SET search_path = public');
      expect(guard).toMatch(/IF auth\.uid\(\) IS NULL THEN\s+RETURN NEW;/);
    });

    it('rascunho → aprovado/nao_aprovado e publicado → rascunho dão RAISE, antes do atalho do gestor', () => {
      const raises = guard.indexOf("IF TG_TABLE_NAME = 'imoveis_locais' AND TG_OP = 'UPDATE' THEN");
      const gestor = guard.indexOf('IF public.proposals_is_tenant_manager(NEW.tenant_id) THEN');
      expect(raises).toBeGreaterThan(-1);
      expect(gestor).toBeGreaterThan(raises);

      const bloco = guard.slice(raises, gestor);
      expect(bloco).toMatch(
        /OLD\.status_aprovacao = 'rascunho' AND NEW\.status_aprovacao IN \('aprovado', 'nao_aprovado'\) THEN\s+RAISE EXCEPTION[^;]*USING ERRCODE = 'check_violation';/,
      );
      expect(bloco).toMatch(
        /OLD\.status_aprovacao <> 'rascunho' AND NEW\.status_aprovacao = 'rascunho' THEN\s+RAISE EXCEPTION[^;]*USING ERRCODE = 'check_violation';/,
      );
    });

    it('INSERT de não-gestor mantém rascunho (só em imoveis_locais) e força aguardando no resto', () => {
      expect(guard).toMatch(
        /IF TG_OP = 'INSERT' THEN\s+IF TG_TABLE_NAME <> 'imoveis_locais' OR NEW\.status_aprovacao IS DISTINCT FROM 'rascunho' THEN\s+NEW\.status_aprovacao := 'aguardando';\s+END IF;\s+NEW\.aprovado_por := NULL;\s+NEW\.aprovado_em := NULL;\s+NEW\.motivo_aprovacao := NULL;\s+RETURN NEW;/,
      );
    });

    it('UPDATE de não-gestor só libera rascunho → aguardando; o resto é restaurado do OLD', () => {
      expect(guard).toMatch(
        /IF TG_TABLE_NAME <> 'imoveis_locais'\s+OR OLD\.status_aprovacao IS DISTINCT FROM 'rascunho'\s+OR NEW\.status_aprovacao IS DISTINCT FROM 'aguardando' THEN\s+NEW\.status_aprovacao := OLD\.status_aprovacao;\s+END IF;\s+NEW\.aprovado_por := OLD\.aprovado_por;\s+NEW\.aprovado_em := OLD\.aprovado_em;\s+NEW\.motivo_aprovacao := OLD\.motivo_aprovacao;\s+RETURN NEW;/,
      );
    });

    it('condominios preservado: toda regra de rascunho é condicionada à tabela', () => {
      // Fora do bloco `IF TG_TABLE_NAME = 'imoveis_locais' ...` dos RAISE, 'rascunho'
      // só pode aparecer em condição que começa por `TG_TABLE_NAME <> 'imoveis_locais' OR`
      // — para condominios ela é sempre verdadeira, ou seja, o caminho de 20260907.
      const inicio = guard.indexOf("IF TG_TABLE_NAME = 'imoveis_locais' AND TG_OP = 'UPDATE' THEN");
      const fim = guard.indexOf('IF public.proposals_is_tenant_manager(NEW.tenant_id) THEN');
      const fora = guard.slice(0, inicio) + guard.slice(fim);
      const condicoes = [...fora.matchAll(/IF ([\s\S]*?) THEN/g)]
        .map((m) => m[1])
        .filter((c) => c.includes("'rascunho'"));

      expect(condicoes).toHaveLength(2);
      for (const c of condicoes) expect(c).toMatch(/^TG_TABLE_NAME <> 'imoveis_locais'\s+OR /);
      const resto = condicoes.reduce((s, c) => s.replace(c, ''), fora);
      expect(resto).not.toContain("'rascunho'");
    });
  });

  it('log ignora atualizado_por no diff e mantém o ramo DELETE vivo (valor_venda)', () => {
    const log = funcao('log_imoveis_locais_alteracoes');
    expect(log).toMatch(/campo\.key NOT IN \('updated_at', 'atualizado_por'\)/);
    expect(log).toContain("jsonb_build_object('valor_venda', jsonb_build_object('de', OLD.valor_venda, 'para', NULL))");
  });

  it('não recria o notify: rascunho não notifica, publicar (→ aguardando) notifica', () => {
    expect(code).not.toContain('notify_gestor_imovel_pendente');
  });

  it('sanidade provada por asserts na própria migration, sem escrever dados', () => {
    const bloco = code.match(/DO \$\$[\s\S]*?END \$\$;/);
    expect(bloco).not.toBeNull();
    expect(bloco[0]).toMatch(/ASSERT[\s\S]*rascunho/);
    expect(bloco[0]).toMatch(/ASSERT \(SELECT attnotnull/);
    expect(bloco[0]).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
});
