/** A.7 · O formulário do curso → o que vai para o banco, ou a primeira coisa que falta. */
import { extractYouTubeId } from '@/features/imoveis/utils/mediaUrls';
import { lerDuracao } from './assistido';
import type { CursoParaEditar } from './universidadeService';

export interface AulaNoForm { id?: string; titulo: string; descricao: string; link: string; duracao: string }
export interface QuestaoNoForm { id?: string; enunciado: string; alternativas: string[]; correta: number }

export function mover<T>(lista: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

export const vazio = (): CursoParaEditar => ({
  titulo: '', descricao: '', categoria: 'treinamentos', obrigatorio_para: [], publicado: false, nota_corte: 70, aulas: [], questoes: [],
});

/** O que vai para o banco, ou a primeira coisa que falta. */
export function montarCurso(base: CursoParaEditar, aulas: AulaNoForm[], questoes: QuestaoNoForm[]): CursoParaEditar | string {
  if (!base.titulo.trim()) return 'Dê um título ao curso.';
  const prontas: CursoParaEditar['aulas'] = [];
  for (const [i, a] of aulas.entries()) {
    const id = extractYouTubeId(a.link.trim()) ?? (/^[A-Za-z0-9_-]{11}$/.test(a.link.trim()) ? a.link.trim() : null);
    const duracao = lerDuracao(a.duracao);
    if (!a.titulo.trim()) return `A aula ${i + 1} precisa de título.`;
    if (!id) return `O link da aula ${i + 1} não é de um vídeo do YouTube.`;
    if (!duracao) return `Informe a duração da aula ${i + 1} (ex.: 12:30).`;
    prontas.push({ id: a.id, titulo: a.titulo.trim(), descricao: a.descricao.trim(), youtube_id: id, duracao_seg: duracao });
  }
  if (base.publicado && prontas.length === 0) return 'Um curso publicado precisa de pelo menos uma aula.';
  const qs: CursoParaEditar['questoes'] = [];
  for (const [i, q] of questoes.entries()) {
    const alternativas = q.alternativas.map((x) => x.trim()).filter(Boolean);
    if (!q.enunciado.trim()) return `A pergunta ${i + 1} precisa de enunciado.`;
    if (alternativas.length < 2) return `A pergunta ${i + 1} precisa de pelo menos 2 alternativas.`;
    if (!q.alternativas[q.correta]?.trim()) return `Marque a alternativa certa da pergunta ${i + 1}.`;
    qs.push({ id: q.id, enunciado: q.enunciado.trim(), alternativas, correta: alternativas.indexOf(q.alternativas[q.correta].trim()) });
  }
  return { ...base, titulo: base.titulo.trim(), aulas: prontas, questoes: qs };
}
