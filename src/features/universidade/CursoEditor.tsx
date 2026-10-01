/**
 * A.7 · O editor do curso (diretoria): dados, cargos para quem é obrigatório,
 * aulas (link do YouTube + duração) e a prova com gabarito.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { carregarCargos } from '@/features/cargos/cargosService';
import { duracaoBR } from './assistido';
import { montarCurso, mover, vazio, type AulaNoForm, type QuestaoNoForm } from './cursoForm';
import { carregarCursoParaEditar, salvarCurso, type CursoParaEditar } from './universidadeService';

export function CursoEditor({ tenantId, cursoId, onFechar }: { tenantId: string; cursoId: string | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const existente = useQuery({ queryKey: ['curso-editar', cursoId], queryFn: () => carregarCursoParaEditar(cursoId!), enabled: !!cursoId });
  const cargos = useQuery({ queryKey: ['cargos', tenantId], queryFn: () => carregarCargos(tenantId) });
  const [base, setBase] = useState<CursoParaEditar>(vazio);
  const [aulas, setAulas] = useState<AulaNoForm[]>([]);
  const [questoes, setQuestoes] = useState<QuestaoNoForm[]>([]);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    const c = existente.data;
    if (!c) return;
    setBase({ ...c, descricao: c.descricao ?? '', categoria: c.categoria ?? '' });
    setAulas(c.aulas.map((a) => ({ id: a.id, titulo: a.titulo, descricao: a.descricao ?? '', link: `https://youtu.be/${a.youtube_id}`, duracao: duracaoBR(a.duracao_seg) })));
    setQuestoes(c.questoes.map((q) => ({ id: q.id, enunciado: q.enunciado, alternativas: q.alternativas, correta: q.correta })));
  }, [existente.data]);

  const salvar = useMutation({
    mutationFn: (curso: CursoParaEditar) => salvarCurso(tenantId, curso),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['universidade-cursos', tenantId] }); onFechar(); },
  });
  const enviar = () => {
    const pronto = montarCurso(base, aulas, questoes);
    if (typeof pronto === 'string') { setProblema(pronto); return; }
    setProblema(null);
    salvar.mutate({ ...pronto, id: cursoId ?? undefined });
  };
  const mexerAula = (i: number, p: Partial<AulaNoForm>) => setAulas((as) => as.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const mexerQuestao = (i: number, p: Partial<QuestaoNoForm>) => setQuestoes((qs) => qs.map((q, j) => (j === i ? { ...q, ...p } : q)));

  if (cursoId && existente.isLoading) return <p className="text-[13px] text-slate-500">Carregando o curso…</p>;

  return (
    <section aria-label="Editor do curso" className="space-y-4">
      <button type="button" className="text-[13px] text-blue-600 hover:underline dark:text-blue-400" onClick={onFechar}>← Cursos</button>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12.5px]">Título<Input aria-label="Título do curso" className="mt-0.5" value={base.titulo} onChange={(e) => setBase({ ...base, titulo: e.target.value })} /></label>
        <label className="text-[12.5px]">Categoria<Input aria-label="Categoria" className="mt-0.5" value={base.categoria} onChange={(e) => setBase({ ...base, categoria: e.target.value })} /></label>
        <label className="text-[12.5px] sm:col-span-2">Descrição
          <textarea aria-label="Descrição do curso" className="mt-0.5 block w-full rounded-md border border-slate-200 bg-white p-2 text-[13px] dark:border-slate-700 dark:bg-slate-900"
            rows={2} value={base.descricao} onChange={(e) => setBase({ ...base, descricao: e.target.value })} />
        </label>
        <label className="text-[12.5px]">Nota de corte da prova
          <Input aria-label="Nota de corte" type="number" min={0} max={100} className="mt-0.5 w-24" value={base.nota_corte}
            onChange={(e) => setBase({ ...base, nota_corte: Number(e.target.value) })} />
        </label>
        <fieldset className="text-[12.5px]">
          <legend>Obrigatório para os cargos (avisa no sino e entra na trilha)</legend>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {(cargos.data?.cargos ?? []).filter((c) => c.ativo).map((c) => (
              <label key={c.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={base.obrigatorio_para.includes(c.id)}
                  onChange={(e) => setBase({ ...base, obrigatorio_para: e.target.checked ? [...base.obrigatorio_para, c.id] : base.obrigatorio_para.filter((x) => x !== c.id) })} />
                {c.nome}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="space-y-2">
        <h3 className="text-[14px] font-semibold">Aulas</h3>
        {aulas.map((a, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[2fr_2fr_100px_auto]">
            <Input aria-label={`Aula ${i + 1} · título`} placeholder={`Aula ${i + 1}`} value={a.titulo} onChange={(e) => mexerAula(i, { titulo: e.target.value })} />
            <Input aria-label={`Aula ${i + 1} · link do YouTube`} placeholder="https://youtu.be/…" value={a.link} onChange={(e) => mexerAula(i, { link: e.target.value })} />
            <Input aria-label={`Aula ${i + 1} · duração`} placeholder="12:30" value={a.duracao} onChange={(e) => mexerAula(i, { duracao: e.target.value })} />
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setAulas((as) => mover(as, i, -1))} aria-label={`Subir a aula ${i + 1}`}>↑</Button>
              <Button size="sm" variant="ghost" onClick={() => setAulas((as) => mover(as, i, 1))} aria-label={`Descer a aula ${i + 1}`}>↓</Button>
              <Button size="sm" variant="ghost" onClick={() => setAulas((as) => as.filter((_, j) => j !== i))}>Tirar</Button>
            </div>
            <textarea aria-label={`Aula ${i + 1} · descrição`} placeholder="Descrição (opcional)" rows={1}
              className="rounded-md border border-slate-200 bg-white p-2 text-[13px] dark:border-slate-700 dark:bg-slate-900 sm:col-span-4"
              value={a.descricao} onChange={(e) => mexerAula(i, { descricao: e.target.value })} />
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setAulas((as) => [...as, { titulo: '', descricao: '', link: '', duracao: '' }])}>Adicionar aula</Button>
        {aulas.some((a) => a.id) && <p className="text-[12px] text-slate-500">Tirar uma aula apaga o progresso de quem já assistiu a ela.</p>}
      </div>

      <div className="space-y-2">
        <h3 className="text-[14px] font-semibold">Prova</h3>
        {questoes.map((q, i) => (
          <fieldset key={i} className="space-y-1 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <Input aria-label={`Pergunta ${i + 1}`} placeholder={`Pergunta ${i + 1}`} value={q.enunciado} onChange={(e) => mexerQuestao(i, { enunciado: e.target.value })} />
            {q.alternativas.map((alt, j) => (
              <label key={j} className="flex items-center gap-2">
                <input type="radio" name={`certa-${i}`} aria-label={`Pergunta ${i + 1} · alternativa ${j + 1} é a certa`} checked={q.correta === j} onChange={() => mexerQuestao(i, { correta: j })} />
                <Input aria-label={`Pergunta ${i + 1} · alternativa ${j + 1}`} className="h-8" value={alt}
                  onChange={(e) => mexerQuestao(i, { alternativas: q.alternativas.map((x, k) => (k === j ? e.target.value : x)) })} />
              </label>
            ))}
            <div className="flex gap-2">
              {q.alternativas.length < 6 && <Button size="sm" variant="ghost" onClick={() => mexerQuestao(i, { alternativas: [...q.alternativas, ''] })}>Mais uma alternativa</Button>}
              <Button size="sm" variant="ghost" onClick={() => setQuestoes((qs) => qs.filter((_, j) => j !== i))}>Tirar a pergunta</Button>
            </div>
          </fieldset>
        ))}
        <Button size="sm" variant="outline" onClick={() => setQuestoes((qs) => [...qs, { enunciado: '', alternativas: ['', ''], correta: 0 }])}>Adicionar pergunta</Button>
      </div>

      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={base.publicado} onChange={(e) => setBase({ ...base, publicado: e.target.checked })} />
        Publicado — a equipe vê e, se obrigatório, é avisada no sino
      </label>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={enviar} disabled={salvar.isPending}>Salvar curso</Button>
        <Button size="sm" variant="ghost" onClick={onFechar}>Cancelar</Button>
        {(problema || salvar.isError) && <span role="alert" className="text-[12px] text-rose-600">{problema ?? (salvar.error as Error).message}</span>}
      </div>
    </section>
  );
}
