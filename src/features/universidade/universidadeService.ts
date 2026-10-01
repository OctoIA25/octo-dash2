/**
 * A.7 · Universidade — tudo pelas funções do banco (20261012_universidade.sql).
 * A tela não lê as tabelas: o gabarito nunca sai do banco, e o progresso
 * só sobe no ritmo do relógio.
 */
import { supabase } from '@/integrations/supabase/client';

export type Situacao = 'nao_abriu' | 'no_meio' | 'concluiu';
export interface MinhaSituacao {
  situacao: Situacao; aulas: number; aulas_concluidas: number; tem_prova: boolean;
  tentativas: number; melhor_nota: number | null; certificado: { hash: string; emitido_em: string } | null;
}
export interface CursoResumo {
  id: string; titulo: string; descricao: string | null; categoria: string | null; publicado: boolean;
  nota_corte: number; obrigatorio: boolean; duracao_seg: number; meu: MinhaSituacao;
}
export interface Aula {
  id: string; ordem: number; titulo: string; descricao: string | null; youtube_id: string; duracao_seg: number;
  segundos_vistos: number; concluida: boolean;
}
export interface Questao { id: string; ordem: number; enunciado: string; alternativas: string[] }
export interface Curso {
  id: string; titulo: string; descricao: string | null; categoria: string | null; publicado: boolean; nota_corte: number;
  aulas: Aula[]; questoes: Questao[]; tentativas: { nota: number; aprovado: boolean; feita_em: string }[]; meu: MinhaSituacao;
}
export interface CursoParaEditar {
  id?: string; titulo: string; descricao: string; categoria: string; obrigatorio_para: string[]; publicado: boolean; nota_corte: number;
  aulas: { id?: string; titulo: string; descricao?: string; youtube_id: string; duracao_seg: number }[];
  questoes: { id?: string; enunciado: string; alternativas: string[]; correta: number }[];
}
export interface LinhaDoPainel extends MinhaSituacao { user_id: string; nome: string; equipe: string; obrigatorio: boolean }
export interface ResultadoDaProva {
  nota: number; aprovado: boolean; nota_corte: number; certas: number; total: number;
  certificado: { hash: string; emitido_em: string; novo: boolean } | null;
}
export interface ItemDaTrilha {
  id: string | null; tipo: 'curso' | 'material' | 'tarefa'; ref_id: string | null; titulo: string | null;
  origem: 'gestor' | 'cargo'; concluido: boolean;
}
export interface Trilha { prazo: string | null; gestor: string | null; pode_editar: boolean; itens: ItemDaTrilha[] }
export interface Certificado { valido: boolean; nome?: string; curso?: string; nota?: number | null; emitido_em?: string; imobiliaria?: string }

const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Isso é da diretoria (ou do líder da equipe).',
  curso_sem_aula: 'Um curso publicado precisa de pelo menos uma aula.',
  curso_invalido: 'O curso veio incompleto.',
  aulas_pendentes: 'A prova abre depois de todas as aulas assistidas.',
  responda_todas: 'Responda todas as perguntas.',
  curso_sem_prova: 'Este curso não tem prova.',
  item_invalido: 'Esse item não existe nesta imobiliária.',
};
function erro(e: { message?: string }): Error {
  const m = e.message ?? '';
  if (m.includes('youtube_id_check')) return new Error('Link do YouTube inválido em uma das aulas.');
  if (m.includes('duracao_seg_check')) return new Error('Toda aula precisa da duração (até 6 horas).');
  if (m.includes('alternativas') || m.includes('correta')) return new Error('Cada pergunta precisa de 2 a 6 alternativas e uma certa.');
  if (m.includes('titulo_check') || m.includes('enunciado_check')) return new Error('Falta um título ou um enunciado.');
  return new Error(MENSAGENS[m] ?? 'Não deu para concluir. Tente de novo.');
}
async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw erro(error);
  return data as T;
}

export const carregarCursos = (tenantId: string) =>
  rpc<{ pode_gerir: boolean; cursos: CursoResumo[] }>('universidade_cursos', { p_tenant_id: tenantId });
export const carregarCurso = (cursoId: string) => rpc<Curso>('curso_ver', { p_curso_id: cursoId });
export const carregarCursoParaEditar = (cursoId: string) => rpc<CursoParaEditar>('curso_para_editar', { p_curso_id: cursoId });
export const salvarCurso = (tenantId: string, curso: CursoParaEditar) => rpc<string>('curso_salvar', { p_tenant_id: tenantId, p_curso: curso });
export const carregarPainel = (cursoId: string) => rpc<LinhaDoPainel[]>('curso_painel', { p_curso_id: cursoId });
export const registrarProgresso = (aulaId: string, segundos: number) =>
  rpc<{ segundos_vistos: number; concluida: boolean }>('registrar_progresso_aula', { p_aula_id: aulaId, p_segundos_vistos: Math.floor(segundos) });
export const responderProva = (cursoId: string, respostas: number[]) =>
  rpc<ResultadoDaProva>('responder_prova', { p_curso_id: cursoId, p_respostas: respostas });
export const verificarCertificado = (hash: string) => rpc<Certificado>('verificar_certificado', { p_hash: hash });

export const carregarTrilha = (tenantId: string, userId: string) => rpc<Trilha>('trilha_ver', { p_tenant_id: tenantId, p_user_id: userId });
export const pessoasDaTrilha = (tenantId: string) =>
  rpc<{ user_id: string; nome: string; equipe: string }[]>('trilha_pessoas', { p_tenant_id: tenantId });
export const adicionarNaTrilha = (tenantId: string, userId: string, tipo: ItemDaTrilha['tipo'], refId: string | null, titulo: string | null) =>
  rpc<string>('trilha_adicionar', { p_tenant_id: tenantId, p_user_id: userId, p_tipo: tipo, p_ref_id: refId, p_titulo: titulo });
export const removerDaTrilha = (itemId: string) => rpc<void>('trilha_remover', { p_item_id: itemId });
export const definirPrazo = (tenantId: string, userId: string, prazo: string | null) =>
  rpc<void>('trilha_prazo', { p_tenant_id: tenantId, p_user_id: userId, p_prazo: prazo });
export const marcarTarefa = (itemId: string, feita: boolean) => rpc<void>('trilha_marcar_tarefa', { p_item_id: itemId, p_feita: feita });
