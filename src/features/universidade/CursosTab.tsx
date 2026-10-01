/**
 * A.7 · A aba Cursos: a lista, o curso aberto, e — para a diretoria — o editor
 * e o painel do time (quem concluiu · quem está no meio · quem não abriu).
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';
import { duracaoBR } from './assistido';
import { CursoEditor } from './CursoEditor';
import { CursoView } from './CursoView';
import { carregarCursos, carregarPainel, type LinhaDoPainel, type Situacao } from './universidadeService';

const ROTULO: Record<Situacao, string> = { nao_abriu: 'Não abriu', no_meio: 'No meio', concluiu: 'Concluiu' };

export function CursosTab({ tenantId }: { tenantId: string }) {
  const [params, setParams] = useSearchParams();
  const { user } = useAuthContext();
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | 'novo' | null>(null);
  const [painelDe, setPainelDe] = useState<string | null>(null);
  const lista = useQuery({ queryKey: ['universidade-cursos', tenantId], queryFn: () => carregarCursos(tenantId) });

  // ?curso=<id>: o aviso de curso obrigatório no sino abre o curso direto.
  const doLink = params.get('curso');
  useEffect(() => {
    if (!doLink) return;
    setAberto(doLink);
    const p = new URLSearchParams(params);
    p.delete('curso');
    setParams(p, { replace: true });
  }, [doLink, params, setParams]);

  if (editando) return <CursoEditor tenantId={tenantId} cursoId={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />;
  if (aberto) return <CursoView cursoId={aberto} onVoltar={() => setAberto(null)} />;
  if (lista.isLoading) return <p className="text-[13px] text-slate-500">Carregando os cursos…</p>;
  if (lista.isError || !lista.data) return <p role="alert" className="text-[13px] text-rose-600">{(lista.error as Error)?.message}</p>;
  const { pode_gerir: podeGerir, cursos } = lista.data;

  return (
    <div className="space-y-4">
      {podeGerir && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setEditando('novo')}>Novo curso</Button>
          <span className="text-[12px] text-slate-500">Curso é playlist de vídeos não listados do YouTube da casa, com prova no fim.</span>
        </div>
      )}
      {cursos.length === 0 && (
        <p className="text-[13px] text-slate-500">
          Nenhum curso ainda. A aba só aparece para a equipe quando houver curso publicado — o plano pede os dois primeiros
          (sugestão: onboarding do corretor novo, e como cadastrar imóvel na Dash) antes de abrir.
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {cursos.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[15px] font-semibold">{c.titulo}</h3>
              {c.obrigatorio && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">Obrigatório</span>}
              {!c.publicado && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold dark:bg-slate-800">Rascunho</span>}
            </div>
            {c.descricao && <p className="line-clamp-2 text-[12.5px] text-slate-600 dark:text-slate-300">{c.descricao}</p>}
            <p className="text-[12px] text-slate-500 tabular-nums">
              {c.meu.aulas} aula{c.meu.aulas === 1 ? '' : 's'} · {duracaoBR(c.duracao_seg)} · {c.meu.tem_prova ? `prova (corte ${c.nota_corte})` : 'sem prova'}
            </p>
            <p className="text-[12.5px] tabular-nums">
              {c.meu.certificado ? 'Concluído ✓ com certificado' : c.meu.situacao === 'concluiu' ? 'Concluído ✓'
                : `${c.meu.aulas_concluidas} de ${c.meu.aulas} aulas`}
            </p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setAberto(c.id)}>{c.meu.situacao === 'nao_abriu' ? 'Começar' : 'Abrir'}</Button>
              {podeGerir && <Button size="sm" variant="ghost" onClick={() => setEditando(c.id)}>Editar</Button>}
              {(podeGerir || user?.systemRole === 'team_leader') && <Button size="sm" variant="ghost" onClick={() => setPainelDe(painelDe === c.id ? null : c.id)}>Painel do time</Button>}
            </div>
            {painelDe === c.id && <PainelDoCurso cursoId={c.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PainelDoCurso({ cursoId }: { cursoId: string }) {
  const painel = useQuery({ queryKey: ['curso-painel', cursoId], queryFn: () => carregarPainel(cursoId) });
  if (painel.isLoading) return <p className="text-[12px] text-slate-500">Carregando…</p>;
  if (painel.isError) return <p role="alert" className="text-[12px] text-rose-600">{(painel.error as Error).message}</p>;
  const linhas = painel.data ?? [];
  const grupos = (['nao_abriu', 'no_meio', 'concluiu'] as const).map((s) => [s, linhas.filter((l) => l.situacao === s)] as const);
  return (
    <div aria-label="Painel do time" className="space-y-2 border-t border-slate-100 pt-2 text-[12.5px] dark:border-slate-800">
      {grupos.map(([s, gente]) => (
        <div key={s}>
          <p className="font-medium">{ROTULO[s]} ({gente.length})</p>
          {gente.length === 0 ? <p className="text-slate-500">—</p> : (
            <ul>{gente.map((l) => <li key={l.user_id}>{l.nome} <span className="text-slate-500">· {l.equipe}{detalhe(l)}</span></li>)}</ul>
          )}
        </div>
      ))}
    </div>
  );
}

function detalhe(l: LinhaDoPainel): string {
  const obrig = l.obrigatorio ? ' · obrigatório' : '';
  if (l.situacao === 'no_meio') return ` · ${l.aulas_concluidas}/${l.aulas} aulas${l.tentativas ? ` · ${l.tentativas} tentativa(s), melhor ${l.melhor_nota}` : ''}${obrig}`;
  if (l.situacao === 'concluiu') return `${l.melhor_nota != null ? ` · nota ${l.melhor_nota}` : ''}${obrig}`;
  return obrig;
}
