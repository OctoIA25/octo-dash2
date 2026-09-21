/**
 * Traz o ranking da planilha de comissionamento para a Dash.
 *
 * A planilha é a fonte do NÚMERO DE VENDAS por corretor no ranking; a Dash
 * calcula o dela por outro caminho (propostas assinadas). Por isso o campo na
 * tela diz de onde veio: os dois números divergem de propósito, e esconder a
 * origem faria alguém decidir com o número errado.
 *
 * Só grava o que leu: mês sem número na planilha não vira zero nem linha (ver
 * parseRanking). Falha na leitura sobe como erro — o job não apaga o que já
 * está gravado, e a tela continua mostrando a última leitura boa.
 *
 * Pré-requisito operacional: a planilha precisa ser do Google (o cliente fala
 * a API do Sheets, que não lê .xlsx) e estar compartilhada com GOOGLE_SA_EMAIL.
 */
import { makeSheetsClient } from '../reportMirror/googleSheets.js';
import { lerRankingCorretores } from './parseRanking.js';
import { casarCorretores } from './casarCorretores.js';

const TABELA = 'corretor_vendas_planilha';
const CONFLITO = 'tenant_id,ano,mes,nome_planilha';

async function buscarMembros(supabase, tenantId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`não consegui ler os corretores do tenant: ${error.message}`);
  return (data || []).map((m) => ({ user_id: m.id, nome: m.full_name }));
}

export function makeRankingPlanilhaRunner(supabase, processEnv = process.env, deps = {}) {
  const sheetId = processEnv.RANKING_PLANILHA_SHEET_ID;
  const tenantId = processEnv.RANKING_PLANILHA_TENANT_ID;
  const tab = processEnv.RANKING_PLANILHA_TAB || 'REPORT';
  const email = processEnv.GOOGLE_SA_EMAIL;
  const keyB64 = processEnv.GOOGLE_SA_PRIVATE_KEY_B64;
  if (!sheetId || !tenantId || !email || !keyB64) {
    throw new Error('[rankingPlanilha] faltam envs: RANKING_PLANILHA_SHEET_ID, RANKING_PLANILHA_TENANT_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY_B64');
  }
  const ano = Number(processEnv.RANKING_PLANILHA_ANO) || new Date().getFullYear();
  const sheets = deps.sheets
    || makeSheetsClient({ email, privateKeyPem: Buffer.from(keyB64, 'base64').toString('utf8') });

  return async function run() {
    const grade = await sheets.readTab({ spreadsheetId: sheetId, tab });
    const { corretores, avisos } = lerRankingCorretores(grade);
    const membros = await buscarMembros(supabase, tenantId);
    const { pares, naoReconhecidos } = casarCorretores(corretores, membros);

    const atualizadoEm = new Date().toISOString();
    const linhas = pares.flatMap((par) =>
      par.meses
        .filter((m) => m.vendas !== null && m.vendas !== undefined)
        .map((m) => ({
          tenant_id: tenantId,
          ano,
          mes: m.mes,
          nome_planilha: par.nome,
          user_id: par.user_id,
          nivel: par.nivel,
          equipe: par.equipe,
          vendas: m.vendas,
          atualizado_em: atualizadoEm,
        })));

    if (linhas.length > 0) {
      const { error } = await supabase.from(TABELA).upsert(linhas, { onConflict: CONFLITO });
      if (error) throw new Error(`não consegui gravar o ranking: ${error.message}`);
    }

    return { corretores: corretores.length, linhas: linhas.length, naoReconhecidos, avisos };
  };
}
