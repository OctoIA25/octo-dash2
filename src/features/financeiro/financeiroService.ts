/**
 * Financeiro fase 1 (P4.5) — leitura e escrita.
 *
 * As três tabelas não têm grant para o front e estão com RLS ligada sem
 * política nenhuma: no Financeiro, TUDO passa por função do banco, que confere
 * lá dentro se quem chama cuida do dinheiro desta imobiliária.
 */

import { supabase } from '@/lib/supabaseClient';
import type {
  Dre, FluxoDeCaixa, LinhaDaExportacao, ListaDeLancamentos, TipoDeLancamento,
} from './financeiro';

export interface ContaDoPlano {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  pai_id: string | null;
  papel: string | null;
  ativa: boolean;
  e_grupo: boolean;
}

export interface ContaBancaria {
  id: string;
  nome: string;
  banco: string;
  saldo_inicial: number;
  ativa: boolean;
}

const vazio = (tenantId: string) => !tenantId || tenantId === 'owner';

/** A função devolve NULL quando recusa. Sem isto a tela diria "salvo" a quem não salvou. */
function exigir<T>(data: T | null, oQue: string): T {
  if (data == null) throw new Error(`Você não tem acesso ao Financeiro desta imobiliária (${oQue}).`);
  return data;
}

export async function carregarPlanoDeContas(tenantId: string): Promise<ContaDoPlano[]> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('financeiro_plano_de_contas', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as ContaDoPlano[]) ?? [];
}

export async function criarPlanoPadrao(tenantId: string): Promise<number> {
  const { data, error } = await supabase.rpc('financeiro_cria_plano_padrao', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export interface FiltrosDoFinanceiro {
  de: string;
  ate: string;
  tipo?: TipoDeLancamento | '';
  status?: string;
  contaId?: string | null;
  centroCusto?: string;
  por?: 'vencimento' | 'competencia';
}

export async function carregarLancamentos(
  tenantId: string,
  f: FiltrosDoFinanceiro
): Promise<ListaDeLancamentos | null> {
  if (vazio(tenantId)) return null;
  const { data, error } = await supabase.rpc('financeiro_lancamentos', {
    p_tenant_id: tenantId,
    p_de: f.de,
    p_ate: f.ate,
    p_tipo: f.tipo || null,
    p_status: f.status || null,
    p_conta_id: f.contaId || null,
    p_centro_custo: f.centroCusto || null,
    p_por: f.por ?? 'vencimento',
  });
  if (error) throw error;
  return (data as ListaDeLancamentos) ?? null;
}

export async function carregarDre(
  tenantId: string,
  de: string,
  ate: string,
  centroCusto?: string
): Promise<Dre | null> {
  if (vazio(tenantId)) return null;
  const { data, error } = await supabase.rpc('financeiro_dre', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate, p_centro_custo: centroCusto || null,
  });
  if (error) throw error;
  return (data as Dre) ?? null;
}

export async function carregarFluxo(
  tenantId: string,
  de: string,
  ate: string,
  gran: 'dia' | 'semana' | 'mes'
): Promise<FluxoDeCaixa | null> {
  if (vazio(tenantId)) return null;
  const { data, error } = await supabase.rpc('financeiro_fluxo_de_caixa', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate, p_gran: gran,
  });
  if (error) throw error;
  return (data as FluxoDeCaixa) ?? null;
}

export async function carregarExportacao(
  tenantId: string,
  de: string,
  ate: string
): Promise<{ de: string; ate: string; linhas: LinhaDaExportacao[] }> {
  const { data, error } = await supabase.rpc('financeiro_exportacao', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  return exigir(data as { de: string; ate: string; linhas: LinhaDaExportacao[] } | null, 'exportar');
}

export interface NovoLancamento {
  tipo: TipoDeLancamento;
  contaId: string | null;
  descricao: string;
  valor: number;
  competencia: string;
  vencimento: string | null;
  centroCusto: string;
  observacao: string;
  repetirMeses: number;
}

export async function lancar(tenantId: string, l: NovoLancamento) {
  const { data, error } = await supabase.rpc('financeiro_lancar', {
    p_tenant_id: tenantId,
    p_tipo: l.tipo,
    p_conta_id: l.contaId || null,
    p_descricao: l.descricao,
    p_valor: l.valor,
    p_competencia: l.competencia,
    p_vencimento: l.vencimento || null,
    p_centro_custo: l.centroCusto ?? '',
    p_observacao: l.observacao ?? '',
    p_anexo: null,
    p_repetir_meses: l.repetirMeses ?? 0,
  });
  if (error) throw error;
  return exigir(data as { id: string; criados: number } | null, 'lançar');
}

export async function baixar(lancamentoId: string, pagoEm: string | null, valorPago: number | null) {
  const { data, error } = await supabase.rpc('financeiro_baixar', {
    p_lancamento_id: lancamentoId,
    p_pago_em: pagoEm,
    p_valor_pago: valorPago,
  });
  if (error) throw error;
  return exigir(data, 'baixar');
}

export async function cancelar(lancamentoId: string) {
  const { data, error } = await supabase.rpc('financeiro_cancelar', { p_lancamento_id: lancamentoId });
  if (error) throw error;
  return exigir(data, 'cancelar');
}

export async function carregarContasBancarias(tenantId: string): Promise<ContaBancaria[]> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('financeiro_contas_bancarias', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as ContaBancaria[]) ?? [];
}

export async function salvarContaBancaria(
  tenantId: string,
  c: { id?: string; nome: string; banco: string; saldoInicial: number }
) {
  const { data, error } = await supabase.rpc('financeiro_conta_bancaria', {
    p_tenant_id: tenantId,
    p_nome: c.nome,
    p_banco: c.banco ?? '',
    p_saldo_inicial: c.saldoInicial ?? 0,
    p_id: c.id ?? null,
  });
  if (error) throw error;
  return exigir(data, 'salvar a conta bancária');
}

/**
 * Entrega o arquivo ao navegador.
 *
 * Fica aqui, e não no componente, porque é a única parte da exportação que
 * toca o DOM — e assim o cálculo do CSV segue testável sem navegador.
 */
export function baixarArquivo(conteudo: string, nome: string) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sem o revoke, cada exportação deixa um blob preso na memória da aba.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// Conciliação por extrato (P4.6)
// ============================================================

export interface CandidatoDaConciliacao {
  lancamento_id: string;
  descricao: string;
  vencimento: string | null;
  valor: number;
  origem: string;
  distancia_dias: number;
}

export interface SugestaoDaConciliacao {
  transacao_id: string;
  data: string;
  valor: number;
  tipo: 'credito' | 'debito';
  descricao: string;
  candidatos: CandidatoDaConciliacao[];
  quantos: number;
  /** Mais de um lançamento possível: quem confirma é a pessoa, nunca a tela. */
  ambigua: boolean;
  sem_candidato: boolean;
}

export interface MovimentoDoExtrato {
  id: string;
  data: string;
  valor: number;
  tipo: 'credito' | 'debito';
  descricao: string;
  ignorada: boolean;
  motivo_ignorada: string;
  lancamento_id: string | null;
  lancamento: string | null;
  conciliada_em: string | null;
}

export interface SituacaoDaConciliacao {
  de: string;
  ate: string;
  movimentos: number;
  conciliados: number;
  ignorados: number;
  em_aberto: number;
  valor_em_aberto: number;
}

export async function importarExtrato(
  tenantId: string,
  contaBancariaId: string,
  arquivo: string,
  periodo: { de: string | null; ate: string | null },
  movimentos: Array<{ fitid: string; data: string; valor: number; tipo: string; descricao: string }>
): Promise<{ importacao_id: string | null; novas: number; repetidas: number }> {
  const { data, error } = await supabase.rpc('extrato_importar', {
    p_tenant_id: tenantId,
    p_conta_bancaria_id: contaBancariaId,
    p_arquivo: arquivo,
    p_periodo_de: periodo.de,
    p_periodo_ate: periodo.ate,
    p_movimentos: movimentos,
  });
  if (error) throw error;
  return exigir(data, 'importar o extrato');
}

export async function carregarSugestoes(
  tenantId: string, de: string, ate: string, diasDeFolga = 5
): Promise<SugestaoDaConciliacao[]> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('extrato_sugestoes', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate, p_dias_de_folga: diasDeFolga,
  });
  if (error) throw error;
  return (data as SugestaoDaConciliacao[]) ?? [];
}

export async function carregarMovimentos(
  tenantId: string, de: string, ate: string
): Promise<MovimentoDoExtrato[]> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('extrato_movimentos', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  return (data as MovimentoDoExtrato[]) ?? [];
}

export async function carregarSituacao(
  tenantId: string, de: string, ate: string
): Promise<SituacaoDaConciliacao | null> {
  if (vazio(tenantId)) return null;
  const { data, error } = await supabase.rpc('extrato_situacao', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  return (data as SituacaoDaConciliacao) ?? null;
}

export async function conciliar(
  tenantId: string, pares: Array<{ transacao_id: string; lancamento_id: string }>
): Promise<{ conciliados: number; recusados: Array<{ motivo: string }>; quantos_recusados: number }> {
  const { data, error } = await supabase.rpc('extrato_conciliar', {
    p_tenant_id: tenantId, p_pares: pares,
  });
  if (error) throw error;
  return exigir(data, 'conciliar');
}

export async function desconciliar(transacaoId: string) {
  const { data, error } = await supabase.rpc('extrato_desconciliar', { p_transacao_id: transacaoId });
  if (error) throw error;
  return exigir(data, 'desfazer a conciliação');
}

export async function ignorarMovimento(transacaoId: string, ignorar: boolean, motivo = '') {
  const { data, error } = await supabase.rpc('extrato_ignorar', {
    p_transacao_id: transacaoId, p_ignorar: ignorar, p_motivo: motivo,
  });
  if (error) throw error;
  return exigir(data, 'ignorar o movimento');
}
