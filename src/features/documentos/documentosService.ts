/**
 * Pasta do cliente (P4.7) — leitura e escrita.
 *
 * As tabelas não têm permissão para o navegador e estão com RLS ligada sem
 * política nenhuma: tudo passa por função do banco, que confere lá dentro se
 * quem chama administra a casa ou é o corretor dono daquele lead.
 *
 * O arquivo em si vai para o bucket PRIVADO `lead-documentos`, na pasta
 * `<tenant>/<lead>` — a mesma que a seção Documentação do lead já usa. A pasta
 * do cliente é uma só; a proposta é a janela que a mostra.
 */

import { supabase } from '@/lib/supabaseClient';

export const BUCKET = 'lead-documentos';

export interface TipoDeDocumento {
  codigo: string;
  nome: string;
  valida_em_dias: number | null;
}

export interface DocumentoDaPasta {
  id: string;
  arquivo: string;
  arquivo_nome: string;
  status: 'enviado' | 'lido' | 'conferido' | 'recusado';
  lido_por: 'ia' | 'regra' | null;
  motivo_recusa: string;
  conferido_em: string | null;
  /** Quantos campos estão em alerta ou erro. */
  alertas: number;
}

export interface TipoNaPasta {
  tipo: string;
  nome: string;
  documentos: DocumentoDaPasta[];
  conferidos: number;
  falta: boolean;
}

export interface Pasta {
  tipos: TipoNaPasta[];
  faltam: number;
  total_tipos: number;
}

export interface CampoDoDocumento {
  campo: string;
  rotulo: string;
  formato: 'texto' | 'cpf' | 'cnpj' | 'data' | 'dinheiro';
  obrigatorio: boolean;
  /** O que a IA leu. NUNCA vale sozinho. */
  valor_sugerido: string | null;
  /** O que a pessoa confirmou. É o único que vale. */
  valor_final: string | null;
  confianca: number | null;
  validacao: 'ok' | 'alerta' | 'erro';
  mensagem: string;
}

export interface DocumentoAberto {
  id: string;
  tipo: string;
  arquivo: string;
  arquivo_nome: string;
  status: DocumentoDaPasta['status'];
  lido_por: 'ia' | 'regra' | null;
  lido_em: string | null;
  conferido_em: string | null;
  motivo_recusa: string;
  campos: CampoDoDocumento[];
}

const vazio = (tenantId: string | null | undefined) => !tenantId || tenantId === 'owner';

/** A função devolve NULL quando recusa. Sem isto a tela diria "salvo" a quem não salvou. */
function exigir<T>(data: T | null, oQue: string): T {
  if (data == null) {
    throw new Error(`Você não tem acesso aos documentos deste cliente (${oQue}).`);
  }
  return data;
}

export async function carregarTipos(): Promise<TipoDeDocumento[]> {
  const { data, error } = await supabase.rpc('documento_tipos_lista');
  if (error) throw error;
  return (data as TipoDeDocumento[]) ?? [];
}

export async function carregarPasta(tenantId: string, leadId: string): Promise<Pasta | null> {
  if (vazio(tenantId) || !leadId) return null;
  const { data, error } = await supabase.rpc('documento_pasta', {
    p_tenant_id: tenantId, p_lead_id: leadId,
  });
  if (error) throw error;
  return (data as Pasta) ?? null;
}

export async function abrirDocumento(documentoId: string): Promise<DocumentoAberto> {
  const { data, error } = await supabase.rpc('documento_abrir', { p_documento_id: documentoId });
  if (error) throw error;
  return exigir(data as DocumentoAberto, 'abrir o documento');
}

/**
 * Sobe o arquivo e registra.
 *
 * A ordem importa: primeiro o arquivo, depois a linha. Se o registro falhar, o
 * arquivo é apagado — senão fica um órfão no bucket que ninguém vê pela tela e
 * que continua sendo dado pessoal guardado.
 */
export async function enviarDocumento(
  tenantId: string,
  leadId: string,
  tipo: string,
  arquivo: File,
  proposalId?: string | null
): Promise<string> {
  const limpo = arquivo.name.replace(/[^\w.-]+/g, '_').slice(0, 120);
  const caminho = `${tenantId}/${leadId}/${Date.now()}-${limpo}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { upsert: false });
  if (erroUpload) throw erroUpload;

  try {
    const { data, error } = await supabase.rpc('documento_registrar', {
      p_tenant_id: tenantId,
      p_lead_id: leadId,
      p_tipo: tipo,
      p_arquivo: caminho,
      p_arquivo_nome: arquivo.name,
      p_proposal_id: proposalId ?? null,
    });
    if (error) throw error;
    return exigir(data as { documento_id: string }, 'registrar o documento').documento_id;
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([caminho]).catch(() => {});
    throw e;
  }
}

/**
 * O endereço temporário para ver o arquivo.
 *
 * O bucket é privado (Regra 5 do plano): o documento nunca tem endereço fixo.
 * Cinco minutos é o bastante para conferir e curto o bastante para um link
 * copiado por engano não servir depois.
 */
export async function verDocumento(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 300);
  if (error) throw error;
  return data.signedUrl;
}

export interface ResultadoDaConfirmacao {
  confirmado: boolean;
  erros?: Array<{ campo: string; mensagem: string }>;
}

/** Regra 1: é o único caminho pelo qual um valor lido passa a valer. */
export async function confirmarDocumento(
  documentoId: string,
  campos: Array<{ campo: string; valor: string }>
): Promise<ResultadoDaConfirmacao> {
  const { data, error } = await supabase.rpc('documento_confirmar', {
    p_documento_id: documentoId, p_campos: campos,
  });
  if (error) throw error;
  return exigir(data as ResultadoDaConfirmacao, 'confirmar');
}

export async function recusarDocumento(documentoId: string, motivo: string) {
  const { data, error } = await supabase.rpc('documento_recusar', {
    p_documento_id: documentoId, p_motivo: motivo,
  });
  if (error) throw error;
  return exigir(data, 'recusar');
}
