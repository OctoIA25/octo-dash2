/**
 * A.6 · O Fire no Início — onde a campanha aparece todo dia. Só com edição
 * ativa: os pontos da pessoa, a posição, o topo da casa, os desafios em aberto
 * e o extrato dela ali mesmo.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hojeSP } from '@/lib/dataSP';
import { ROTULO_DO_EVENTO, comPosicao } from './fire';
import { carregarPainel } from './fireService';
import { ExtratoFire } from './ExtratoFire';

const dataBR = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function FireNoInicio({ tenantId }: { tenantId: string }) {
  const painel = useQuery({ queryKey: ['fire-painel', tenantId, null], queryFn: () => carregarPainel(tenantId) });
  const [vendoExtrato, setVendoExtrato] = useState(false);
  const p = painel.data;
  const e = p?.edicao;
  if (!p || !e || e.status !== 'ativa') return null;

  const ranking = comPosicao(e.classificacao);
  const eu = ranking.find((c) => c.user_id === p.eu);
  const hoje = hojeSP();
  const desafios = e.desafios.filter((d) => d.prazo >= hoje);

  return (
    <section aria-label="Fire" className="mb-4 rounded-xl border border-orange-200 bg-white p-4 dark:border-orange-900/60 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">🔥 {e.nome}</h2>
        <span className="text-[12px] text-slate-500">até {dataBR(e.fim)}</span>
      </div>
      {eu && (
        <p className="mb-2 text-[14px]">
          Você: <b className="tabular-nums">{eu.pontos} pontos</b> · {eu.posicao}º de {ranking.length}
        </p>
      )}
      <ol aria-label="Topo da classificação" className="mb-2 space-y-0.5 text-[13px]">
        {ranking.slice(0, 5).map((c) => (
          <li key={c.user_id} className={`flex gap-2 ${c.user_id === p.eu ? 'font-semibold' : ''}`}>
            <span className="w-6 tabular-nums text-slate-500">{c.posicao}º</span>
            <span className="min-w-0 flex-1 truncate">{c.nome}</span>
            <span className="tabular-nums">{c.pontos}</span>
          </li>
        ))}
      </ol>
      {desafios.length > 0 && (
        <div className="mb-2 text-[12.5px]">
          <p className="font-medium">Desafios</p>
          <ul>
            {desafios.map((d) => (
              <li key={d.id}>
                {d.descricao} <span className="text-slate-500">· {d.quantidade} {ROTULO_DO_EVENTO[d.evento].toLowerCase()}{d.quantidade > 1 ? 's' : ''} até {dataBR(d.prazo)} · +{d.pontos}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {eu && (
        <>
          <button type="button" className="text-[12.5px] font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => setVendoExtrato((v) => !v)}>
            {vendoExtrato ? 'Esconder meu extrato' : 'Ver de onde veio cada ponto'}
          </button>
          {vendoExtrato && <div className="mt-2"><ExtratoFire tenantId={tenantId} edicaoId={e.id} userId={p.eu} podeEstornar={false} /></div>}
        </>
      )}
    </section>
  );
}
