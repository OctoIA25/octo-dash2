/**
 * Backfill único: commercial_sales (planilha REPORT 2026, já ingerida) → proposals.
 *
 * Contexto: o dash passa a ser a fonte das vendas (funil proposta→assinada) e o
 * espelho REPORT no Drive vira a "planilha preenchida pelo dash". Este script dá
 * a carga inicial: cada venda histórica entra como proposta 'proposta-assinada'
 * com signed_at e commission_total exatos da planilha (override — o motor do
 * espelho usa esse valor em vez de derivar 3,5/6%).
 *
 * Idempotente: marca cada proposta criada com
 * transaction_form.backfill_commercial_sale_id e pula as já marcadas.
 *
 * Uso:  node scripts/backfill-proposals-from-commercial-sales.mjs [--dry-run]
 * Env:  VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (lidos de .env)
 */
import { readFileSync } from 'node:fs';

const TENANT_ID = '65c69875-dc83-4062-90f6-6f6adc30df26'; // Lotus

// Apelidos da planilha → auth_user_id do corretor real (tenant_brokers).
// Conferido manualmente em 2026-09-01; nome não listado fica sem user (o
// espelho ainda mostra o nome, mas marca "revisar à mão" no split).
const CORRETORES = {
  'david venturini': '20403c21-88ba-41e3-bca7-c6bf23693970',
  'fernanda': '05262739-196d-4888-8d7d-bb84f6bc670d',
  'fernanda souza': '05262739-196d-4888-8d7d-bb84f6bc670d',
  'humberto': 'f45186d7-9565-4d68-969e-dda50dc41511',
  'humberto martinez': 'f45186d7-9565-4d68-969e-dda50dc41511',
  'flávia': '3cfb9746-6cf1-4199-bbd1-8dd4abbc1c2e',
  'flávia ceolin': '3cfb9746-6cf1-4199-bbd1-8dd4abbc1c2e',
  'flavia ceolin': '3cfb9746-6cf1-4199-bbd1-8dd4abbc1c2e',
  'gabi': '57b5e55e-5519-4d0c-acf4-6b80f72ba57b',
  'gabrielle': '57b5e55e-5519-4d0c-acf4-6b80f72ba57b',
  'gabriele fávaro': '57b5e55e-5519-4d0c-acf4-6b80f72ba57b',
  'andre': 'a91cad0b-3f56-41c9-ac02-a127e896a5d8',
  'andré marcondes': 'a91cad0b-3f56-41c9-ac02-a127e896a5d8',
  // 'nathalia lobo': saiu da empresa, sem membership — fica só o nome.
  // 'eduardo': ambíguo (Eduardo Lacerda × Carlos Eduardo) — fica só o nome.
  // 'flávia e humberto': venda conjunta — sem dono único, fica só o nome.
};

// Nome canônico para exibição/agregação (senão "Fernanda" e "Fernanda Souza"
// continuam contando como duas pessoas no ranking).
const NOMES = {
  '05262739-196d-4888-8d7d-bb84f6bc670d': 'Fernanda Souza',
  'f45186d7-9565-4d68-969e-dda50dc41511': 'Humberto Martinez',
  '3cfb9746-6cf1-4199-bbd1-8dd4abbc1c2e': 'Flavia Ceolin',
  '57b5e55e-5519-4d0c-acf4-6b80f72ba57b': 'Gabriele Fávaro',
  'a91cad0b-3f56-41c9-ac02-a127e896a5d8': 'André Marcondes',
  '20403c21-88ba-41e3-bca7-c6bf23693970': 'David Venturini',
};

const dryRun = process.argv.includes('--dry-run');

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_BASE = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env');

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { ...HEADERS, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null; // INSERT sem Prefer volta 201 com corpo vazio
}

const vendas = await rest(
  `commercial_sales?select=id,empreendimento,quadra,unidade,valor_vgv,comissao_total_venda,cliente_nome,corretor_nome,data_assinatura,data_recebimento&tenant_id=eq.${TENANT_ID}&is_active=eq.true&order=data_assinatura.asc&limit=1000`,
);
console.log(`Vendas ativas em commercial_sales: ${vendas.length}`);

// Já backfillados (idempotência).
const existentes = await rest(
  `proposals?select=transaction_form&tenant_id=eq.${TENANT_ID}&source=eq.manual&limit=1000`,
);
const jaFeitos = new Set(
  existentes.map((p) => p.transaction_form?.backfill_commercial_sale_id).filter(Boolean),
);

let criadas = 0;
let puladas = 0;
const semUser = new Map();

for (const v of vendas) {
  if (jaFeitos.has(v.id)) { puladas++; continue; }
  if (!v.data_assinatura) { console.warn(`SEM data_assinatura, pulando: ${v.empreendimento} ${v.unidade} (${v.corretor_nome})`); puladas++; continue; }

  const nomePlanilha = (v.corretor_nome || '').trim();
  const userId = CORRETORES[nomePlanilha.toLowerCase()] || null;
  if (!userId && nomePlanilha) semUser.set(nomePlanilha, (semUser.get(nomePlanilha) || 0) + 1);

  const unidade = [v.quadra, v.unidade].filter(Boolean).join('-');
  const proposta = {
    tenant_id: TENANT_ID,
    source: 'manual',
    status: 'Proposta Assinada',
    stage_id: 'proposta-assinada',
    property_reference: [v.empreendimento, unidade].filter(Boolean).join(' '),
    agent_user_id: userId,
    agent_name: (userId && NOMES[userId]) || nomePlanilha,
    value: v.valor_vgv ?? 0,
    // Meio-dia em SP: o espelho bucketa o mês em America/Sao_Paulo — meia-noite
    // UTC cairia no dia anterior e mudaria o mês nas viradas.
    signed_at: `${v.data_assinatura}T12:00:00-03:00`,
    commission_total: v.comissao_total_venda ?? null,
    forecast_empreendimento: v.empreendimento || null,
    forecast_unidade: unidade || null,
    forecast_estado: v.data_recebimento ? 'Recebido' : 'Assinado',
    transaction_form: { backfill_commercial_sale_id: v.id },
  };

  if (dryRun) {
    console.log(`[dry-run] ${v.data_assinatura} ${proposta.agent_name.padEnd(22)} ${proposta.property_reference.padEnd(28)} VGV ${proposta.value} com ${proposta.commission_total}`);
    criadas++;
    continue;
  }

  const [criada] = await rest('proposals', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(proposta),
  });

  if (v.cliente_nome?.trim()) {
    await rest('proposal_parties', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: TENANT_ID, proposal_id: criada.id, party_type: 'comprador', full_name: v.cliente_nome.trim() }),
    });
  }
  criadas++;
}

console.log(`\n${dryRun ? '[dry-run] criaria' : 'Criadas'}: ${criadas} | puladas (já feitas/sem data): ${puladas}`);
if (semUser.size) {
  console.log('Sem corretor resolvido (entram só com o nome — ajustar no dash se preciso):');
  for (const [nome, n] of semUser) console.log(`  - ${nome} (${n} venda${n > 1 ? 's' : ''})`);
}
