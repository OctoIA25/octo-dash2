/**
 * Backfill: apaga de `leads.property_code` o código que o PORTAL inventou.
 *
 * POR QUE EXISTE
 * `clientListingId` é o id do anúncio no publicador. Anúncio que saiu do nosso
 * feed VRSync devolve o `codigo_imovel` (AP679, CA0056); anúncio publicado por
 * fora devolve um id do portal ('I7V1GD') que não é imóvel nenhum — e ele ia
 * para `property_code` como se fosse. Desde server/lancamentoAnuncios.js
 * (`semCodigoDoCatalogo`) o lead NOVO já entra sem esse código; este script
 * limpa os que entraram antes. Medido em 12/set/2026: 21 leads da Lotus Brokers,
 * em 8 anúncios.
 *
 * SÓ APAGA O QUE NÓS MESMOS ESCREVEMOS DO PAYLOAD. Três travas, todas obrigatórias:
 *   1. o lead veio de portal (source ZAP/OLX/Instagram/Facebook);
 *   2. `property_code` é LITERALMENTE o `clientListingId` que o portal mandou —
 *      código digitado por gente, ou trocado pelo de-para, não casa e não é tocado;
 *   3. `eh_codigo_catalogo` diz `false` — a mesma função do trigger de entrada.
 * Anúncio que está no de-para é pulado antes de tudo: ali o código é nosso.
 *
 * O código do portal NÃO se perde: continua em
 * custom_fields.raw_data.original_request.clientListingId, que é de onde a tela
 * de pendência do Bolsão lê para amarrar o anúncio a um imóvel.
 *
 * A classificação não é recalculada de propósito: medido contra o banco em
 * 12/set, `classificar_lead_com_lancamento` devolve ['indefinido'] tanto com o
 * código fantasma quanto sem código — o resultado é o mesmo e mexer nela só
 * acordaria o guard de `classification_source`.
 *
 * Idempotente. Dry-run por padrão; --apply grava.
 *
 * Uso:
 *   node scripts/backfill-codigo-portal-sem-catalogo.mjs                  # dry-run
 *   node scripts/backfill-codigo-portal-sem-catalogo.mjs --apply
 *   node scripts/backfill-codigo-portal-sem-catalogo.mjs --apply --tenant=<id>
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
// service_role: o guard tg_classification_source_guard só preserva
// `classification_source` para ele. Mesma razão do backfill-codigo-lancamento.
const supabase = createClient(url, key, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1] || null;
const PAGE = 1000;

// As mesmas origens de server/zap/anunciosPendentes.js.
const FONTES = 'source.ilike.%zap%,source.ilike.%olx%,source.ilike.%instagram%,source.ilike.%facebook%';

const req = (lead) => lead?.custom_fields?.raw_data?.original_request || {};
const texto = (v) => String(v ?? '').trim().toUpperCase();
const anuncioDoLead = (lead) =>
  String(req(lead).originListingId ?? lead?.custom_fields?.raw_data?.meta?.form_id ?? '').trim() || null;

const { data: depara, error: eDepara } = await supabase
  .from('lancamento_anuncios').select('tenant_id, origin_listing_id');
if (eDepara) { console.error('erro lendo lancamento_anuncios:', eDepara.message); process.exit(1); }
const mapeados = new Set((depara || []).map((d) => `${d.tenant_id}|${d.origin_listing_id}`));

console.log(`de-para: ${mapeados.size} anúncios | modo: ${APPLY ? 'APPLY' : 'dry-run'}\n`);

const catalogo = new Map();
/** Códigos cuja resposta o banco não deu — leads pulados, não limpos. */
const incertos = new Set();

async function ehDoCatalogo(tenantId, codigo) {
  const chave = `${tenantId}|${codigo}`;
  if (catalogo.has(chave)) return catalogo.get(chave);
  const { data, error } = await supabase.rpc('eh_codigo_catalogo', { p_tenant: tenantId, p_codigo: codigo });
  // Erro vira `true` (= "não mexe"): a mesma falha aberta do servidor, para um
  // problema de banco nunca apagar o código de um imóvel que existe.
  //
  // E NÃO ENTRA NO CACHE. Uma queda de rede em 12/set respondeu `fetch failed`
  // para 'I7V1GD', o `true` ficou memorizado e os 4 leads daquele anúncio foram
  // pulados em silêncio — o resumo disse "a limpar: 17" como se 17 fosse o
  // número verdadeiro. Só resposta definitiva é memorizada; incerta é contada e
  // aparece no fim.
  if (error) {
    console.error(`  ⚠️  eh_codigo_catalogo(${codigo}):`, error.message, '— lead pulado, rode de novo');
    incertos.add(chave);
    return true;
  }
  catalogo.set(chave, data === true);
  return data === true;
}

let lidos = 0, alvo = 0, gravados = 0, falhas = 0;
const porAnuncio = new Map();

for (let from = 0; ; from += PAGE) {
  let q = supabase
    .from('leads')
    .select('id, name, tenant_id, source, property_code, custom_fields')
    .or(FONTES)
    .not('property_code', 'is', null)
    .order('created_at', { ascending: true })
    .range(from, from + PAGE - 1);
  if (tenantArg) q = q.eq('tenant_id', tenantArg);

  const { data, error } = await q;
  if (error) { console.error('erro lendo leads:', error.message); process.exit(1); }
  if (!data?.length) break;
  lidos += data.length;

  for (const lead of data) {
    const anuncio = anuncioDoLead(lead);
    if (!anuncio) continue;                                            // trava 1: veio de webhook de portal
    if (mapeados.has(`${lead.tenant_id}|${anuncio}`)) continue;        // no de-para o código é nosso
    if (texto(req(lead).clientListingId) !== texto(lead.property_code)) continue; // trava 2: foi o portal que escreveu
    if (await ehDoCatalogo(lead.tenant_id, lead.property_code)) continue;         // trava 3: não é imóvel nosso

    alvo += 1;
    porAnuncio.set(anuncio, (porAnuncio.get(anuncio) || 0) + 1);
    console.log(`  ${String(lead.name).slice(0, 24).padEnd(24)} ${String(lead.source).padEnd(14)} anúncio ${anuncio.padEnd(18)} ${lead.property_code} → (vazio)`);

    if (!APPLY) continue;
    const { error: eUp } = await supabase.from('leads').update({ property_code: null }).eq('id', lead.id);
    if (eUp) { console.error(`    ❌ ${lead.id}:`, eUp.message); falhas += 1; } else gravados += 1;
  }

  if (data.length < PAGE) break;
}

console.log(`\nleads de portal lidos: ${lidos} | a limpar: ${alvo} em ${porAnuncio.size} anúncios`);
console.log(APPLY ? `gravados: ${gravados} | falhas: ${falhas}` : 'dry-run — nada gravado (use --apply)');

// Rodada incompleta NÃO pode parecer sucesso: o número acima é só o que esta
// rodada conseguiu ver. Códigos incertos nem entraram na conta de `alvo`.
if (incertos.size) {
  console.log(`\n⚠️  ${incertos.size} código(s) sem resposta do banco — os leads deles NÃO entraram na conta:`);
  for (const c of incertos) console.log(`     ${c.split('|')[1]}`);
}
if (falhas || incertos.size) {
  console.log('\n⚠️  rodada INCOMPLETA. O script é idempotente: rode de novo para pegar o que faltou.');
  process.exit(1);
}
