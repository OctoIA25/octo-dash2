/**
 * Conferência de vendas (P4.4) — leitura e escrita.
 *
 * `vendas`, `venda_repasses` e `venda_historico` não têm grant para o front:
 * tudo passa por função do banco, que confere admin lá dentro. Não existe
 * caminho em que a tela mande um UPDATE sem o banco ter conferido quem é.
 */

import { supabase } from '@/lib/supabaseClient';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';
import { nivelValido } from '@/features/comissionamento/commissionRules';
import type { Conferencia, PessoaDoRepasse, RepasseParaGravar } from './vendas';

export interface FiltrosDaConferencia {
  de: string;
  ate: string;
  status?: string;
  situacao?: string;
  construtoraId?: string | null;
  corretorId?: string | null;
  equipeId?: string | null;
  /** 'lancamento' | 'terceiros' — os prontos. */
  tipo?: string | null;
  lancamentoId?: string | null;
}

export async function carregarConferencia(
  tenantId: string,
  f: FiltrosDaConferencia
): Promise<Conferencia | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('vendas_conferencia', {
    p_tenant_id: tenantId,
    p_de: f.de,
    p_ate: f.ate,
    p_status: f.status || null,
    p_construtora_id: f.construtoraId || null,
    p_corretor_id: f.corretorId || null,
    p_equipe_id: f.equipeId || null,
    p_tipo: f.tipo || null,
    p_lancamento_id: f.lancamentoId || null,
    p_situacao: f.situacao || null,
  });
  if (error) throw error;
  return (data as Conferencia) ?? null;
}

export interface RepasseNaTela {
  id: string;
  papel: string;
  parte: string;
  nivel: string | null;
  percentual: number;
  valor: number;
  status: 'a_pagar' | 'pago';
  pago_em: string | null;
}

/** Uma parcela da venda — é a mesma linha do "a receber" do Financeiro. */
export interface ParcelaDaVenda {
  id: string;
  parcela: number;
  valor: number;
  vencimento: string | null;
  pago_em: string | null;
  valor_pago: number | null;
  status: 'aberto' | 'baixado' | 'cancelado';
}

export interface PassoDoHistorico {
  campo: string;
  de: string | null;
  para: string | null;
  justificativa: string | null;
  em: string;
  autor: string;
}

export interface DetalheDaVenda {
  venda: Record<string, unknown>;
  construtora: string | null;
  parcelas: ParcelaDaVenda[];
  repasses: RepasseNaTela[];
  historico: PassoDoHistorico[];
}

export async function carregarDetalhe(vendaId: string): Promise<DetalheDaVenda | null> {
  const { data, error } = await supabase.rpc('venda_detalhe', { p_venda_id: vendaId });
  if (error) throw error;
  return (data as DetalheDaVenda) ?? null;
}

/**
 * A nota fiscal, sozinha. O recebimento NÃO vai junto: com parcelas, salvar a
 * nota mandando o recebimento lido antes da última baixa desfaria a baixa.
 */
export async function gravarNotaFiscal(
  vendaId: string,
  nf: { numero: string; data: string | null; arquivo: string | null },
) {
  const { data, error } = await supabase.rpc('venda_gravar_nf', {
    p_venda_id: vendaId,
    p_nf_numero: nf.numero ?? '',
    p_nf_data: nf.data || null,
    p_nf_arquivo: nf.arquivo || null,
    p_observacao: '',
  });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para editar esta venda.');
  return data;
}

/** Troca as parcelas EM ABERTO; as já recebidas ficam. A soma tem de fechar com a comissão. */
export async function parcelarVenda(vendaId: string, parcelas: Array<{ valor: number; vencimento: string | null }>) {
  const { data, error } = await supabase.rpc('venda_parcelar', { p_venda_id: vendaId, p_parcelas: parcelas });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para parcelar esta venda.');
  return data as ParcelaDaVenda[];
}

export interface NovaVenda {
  dataVenda: string;
  /** Texto livre — só quando não é um empreendimento do cadastro (terceiros). */
  empreendimento: string;
  lancamentoId: string | null;
  corretorId: string | null;
  corretorNome: string;
  cliente: string;
  vgv: number;
  /** A comissão NEGOCIADA, em reais. O % sai dela. */
  comissao: number;
  /** Previsão de recebimento (à vista). Sem ela, a venda fica "sem data" na projeção. */
  previstoEm: string | null;
}

export async function criarVenda(tenantId: string, v: NovaVenda) {
  const { data, error } = await supabase.rpc('venda_criar', {
    p_tenant_id: tenantId,
    p_data_venda: v.dataVenda,
    p_empreendimento: v.empreendimento,
    p_lancamento_id: v.lancamentoId,
    p_corretor_id: v.corretorId,
    p_corretor_nome: v.corretorNome,
    p_cliente: v.cliente,
    p_vgv: v.vgv,
    p_comissao: v.comissao,
    p_parcelas: v.previstoEm ? [{ valor: v.comissao, vencimento: v.previstoEm }] : null,
  });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para criar venda nesta imobiliária.');
  return data;
}

export async function gravarRepasses(vendaId: string, linhas: RepasseParaGravar[]) {
  const { data, error } = await supabase.rpc('venda_gravar_repasses', {
    p_venda_id: vendaId,
    p_linhas: linhas,
  });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para gravar repasses desta venda.');
  return data as { gravados: number; soma: number };
}

export async function marcarRepassePago(repasseId: string, pago: boolean) {
  const { data, error } = await supabase.rpc('venda_repasse_pago', {
    p_repasse_id: repasseId,
    p_pago: pago,
  });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para marcar este repasse.');
  return data;
}

/**
 * Traz para `vendas` as propostas assinadas que ainda não viraram venda.
 *
 * Existe porque a tabela nasceu hoje e o histórico já estava no CRM: sem isto
 * a conferência começaria vazia, e ninguém confia numa tela que estreia em
 * branco quando sabe que houve vendas.
 */
export async function importarAssinadas(tenantId: string) {
  const { data, error } = await supabase.rpc('vendas_importar_assinadas', { p_tenant_id: tenantId });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para importar vendas deste tenant.');
  return data as { criadas: number; ja_existiam: number; de_fora: unknown[] };
}

/**
 * A equipe com nível e Líder Direto — o que o motor de comissão precisa.
 *
 * O nível usado no cálculo é o CONGELADO NA VENDA; isto aqui serve para achar
 * o líder e o nível DELE. Trocar um pelo outro desfaria, na hora de pagar, a
 * garantia que o banco protege.
 */
export async function carregarEquipe(tenantId: string): Promise<PessoaDoRepasse[]> {
  if (!tenantId || tenantId === 'owner') return [];
  const [membros, { data: niveis, error }] = await Promise.all([
    fetchTenantMembers(tenantId),
    // O nível mora em `permissions.nivel_comissao`, onde a Gestão de Equipe
    // grava. A coluna `nivel` está obsoleta: ninguém a preenchia, e o líder de
    // todo mundo chegava aqui "sem nível" (20261006).
    supabase.from('tenant_memberships').select('user_id, permissions, leader_user_id').eq('tenant_id', tenantId),
  ]);
  if (error) throw error;

  const porId = new Map<string, { nivel: unknown; leader_user_id: string | null }>();
  (niveis ?? []).forEach((r) => porId.set(r.user_id as string, {
    nivel: (r.permissions as { nivel_comissao?: unknown } | null)?.nivel_comissao ?? null,
    leader_user_id: (r.leader_user_id as string) ?? null,
  }));

  return membros.map((m) => {
    const extra = porId.get(m.user_id);
    return {
      user_id: m.user_id,
      // O e-mail é o nome do membro na Dash: `tenant_memberships` não guarda
      // nome, e mostrar o UUID não ajuda ninguém a conferir uma folha.
      nome: m.email || 'Sem nome',
      nivel: nivelValido(extra?.nivel),
      leader_user_id: extra?.leader_user_id ?? m.leader_user_id ?? null,
    };
  });
}

/** As construtoras, para o filtro. */
export async function carregarConstrutoras(tenantId: string) {
  const { data, error } = await supabase
    .from('construtoras')
    .select('id, nome')
    .eq('tenant_id', tenantId)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; nome: string }>;
}

/** As equipes, para o filtro. */
export async function carregarEquipes(tenantId: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

/** Os empreendimentos (lançamentos), com a construtora — o filtro abre por ela. */
export async function carregarEmpreendimentos(tenantId: string) {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, nome, construtora_id')
    .eq('tenant_id', tenantId)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; nome: string; construtora_id: string | null }>;
}

/**
 * Sobe a nota fiscal. O caminho é `tenant/venda/arquivo` porque é dele que a
 * política do bucket tira o recorte — e o bucket é privado e de admin.
 */
export async function subirNotaFiscal(tenantId: string, vendaId: string, arquivo: File) {
  const limpo = arquivo.name.replace(/[^\w.-]+/g, '_');
  const caminho = `${tenantId}/${vendaId}/${Date.now()}_${limpo}`;
  const { error } = await supabase.storage.from('vendas-nf').upload(caminho, arquivo, { upsert: false });
  if (error) throw error;
  return caminho;
}

/** Link temporário para ver a nota — o bucket é privado, não tem URL pública. */
export async function linkDaNotaFiscal(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('vendas-nf').createSignedUrl(caminho, 60 * 5);
  if (error) return null;
  return data?.signedUrl ?? null;
}
