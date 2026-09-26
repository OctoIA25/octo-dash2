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
/*
 * `--sql` imprime o SQL em vez de gravar. É o modo que se usa para produção:
 * a carga vira uma migration registrada, revisável antes de rodar, em vez de
 * uma execução avulsa que ninguém consegue auditar depois.
 *
 * O SQL faz o MESMO que `membro_definir_cargo` faria, e não a chama porque
 * ela é SECURITY DEFINER e confere `auth.uid()` — numa migration não há
 * usuário logado, e ela devolveria nulo sem gravar nada.
 *
 * As duas travas da função (não rebaixar a si mesmo, não deixar a casa sem
 * admin) não se aplicam aqui: `cargoDoMesmoNivel` escolhe sempre um cargo do
 * MESMO papel, então nenhum nível de acesso muda nesta carga. O SQL abaixo
 * confere isso em tempo de execução, por via das dúvidas.
 */
const SO_SQL = process.argv.includes('--sql');
const linhasCargo = [];
const linhasExtra = [];
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

  if (SO_SQL) {
    linhasCargo.push(`  ('${m.tenant_id}'::uuid,'${m.user_id}'::uuid,'${cargo.id}'::uuid,'${cargo.role}')`);
    for (const e of extras) {
      const motivo = e.motivo.replace(/'/g, "''");
      linhasExtra.push(`  ('${m.tenant_id}'::uuid,'${m.user_id}'::uuid,'${e.codigo}',${e.concede},'${motivo}')`);
    }
  } else if (APLICAR) {
    const { error } = await db.rpc('membro_definir_cargo', {
      p_tenant_id: m.tenant_id, p_user_id: m.user_id,
      p_cargo_id: cargo.id, p_extras: extras,
    });
    if (error) { console.error(`  ✗ ${m.user_id}: ${error.message}`); divergentes++; convertidos--; }
  }
}

if (SO_SQL) {
  if (divergentes > 0) {
    console.error('\n-- HOUVE DIVERGENCIA: nenhum SQL gerado. Resolva acima primeiro.');
    process.exit(1);
  }
  const sql = [
    '-- Carga inicial dos cargos — gerada por scripts/carga-cargos.mjs',
    `-- ${convertidos} pessoas, ${comExcecao} com excecao. Conferido pessoa a pessoa`,
    '-- com `permissoesDeSidebar` nos dois estados: nenhuma muda de tela.',
    '',
    'WITH atribuicao(tenant_id, user_id, cargo_id, role_do_cargo) AS (VALUES',
    linhasCargo.join(',\n'),
    '),',
    'conferencia AS (',
    '  -- Esta carga NAO muda nivel de acesso de ninguem. Se mudar, para tudo.',
    '  SELECT CASE WHEN EXISTS (',
    '      SELECT 1 FROM atribuicao a JOIN tenant_memberships tm',
    '        ON tm.tenant_id = a.tenant_id AND tm.user_id = a.user_id',
    '       WHERE tm.role IS DISTINCT FROM a.role_do_cargo)',
    "    THEN (SELECT 1/0) ELSE 0 END AS ok",
    ')',
    'UPDATE tenant_memberships tm SET cargo_id = a.cargo_id',
    '  FROM atribuicao a, conferencia',
    ' WHERE tm.tenant_id = a.tenant_id AND tm.user_id = a.user_id',
    '   AND tm.cargo_id IS NULL;',
    '',
    linhasExtra.length
      ? 'INSERT INTO membro_permissoes_extra (tenant_id, user_id, permissao_codigo, concede, motivo) VALUES\n'
        + linhasExtra.join(',\n')
        + '\nON CONFLICT (tenant_id, user_id, permissao_codigo) DO UPDATE\n'
        + '  SET concede = EXCLUDED.concede, motivo = EXCLUDED.motivo;'
      : '-- nenhuma excecao a inserir',
  ].join('\n');
  await (await import('node:fs/promises')).writeFile('/tmp/claude-501/carga-cargos.sql', sql + '\n');
  console.error(`\nSQL gerado: ${convertidos} pessoas, ${linhasExtra.length} excecoes -> /tmp/claude-501/carga-cargos.sql`);
  process.exit(0);
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
