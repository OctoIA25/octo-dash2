/**
 * Leitura e exclusão de rascunhos de imóvel (`imoveis_locais` com status `rascunho`).
 * Salvar e publicar ficam no CriarImovelForm, junto do resto do cadastro.
 */
import { supabase } from '@/lib/supabaseClient';
import type { ImovelLocalRow } from '../utils/buildEditDataFromLocal';
import { STATUS_RASCUNHO } from '../utils/rascunho';

export interface RascunhoImovel extends ImovelLocalRow {
  id: string;
  criado_por?: string | null;
  atualizado_por?: string | null;
  created_at: string;
  updated_at: string;
}

/** Rascunhos do tenant, alterados por último primeiro. */
export const listarRascunhos = async (tenantId: string): Promise<RascunhoImovel[]> => {
  const { data, error } = await supabase
    .from('imoveis_locais')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status_aprovacao', STATUS_RASCUNHO)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Falha ao carregar rascunhos: ${error.message}`);
  return (data ?? []) as unknown as RascunhoImovel[];
};

/**
 * Nome de quem criou cada rascunho. `get_tenant_members` só devolve a equipe
 * para admin/owner; `tenant_brokers` é legível por qualquer membro do tenant.
 * Falha aqui só tira o nome da lista — não derruba a aba.
 */
export const nomesDosAutores = async (tenantId: string, userIds: string[]): Promise<Record<string, string>> => {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('tenant_brokers')
    .select('auth_user_id, name')
    .eq('tenant_id', tenantId)
    .in('auth_user_id', ids);

  if (error) {
    console.error('[rascunhos] falha ao buscar nomes dos autores:', error.message);
    return {};
  }
  return Object.fromEntries(
    (data ?? []).filter((b) => b.auth_user_id && b.name).map((b) => [b.auth_user_id as string, b.name as string]),
  );
};

/**
 * Exclui SÓ se ainda for rascunho: o filtro de status impede que "Excluir
 * rascunho" apague um imóvel que outra aba já publicou.
 */
export const excluirRascunho = async (tenantId: string, codigoImovel: string): Promise<void> => {
  const { data, error } = await supabase
    .from('imoveis_locais')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('codigo_imovel', codigoImovel)
    .eq('status_aprovacao', STATUS_RASCUNHO)
    .select('id');

  if (error) throw new Error(`Falha ao excluir rascunho: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error('Rascunho não encontrado — ele pode já ter sido publicado ou excluído.');
  }
};
