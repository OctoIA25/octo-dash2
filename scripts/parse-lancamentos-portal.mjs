/**
 * Parser HEURÍSTICO das descrições dos books para PROPOR os campos do Portal
 * (cidade, bairro, construtora, dormitorios, specs, estagio). SÓ LEITURA — não
 * escreve nada no banco. Gera:
 *
 *   scripts/out/lancamentos-portal-proposto.json  → revise e edite à mão
 *   (stdout)                                       → tabela + confiança por campo
 *
 * Depois de revisar o JSON, aplique com:
 *   node scripts/apply-lancamentos-portal.mjs   (script separado, dry-run por default)
 *
 * ⚠️ Texto livre não é estruturado: trate TODA proposta como rascunho. Campos de
 * baixa confiança vêm marcados "?"; o esperado é você corrigir no JSON.
 *
 * Uso:  node scripts/parse-lancamentos-portal.mjs [tenant_id]
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const TENANT = process.argv[2] || '65c69875-dc83-4062-90f6-6f6adc30df26';

// ── Extratores. Cada um retorna { value, conf } (conf: 'alta' | 'baixa' | null).
//    Regex propositalmente conservador: prefere não propor a propor errado.

// "em Jundiaí/SP", "em Jundiaí (SP)", "em Jundiaí, São Paulo", "em Itupeva/SP"
function cidade(t) {
  let m = t.match(/em\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+){0,2})\s*[\/(]\s*(?:SP|São Paulo)/);
  if (m) return { value: m[1].trim(), conf: 'alta' };
  m = t.match(/em\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+),\s*São Paulo/);
  if (m) return { value: m[1].trim(), conf: 'alta' };
  // fallback baixa-confiança: cidades conhecidas da região citadas soltas no texto
  m = t.match(/\b(Jundiaí|Itupeva|Itatiba|Valinhos|Campinas|Várzea Paulista|Louveira|Vinhedo)\b/);
  if (m) return { value: m[1], conf: 'baixa' };
  return { value: null, conf: null };
}

// "no bairro Medeiros", "no Jardim do Lago", "na Vila Arens", "no Horto Florestal"
function bairro(t) {
  let m = t.match(/no bairro\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+(?:\s+(?:do|da|de|dos|das)?\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+){0,2})/);
  if (m) return { value: m[1].trim(), conf: 'alta' };
  m = t.match(/n[oa]\s+((?:Jardim|Vila|Parque|Horto|Chácara)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇa-zà-ÿ]+){0,2})/);
  if (m) return { value: m[1].trim(), conf: 'baixa' };
  return { value: null, conf: null };
}

// "da Construtora Santa Angela", "desenvolvido pela Mac Lucer", "pela Tebas Engenharia"
function construtora(t) {
  let m = t.match(/(?:desenvolvid[oa]|empreendimento)\s+(?:d[aeo]s?\s+)?(?:pel[ao]\s+)?(?:Construtora\s+|Incorporadora\s+)?([A-ZÁÉÍÓÚ][\wÀ-ÿ]+(?:\s+[A-ZÁÉÍÓÚ][\wÀ-ÿ]+){0,2})/);
  if (m) {
    const v = m[1].trim();
    // filtra falsos-positivos óbvios ("é", "residencial", nome do próprio empreend.)
    if (!/^(é|Residencial|imobiliário|de)$/i.test(v)) return { value: v, conf: 'baixa' };
  }
  m = t.match(/pel[ao]\s+((?:Construtora\s+|Incorporadora\s+)?[A-ZÁÉÍÓÚ][\wÀ-ÿ]+(?:\s+[A-ZÁÉÍÓÚ][\wÀ-ÿ]+){0,2})/);
  if (m) return { value: m[1].trim(), conf: 'baixa' };
  return { value: null, conf: null };
}

// "2 ou 3 dormitórios", "2 e 3 dorms", "2 dormitórios com suíte", "três suítes"
function dormitorios(t) {
  const m = t.match(/(\d+(?:\s*(?:e|ou|a)\s*\d+)?)\s*dormit[óo]rios?/i);
  if (m) return { value: m[1].replace(/\s+/g, ' ').trim() + ' dorms', conf: 'baixa' };
  const s = t.match(/(?:com\s+)?(?:três|3)\s+su[íi]tes/i);
  if (s) return { value: '3 suítes', conf: 'baixa' };
  return { value: null, conf: null };
}

// metragens: "53 m², 68 m² e 85 m²" → junta as áreas p/ a linha de specs
function specs(t, dorms) {
  const areas = [...t.matchAll(/(\d{2,3})\s*m²/g)].map((m) => +m[1]);
  if (!areas.length) return { value: null, conf: null };
  const min = Math.min(...areas), max = Math.max(...areas);
  const faixa = min === max ? `${min} m²` : `${min}–${max} m²`;
  const value = dorms?.value ? `${faixa} · ${dorms.value}` : faixa;
  return { value, conf: 'baixa' };
}

const { data, error } = await supabase
  .from('lancamentos')
  .select('id, nome, descricao, cidade, bairro, estagio, construtora, dormitorios, specs')
  .eq('tenant_id', TENANT)
  .order('created_at', { ascending: true });

if (error) {
  console.error('❌ Erro na query:', error.code, error.message);
  process.exit(1);
}

const flag = (c) => (c === 'alta' ? '  ' : c === 'baixa' ? ' ?' : ' ∅');
const propostas = [];

console.log(`\n🔎 Parseando ${data.length} book(s) — tenant ${TENANT}`);
console.log('   (∅ = não achei · ? = baixa confiança, confira · <vazio> = alta)\n');

for (const l of data) {
  const t = (l.descricao || '').replace(/\s+/g, ' ').trim();
  const c = cidade(t), b = bairro(t), k = construtora(t), d = dormitorios(t);
  const sp = specs(t, d);

  // só propõe onde o campo está VAZIO no banco (não sobrescreve o que já existe).
  const prop = {
    id: l.id,
    nome: l.nome,
    cidade: l.cidade ?? c.value,
    bairro: l.bairro ?? b.value,
    construtora: l.construtora ?? k.value,
    dormitorios: l.dormitorios ?? d.value,
    specs: l.specs ?? sp.value,
    estagio: l.estagio ?? null, // não dá p/ inferir do texto de forma confiável
    _confianca: { cidade: c.conf, bairro: b.conf, construtora: k.conf, dormitorios: d.conf, specs: sp.conf },
  };
  propostas.push(prop);

  console.log(`▸ ${l.nome}`);
  console.log(`    cidade${flag(c.conf)}  ${c.value ?? '—'}`);
  console.log(`    bairro${flag(b.conf)}  ${b.value ?? '—'}`);
  console.log(`    constr${flag(k.conf)}  ${k.value ?? '—'}`);
  console.log(`    dorms ${flag(d.conf)}  ${d.value ?? '—'}`);
  console.log(`    specs ${flag(sp.conf)}  ${sp.value ?? '—'}`);
}

mkdirSync('scripts/out', { recursive: true });
const outPath = 'scripts/out/lancamentos-portal-proposto.json';
writeFileSync(outPath, JSON.stringify(propostas, null, 2));

// Resumo de cobertura por campo.
const cov = (f) => propostas.filter((p) => p[f]).length;
console.log('\n📊 Cobertura das propostas (com valor / total):');
for (const f of ['cidade', 'bairro', 'construtora', 'dormitorios', 'specs']) {
  console.log(`   ${f.padEnd(12)} ${cov(f)}/${propostas.length}`);
}
console.log(`\n✅ Rascunho salvo em ${outPath}`);
console.log('   → REVISE e corrija à mão antes de aplicar. estagio ficou null (não é inferível do texto).');
