/**
 * A.7 · A trilha do PDI: a fila que o gestor monta para a pessoa ("até
 * dezembro: curso de lançamento + ler o plano de carreira + uma tarefa"). O
 * status de curso e de material vem do certificado e do aceite — ninguém
 * marca à mão. Curso obrigatório do cargo entra sozinho.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthContext } from '@/contexts/AuthContext';
import { carregarMateriais } from '@/features/materiais/materiaisService';
import {
  adicionarNaTrilha, carregarCursos, carregarTrilha, definirPrazo, marcarTarefa, pessoasDaTrilha, removerDaTrilha,
  type ItemDaTrilha,
} from './universidadeService';

const ROTULO_DO_TIPO: Record<ItemDaTrilha['tipo'], string> = { curso: 'Curso', material: 'Material', tarefa: 'Tarefa' };
const dataBR = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');

export function TrilhaTab({ tenantId }: { tenantId: string }) {
  const { user } = useAuthContext();
  const eu = user?.id ?? '';
  const [pessoa, setPessoa] = useState(eu);
  const pessoas = useQuery({ queryKey: ['trilha-pessoas', tenantId], queryFn: () => pessoasDaTrilha(tenantId) });
  const trilha = useQuery({ queryKey: ['trilha', tenantId, pessoa], queryFn: () => carregarTrilha(tenantId, pessoa), enabled: !!pessoa });

  return (
    <div className="space-y-4">
      {(pessoas.data?.length ?? 0) > 0 && (
        <label className="text-[13px]">
          Trilha de{' '}
          <select aria-label="Pessoa" value={pessoa} onChange={(e) => setPessoa(e.target.value)}
            className="ml-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-[13px] dark:border-slate-700 dark:bg-slate-900">
            <option value={eu}>mim</option>
            {pessoas.data!.map((p) => <option key={p.user_id} value={p.user_id}>{p.nome} · {p.equipe}</option>)}
          </select>
        </label>
      )}
      {trilha.isLoading && <p className="text-[13px] text-slate-500">Carregando a trilha…</p>}
      {trilha.isError && <p role="alert" className="text-[13px] text-rose-600">{(trilha.error as Error).message}</p>}
      {trilha.data && <DetalheDaTrilha tenantId={tenantId} pessoa={pessoa} eu={eu} />}
    </div>
  );
}

function DetalheDaTrilha({ tenantId, pessoa, eu }: { tenantId: string; pessoa: string; eu: string }) {
  const qc = useQueryClient();
  const chave = ['trilha', tenantId, pessoa];
  const trilha = useQuery({ queryKey: chave, queryFn: () => carregarTrilha(tenantId, pessoa) });
  const recarregar = () => qc.invalidateQueries({ queryKey: chave });
  const acao = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: recarregar });
  const t = trilha.data!;
  const feitos = t.itens.filter((i) => i.concluido).length;

  return (
    <section aria-label="Trilha" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
        <span className="font-semibold tabular-nums">{feitos} de {t.itens.length} concluídos</span>
        {t.prazo && <span className="text-slate-600 dark:text-slate-300">até {dataBR(t.prazo)}</span>}
        {t.gestor && <span className="text-slate-500">montada por {t.gestor}</span>}
      </div>
      {t.itens.length === 0 && (
        <p className="text-[13px] text-slate-500">{t.pode_editar ? 'Trilha vazia. Monte abaixo: cursos, materiais e tarefas, com prazo.' : 'Nenhum item na sua trilha ainda.'}</p>
      )}
      <ul className="space-y-1">
        {t.itens.map((i, k) => (
          <li key={i.id ?? `cargo-${i.ref_id}-${k}`} className="flex flex-wrap items-center gap-2 text-[13px]">
            {i.tipo === 'tarefa' && i.id && (pessoa === eu || t.pode_editar) ? (
              <input type="checkbox" aria-label={`Feita: ${i.titulo}`} checked={i.concluido}
                onChange={(e) => acao.mutate(() => marcarTarefa(i.id!, e.target.checked))} />
            ) : (
              <span className={`w-4 ${i.concluido ? 'text-emerald-600' : 'text-slate-400'}`}>{i.concluido ? '✓' : '○'}</span>
            )}
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{ROTULO_DO_TIPO[i.tipo]}</span>
            <span className={i.concluido ? 'text-slate-500 line-through' : ''}>{i.titulo ?? '—'}</span>
            {i.origem === 'cargo' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">obrigatório do cargo</span>}
            {t.pode_editar && i.origem === 'gestor' && i.id && (
              <button type="button" className="text-[12px] text-slate-500 hover:underline" onClick={() => acao.mutate(() => removerDaTrilha(i.id!))}>tirar</button>
            )}
          </li>
        ))}
      </ul>
      {acao.isError && <p role="alert" className="text-[12px] text-rose-600">{(acao.error as Error).message}</p>}
      {t.pode_editar && <MontarTrilha tenantId={tenantId} pessoa={pessoa} prazo={t.prazo} onMudou={recarregar} />}
    </section>
  );
}

function MontarTrilha({ tenantId, pessoa, prazo, onMudou }: { tenantId: string; pessoa: string; prazo: string | null; onMudou: () => void }) {
  const [tipo, setTipo] = useState<ItemDaTrilha['tipo']>('curso');
  const [ref, setRef] = useState('');
  const [titulo, setTitulo] = useState('');
  const [novoPrazo, setNovoPrazo] = useState(prazo ?? '');
  const cursos = useQuery({ queryKey: ['universidade-cursos', tenantId], queryFn: () => carregarCursos(tenantId) });
  const materiais = useQuery({ queryKey: ['materiais', tenantId], queryFn: () => carregarMateriais(tenantId, true) });
  const adicionar = useMutation({
    mutationFn: () => adicionarNaTrilha(tenantId, pessoa, tipo, tipo === 'tarefa' ? null : ref, tipo === 'tarefa' ? titulo.trim() : null),
    onSuccess: () => { setRef(''); setTitulo(''); onMudou(); },
  });
  const salvarPrazo = useMutation({ mutationFn: () => definirPrazo(tenantId, pessoa, novoPrazo || null), onSuccess: onMudou });
  const opcoes = tipo === 'curso'
    ? (cursos.data?.cursos ?? []).filter((c) => c.publicado).map((c) => ({ id: c.id, nome: c.titulo }))
    : (materiais.data?.materiais ?? []).map((m) => ({ id: m.id, nome: m.titulo }));
  const pronto = tipo === 'tarefa' ? titulo.trim().length > 0 : !!ref;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-[13px] font-medium">Montar a trilha</p>
      <div className="flex flex-wrap items-end gap-2">
        <select aria-label="Tipo do item" value={tipo} onChange={(e) => { setTipo(e.target.value as ItemDaTrilha['tipo']); setRef(''); }}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-[13px] dark:border-slate-700 dark:bg-slate-900">
          <option value="curso">Curso</option><option value="material">Material</option><option value="tarefa">Tarefa</option>
        </select>
        {tipo === 'tarefa' ? (
          <Input aria-label="Tarefa" className="h-9 w-72" placeholder="Acompanhar 3 visitas com o líder" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        ) : (
          <select aria-label={tipo === 'curso' ? 'Curso' : 'Material'} value={ref} onChange={(e) => setRef(e.target.value)}
            className="h-9 max-w-xs rounded-md border border-slate-200 bg-white px-2 text-[13px] dark:border-slate-700 dark:bg-slate-900">
            <option value="">Escolha…</option>
            {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        )}
        <Button size="sm" disabled={!pronto || adicionar.isPending} onClick={() => adicionar.mutate()}>Pôr na trilha</Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12.5px]">Prazo<Input aria-label="Prazo da trilha" type="date" className="mt-0.5 h-9" value={novoPrazo} onChange={(e) => setNovoPrazo(e.target.value)} /></label>
        <Button size="sm" variant="outline" disabled={salvarPrazo.isPending || novoPrazo === (prazo ?? '')} onClick={() => salvarPrazo.mutate()}>Salvar prazo</Button>
      </div>
      {(adicionar.isError || salvarPrazo.isError) && (
        <p role="alert" className="text-[12px] text-rose-600">{((adicionar.error ?? salvarPrazo.error) as Error).message}</p>
      )}
    </div>
  );
}
