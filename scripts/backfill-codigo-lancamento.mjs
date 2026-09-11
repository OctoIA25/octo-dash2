/**
 * Backfill: reescreve leads.property_code com o código do lançamento (L0NN) nos
 * leads que entraram ANTES do de-para `lancamento_anuncios` (03/set/2026 para o
 * ZAP, 10/set para o Meta Lead Ads).
 *
 * POR QUE EXISTE
 * O portal devolve o ID do anúncio DELE (`clientListingId` = '110D1GD'), não o
 * nosso código — só bate quem foi publicado pelo nosso feed VRSync. O de-para
 * (server/lancamentoAnuncios.js) resolve isso na ENTRADA do lead; quem chegou
 * antes ficou com o código do portal gravado e classificação `indefinido`.
 * Medido em 11/set/2026: 33 leads de ZAP do tenant Lotus Brokers.
 *
 * O código do portal NÃO se perde: continua em
 * custom_fields.raw_data.original_request (ZAP) / .raw_data.meta (Meta) — é de
 * lá que este script lê a chave, e é por lá que se desfaz o backfill.
 *
 * Idempotente: só toca lead cujo anúncio está no de-para e cujo código difere.
 * Rodar quantas vezes quiser. Dry-run por padrão; --apply grava.
 *
 * Uso:
 *   node scripts/backfill-codigo-lancamento.mjs                        # dry-run
 *   node scripts/backfill-codigo-lancamento.mjs --apply
 *   node scripts/backfill-codigo-lancamento.mjs --apply --tenant=<id>
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
// service_role de propósito: tg_classification_source_guard só preserva
// `classification_source` para service_role — com JWT de usuário ele carimbaria
// 'dashboard' e este reprocessamento automático viraria decisão humana.
const supabase = createClient(url, key, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || null;
const PAGE = 1000;

// A chave do anúncio: o ZAP manda `originListingId`; o Meta Lead Ads, `form_id`.
// As duas moram na mesma coluna do de-para (ver 20260910_meta_form_lancamento.sql).
const chaveAnuncio = (customFields) => {
  const raw = customFields?.raw_data || {};
  const v = raw.original_request?.originListingId ?? raw.meta?.form_id;
  const s = v == null ? '' : String(v).trim();
  return s || null;
};

const { data: depara, error: eDepara } = await supabase
  .from('lancamento_anuncios').select('tenant_id, origin_listing_id, codigo');
if (eDepara) { console.error('erro lendo lancamento_anuncios:', eDepara.message); process.exit(1); }

const mapa = new Map((depara || []).map((d) => [`${d.tenant_id}|${d.origin_listing_id}`, d.codigo]));
const tenants = tenantArg ? [tenantArg] : [...new Set((depara || []).map((d) => d.tenant_id))];
console.log(`de-para: ${mapa.size} anúncios | tenants: ${tenants.length} | modo: ${APPLY ? 'APPLY' : 'dry-run'}\n`);

let alvo = 0, gravados = 0, falhas = 0;
for (const tenantId of tenants) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, source, property_code, classification_source, custom_fields')
      .eq('tenant_id', tenantId)
      // order() não é enfeite: sem ORDER BY, o offset do PostgREST devolve
      // páginas com linhas repetidas e linhas puladas — a primeira versão deste
      // script perdeu 48 leads assim.
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) { console.error(`[${tenantId}] erro lendo leads:`, error.message); break; }

    for (const lead of data || []) {
      const codigo = mapa.get(`${tenantId}|${chaveAnuncio(lead.custom_fields)}`);
      if (!codigo) continue;
      if ((lead.property_code || '').trim().toUpperCase() === codigo) continue;

      // Um código que está no de-para É lançamento, por definição — a mesma
      // regra de eh_codigo_lancamento(). Mas classificação de humano/Lia é
      // intocável: reprocessamento automático só mexe em 'automatic' (20260818).
      const reclassifica = lead.classification_source === 'automatic';
      const patch = { property_code: codigo, ...(reclassifica ? { classification: ['lancamento'] } : {}) };

      alvo++;
      console.log(`${lead.id} | ${lead.source} | ${lead.property_code ?? 'null'} -> ${codigo}${reclassifica ? ' (+ lancamento)' : ' (classificação preservada)'}`);
      if (!APPLY) continue;

      const { error: eUp } = await supabase.from('leads').update(patch).eq('id', lead.id);
      if (eUp) { falhas++; console.error(`  falha id=${lead.id}: ${eUp.message}`); } else { gravados++; }
    }

    if (!data || data.length < PAGE) break;
  }
}

console.log(`\nalvo: ${alvo} | gravados: ${gravados} | falhas: ${falhas}`);
if (!APPLY) console.log('dry-run — nada foi gravado. Rode com --apply para gravar.');
// bolsao acompanha sozinho: tr_leads_codigo_to_bolsao e
// tr_leads_classification_to_bolsao espelham código e classificação no UPDATE.
