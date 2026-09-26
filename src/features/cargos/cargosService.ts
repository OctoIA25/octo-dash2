/**
 * Cargos com pacote de permissões (P4.1) — leitura e escrita.
 *
 * `cargos`, `cargo_permissoes` e `membro_permissoes_extra` não têm grant para o
 * front: tudo passa por função do banco, que confere admin lá dentro. Permissão
 * é a última coisa que pode ser escrita por quem não deveria.
 */

import { supabase } from '@/lib/supabaseClient';
import type { Cargo, PermissaoDoCatalogo, QuadroDeCargos } from './cargos';

const vazio = (tenantId: string) => !tenantId || tenantId === 'owner';

function exigir<T>(data: T | null, oQue: string): T {
  if (data == null) {
    throw new Error(`Você não tem permissão para ${oQue} nesta imobiliária.`);
  }
  return data;
}

export async function carregarCatalogo(): Promise<PermissaoDoCatalogo[]> {
  const { data, error } = await supabase.rpc('permissoes_catalogo');
  if (error) throw error;
  return (data as PermissaoDoCatalogo[]) ?? [];
}

export async function carregarCargos(tenantId: string): Promise<QuadroDeCargos | null> {
  if (vazio(tenantId)) return null;
  const { data, error } = await supabase.rpc('cargos_do_tenant', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as QuadroDeCargos) ?? null;
}

export interface CargoParaSalvar {
  id?: string | null;
  nome: string;
  descricao: string;
  nivel_acesso: number;
  role: Cargo['role'];
  permissoes: string[];
}

export async function salvarCargo(tenantId: string, c: CargoParaSalvar) {
  const { data, error } = await supabase.rpc('cargo_salvar', {
    p_tenant_id: tenantId,
    p_nome: c.nome,
    p_descricao: c.descricao ?? '',
    p_nivel: c.nivel_acesso,
    p_role: c.role,
    p_permissoes: c.permissoes ?? [],
    p_id: c.id ?? null,
  });
  if (error) throw error;
  return exigir(data as { id: string; nome: string; role: string; permissoes: number; pessoas: number } | null,
    'salvar cargos');
}

/**
 * Marca ou desmarca UMA permissão de UM cargo — o clique no quadro.
 *
 * Não reaproveita `salvarCargo` de propósito. Aquela troca o pacote inteiro, e
 * a tela teria de montar a lista final a partir do que tem em memória: dois
 * cliques seguidos no mesmo cargo mandariam duas listas construídas sobre o
 * MESMO estado antigo, e a segunda apagaria a primeira. Sem erro — a marca
 * voltaria sozinha, e quem clicou acharia que não pegou.
 *
 * Devolve o estado REAL depois da escrita, para a tela confirmar (ou corrigir)
 * a marca que já pintou.
 */
export async function marcarPermissao(
  cargoId: string, permissao: string, marcar: boolean,
): Promise<{ marcada: boolean; permissoes: number }> {
  const { data, error } = await supabase.rpc('cargo_permissao_marcar', {
    p_cargo_id: cargoId,
    p_permissao: permissao,
    p_marcar: marcar,
  });
  if (error) throw error;
  return exigir(data as { marcada: boolean; permissoes: number } | null, 'alterar permissões de cargo');
}

export async function excluirCargo(cargoId: string) {
  const { data, error } = await supabase.rpc('cargo_excluir', { p_cargo_id: cargoId });
  if (error) throw error;
  return exigir(data as { excluido: boolean; nome: string } | null, 'excluir cargos');
}

export interface ExcecaoDeMembro {
  codigo: string;
  concede: boolean;
  motivo?: string;
}

export async function definirCargoDoMembro(
  tenantId: string,
  userId: string,
  cargoId: string | null,
  extras: ExcecaoDeMembro[] = []
) {
  const { data, error } = await supabase.rpc('membro_definir_cargo', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_cargo_id: cargoId,
    p_extras: extras,
  });
  if (error) throw error;
  return exigir(
    data as { cargo: string | null; role_antes: string; role_depois: string; excecoes: number } | null,
    'definir cargos'
  );
}

export interface PermissoesEfetivas {
  cargo_id: string | null;
  cargo: string | null;
  role: string;
  /** `null` = sem cargo; o app cai na regra antiga. */
  permissoes: string[] | null;
  excecoes?: Array<{ codigo: string; concede: boolean; motivo: string }>;
}

export async function permissoesEfetivas(
  tenantId: string,
  userId: string
): Promise<PermissoesEfetivas | null> {
  const { data, error } = await supabase.rpc('permissoes_efetivas', {
    p_tenant_id: tenantId, p_user_id: userId,
  });
  if (error) throw error;
  return (data as PermissoesEfetivas) ?? null;
}
