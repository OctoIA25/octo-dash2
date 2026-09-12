/**
 * Backfill: `tenant_memberships.leader_user_id` a partir do gestor da equipe.
 *
 * POR QUE
 * O motor de comissão (§D062, `commissionRules.ts`) recusa ratear corretor de
 * nível estagiário/júnior/pleno que esteja sem Líder Direto — e recusar é o
 * certo: sem líder não existe complemento a pagar, e chutar zero seria inventar
 * dinheiro. O efeito colateral é o card "Líquido imobiliária" virar "—" toda
 * vez que o recorte (uma equipe, um mês) só tem corretor nessa situação.
 *
 * `leader_user_id` NÃO é hierarquia nova: a migração 20260825 diz que ele é a
 * denormalização de `teams.leader_user_id` (o gestor primário), mantida pelo
 * app ao salvar equipe/membro. Quem entrou na equipe por outro caminho ficou
 * sem o espelho. Este script só re-sincroniza isso — nenhuma decisão de quem
 * lidera quem é tomada aqui.
 *
 * NÃO resolve (e lista no fim, para decisão humana):
 *  - membro sem `team_id`: não há de onde derivar o líder;
 *  - equipe sem gestor primário;
 *  - o próprio gestor da equipe (seria líder de si mesmo — Sênior/Coordenador
 *    já é aceito pelo motor sem líder, os demais precisam de decisão).
 *
 * Uso:  node scripts/backfill-lider-direto.mjs <tenant_id> [--apply]
 *       Sem --apply só imprime o plano (nada é escrito).
 * Env:  VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (lidos de .env)
 */
import { readFileSync } from 'node:fs';

const tenantId = process.argv[2];
const apply = process.argv.includes('--apply');

if (!tenantId || tenantId.startsWith('--')) {
  console.error('Uso: node scripts/backfill-lider-direto.mjs <tenant_id> [--apply]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_BASE = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env');

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { ...HEADERS, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const AUTO_LIDER = ['senior', 'coordenador']; // D062: líderes de si mesmos

const [membros, equipes, perfis] = [
  await rest(`tenant_memberships?select=id,user_id,team_id,leader_user_id,permissions&tenant_id=eq.${tenantId}`),
  await rest(`teams?select=id,name,leader_user_id&tenant_id=eq.${tenantId}`),
  null,
];

const nomePorUser = new Map(
  (
    await rest(
      `user_profiles?select=id,full_name,email&id=in.(${membros.map((m) => m.user_id).join(',')})`,
    )
  ).map((p) => [p.id, p.full_name || p.email || p.id]),
);
const equipePorId = new Map(equipes.map((t) => [t.id, t]));
const nome = (userId) => nomePorUser.get(userId) || userId;

const plano = [];
const pendentes = [];

for (const m of membros) {
  const nivel = m.permissions?.nivel_comissao ?? null;
  if (m.leader_user_id) continue;
  if (!nivel) {
    pendentes.push(`${nome(m.user_id).padEnd(26)} sem nível de comissionamento`);
    continue;
  }
  if (AUTO_LIDER.includes(nivel)) continue; // o motor já aceita sem líder

  const equipe = m.team_id ? equipePorId.get(m.team_id) : null;
  if (!equipe) {
    pendentes.push(`${nome(m.user_id).padEnd(26)} ${nivel.padEnd(11)} sem equipe — líder indefinível`);
    continue;
  }
  if (!equipe.leader_user_id) {
    pendentes.push(`${nome(m.user_id).padEnd(26)} ${nivel.padEnd(11)} equipe "${equipe.name}" sem gestor`);
    continue;
  }
  if (equipe.leader_user_id === m.user_id) {
    pendentes.push(`${nome(m.user_id).padEnd(26)} ${nivel.padEnd(11)} é o gestor de "${equipe.name}" — decidir à mão`);
    continue;
  }

  plano.push({ id: m.id, userId: m.user_id, nivel, equipe: equipe.name, lider: equipe.leader_user_id });
}

console.log(`\nMembros: ${membros.length} | equipes: ${equipes.length}`);
console.log(`\n${apply ? 'APLICANDO' : 'PLANO (dry-run)'} — ${plano.length} membro(s) ganham Líder Direto:\n`);
for (const p of plano) {
  console.log(`  ${nome(p.userId).padEnd(26)} ${p.nivel.padEnd(11)} equipe ${p.equipe.padEnd(18)} -> líder ${nome(p.lider)}`);
}

if (apply) {
  for (const p of plano) {
    await rest(`tenant_memberships?id=eq.${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ leader_user_id: p.lider }),
    });
  }
  console.log(`\n${plano.length} atualizados.`);
} else if (plano.length) {
  console.log('\nNada foi escrito. Rode de novo com --apply para gravar.');
}

if (pendentes.length) {
  console.log(`\nFicam de fora (${pendentes.length}) — resolver em Gestão de Equipe:\n`);
  for (const p of pendentes) console.log(`  ${p}`);
}
