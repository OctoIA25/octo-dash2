/**
 * P0.6 — o job que roda o teste diário e PERSISTE o resultado.
 *
 * Camada de I/O. A regra vive em checks.js, puro e testável sem rede.
 *
 * Escreve em `consistencia_diaria`; quem lê é o endpoint de Status do Tenant,
 * que por desenho só consulta estado já persistido — ele é a ferramenta de
 * diagnóstico e não pode cair na presença do defeito que deveria medir.
 *
 * Uma imobiliária que falha NÃO interrompe as outras: cada uma é um
 * `allSettled` próprio. Um job de saúde que para no primeiro erro deixa de
 * vigiar justamente quando há erro.
 */
import { COLUNAS_QUE_VIRAM_NUMERO, montaRelatorio } from './checks.js';

/** Quantas linhas a tabela tem e quantas têm a coluna preenchida. */
async function preenchimentoDaColuna(supabase, tenantId, { tabela, coluna, porque }) {
  const base = () => supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  const [tudo, comValor] = await Promise.all([base(), base().not(coluna, 'is', null)]);
  if (tudo.error || comValor.error) {
    // Tabela ou coluna que não existe neste ambiente: some da checagem em vez
    // de virar falha. Colunas somem em migração; o painel não pode acusar isso
    // como número errado.
    return null;
  }
  return { tabela, coluna, porque, total: tudo.count || 0, preenchidas: comValor.count || 0 };
}

/** Roda as checagens de UMA imobiliária. Não grava. */
export async function apuraConsistencia(supabase, tenantId) {
  const { data: numeros, error } = await supabase.rpc('consistencia_numeros', { p_tenant: tenantId });
  if (error) throw new Error(`consistencia_numeros: ${error.message}`);

  const preenchimento = (
    await Promise.all(COLUNAS_QUE_VIRAM_NUMERO.map((c) => preenchimentoDaColuna(supabase, tenantId, c)))
  ).filter(Boolean);

  return montaRelatorio({ ...(numeros || {}), preenchimento });
}

/** Roda e grava. Devolve o relatório. */
export async function rodaEGrava(supabase, tenantId) {
  const relatorio = await apuraConsistencia(supabase, tenantId);
  const { error } = await supabase.from('consistencia_diaria').insert({
    tenant_id: tenantId,
    ok: relatorio.ok,
    checagens: relatorio.checagens,
  });
  if (error) throw new Error(`gravar consistencia_diaria: ${error.message}`);
  return relatorio;
}

/**
 * Passa por todas as imobiliárias. Devolve o resumo, para o log dizer algo
 * útil quando alguém for procurar.
 */
export async function rodaParaTodosOsTenants(supabase) {
  const { data: tenants, error } = await supabase.from('tenants').select('id, name');
  if (error) throw new Error(`listar tenants: ${error.message}`);

  const resultados = await Promise.allSettled(
    (tenants || []).map(async (t) => ({ tenant: t.name, ...(await rodaEGrava(supabase, t.id)) })),
  );

  const okS = resultados.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
  const comProblema = resultados.filter((r) => r.status === 'fulfilled' && !r.value.ok);
  const falharam = resultados.filter((r) => r.status === 'rejected');

  for (const r of comProblema) {
    const quais = r.value.checagens.filter((c) => !c.ok).map((c) => `${c.nome} (${c.detalhe})`);
    console.warn(`[consistencia] ${r.value.tenant}: ${quais.join(' | ')}`);
  }
  for (const r of falharam) console.error('[consistencia] falhou:', r.reason?.message || r.reason);

  return { total: (tenants || []).length, ok: okS, comProblema: comProblema.length, falharam: falharam.length };
}
