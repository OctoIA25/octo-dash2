/**
 * A.7 · Um curso: a playlist, o player, a prova no fim e o certificado.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { duracaoBR, percentual } from './assistido';
import { PlayerDaAula } from './PlayerDaAula';
import { carregarCurso, responderProva, type Curso, type ResultadoDaProva } from './universidadeService';

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export function CursoView({ cursoId, onVoltar }: { cursoId: string; onVoltar: () => void }) {
  const qc = useQueryClient();
  const curso = useQuery({ queryKey: ['curso', cursoId], queryFn: () => carregarCurso(cursoId) });
  const [aulaId, setAulaId] = useState<string | null>(null);

  if (curso.isLoading) return <p className="text-[13px] text-slate-500">Carregando o curso…</p>;
  if (curso.isError || !curso.data) return <p role="alert" className="text-[13px] text-rose-600">{(curso.error as Error)?.message}</p>;
  const c = curso.data;
  const atual = c.aulas.find((a) => a.id === aulaId) ?? c.aulas.find((a) => !a.concluida) ?? c.aulas[0];
  const todasVistas = c.aulas.length > 0 && c.aulas.every((a) => a.concluida);
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['curso', cursoId] });
    qc.invalidateQueries({ queryKey: ['universidade-cursos'] });
  };

  return (
    <div className="space-y-4">
      <button type="button" className="text-[13px] text-blue-600 hover:underline dark:text-blue-400" onClick={onVoltar}>← Cursos</button>
      <div>
        <h2 className="text-[18px] font-semibold">{c.titulo}</h2>
        {c.descricao && <p className="text-[13px] text-slate-600 dark:text-slate-300">{c.descricao}</p>}
        {!c.publicado && <p className="text-[12px] font-medium text-amber-700">Rascunho — só a diretoria vê.</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-2">
          {atual ? (
            <>
              <PlayerDaAula key={atual.id} aula={atual} onRegistrou={(r) => { if (r.concluida && !atual.concluida) recarregar(); }} />
              <h3 className="text-[15px] font-semibold">{atual.ordem}. {atual.titulo}</h3>
              {atual.descricao && <p className="whitespace-pre-line text-[13px] text-slate-600 dark:text-slate-300">{atual.descricao}</p>}
            </>
          ) : <p className="text-[13px] text-slate-500">Este curso ainda não tem aulas.</p>}
        </div>
        <ol aria-label="Aulas" className="space-y-1">
          {c.aulas.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setAulaId(a.id)}
                className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${a.id === atual?.id ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
                <span className={`w-4 shrink-0 ${a.concluida ? 'text-emerald-600' : 'text-slate-400'}`}>{a.concluida ? '✓' : a.ordem}</span>
                <span className="min-w-0 flex-1">{a.titulo}</span>
                <span className="shrink-0 tabular-nums text-[11.5px] text-slate-500">
                  {a.concluida ? duracaoBR(a.duracao_seg) : `${percentual(a.segundos_vistos, a.duracao_seg)}%`}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {c.questoes.length > 0 && <Prova curso={c} liberada={todasVistas} onRespondeu={recarregar} />}
      {c.meu.certificado && <CertificadoDoCurso hash={c.meu.certificado.hash} emitidoEm={c.meu.certificado.emitido_em} />}
      {c.questoes.length === 0 && todasVistas && <p className="text-[13px] font-medium text-emerald-700">Curso concluído ✓</p>}
    </div>
  );
}

function Prova({ curso: c, liberada, onRespondeu }: { curso: Curso; liberada: boolean; onRespondeu: () => void }) {
  const [respostas, setRespostas] = useState<(number | null)[]>(() => c.questoes.map(() => null));
  const [resultado, setResultado] = useState<ResultadoDaProva | null>(null);
  const enviar = useMutation({
    mutationFn: () => responderProva(c.id, respostas as number[]),
    onSuccess: (r) => { setResultado(r); setRespostas(c.questoes.map(() => null)); onRespondeu(); },
  });
  const aprovado = !!c.meu.certificado;

  return (
    <section aria-label="Prova" className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="text-[15px] font-semibold">Prova · nota de corte {c.nota_corte}</h3>
      {!liberada && <p className="text-[13px] text-slate-500">A prova abre depois de todas as aulas assistidas.</p>}
      {liberada && !aprovado && (
        <>
          {c.questoes.map((q, i) => (
            <fieldset key={q.id} className="space-y-1">
              <legend className="text-[13.5px] font-medium">{i + 1}. {q.enunciado}</legend>
              {q.alternativas.map((alt, j) => (
                <label key={j} className="flex items-center gap-2 text-[13px]">
                  <input type="radio" name={`q-${q.id}`} checked={respostas[i] === j}
                    onChange={() => setRespostas((r) => r.map((x, k) => (k === i ? j : x)))} />
                  {alt}
                </label>
              ))}
            </fieldset>
          ))}
          <Button size="sm" disabled={respostas.some((r) => r === null) || enviar.isPending} onClick={() => enviar.mutate()}>Enviar respostas</Button>
          {enviar.isError && <p role="alert" className="text-[12px] text-rose-600">{(enviar.error as Error).message}</p>}
        </>
      )}
      {resultado && (
        <p role="status" className={`text-[13.5px] font-medium ${resultado.aprovado ? 'text-emerald-700' : 'text-rose-700'}`}>
          {resultado.aprovado
            ? `Aprovado com ${resultado.nota} (${resultado.certas} de ${resultado.total}).`
            : `Nota ${resultado.nota} — abaixo de ${resultado.nota_corte}. Reveja as aulas e tente de novo.`}
        </p>
      )}
      {c.tentativas.length > 0 && (
        <div className="text-[12.5px] text-slate-600 dark:text-slate-300">
          <p className="font-medium">Suas tentativas</p>
          <ul>{c.tentativas.map((t, i) => <li key={i}>{dataBR(t.feita_em)} · nota {t.nota} · {t.aprovado ? 'aprovado' : 'reprovado'}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function CertificadoDoCurso({ hash, emitidoEm }: { hash: string; emitidoEm: string }) {
  const [copiado, setCopiado] = useState(false);
  const link = `${window.location.origin}/certificado/${hash}`;
  const copiar = () => {
    navigator.clipboard?.writeText(link).then(() => setCopiado(true)).catch(() => setCopiado(false));
  };
  return (
    <section aria-label="Certificado" className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
      <h3 className="text-[15px] font-semibold text-emerald-800 dark:text-emerald-300">Certificado emitido em {dataBR(emitidoEm)}</h3>
      <p className="break-all font-mono text-[11.5px] text-slate-600 dark:text-slate-300">SHA-256: {hash}</p>
      <div className="flex flex-wrap items-center gap-2">
        <a className="text-[13px] font-medium text-blue-600 hover:underline dark:text-blue-400" href={`/certificado/${hash}`} target="_blank" rel="noreferrer">Conferir o certificado</a>
        <Button size="sm" variant="outline" onClick={copiar}>{copiado ? 'Link copiado' : 'Copiar o link'}</Button>
      </div>
    </section>
  );
}
