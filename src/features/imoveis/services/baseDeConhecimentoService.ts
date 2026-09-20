/**
 * Base de conhecimento por empreendimento (P2.3).
 *
 * A Dash guarda os documentos e faz a busca. Quem extrai o PDF e gera o
 * embedding é a LIA, no servidor próprio — decidido pelo chefe em
 * 20/09/2026. Até isso ligar, a busca é por palavra e já funciona.
 */

import { supabase } from '@/lib/supabaseClient';

export const TIPOS_DE_DOCUMENTO = [
  { valor: 'book', rotulo: 'Book' },
  { valor: 'memorial', rotulo: 'Memorial descritivo' },
  { valor: 'faq', rotulo: 'Perguntas frequentes' },
  { valor: 'regulamento', rotulo: 'Regulamento' },
  { valor: 'resposta_plantao', rotulo: 'Resposta de plantão' },
  { valor: 'outro', rotulo: 'Outro' },
] as const;

export interface DocumentoKb {
  id: string;
  titulo: string;
  tipo: string;
  arquivo_url: string | null;
  conteudo: string | null;
  valido_ate: string | null;
  ativo: boolean;
  status_indexacao: 'pendente' | 'indexado' | 'erro';
  qtd_trechos: number;
  erro_indexacao: string | null;
  updated_at: string;
}

export interface TrechoEncontrado {
  trecho_id: string;
  documento_id: string;
  documento_titulo: string;
  documento_tipo: string;
  texto: string;
  semelhanca: number;
  /** 'significado' quando houve embedding; 'palavra' quando foi busca textual. */
  modo: 'significado' | 'palavra';
}

const COLUNAS =
  'id, titulo, tipo, arquivo_url, conteudo, valido_ate, ativo, status_indexacao, qtd_trechos, erro_indexacao, updated_at';

export async function listarDocumentos(lancamentoId: string): Promise<DocumentoKb[]> {
  if (!lancamentoId) return [];
  const { data, error } = await supabase
    .from('kb_documentos')
    .select(COLUNAS)
    .eq('lancamento_id', lancamentoId)
    .order('created_at', { ascending: false });
  // Erro não vira lista vazia: a tela diria que não há documento nenhum.
  if (error) throw error;
  return (data ?? []) as unknown as DocumentoKb[];
}

export async function criarDocumento(
  tenantId: string,
  lancamentoId: string,
  doc: { titulo: string; tipo: string; arquivo_url?: string | null; conteudo?: string | null; valido_ate?: string | null }
): Promise<void> {
  if (!tenantId || tenantId === 'owner' || !lancamentoId) throw new Error('sem imobiliária ou lançamento');
  const { error } = await supabase.from('kb_documentos').insert({
    tenant_id: tenantId,
    lancamento_id: lancamentoId,
    titulo: doc.titulo.trim(),
    tipo: doc.tipo,
    arquivo_url: doc.arquivo_url?.trim() || null,
    conteudo: doc.conteudo?.trim() || null,
    valido_ate: doc.valido_ate || null,
    status_indexacao: 'pendente',
  });
  if (error) throw error;
}

export async function alterarDocumento(
  id: string,
  campos: Partial<Pick<DocumentoKb, 'ativo' | 'valido_ate' | 'titulo' | 'tipo'>>
): Promise<void> {
  const { error } = await supabase
    .from('kb_documentos')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function apagarDocumento(id: string): Promise<void> {
  const { error } = await supabase.from('kb_documentos').delete().eq('id', id);
  if (error) throw error;
}

/**
 * O "Testar busca": pergunta como o cliente faria.
 *
 * Sem embedding a busca é por palavra — e é de propósito que o resultado diga
 * qual modo foi usado. O gestor precisa saber se a LIA acharia isso por
 * significado ou só porque a palavra bateu.
 */
export async function testarBusca(
  lancamentoId: string,
  pergunta: string,
  k = 5
): Promise<TrechoEncontrado[]> {
  if (!lancamentoId || !pergunta.trim()) return [];
  const { data, error } = await supabase.rpc('buscar_kb', {
    p_lancamento_id: lancamentoId,
    p_pergunta: pergunta.trim(),
    p_k: k,
  });
  if (error) throw error;
  return (data ?? []) as TrechoEncontrado[];
}
