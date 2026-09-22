/**
 * Ajuda: manual + FAQ (P4.9) — leitura e escrita.
 *
 * Todo membro lê e pergunta. Escrever artigo, responder dúvida e ver o que foi
 * reportado é de quem administra — as funções do banco conferem isso lá dentro.
 */

import { supabase } from '@/lib/supabaseClient';

export interface Artigo {
  id: string;
  tipo: 'manual' | 'faq';
  modulo: string;
  titulo: string;
  texto: string;
  /** Artigo da plataforma: vale para todas as imobiliárias e só o dono edita. */
  da_plataforma: boolean;
}

export interface Duvida {
  id: string;
  pergunta: string;
  modulo: string;
  tela?: string;
  perguntou_email?: string;
  perguntou_em: string;
  resposta: string;
  respondeu_em: string | null;
  status: 'aberta' | 'respondida' | 'publicada';
  artigo_id?: string | null;
}

export interface ProblemaReportado {
  id: string;
  titulo: string;
  descricao: string;
  tipo: string;
  prioridade: string;
  status: string;
  url: string;
  quando: string;
  quem: string | null;
}

const vazio = (t: string | null | undefined) => !t || t === 'owner';

function exigir<T>(data: T | null, oQue: string): T {
  if (data == null) throw new Error(`Você não tem acesso a isso (${oQue}).`);
  return data;
}

export async function buscarAjuda(
  tenantId: string, termo?: string, modulo?: string
): Promise<Artigo[]> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('ajuda_buscar', {
    p_tenant_id: tenantId,
    p_termo: termo?.trim() || null,
    p_modulo: modulo || null,
  });
  if (error) throw error;
  return (data as Artigo[]) ?? [];
}

export async function perguntar(
  tenantId: string, pergunta: string, modulo = 'geral', tela = ''
): Promise<string> {
  const { data, error } = await supabase.rpc('ajuda_perguntar', {
    p_tenant_id: tenantId, p_pergunta: pergunta, p_modulo: modulo, p_tela: tela,
  });
  if (error) throw error;
  return exigir(data as { duvida_id: string }, 'perguntar').duvida_id;
}

export async function minhasDuvidas(tenantId: string): Promise<Duvida[]> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('ajuda_minhas_duvidas', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as Duvida[]) ?? [];
}

/** A fila de quem administra. Devolve nulo quando quem chama não pode ver. */
export async function filaDeDuvidas(tenantId: string): Promise<Duvida[] | null> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('ajuda_duvidas_lista', {
    p_tenant_id: tenantId, p_status: null,
  });
  if (error) throw error;
  return (data as Duvida[]) ?? null;
}

export async function responder(duvidaId: string, resposta: string) {
  const { data, error } = await supabase.rpc('ajuda_responder', {
    p_duvida_id: duvidaId, p_resposta: resposta,
  });
  if (error) throw error;
  return exigir(data, 'responder');
}

export async function publicarNoFaq(duvidaId: string, titulo?: string) {
  const { data, error } = await supabase.rpc('ajuda_publicar_no_faq', {
    p_duvida_id: duvidaId, p_titulo: titulo || null,
  });
  if (error) throw error;
  return exigir(data as { artigo_id: string; ja_publicada?: boolean }, 'publicar no FAQ');
}

export async function salvarArtigo(
  tenantId: string,
  a: { id?: string; titulo: string; texto: string; modulo: string; publicado?: boolean }
) {
  const { data, error } = await supabase.rpc('ajuda_artigo_salvar', {
    p_tenant_id: tenantId,
    p_titulo: a.titulo,
    p_texto: a.texto,
    p_modulo: a.modulo,
    p_tipo: 'manual',
    p_id: a.id ?? null,
    p_publicado: a.publicado ?? true,
  });
  if (error) throw error;
  return exigir(data as { artigo_id: string }, 'salvar o artigo');
}

export async function problemasReportados(tenantId: string): Promise<ProblemaReportado[] | null> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('ajuda_problemas_reportados', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as ProblemaReportado[]) ?? null;
}
