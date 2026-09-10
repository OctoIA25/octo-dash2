/**
 * Invariantes do SQL de 20260910_lia_cadencia.sql.
 *
 * A migration não roda aqui (não há Postgres no CI), então o teste lê o
 * arquivo e trava as decisões que, se alguém desfizer sem perceber, viram
 * vazamento de dado ou cadência duplicada:
 *
 *  - RLS habilitada e NENHUMA policy criada — `lia_followups` é server-side
 *    (motivo/message_sent carregam texto de conversa com o cliente). Uma
 *    policy nova aqui exporia isso ao PostgREST com a anon key.
 *  - o REVOKE fica COMENTADO até sabermos com que chave o app da LIA escreve;
 *    ativá-lo às cegas mata a cadência em silêncio.
 *  - o índice único de idempotência é PARCIAL: sem o WHERE, as 2.527 linhas
 *    existentes (idempotency_key NULL) colidiriam e a migration falharia.
 *  - as colunas novas não têm DEFAULT de valor (só updated_at): um DEFAULT
 *    'whatsapp' faria o passado parecer declarado quando é desconhecido.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../../supabase/migrations/20260910_lia_cadencia.sql'),
  'utf8',
);
/** Só o SQL executável — comentário citando "REVOKE" não pode passar por código. */
const code = sql.replace(/--[^\n]*/g, '');

describe('20260910 lia_cadencia — segurança', () => {
  it('habilita RLS em lia_followups', () => {
    expect(code.includes('ALTER TABLE public.lia_followups ENABLE ROW LEVEL SECURITY')).toBe(true);
  });

  it('NÃO cria policy — a tabela é server-side (service_role apenas)', () => {
    expect(/CREATE\s+POLICY/i.test(code)).toBe(false);
  });

  it('mantém o REVOKE comentado até confirmarmos a chave do app da LIA', () => {
    expect(/REVOKE/i.test(code)).toBe(false);
    expect(sql.includes('-- REVOKE ALL ON public.lia_followups FROM anon, authenticated;')).toBe(true);
  });

  it('não concede acesso a anon/authenticated', () => {
    expect(/GRANT[\s\S]*?\b(anon|authenticated)\b/i.test(code)).toBe(false);
  });
});

describe('20260910 lia_cadencia — idempotência e colunas', () => {
  it('índice único de idempotência é parcial (WHERE idempotency_key IS NOT NULL)', () => {
    const idx = code.match(/CREATE UNIQUE INDEX[\s\S]*?ux_lia_followups_idem[\s\S]*?;/i);
    expect(idx).not.toBeNull();
    expect(idx[0]).toMatch(/\(tenant_id,\s*idempotency_key\)/i);
    expect(idx[0]).toMatch(/WHERE\s+idempotency_key\s+IS\s+NOT\s+NULL/i);
  });

  it('cria as seis colunas novas, todas com IF NOT EXISTS', () => {
    for (const col of ['channel', 'replied_at', 'outcome', 'template_name', 'idempotency_key', 'updated_at']) {
      expect(code).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`, 'i'));
    }
  });

  it('só updated_at tem DEFAULT — as demais nascem NULL ("não informado")', () => {
    const bloco = code.match(/ALTER TABLE public\.lia_followups\s+ADD COLUMN[\s\S]*?;/i)[0];
    const comDefault = [...bloco.matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)[^,;]*DEFAULT/gi)].map((m) => m[1]);
    expect(comDefault).toEqual(['updated_at']);
  });

  it('CHECKs de channel/outcome aceitam NULL e entram como NOT VALID', () => {
    for (const nome of ['lia_followups_channel_check', 'lia_followups_outcome_check']) {
      const c = code.match(new RegExp(`ADD CONSTRAINT ${nome}[\\s\\S]*?NOT VALID`, 'i'));
      expect(c, nome).not.toBeNull();
      expect(c[0]).toMatch(/IS NULL OR/i);
    }
  });

  it('não cria FOREIGN KEY em lead_id — quem escreve é um app externo', () => {
    expect(/ADD CONSTRAINT[\s\S]*?FOREIGN KEY[\s\S]*?lead_id/i.test(code)).toBe(false);
  });

  it('é idempotente: todo DDL usa IF NOT EXISTS ou guarda em pg_constraint', () => {
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.lia_followups/i);
    const indices = [...code.matchAll(/CREATE (?:UNIQUE )?INDEX([\s\S]*?)ON /gi)];
    expect(indices.length).toBe(3);
    for (const [, meio] of indices) expect(meio).toMatch(/IF NOT EXISTS/i);
    expect(code).toMatch(/FROM pg_constraint WHERE conname = 'lia_followups_channel_check'/);
  });

  it('não insere linha de mentira para provar a migration', () => {
    expect(/INSERT\s+INTO/i.test(code)).toBe(false);
  });
});
