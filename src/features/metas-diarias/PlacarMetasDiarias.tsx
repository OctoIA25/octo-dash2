/**
 * A.4 · Placar do gestor, no topo do Início: quantos lançaram o compromisso,
 * quantos bateram e o aproveitamento — separado por equipe. O líder vê a
 * equipe dele; a diretoria, a casa. Quem decide é o banco.
 */
import { useQuery } from '@tanstack/react-query';
import { carregarPlacar } from './metasDiariasService';

export function PlacarMetasDiarias({ tenantId }: { tenantId: string }) {
  const placar = useQuery({ queryKey: ['placar-metas-diarias', tenantId], queryFn: () => carregarPlacar(tenantId) });
  if (placar.isLoading || placar.isError || !placar.data || placar.data.equipes.length === 0) return null;

  return (
    <section aria-label="Placar de hoje" className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-[15px] font-semibold text-slate-900 dark:text-slate-100">Placar de hoje · metas diárias</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {placar.data.equipes.map((e) => (
          <div key={e.equipe} className="rounded-lg border border-border px-3 py-2.5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">{e.equipe}</p>
            <p className="mt-1 text-[13px] tabular-nums">
              <b>{e.lancaram}</b> de {e.corretores} lançaram · <b>{e.bateram}</b> bateram
            </p>
            <p className="text-[12.5px] text-text-secondary tabular-nums">
              Aproveitamento: {e.aproveitamento == null ? 'Sem dados' : `${e.aproveitamento}%`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
