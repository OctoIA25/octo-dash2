/**
 * Atas de reunião (P4.8) — leitura e escrita.
 *
 * As tabelas não têm permissão para o navegador: tudo passa por função do
 * banco, que confere lá dentro se quem chama administra a casa ou lidera
 * equipe. O corretor não vê a ata — ele recebe a tarefa na agenda dele.
 */

import { supabase } from '@/lib/supabaseClient';

export interface AtaNaLista {
  id: string;
  titulo: string;
  data_reuniao: string | null;
  status: 'enviada' | 'lida' | 'revisada';
  equipe: string;
  criado_em: string;
  tarefas: number;
  sem_responsavel: number;
  tarefas_criadas: boolean;
}

export interface TarefaDaAta {
  id: string;
  descricao: string;
  /** O que a transcrição disse: "a Ana", "o jurídico". Não é uma pessoa. */
  responsavel_texto: string;
  /** Quem é, de verdade. Só uma pessoa preenche. */
  responsavel_email: string | null;
  prazo: string | null;
  descartada: boolean;
  na_agenda: boolean;
}

export interface Ata {
  id: string;
  titulo: string;
  data_reuniao: string | null;
  participantes: string[];
  resumo: string;
  decisoes: string[];
  riscos: string[];
  mapa: Array<{ nivel: number; texto: string }>;
  status: AtaNaLista['status'];
  lido_por: 'ia' | null;
  erro_leitura: string;
  tarefas_criadas_em: string | null;
  equipe: string;
  lead_id: string | null;
  transcricao: string;
  tarefas: TarefaDaAta[];
}

export interface Responsavel { email: string; nome: string; papel: string }

const vazio = (tenantId: string | null | undefined) => !tenantId || tenantId === 'owner';

function exigir<T>(data: T | null, oQue: string): T {
  if (data == null) throw new Error(`Você não tem acesso às atas desta imobiliária (${oQue}).`);
  return data;
}

export async function carregarAtas(tenantId: string): Promise<AtaNaLista[] | null> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('atas_lista', { p_tenant_id: tenantId, p_limite: 50 });
  if (error) throw error;
  return (data as AtaNaLista[]) ?? null;
}

export async function abrirAta(ataId: string): Promise<Ata> {
  const { data, error } = await supabase.rpc('ata_abrir', { p_ata_id: ataId });
  if (error) throw error;
  return exigir(data as Ata, 'abrir a ata');
}

export async function carregarResponsaveis(tenantId: string): Promise<Responsavel[]> {
  if (vazio(tenantId)) return [];
  const { data, error } = await supabase.rpc('ata_responsaveis', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data as Responsavel[]) ?? [];
}

export async function criarAta(
  tenantId: string,
  a: { titulo: string; data: string | null; transcricao: string; equipe?: string }
): Promise<string> {
  const { data, error } = await supabase.rpc('ata_criar', {
    p_tenant_id: tenantId,
    p_titulo: a.titulo,
    p_data_reuniao: a.data || null,
    p_transcricao: a.transcricao,
    p_equipe: a.equipe ?? '',
    p_lead_id: null,
    p_proposal_id: null,
  });
  if (error) throw error;
  return exigir(data as { ata_id: string }, 'criar a ata').ata_id;
}

export async function revisarTarefa(
  tarefaId: string,
  mudanca: { descricao?: string; responsavelEmail?: string | null; prazo?: string | null; descartada?: boolean }
) {
  const { data, error } = await supabase.rpc('ata_tarefa_revisar', {
    p_tarefa_id: tarefaId,
    p_descricao: mudanca.descricao ?? null,
    p_responsavel_email: mudanca.responsavelEmail ?? null,
    p_prazo: mudanca.prazo ?? null,
    p_descartada: mudanca.descartada ?? null,
  });
  if (error) throw error;
  return exigir(data, 'revisar a tarefa');
}

export interface ResultadoDaCriacao {
  criadas: number;
  ja_criadas?: boolean;
  sem_responsavel?: Array<{ descricao: string; responsavel_texto: string | null }>;
}

/** O único ponto em que a ata vira trabalho de alguém. */
export async function criarTarefas(ataId: string): Promise<ResultadoDaCriacao> {
  const { data, error } = await supabase.rpc('ata_criar_tarefas', { p_ata_id: ataId });
  if (error) throw error;
  return exigir(data as ResultadoDaCriacao, 'criar as tarefas');
}

/**
 * Lê o arquivo da transcrição.
 *
 * `.txt` e `.vtt` são texto puro. `.docx` é um zip e NÃO é lido aqui — a tela
 * diz isso em vez de mostrar um punhado de caracteres binários e deixar a
 * pessoa achar que a ata ficou estranha por culpa da reunião.
 */
export async function lerArquivoDeTranscricao(arquivo: File): Promise<string> {
  if (/\.docx?$/i.test(arquivo.name)) {
    throw new Error('Arquivo do Word ainda não é lido aqui. Abra, copie o texto e cole no campo abaixo.');
  }
  const texto = await arquivo.text();
  // O .vtt vem com "WEBVTT", numeração e marcas de tempo. Tirar isso deixa só
  // as falas, que é o que interessa a quem lê e a quem resume.
  if (/\.vtt$/i.test(arquivo.name)) {
    return texto
      .split(/\r?\n/)
      .filter((l) => !/^WEBVTT/i.test(l) && !/^\d+$/.test(l.trim()) && !/-->/.test(l))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return texto;
}
