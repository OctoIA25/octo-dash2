/**
 * A carga inicial: põe cada pessoa num cargo SEM mudar o que ela vê.
 *
 *   node scripts/carga-cargos.mjs            # ensaio: só mostra o que faria
 *   node scripts/carga-cargos.mjs --aplicar  # grava
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 *
 * POR QUE UM SCRIPT, E NÃO UMA MIGRATION EM SQL
 *
 * A regra que decide o que cada pessoa vê mora em `permissoesDeSidebar`, e
 * tem ramos que o SQL não teria de graça — o principal: para admin e líder de
 * equipe ela IGNORA a lista salva e entrega o contrato inteiro da imobiliária.
 * Reescrever isso em SQL criaria uma segunda cópia da regra, e as duas
 * divergiriam no primeiro ajuste. Aqui o script chama a função que está no ar.
 *
 * É IDEMPOTENTE: só toca em quem está sem cargo. Rodar duas vezes não faz mal.
 */
import { createClient } from '@supabase/supabase-js';
import { permissoesDeSidebar, comPermissoesNaoEditaveis, SIDEBAR_PERMISSIONS_EDITAVEIS } from '../src/types/permissions.ts';
import { excecoesQuePreservam, cargoDoMesmoNivel } from '../src/features/cargos/converterParaCargo.ts';

const APLICAR = process.argv.includes('--aplicar');
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const temCaixa = (c) => SIDEBAR_PERMISSIONS_EDITAVEIS.includes(c);

const [{ data: tenants }, { data: membros }, { data: cargos }, { data: pacotes }, { data: catalogo }] =
  await Promise.all([
    db.from('tenants').select('id, name, allowed_features'),
    db.from('tenant_memberships').select('tenant_id, user_id, role, cargo_id, permissions'),
    db.from('cargos').select('id, tenant_id, nome, role, nivel_acesso'),
    db.from('cargo_permissoes').select('cargo_id, permissao_codigo'),
    db.from('permissoes').select('codigo'),
  ]);

/*
 * Só dá para preservar o que o catálogo conhece: `membro_definir_cargo`
 * descarta exceção cujo código não exista em `permissoes`. Os que saíram do
 * catálogo em 26/09 (octo-chat, atividades) não têm tela alcançável, então
 * perdê-los é o certo — mas tem de ser DITO, não descoberto depois.
 */
const noCatalogo = new Set((catalogo ?? []).map((p) => p.codigo));
const preservavel = (c) => noCatalogo.has(c);

const contrato = new Map(tenants.map((t) => [t.id, t.allowed_features]));
const nomeDaCasa = new Map(tenants.map((t) => [t.id, t.name]));
const pacoteDe = new Map();
for (const { cargo_id, permissao_codigo } of pacotes ?? []) {
  if (!pacoteDe.has(cargo_id)) pacoteDe.set(cargo_id, []);
  pacoteDe.get(cargo_id).push(permissao_codigo);
}

let convertidos = 0, pulados = 0, semCargo = 0, comExcecao = 0, divergentes = 0;
const perdemForaDoCatalogo = [];

for (const m of membros ?? []) {
  if (m.cargo_id) { pulados++; continue; }

  const cargo = cargoDoMesmoNivel(cargos.filter((c) => c.tenant_id === m.tenant_id), m.role);
  if (!cargo) {
    console.warn(`  ! ${nomeDaCasa.get(m.tenant_id)} não tem cargo para o nível "${m.role}" — pulado`);
    semCargo++;
    continue;
  }

  const salvas = m.permissions?.sidebar_permissions;
  const ctx = {
    isOwner: false,
    isTenantUser: true,
    systemRole: m.role,
    tenantAllowedFeatures: contrato.get(m.tenant_id),
    sidebarPermissions: Array.isArray(salvas) && salvas.length > 0
      ? comPermissoesNaoEditaveis(salvas, m.role) : undefined,
  };
  const antes = permissoesDeSidebar({ ...ctx, permissoesDoCargo: null });

  /*
   * O DESEJADO É O DE HOJE, INTEIRO — e não só o que tem caixa na tela.
   *
   * Filtrar por `temCaixa` aqui foi o meu erro, e o ensaio o pegou: 'metas' e
   * 'octo-chat' não têm caixa, e quem os tinha sem o cargo os dar ficava sem
   * eles. A caixa diz o que o GESTOR pode mexer; não diz o que a pessoa tem.
   */
  const desejado = antes.filter(preservavel);
  const pacote = pacoteDe.get(cargo.id) ?? [];
  const extras = excecoesQuePreservam(desejado, pacote.filter(preservavel));
  const forasDoCatalogo = antes.filter((c) => !preservavel(c));

  /*
   * A CONFERÊNCIA, POR PESSOA, ANTES DE GRAVAR.
   *
   * Não basta o teste ter passado nos arranjos de ontem: se alguém mudou de
   * permissão depois, é esta linha que pega. Divergiu, não grava.
   */
  const efetivoNovo = new Set([...pacoteDe.get(cargo.id) ?? []]);
  for (const e of extras) e.concede ? efetivoNovo.add(e.codigo) : efetivoNovo.delete(e.codigo);
  const depois = permissoesDeSidebar({ ...ctx, permissoesDoCargo: [...efetivoNovo] });

  // Os fora do catálogo saem dos DOIS lados: eles não têm como voltar, e não
  // podem mascarar uma perda de verdade no que sobra.
  const comparavel = (lista) => lista.filter(preservavel).join(', ');
  if (comparavel(antes) !== comparavel(depois)) {
    console.error(`  ✗ ${nomeDaCasa.get(m.tenant_id)} / ${m.user_id}: MUDARIA a tela — não gravado`);
    console.error(`      antes:  ${antes.join(', ')}`);
    console.error(`      depois: ${depois.join(', ')}`);
    divergentes++;
    continue;
  }

  if (extras.length > 0) comExcecao++;
  if (forasDoCatalogo.length > 0) perdemForaDoCatalogo.push(`${nomeDaCasa.get(m.tenant_id)}: ${forasDoCatalogo.join(', ')}`);
  convertidos++;

  if (APLICAR) {
    const { error } = await db.rpc('membro_definir_cargo', {
      p_tenant_id: m.tenant_id, p_user_id: m.user_id,
      p_cargo_id: cargo.id, p_extras: extras,
    });
    if (error) { console.error(`  ✗ ${m.user_id}: ${error.message}`); divergentes++; convertidos--; }
  }
}

console.log(`\n${APLICAR ? 'APLICADO' : 'ENSAIO (nada foi gravado)'}`);
console.log(`  converteriam:        ${convertidos}`);
console.log(`  destes, com exceção: ${comExcecao}`);
console.log(`  já tinham cargo:     ${pulados}`);
console.log(`  sem cargo no nível:  ${semCargo}`);
console.log(`  DIVERGIRAM:          ${divergentes}${divergentes ? '  <<< nenhum destes foi gravado' : ''}`);
if (perdemForaDoCatalogo.length > 0) {
  console.log(`\n  ${perdemForaDoCatalogo.length} pessoa(s) perdem codigo que saiu do catalogo (sem tela alcancavel):`);
  for (const l of [...new Set(perdemForaDoCatalogo)]) console.log(`    ${l}`);
}
process.exit(divergentes > 0 ? 1 : 0);
