/**
 * A.3 · A régua das Flags, em Configurações. Uma por atuação; em cada uma,
 * verde e amarelo como caminhos alternativos ("2 vendas OU 1 venda + 8
 * visitas"). Vermelho não se cadastra. Salvou, a tela de Flags reclassifica
 * na próxima leitura — sem deploy.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  METRICAS, ROTULO_DA_ATUACAO, caminhoInvalido, descreverCaminho, limparCaminhos,
  type Atuacao, type Caminho, type Metrica,
} from './flags';
import { buscarReguas, salvarRegua, type Nivel, type Reguas } from './flagsService';

const ROTULO_DA_METRICA: Record<Metrica, string> = { vendas: 'Vendas', visitas: 'Visitas realizadas', captacoes: 'Captações' };

export function ReguaFlagsPanel({ tenantId, podeEditar }: { tenantId: string; podeEditar: boolean }) {
  const reguas = useQuery({ queryKey: ['flag-reguas', tenantId], queryFn: () => buscarReguas(tenantId) });
  if (reguas.isLoading) return <p className="text-[13px] text-slate-500">Carregando a régua…</p>;
  if (reguas.isError || !reguas.data) return <p role="alert" className="text-[13px] text-rose-600">Não deu para carregar a régua.</p>;
  return (
    <div className="space-y-6">
      {!podeEditar && <p className="text-[13px] text-slate-500">Só a diretoria muda a régua. Você vê o que está valendo.</p>}
      {(['lancamentos', 'prontos'] as const).map((a) => (
        <section key={a} aria-label={`Régua de ${ROTULO_DA_ATUACAO[a]}`} className="space-y-3">
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{ROTULO_DA_ATUACAO[a]}</h3>
          {(['verde', 'amarelo'] as const).map((n) => (
            <NivelDaRegua key={n} tenantId={tenantId} atuacao={a} nivel={n} reguas={reguas.data} podeEditar={podeEditar} />
          ))}
          <p className="text-[12.5px] text-slate-500">Vermelho: quem não alcança o amarelo.</p>
        </section>
      ))}
    </div>
  );
}

function NivelDaRegua({ tenantId, atuacao, nivel, reguas, podeEditar }: {
  tenantId: string; atuacao: Atuacao; nivel: Nivel; reguas: Reguas; podeEditar: boolean;
}) {
  const qc = useQueryClient();
  const salvo = reguas[`${atuacao}:${nivel}`] ?? [];
  const [caminhos, setCaminhos] = useState<Caminho[]>(salvo);
  useEffect(() => setCaminhos(reguas[`${atuacao}:${nivel}`] ?? []), [reguas, atuacao, nivel]);

  const limpos = limparCaminhos(caminhos);
  const erro = limpos.map(caminhoInvalido).find(Boolean) ?? null;
  const mudou = JSON.stringify(limpos) !== JSON.stringify(limparCaminhos(salvo));
  const salvar = useMutation({
    mutationFn: () => salvarRegua(tenantId, atuacao, nivel, limpos),
    // Relê do banco: o que aparece depois de salvar é o que ficou gravado.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['flag-reguas', tenantId] });
      qc.invalidateQueries({ queryKey: ['flags-do-mes', tenantId] });
    },
  });

  const muda = (i: number, m: Metrica, valor: string) =>
    setCaminhos((cs) => cs.map((c, j) => (j === i ? { ...c, [m]: valor === '' ? undefined : Number(valor) } : c)));

  const titulo = nivel === 'verde' ? 'Verde' : 'Amarelo';
  if (!podeEditar) {
    return (
      <p className="text-[13px]"><b>{titulo}:</b>{' '}
        {salvo.length === 0 ? <span className="text-slate-500">sem régua</span> : salvo.map(descreverCaminho).join(' — ou — ')}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="mb-2 text-[13px] font-medium">{titulo} <span className="font-normal text-slate-500">— alcançou qualquer um dos caminhos, é {titulo.toLowerCase()}</span></p>
      <div className="space-y-2">
        {caminhos.map((c, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            {i > 0 && <span className="w-full text-[11.5px] font-semibold uppercase text-slate-500">ou</span>}
            {METRICAS.map((m) => (
              <label key={m} className="text-[12px] text-slate-600 dark:text-slate-300">
                {ROTULO_DA_METRICA[m]}
                <Input type="number" min={1} max={999} inputMode="numeric" className="mt-0.5 h-8 w-28"
                  aria-label={`${titulo} · caminho ${i + 1} · ${ROTULO_DA_METRICA[m]}`}
                  value={c[m] ?? ''} onChange={(e) => muda(i, m, e.target.value)} />
              </label>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => setCaminhos((cs) => cs.filter((_, j) => j !== i))}>Tirar</Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setCaminhos((cs) => [...cs, {}])}>
          {caminhos.length === 0 ? `Criar régua do ${titulo.toLowerCase()}` : 'Outro caminho'}
        </Button>
        <Button type="button" size="sm" onClick={() => salvar.mutate()} disabled={!mudou || !!erro || salvar.isPending}>Salvar</Button>
        {erro && <span role="alert" className="text-[12px] text-rose-600">{erro}</span>}
        {salvar.isError && <span role="alert" className="text-[12px] text-rose-600">{(salvar.error as Error).message}</span>}
        {limpos.length === 0 && salvo.length > 0 && <span className="text-[12px] text-amber-700">Salvar vazio tira a régua do {titulo.toLowerCase()}.</span>}
      </div>
    </div>
  );
}
