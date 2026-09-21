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
  construtoraId?: string | null;
  corretorId?: string | null;
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
  repasses: RepasseNaTela[];
  historico: PassoDoHistorico[];
}

export async function carregarDetalhe(vendaId: string): Promise<DetalheDaVenda | null> {
  const { data, error } = await supabase.rpc('venda_detalhe', { p_venda_id: vendaId });
  if (error) throw error;
  return (data as DetalheDaVenda) ?? null;
}

export interface ConferenciaDaVenda {
  nfNumero: string;
  nfData: string | null;
  nfArquivo: string | null;
  previstoEm: string | null;
  recebidoEm: string | null;
  valorRecebido: number | null;
  observacao: string;
}

/**
 * Manda o formulário INTEIRO. A função do banco não tem parâmetro opcional de
 * propósito — com patch não há como distinguir "não mexi" de "apaguei", e o
 * número da NF voltaria sozinho na primeira vez que alguém o limpasse.
 */
export async function salvarConferencia(vendaId: string, v: ConferenciaDaVenda) {
  const { data, error } = await supabase.rpc('venda_atualizar', {
    p_venda_id: vendaId,
    p_nf_numero: v.nfNumero ?? '',
    p_nf_data: v.nfData || null,
    p_nf_arquivo: v.nfArquivo || null,
    p_previsto_em: v.previstoEm || null,
    p_recebido_em: v.recebidoEm || null,
    p_valor_recebido: v.valorRecebido ?? null,
    p_observacao: v.observacao ?? '',
  });
  if (error) throw error;
  // A função devolve NULL quando recusa (não é admin). Sem este aviso a tela
  // mostraria "salvo" para quem não salvou nada.
  if (data == null) throw new Error('Você não tem permissão para editar esta venda.');
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
    supabase.from('tenant_memberships').select('user_id, nivel, leader_user_id').eq('tenant_id', tenantId),
  ]);
  if (error) throw error;

  const porId = new Map<string, { nivel: string | null; leader_user_id: string | null }>();
  (niveis ?? []).forEach((r) => porId.set(r.user_id as string, {
    nivel: (r.nivel as string) ?? null,
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
