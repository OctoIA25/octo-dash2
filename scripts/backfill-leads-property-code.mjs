/**
 * Backfill: preenche leads.property_code a partir de kenlo_leads.interest_reference,
 * casando por telefone. Corrige leads criados pelo loopback da Lia/n8n ANTES do fix
 * do resolvePropertyCode (webhook manda `codigo`, endpoint não lia → property_code null).
 *
 * Idempotente: só toca linhas com property_code null que têm par em kenlo_leads com
 * interest_reference. Rodar quantas vezes quiser. Dry-run por padrão; --apply grava.
 *
 * Uso:
 *   node scripts/backfill-leads-property-code.mjs                 # dry-run (default)
 *   node scripts/backfill-leads-property-code.mjs --apply         # grava
 *   node scripts/backfill-leads-property-code.mjs --apply --tenant=<id>  # escopo
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || null;
const SINCE = process.argv.find((a) => a.startsWith('--since='))?.split('=')[1] || '2026-06-01T00:00:00Z';

// Telefone canônico p/ casar as duas tabelas: só dígitos, últimos 11 (DDD+numero).
const normPhone = (p) => (p || '').replace(/\D/g, '').slice(-11);

async function tenantsToProcess() {
  if (tenantArg) return [tenantArg];
  const { data } = await supabase.from('leads').select('tenant_id').is('property_code', null).gte('created_at', SINCE);
  return [...new Set((data || []).map((r) => r.tenant_id))];
}

let totalRecuperados = 0, totalSemPar = 0;
for (const tenantId of await tenantsToProcess()) {
  // alvo: leads sem código
  const { data: alvo, error: e1 } = await supabase
    .from('leads').select('id, name, phone').eq('tenant_id', tenantId).is('property_code', null).gte('created_at', SINCE);
  if (e1) { console.error(`[${tenantId}] erro leads:`, e1.message); continue; }

  // fonte: kenlo_leads com código
  const { data: fonte, error: e2 } = await supabase
    .from('kenlo_leads').select('client_phone, interest_reference')
    .eq('tenant_id', tenantId).not('interest_reference', 'is', null).gte('created_at', SINCE);
  if (e2) { console.error(`[${tenantId}] erro kenlo_leads:`, e2.message); continue; }

  const refByPhone = new Map();
  for (const r of fonte || []) { const k = normPhone(r.client_phone); if (k && !refByPhone.has(k)) refByPhone.set(k, r.interest_reference); }

  let rec = 0, semPar = 0;
  for (const l of alvo || []) {
    const ref = refByPhone.get(normPhone(l.phone));
    if (!ref) { semPar++; continue; }
    rec++;
    if (APPLY) {
      const { error } = await supabase.from('leads')
        .update({ property_code: ref.trim().toUpperCase() }).eq('id', l.id);
      if (error) console.error(`  falha id=${l.id}: ${error.message}`);
    }
  }
  console.log(`[${tenantId}] recuperáveis=${rec} sem_par=${semPar} ${APPLY ? '(gravado)' : '(dry-run)'}`);
  totalRecuperados += rec; totalSemPar += semPar;
}
console.log(`\nTOTAL: recuperados=${totalRecuperados} sem_par=${totalSemPar} ${APPLY ? '✅ aplicado' : '— dry-run, use --apply p/ gravar'}`);
