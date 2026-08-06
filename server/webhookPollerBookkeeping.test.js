/**
 * O poller vive dentro de proxy-production.js (não exportado), então o invariante
 * é travado por source-scan — mesmo padrão de whatsapp/ensureConversationMigration.test.js.
 *
 * Invariante: gravar o desfecho de um webhook NUNCA pode falhar calado. Quando o
 * .update() não era conferido, um 42703 (coluna last_error ausente em prod)
 * deixava o evento 'pending' com attempts=0 re-tentando para sempre — visualmente
 * idêntico a fila normal. Levou ~2 meses para aparecer, porque só se manifesta
 * quando existe subscription de verdade para entregar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = readFileSync(path.join(__dirname, 'proxy-production.js'), 'utf8');
const migration = readFileSync(
  path.join(__dirname, '../supabase/migrations/20260805_add_last_error_to_webhook_events.sql'),
  'utf8',
);

describe('bookkeeping do poller de webhook_events', () => {
  it('confere o erro do UPDATE de desfecho e loga', () => {
    expect(server).toMatch(/const recordOutcome = async \(patch\) => \{[\s\S]*?const \{ error: updateError \} = await supabase/);
    expect(server).toMatch(/if \(updateError\) \{[\s\S]*?console\.error\(/);
  });

  it('usa recordOutcome nos DOIS desfechos (entregue e falha)', () => {
    // Um .update() cru em qualquer um dos ramos reintroduz o silêncio.
    expect(server).toMatch(/await recordOutcome\(\{\s*status: 'delivered'/);
    expect(server).toMatch(/await recordOutcome\(\{\s*status: exhausted \? 'failed' : 'pending'/);
  });

  it('a coluna last_error é garantida por migração idempotente', () => {
    expect(migration).toMatch(/ALTER TABLE public\.webhook_events\s+ADD COLUMN IF NOT EXISTS last_error TEXT/);
  });
});
