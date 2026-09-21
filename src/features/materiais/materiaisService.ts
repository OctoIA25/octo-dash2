/**
 * Materiais de estudo (P4.2) — leitura e escrita.
 *
 * As três tabelas não têm grant para o front: tudo passa por função do banco,
 * que decide lá dentro quem alcança o quê. A regra de alcance mora numa função
 * só (`material_alcanca`), consultada pela lista, pelos pendentes e pelo
 * relatório — duas cópias divergiriam, e a divergência apareceria como "sumiu
 * um material" para uma pessoa só.
 */

import { supabase } from '@/lib/supabaseClient';
import type { CategoriaDeMaterial, QuadroDeMateriais, TipoDeMaterial } from './materiais';

const vazio = (tenantId: string) => !tenantId || tenantId === 'owner';

function exigir<T>(data: T | null, oQue: string): T {
  if (data == null) throw new Error(`Você não tem permissão para ${oQue}.`);
  return data;
}

export async function carregarMateriais(
  tenantId: string,
  incluirRascunhos = false
): Promise<QuadroDeMateriais | null> {
  if (vazio(tenantId)) return null;
  const { data, error } = await supabase.rpc('materiais_listar', {
    p_tenant_id: tenantId,
    p_incluir_rascunhos: incluirRascunhos,
  });
  if (error) throw error;
  return (data as QuadroDeMateriais) ?? null;
}

export interface MaterialParaSalvar {
  id?: string | null;
  titulo: string;
  resumo: string;
  categoria: CategoriaDeMaterial;
  tipo: TipoDeMaterial;
  conteudo: string;
  arquivo?: string | null;
  linkUrl?: string | null;
  obrigatorio: boolean;
  publico: 'todos' | 'cargo' | 'equipe';
  cargoId?: string | null;
  teamId?: string | null;
  publicar: boolean;
  /** `true` = mudou a regra, e todo mundo precisa ler de novo. */
  novaVersao?: boolean;
  nota?: string;
}

export async function salvarMaterial(tenantId: string, m: MaterialParaSalvar) {
  const { data, error } = await supabase.rpc('material_salvar', {
    p_tenant_id: tenantId,
    p_titulo: m.titulo,
    p_categoria: m.categoria,
    p_tipo: m.tipo,
    p_conteudo: m.conteudo ?? '',
    p_resumo: m.resumo ?? '',
    p_arquivo: m.arquivo ?? null,
    p_link_url: m.linkUrl ?? null,
    p_obrigatorio: m.obrigatorio,
    p_publico: m.publico,
    p_cargo_id: m.cargoId ?? null,
    p_team_id: m.teamId ?? null,
    p_publicar: m.publicar,
    p_id: m.id ?? null,
    p_nova_versao: m.novaVersao ?? false,
    p_nota: m.nota ?? '',
  });
  if (error) throw error;
  return exigir(
    data as { id: string; titulo: string; versao: number; publicado: boolean; releitura: number } | null,
    'salvar materiais'
  );
}

export async function arquivarMaterial(materialId: string) {
  const { data, error } = await supabase.rpc('material_excluir', { p_material_id: materialId });
  if (error) throw error;
  return exigir(data as { arquivado: boolean; titulo: string } | null, 'arquivar materiais');
}

/** Registra que a pessoa abriu — e, quando `aceitar`, que declarou ter entendido. */
export async function registrarLeitura(materialId: string, aceitar = false) {
  const { data, error } = await supabase.rpc('material_registrar_leitura', {
    p_material_id: materialId,
    p_aceitar: aceitar,
  });
  if (error) throw error;
  return data as { material: string; versao: number; aceito: boolean } | null;
}

export interface Pendente {
  id: string;
  titulo: string;
  categoria: CategoriaDeMaterial;
  versao: number;
}

export async function carregarPendentes(tenantId: string): Promise<Pendente[]> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('materiais_pendentes', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as Pendente[]) ?? [];
}

export interface RelatorioDoMaterial {
  material: string;
  versao: number;
  obrigatorio: boolean;
  alcanca: number;
  leram: number;
  aceitaram: number;
  pessoas: Array<{
    user_id: string;
    email: string;
    role: string;
    lido_em: string | null;
    aceito_em: string | null;
  }>;
}

export async function carregarRelatorio(materialId: string): Promise<RelatorioDoMaterial | null> {
  const { data, error } = await supabase.rpc('material_relatorio', { p_material_id: materialId });
  if (error) throw error;
  return (data as RelatorioDoMaterial) ?? null;
}

export interface VersaoDoMaterial {
  versao: number;
  titulo: string;
  nota: string;
  publicado_em: string;
  autor: string;
  leram: number;
}

export async function carregarVersoes(materialId: string): Promise<VersaoDoMaterial[]> {
  const { data, error } = await supabase.rpc('material_versoes', { p_material_id: materialId });
  if (error) throw error;
  return (data as VersaoDoMaterial[]) ?? [];
}

/** Sobe o arquivo. O caminho é `tenant/arquivo`, que é de onde a política tira o recorte. */
export async function subirArquivo(tenantId: string, arquivo: File) {
  const limpo = arquivo.name.replace(/[^\w.-]+/g, '_');
  const caminho = `${tenantId}/${Date.now()}_${limpo}`;
  const { error } = await supabase.storage.from('materiais-estudo').upload(caminho, arquivo);
  if (error) throw error;
  return caminho;
}

/** Link temporário: o bucket é privado, não tem endereço público. */
export async function linkDoArquivo(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('materiais-estudo')
    .createSignedUrl(caminho, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}
