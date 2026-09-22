/**
 * Contratos do corretor (P4.3) — leitura, aceite e PDF.
 *
 * O ACEITE NÃO PASSA PELO SUPABASE. Ele vai por uma rota do servidor da Dash,
 * porque é lá que o IP da conexão é visível — o navegador não enxerga o próprio
 * endereço público, e se ele o informasse o aceitante estaria declarando o
 * próprio IP. A função do banco nem tem permissão para o navegador.
 */

import { supabase } from '@/lib/supabaseClient';
import { carimboDeAceite, mensagemDeErro } from './contratos';
import type { ContratoPendente, ModeloDeContrato, ResultadoDaAtribuicao } from './contratos';

export async function carregarPendentes(): Promise<ContratoPendente[] | null> {
  const { data, error } = await supabase.rpc('contratos_pendentes');
  // Devolve NULL no erro, e não lista vazia: é o sinal para a tela NÃO
  // bloquear. Uma lista vazia aqui diria "conferi e não há pendência", que é
  // o contrário do que aconteceu.
  if (error) return null;
  return (data as ContratoPendente[]) ?? [];
}

export async function carregarModelos(tenantId: string): Promise<ModeloDeContrato[] | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('contrato_modelos_listar', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as ModeloDeContrato[]) ?? null;
}

export interface ModeloParaSalvar {
  id?: string | null;
  titulo: string;
  corpo: string;
  descricao: string;
  exigeAssinaturaEletronica: boolean;
  novaVersao?: boolean;
  nota?: string;
}

export async function salvarModelo(tenantId: string, m: ModeloParaSalvar) {
  const { data, error } = await supabase.rpc('contrato_modelo_salvar', {
    p_tenant_id: tenantId,
    p_titulo: m.titulo,
    p_corpo: m.corpo,
    p_descricao: m.descricao ?? '',
    p_exige_ae: m.exigeAssinaturaEletronica,
    p_id: m.id ?? null,
    p_nova_versao: m.novaVersao ?? false,
    p_nota: m.nota ?? '',
  });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para editar contratos.');
  return data as { id: string; titulo: string; versao: number };
}

/**
 * Atribui — ou só SIMULA, para a tela mostrar quem ficaria de fora.
 *
 * A simulação existe porque o cadastro está quase vazio: medido em produção em
 * 21/09, CPF preenchido em 0 de 126 membros. Atribuir às cegas criaria
 * contratos com lacuna, e a lacuna só apareceria depois do aceite.
 */
export async function atribuir(
  tenantId: string,
  modeloId: string,
  alvo: 'todos' | 'cargo' | 'pessoa',
  alvoId: string | null,
  confirmar: boolean
): Promise<ResultadoDaAtribuicao> {
  const { data, error } = await supabase.rpc('contrato_atribuir', {
    p_tenant_id: tenantId,
    p_modelo_id: modeloId,
    p_alvo: alvo,
    p_alvo_id: alvoId,
    p_confirmar: confirmar,
  });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para atribuir contratos.');
  return data as ResultadoDaAtribuicao;
}

export interface RelatorioDeContrato {
  modelo: string;
  versao_atual: number;
  pendentes: number;
  aceitos_versao_atual: number;
  linhas: Array<{
    id: string; user_id: string; email: string; versao: number;
    status: string; aceito_em: string | null; ip: string | null;
    tem_pdf: boolean; versao_antiga: boolean;
  }>;
}

export async function carregarRelatorio(modeloId: string): Promise<RelatorioDeContrato | null> {
  const { data, error } = await supabase.rpc('contrato_relatorio', { p_modelo_id: modeloId });
  if (error) throw error;
  return (data as RelatorioDeContrato) ?? null;
}

export async function cancelarAtribuicao(atribuicaoId: string) {
  const { data, error } = await supabase.rpc('contrato_cancelar', { p_atribuicao_id: atribuicaoId });
  if (error) throw error;
  if (data == null) throw new Error('Você não tem permissão para cancelar.');
  return data;
}

export interface AceiteRegistrado {
  aceito: boolean;
  aceito_em: string;
  hash: string;
  titulo: string;
  ja_aceito?: boolean;
}

/**
 * Registra o aceite pelo servidor da Dash.
 *
 * O token vai no cabeçalho e o servidor extrai dele quem está aceitando — o
 * corpo carrega só qual contrato. Mandar o usuário no corpo abriria o mesmo
 * buraco que a configuração da Meta já documentou: o identificador de quem age
 * precisa ter uma fonte só.
 */
export async function aceitarContrato(atribuicaoId: string): Promise<AceiteRegistrado> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre de novo para aceitar.');

  const resposta = await fetch('/api/v1/contratos/aceitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ atribuicao_id: atribuicaoId }),
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || corpo?.ok === false) {
    // `mensagemDeErro` e não `corpo.error` direto: o erro pode vir como objeto,
    // e o texto que a pessoa veria seria "[object Object]" — num momento em que
    // ela está bloqueada fora da Dash e não tem outra tela para onde ir.
    throw new Error(mensagemDeErro(corpo));
  }
  return corpo as AceiteRegistrado;
}

/**
 * O PDF carimbado, gerado no navegador.
 *
 * Fica no cliente porque é lá que a biblioteca já existe (o mesmo jsPDF dos
 * relatórios) e porque o texto já está na tela. O que dá valor ao documento
 * não é o PDF e sim o registro no banco — o papel é a cópia legível dele, e
 * por isso carrega o hash: se alguém trocar uma vírgula depois, o hash não
 * confere mais.
 */
export async function gerarPdfDoContrato(a: {
  titulo: string;
  corpo: string;
  versao: number;
  hash: string;
  aceito_em: string;
  ip: string | null;
  nomeDaPessoa: string;
}): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  const margem = 20;
  const largura = 210 - margem * 2;
  let y = margem;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(a.titulo, margem, y);
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(110);
  pdf.text(`${a.nomeDaPessoa} — versão ${a.versao}`, margem, y);
  y += 8;

  pdf.setTextColor(20);
  pdf.setFontSize(10);
  for (const linha of pdf.splitTextToSize(a.corpo, largura) as string[]) {
    if (y > 270) { pdf.addPage(); y = margem; }
    pdf.text(linha, margem, y);
    y += 5;
  }

  // O carimbo, separado do texto por uma régua para não se confundir com ele.
  if (y > 240) { pdf.addPage(); y = margem; }
  y += 6;
  pdf.setDrawColor(180);
  pdf.line(margem, y, margem + largura, y);
  y += 6;

  pdf.setFontSize(8);
  pdf.setTextColor(90);
  for (const linha of carimboDeAceite({
    aceito_em: a.aceito_em, ip: a.ip, hash: a.hash, titulo: a.titulo, versao: a.versao,
  })) {
    for (const parte of pdf.splitTextToSize(linha, largura) as string[]) {
      if (y > 285) { pdf.addPage(); y = margem; }
      pdf.text(parte, margem, y);
      y += 4;
    }
  }

  return pdf.output('blob');
}

/**
 * Sobe o PDF para o perfil do corretor.
 *
 * É o MESMO bucket onde já mora o Termo de Associação, e o mesmo caminho
 * (`tenant/user`), para o documento aparecer na lista que a Gestão de Equipe
 * já mostra — em vez de criar um segundo lugar de guardar documento.
 */
export async function subirPdfNoPerfil(
  tenantId: string,
  userId: string,
  pdf: Blob,
  titulo: string
): Promise<string> {
  const limpo = titulo.replace(/[^\w.-]+/g, '_').slice(0, 60);
  const caminho = `${tenantId}/${userId}/${limpo}_${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from('corretor-documentos')
    .upload(caminho, pdf, { contentType: 'application/pdf' });
  if (error) throw error;

  return caminho;
}

export async function registrarPdf(atribuicaoId: string, caminho: string) {
  const { error } = await supabase.rpc('contrato_registrar_pdf', {
    p_atribuicao_id: atribuicaoId,
    p_arquivo: caminho,
  });
  if (error) throw error;
}
