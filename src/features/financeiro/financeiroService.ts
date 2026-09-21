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
