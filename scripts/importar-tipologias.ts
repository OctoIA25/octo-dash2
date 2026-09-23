/**
 * Importa o catálogo da equipe para `tipologias` (P2.1).
 *
 *   npx tsx scripts/importar-tipologias.ts            # só relatório, não grava
 *   npx tsx scripts/importar-tipologias.ts --aplicar  # grava
 *   npx tsx scripts/importar-tipologias.ts --csv arquivo.csv
 *
 * SÓ LÊ POR PADRÃO. Gravar exige `--aplicar`, escrito por extenso: uma
 * importação que roda sozinha ao ser invocada é como se sobrescreve trabalho
 * de outra pessoa sem querer.
 *
 * O QUE ELE NÃO FAZ, porque o plano proíbe e porque é certo:
 *
 *   * **não cria empreendimento.** Linha da planilha que não casa com nenhum
 *     lançamento cadastrado vai para o relatório de pendências. Criar seria
 *     encher o cadastro de nomes que ninguém reconhece;
 *   * **não apaga tipologia que alguém cadastrou à mão.** Ele só mexe na linha
 *     que ele próprio criou — reconhecida pela observação. Trabalho humano vale
 *     mais que importação;
 *   * **não inventa metragem, nem data de preço.** As duas ficam nulas, e o
 *     motivo está em `catalogoParaTipologia.ts`.
 *
 * O CASAMENTO É PELO CÓDIGO L0xx, como o plano pede. Pelo nome só quando o
 * código falta, e com normalização — os nomes divergem entre planilha e
 * cadastro ("Giovialle" × "Gioviale", "Nexos Residence" × "Nexus").
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { parseCatalogoCsv, CATALOGO_CSV_URL } from '../src/features/imoveis/hooks/useConstrutorasCatalogo';
import { codigosDaCelula, montarTipologia } from '../src/features/imoveis/utils/catalogoParaTipologia';

const MARCA = 'Importado do catálogo da equipe';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const csvLocal = args[args.indexOf('--csv') + 1];
const usarCsvLocal = args.includes('--csv');

const url = process.env.VITE_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error('Faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, chave, { auth: { persistSession: false } });

/** Sem acento, sem pontuação, minúsculo — para casar nomes que divergem. */
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
  const csv = usarCsvLocal
    ? readFileSync(csvLocal, 'utf8')
    : await fetch(CATALOGO_CSV_URL).then((r) => r.text());

  const catalogo = await parseCatalogoCsv(csv);
  console.log(`\nCatálogo: ${catalogo.length} empreendimentos\n`);

  const { data: lancamentos, error } = await db
    .from('lancamentos')
    .select('id, tenant_id, nome, codigos');
  if (error) throw error;

  const porCodigo = new Map<string, { id: string; tenant_id: string; nome: string }[]>();
  const porNome = new Map<string, { id: string; tenant_id: string; nome: string }[]>();
  for (const l of lancamentos ?? []) {
    for (const c of (l.codigos ?? []) as string[]) {
      const k = String(c).trim().toUpperCase();
      porCodigo.set(k, [...(porCodigo.get(k) ?? []), l as never]);
    }
    const n = normalizar(l.nome ?? '');
    if (n) porNome.set(n, [...(porNome.get(n) ?? []), l as never]);
  }

  const casadas: { linha: typeof catalogo[number]; lanc: { id: string; tenant_id: string; nome: string }; como: string }[] = [];
  const pendentes: { empreendimento: string; motivo: string }[] = [];

  for (const linha of catalogo) {
    const codigos = codigosDaCelula(linha.codigo);
    let achados = codigos.flatMap((c) => porCodigo.get(c) ?? []);
    let como = `código ${codigos.join(', ')}`;

    if (achados.length === 0) {
      achados = porNome.get(normalizar(linha.empreendimento)) ?? [];
      como = 'nome';
    }

    const unicos = [...new Map(achados.map((a) => [a.id, a])).values()];
    if (unicos.length === 0) {
      pendentes.push({
        empreendimento: linha.empreendimento,
        motivo: codigos.length
          ? `código ${codigos.join(', ')} não existe em nenhum lançamento`
          : 'sem código na planilha e o nome não casa com nenhum lançamento',
      });
      continue;
    }
    if (unicos.length > 1) {
      // Falha fechada: dois lançamentos para a mesma linha é ambiguidade, e
      // escolher um viraria tipologia no empreendimento errado.
      pendentes.push({
        empreendimento: linha.empreendimento,
        motivo: `casa com ${unicos.length} lançamentos (${unicos.map((u) => u.nome).join(' / ')}) — ambíguo`,
      });
      continue;
    }
    casadas.push({ linha, lanc: unicos[0], como });
  }

  console.log(`Casaram: ${casadas.length}   ·   Pendentes: ${pendentes.length}\n`);

  if (pendentes.length) {
    console.log('PENDÊNCIAS — nenhuma destas foi importada:');
    for (const p of pendentes) console.log(`  · ${p.empreendimento.padEnd(34)} ${p.motivo}`);
    console.log();
  }

  // O que a conversão não conseguiu afirmar, por linha casada.
  const semPreco = casadas.filter((c) => montarTipologia(c.linha).preco_a_partir === null);
  const semDorms = casadas.filter((c) => montarTipologia(c.linha).dormitorios === null);
  console.log(`Das ${casadas.length} que casaram: ${semPreco.length} sem preço utilizável, ${semDorms.length} sem dormitórios.`);
  console.log('Metragem: 0 de todas — a planilha não tem essa coluna.\n');

  if (!aplicar) {
    console.log('Nada foi gravado. Rode com --aplicar para gravar.\n');
    return;
  }

  let criadas = 0; let atualizadas = 0;
  for (const { linha, lanc } of casadas) {
    const t = montarTipologia(linha);
    const { data: existente } = await db
      .from('tipologias')
      .select('id, observacao')
      .eq('lancamento_id', lanc.id)
      .like('observacao', `${MARCA}%`)
      .maybeSingle();

    const campos = {
      tenant_id: lanc.tenant_id,
      lancamento_id: lanc.id,
      nome: t.nome,
      dormitorios: t.dormitorios,
      suites: t.suites,
      vagas: t.vagas,
      area_privativa_m2: null,
      preco_a_partir: t.preco_a_partir,
      preco_atualizado_em: t.preco_atualizado_em,
      disponivel: true,
      observacao: t.observacao,
      ordem: 0,
    };

    if (existente) {
      const { error: e } = await db.from('tipologias').update(campos).eq('id', existente.id);
      if (e) { console.error(`  ! ${lanc.nome}: ${e.message}`); continue; }
      atualizadas += 1;
    } else {
      const { error: e } = await db.from('tipologias').insert(campos);
      if (e) { console.error(`  ! ${lanc.nome}: ${e.message}`); continue; }
      criadas += 1;
    }
  }

  console.log(`Gravado: ${criadas} criadas, ${atualizadas} atualizadas.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
