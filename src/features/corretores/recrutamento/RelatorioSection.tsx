/**
 * Recrutamento › Relatório (P3.8).
 *
 * Quatro leituras que o plano pede: por data de alcance de etapa, conversão
 * entre etapas, por origem e por área.
 *
 * A regra que atravessa a tela: ZERO TEM DOIS SIGNIFICADOS. "Nenhum candidato
 * chegou aqui" e "ninguém anota esta etapa" viram o mesmo zero — e o segundo,
 * lido como o primeiro, faz concluir que o processo trava onde ele só não é
 * registrado. Medido em produção: dois dos seis carimbos de etapa nunca foram
 * preenchidos.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, Info, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import {
  ROTULO_DA_AREA, ROTULO_DA_ORIGEM, avisoDaOrigem, conversoes, etapasSemRegistro,
  listaEmPortugues, periodoAntesDoRegistro, somaFecha, type RelatorioDeRecrutamento,
} from './relatorio';

async function carregarRelatorio(
  tenantId: string,
  de: string,
  ate: string
): Promise<RelatorioDeRecrutamento | null> {
  if (!tenantId || tenantId === 'owner') return null;
  const { data, error } = await supabase.rpc('recrut_relatorio', {
    p_tenant_id: tenantId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  return (data as RelatorioDeRecrutamento) ?? null;
}

const inteiro = (n: number) => n.toLocaleString('pt-BR');

export function RelatorioSection({ tenantId }: { tenantId: string }) {
  // Padrão: o ano corrente. O período curto esconderia o pouco que há — são 5
  // candidatos em produção, todos de abril e maio.
  const ano = new Date().getFullYear();
  const [de, setDe] = useState(`${ano}-01-01`);
  const [ate, setAte] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['recrut-relatorio', tenantId, de, ate],
    queryFn: () => carregarRelatorio(tenantId, de, ate),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  if (!tenantId || tenantId === 'owner') return null;

  const semRegistro = data ? etapasSemRegistro(data.etapas) : [];
  const avisoOrigem = data ? avisoDaOrigem(data) : null;
  const somaOrigem = data ? somaFecha(data.por_origem, data.total) : null;
  const somaArea = data ? somaFecha(data.por_area, data.total) : null;
  const pegaAntes = data ? periodoAntesDoRegistro(de, data.registro_desde) : false;

  return (
    <div className="mb-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Relatório de recrutamento</h2>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="De" />
          <span className="text-xs text-muted-foreground">até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Até" />
        </div>
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {isError && (
        <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
          Não deu para ler o relatório: {(error as Error)?.message}
        </p>
      )}

      {data && (
        <div className="space-y-4">
          {/* O aviso que separa "ninguém chegou" de "ninguém anota". */}
          {semRegistro.length > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {semRegistro.length === 1 ? 'A etapa' : 'As etapas'}{' '}
                <strong>{listaEmPortugues(semRegistro)}</strong>{' '}
                {semRegistro.length === 1 ? 'nunca foi registrada' : 'nunca foram registradas'} para
                nenhum candidato. O zero delas não quer dizer que ninguém passou por lá — quer dizer
                que ninguém anotou. A partir de {data.registro_desde}, mudar a etapa do candidato
                carimba a data sozinho.
              </span>
            </p>
          )}

          {pegaAntes && (
            <p className="flex items-start gap-2 rounded-md border p-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              O período escolhido começa antes de {data.registro_desde}, quando a data de cada etapa
              passou a ser carimbada sozinha. O que está antes disso só tem o que alguém preencheu
              à mão.
            </p>
          )}

          {/* POR DATA DE ALCANCE — o que o plano pede, e não "quantos estão
              nela hoje": quem passou pela etapa e avançou sumiria da segunda
              contagem. */}
          <section>
            <h3 className="mb-1 text-sm font-semibold">Quantos chegaram em cada etapa</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              Por <strong>data de alcance</strong> no período — não é quantos estão na etapa hoje.
              Quem passou por ela e avançou continua contando.
            </p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Etapa</th>
                    <th className="px-3 py-2 text-right">Chegaram</th>
                    <th className="px-3 py-2">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.etapas.map((e) => (
                    <tr key={e.etapa}>
                      <td className="px-3 py-2 font-medium">{e.rotulo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{inteiro(e.alcancaram)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {e.registrado_sempre === 0 ? 'etapa nunca registrada' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Conversão entre etapas</h3>
            <ul className="divide-y rounded-md border">
              {conversoes(data.etapas).map((c) => (
                <li key={`${c.de}-${c.para}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-xs">
                  <span>{c.de} → {c.para}</span>
                  <span className={c.resultado.pct == null ? 'text-muted-foreground' : 'tabular-nums'}>
                    {c.resultado.texto}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section>
              <h3 className="mb-1 text-sm font-semibold">Por origem</h3>
              {avisoOrigem && (
                <p className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {avisoOrigem}
                </p>
              )}
              <Lista linhas={data.por_origem.map((o) => ({
                rotulo: ROTULO_DA_ORIGEM[o.origem] ?? o.origem,
                n: o.candidatos,
              }))} total={data.total} />
              {somaOrigem && !somaOrigem.fecha && (
                <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
                  A soma das origens deu {somaOrigem.soma} e há {data.total} candidatos no período —
                  alguém ficou de fora do agrupamento.
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-1 text-sm font-semibold">Por área</h3>
              <Lista linhas={data.por_area.map((a) => ({
                rotulo: ROTULO_DA_AREA[a.area] ?? a.area,
                n: a.candidatos,
              }))} total={data.total} />
              {somaArea && !somaArea.fecha && (
                <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
                  A soma das áreas deu {somaArea.soma} e há {data.total} candidatos no período.
                </p>
              )}
            </section>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {inteiro(data.total)} candidato{data.total === 1 ? '' : 's'} com candidatura no período.
          </p>
        </div>
      )}
    </div>
  );
}

function Lista({
  linhas,
  total,
}: {
  linhas: Array<{ rotulo: string; n: number }>;
  total: number;
}) {
  if (linhas.length === 0) {
    return <p className="rounded-md border p-3 text-xs text-muted-foreground">Nenhum candidato no período.</p>;
  }
  return (
    <ul className="divide-y rounded-md border">
      {linhas.map((l) => (
        <li key={l.rotulo} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">{l.rotulo}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {inteiro(l.n)}
            {total > 0 && ` · ${Math.round((l.n / total) * 100)}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}
