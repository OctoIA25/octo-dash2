/**
 * Relatórios › Marketing › Campanhas e ROI (P3.5).
 *
 * O QUE ESTA TELA SE RECUSA A FAZER: esconder gasto que não sabe explicar.
 * Medido na conta da Lotus em 21/09, duas das quatro campanhas são
 * clique-para-WhatsApp e somam 38% do gasto — o lead chega pela conversa, sem
 * formulário, e não há o que o ligue ao anúncio. Elas aparecem assim mesmo,
 * marcadas, porque o critério do plano é o total bater com o Gerenciador.
 *
 * E o ROI aparece VAZIO, com o motivo escrito: a venda não guarda de qual lead
 * veio (P4.4), então CAC e ROAS não têm numerador. Um painel de ROI que some
 * faria parecer que ninguém pensou nele.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Info, Loader2, RefreshCw } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { percentual } from '@/features/kpis/utils/painelComercial';
import { carregarConfigDeAnuncios, carregarCorretoresDaCampanha } from './anunciosService';
import { semaforo, taxa, type Faixa } from './anuncios';
import {
  carregarCampanhas, carregarDetalhe, qualificadosPorCampanha, sincronizarGasto,
  type LinhaDeDetalhe,
} from './campanhasService';
import {
  avisoDeAtribuicao, buracoDeAtribuicao, desdeQuando, empreendimentosDas, filtrarPorEmpreendimento,
  pctSemAtribuicao, porUnidade, reaisExatos, type Campanha,
} from './campanhas';

const inteiro = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR');

/** As mesmas cores da matriz de eficiência, para não reaprender em cada tela. */
const COR_SEMAFORO: Record<Faixa, string> = {
  boa: 'bg-emerald-500',
  media: 'bg-amber-500',
  ruim: 'bg-rose-500',
  sem: 'bg-muted-foreground/30',
};

export function CampanhasTab() {
  const { user, isAdmin } = useAuthContext();
  const tenantId = user?.tenantId;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [sincronizando, setSincronizando] = useState(false);
  const [empreendimento, setEmpreendimento] = useState('');

  const de = `${mes}-01`;
  const ate = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0))
    .toISOString().slice(0, 10);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['campanhas', tenantId, de, ate],
    queryFn: () => carregarCampanhas(tenantId!, de, ate),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const todas = useMemo(() => data?.campanhas ?? [], [data]);
  const empreendimentos = useMemo(() => empreendimentosDas(todas), [todas]);
  const campanhas = useMemo(
    () => filtrarPorEmpreendimento(todas, empreendimento),
    [todas, empreendimento]
  );

  const { data: configAnuncios } = useQuery({
    queryKey: ['anuncios-config', tenantId],
    queryFn: () => carregarConfigDeAnuncios(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const { data: qualificados } = useQuery({
    queryKey: ['campanhas-qualificados', tenantId, de, ate, campanhas.length],
    queryFn: () => qualificadosPorCampanha(tenantId!, campanhas),
    enabled: !!tenantId && campanhas.length > 0,
  });

  const sincronizar = async () => {
    if (!tenantId) return;
    setSincronizando(true);
    try {
      const r = await sincronizarGasto(tenantId, { de, ate });
      await qc.invalidateQueries({ queryKey: ['campanhas', tenantId] });
      toast({
        title: 'Gasto atualizado',
        description: `${r.gravadas} linha(s) de ${r.campanhas} campanha(s), somando ${reaisExatos(r.gasto)}.`,
      });
    } catch (e) {
      const codigo = (e as Error & { codigo?: string }).codigo;
      toast({
        title: codigo === 'conta_de_anuncios_ausente' ? 'Falta a conta de anúncios' : 'Não deu para atualizar',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSincronizando(false);
    }
  };

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-4 text-sm text-muted-foreground">Escolha uma imobiliária.</p>;
  }

  const totais = data?.totais;
  const buraco = buracoDeAtribuicao(campanhas);
  const pctSem = totais ? pctSemAtribuicao(totais) : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Campanhas</h2>
          <p className="text-xs text-muted-foreground">
            Gasto lido da Meta e guardado aqui · {desdeQuando(data?.atualizado_em ?? null)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
          {empreendimentos.length > 0 && (
            <select
              value={empreendimento}
              onChange={(e) => setEmpreendimento(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
              // O empreendimento não é campo da Meta: vem do colchete no nome
              // da campanha, que é convenção da casa. A legenda diz isso para
              // ninguém achar que a Meta o informa.
              title="Lido do colchete no nome da campanha"
            >
              <option value="">Todos os empreendimentos</option>
              {empreendimentos.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
              <option value="(sem)">Sem empreendimento no nome</option>
            </select>
          )}
          {isAdmin && (
            <button
              onClick={sincronizar}
              disabled={sincronizando}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
              {sincronizando ? 'Buscando…' : 'Atualizar da Meta'}
            </button>
          )}
        </div>
      </header>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {isError && (
        <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
          Não deu para ler as campanhas: {(error as Error)?.message ?? 'erro desconhecido'}
        </p>
      )}

      {data && campanhas.length === 0 && (
        <p className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Nenhum gasto guardado para este mês.{' '}
          {isAdmin
            ? 'Use "Atualizar da Meta" para buscar — é a primeira vez que este mês é lido.'
            : 'Peça à gestão para atualizar da Meta.'}
        </p>
      )}

      {totais && campanhas.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Contador rotulo="Gasto no mês" valor={reaisExatos(totais.gasto)}
              legenda="Soma do que a Meta cobrou no período, por anúncio. É este número que tem de bater com o Gerenciador de Anúncios." />
            <Contador rotulo="Leads (Meta)" valor={inteiro(totais.leads_meta)}
              legenda="Quantos leads de formulário a Meta contou. Campanha de clique para WhatsApp não entra aqui — o resultado dela é conversa, não lead." />
            <Contador rotulo="Custo por lead" valor={reaisExatos(porUnidade(totais.gasto, totais.leads_meta))}
              legenda="Gasto do período dividido pelos leads que a Meta contou." />
            <Contador rotulo="Cliques" valor={inteiro(totais.cliques)}
              legenda={`CTR de ${percentual(porUnidade(100 * totais.cliques, totais.impressoes), 2)} sobre ${inteiro(totais.impressoes)} impressões.`} />
          </div>

          {pctSem != null && pctSem > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{reaisExatos(totais.gasto_sem_atribuicao)}</strong> ({pctSem}% do gasto) estão em campanha
                de clique para WhatsApp, onde o lead chega pela conversa e não há o que o ligue ao anúncio.
                O gasto aparece porque o total precisa bater com o Gerenciador; a atribuição lead a lead, não.
              </span>
            </p>
          )}

          {buraco.pct != null && buraco.falta > 0 && (
            <p className="flex items-start gap-2 rounded-md border p-2.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Nas campanhas de formulário, a Meta contou <strong>{buraco.meta}</strong> leads e a Dash amarrou{' '}
              <strong>{buraco.dash}</strong> — faltam {buraco.falta} ({buraco.pct}%). O lead existe; o que
              falta é a campanha gravada nele. Em <strong>Formulários da Meta</strong>, "Baixar leads"
              completa o que falta nos que já entraram.
            </p>
          )}

          <Tabela campanhas={campanhas} qualificados={qualificados ?? {}}
            tenantId={tenantId} de={de} ate={ate}
            alvo={configAnuncios?.custo_alvo_qualificado ?? null}
            limite={configAnuncios?.custo_limite_qualificado ?? null} />

          <PainelDeRoi
            disponivel={data.roi_disponivel}
            falta={data.roi_falta}
            gasto={totais.gasto}
          />
        </>
      )}
    </div>
  );
}

function Contador({ rotulo, valor, legenda }: { rotulo: string; valor: string; legenda: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
        <span title={legenda} className="cursor-help"><Info className="h-3 w-3" /></span>
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

function Tabela({
  campanhas,
  qualificados,
  tenantId,
  de,
  ate,
  alvo,
  limite,
}: {
  campanhas: Campanha[];
  qualificados: Record<string, number>;
  tenantId: string;
  de: string;
  ate: string;
  alvo: number | null;
  limite: number | null;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">Campanha</th>
            <th className="px-3 py-2 text-right">Gasto</th>
            <th className="px-3 py-2 text-right">Impressões</th>
            <th className="px-3 py-2 text-right">CTR</th>
            <th className="px-3 py-2 text-right">CPC</th>
            <th className="px-3 py-2 text-right">Leads (Meta)</th>
            <th className="px-3 py-2 text-right">R$/lead</th>
            <th className="px-3 py-2 text-right">Na Dash</th>
            <th className="px-3 py-2 text-right">Qualificados</th>
            <th className="px-3 py-2 text-right">R$/qualificado</th>
            <th className="px-3 py-2 text-center">Sinal</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {campanhas.map((c) => {
            const q = qualificados[c.campaign_id];
            const aviso = avisoDeAtribuicao(c);
            return (
              <tr key={c.campaign_id} className="align-top">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setAberta(aberta === c.campaign_id ? null : c.campaign_id)}
                    className="flex items-start gap-1 text-left font-medium hover:underline"
                  >
                    {aberta === c.campaign_id
                      ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    {c.campaign_nome}
                  </button>
                  <span className="block pl-4 text-[11px] text-muted-foreground">
                    {c.anuncios} anúncio{c.anuncios === 1 ? '' : 's'}
                  </span>
                  {aviso && (
                    <span className="mt-1 block pl-4 text-[11px] text-amber-700 dark:text-amber-400">{aviso}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(c.gasto)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inteiro(c.impressoes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{percentual(c.ctr, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(c.cpc)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.atribuivel ? inteiro(c.leads_meta) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.atribuivel ? reaisExatos(c.custo_por_lead_meta) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.atribuivel ? inteiro(c.leads_dash) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.atribuivel ? (q == null ? '…' : inteiro(q)) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.atribuivel && q != null
                    ? reaisExatos(porUnidade(c.gasto, q))
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {(() => {
                    const s = semaforo(
                      c.atribuivel && q != null ? porUnidade(c.gasto, q) : null, alvo, limite
                    );
                    return (
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${COR_SEMAFORO[s.cor]}`}
                        title={s.texto}
                        aria-label={s.texto}
                      />
                    );
                  })()}
                </td>
              </tr>
            );
          })}
          {campanhas.map((c) =>
            aberta === c.campaign_id ? (
              <tr key={`${c.campaign_id}-detalhe`}>
                <td colSpan={11} className="bg-muted/30 px-3 py-2">
                  <Detalhe tenantId={tenantId} campaignId={c.campaign_id} de={de} ate={ate} />
                </td>
              </tr>
            ) : null
          )}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        Qualificado = score acima do limite da imobiliária <strong>ou</strong> já chegou em Visita agendada.
        O score é o mesmo da lista de leads — não há uma segunda conta aqui.
        {alvo == null && ' O sinal fica cinza porque não há alvo de custo por qualificado cadastrado — sem ele, a tela não tem como dizer o que é caro.'}
      </p>
    </div>
  );
}

/**
 * O painel de ROI que aparece vazio, com o motivo.
 *
 * O plano pede CAC = gasto ÷ vendas e ROAS = comissão ÷ gasto. Nenhum dos dois
 * tem numerador enquanto a venda não souber de qual lead veio. Sumir com o
 * painel esconderia a dependência; mostrar zero seria mentira.
 */
function PainelDeRoi({
  disponivel,
  falta,
  gasto,
}: {
  disponivel: boolean;
  falta: string;
  gasto: number;
}) {
  return (
    <section className="rounded-lg border">
      <header className="border-b bg-muted/40 px-3 py-2">
        <h3 className="text-sm font-semibold">ROI</h3>
      </header>
      <div className="grid gap-2 p-3 sm:grid-cols-3">
        <Contador rotulo="Investido" valor={reaisExatos(gasto)}
          legenda="O que já dá para saber hoje: quanto foi gasto em anúncio no período." />
        <Contador rotulo="CAC" valor="—"
          legenda="Gasto dividido pelas vendas vindas destas campanhas." />
        <Contador rotulo="ROAS sobre VGC" valor="—"
          legenda="Comissão das vendas dividida pelo gasto. Sobre comissão, e não sobre VGV — é o que entra na imobiliária." />
      </div>
      {!disponivel && (
        <p className="flex items-start gap-2 border-t px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Os dois ficam vazios de propósito.</strong> {falta} Quando a venda passar a guardar o
            lead de origem, estes dois campos passam a funcionar sozinhos, com o gasto que já está aqui.
          </span>
        </p>
      )}
    </section>
  );
}

/**
 * Conjunto e anúncio de uma campanha.
 *
 * Carregado só ao abrir: o grão guardado já é por anúncio, mas trazer o
 * detalhe de todas as campanhas junto com a lista pesaria a tela para
 * responder uma pergunta que quase sempre não é feita.
 */
function Detalhe({
  tenantId,
  campaignId,
  de,
  ate,
}: {
  tenantId: string;
  campaignId: string;
  de: string;
  ate: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['campanha-detalhe', tenantId, campaignId, de, ate],
    queryFn: () => carregarDetalhe(tenantId, campaignId, de, ate),
    enabled: !!tenantId && !!campaignId,
  });

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Abrindo…
      </p>
    );
  }
  if (isError) return <p className="text-xs text-rose-700 dark:text-rose-300">Não deu para abrir a campanha.</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Nivel titulo="Conjuntos" linhas={data.conjuntos} campo="adset_nome" />
        <Nivel titulo="Anúncios" linhas={data.anuncios} campo="ad_nome" />
      </div>
      <QuemRecebeu tenantId={tenantId} campaignId={campaignId} de={de} ate={ate} />
    </div>
  );
}

/**
 * Quem recebeu os leads desta campanha, e até onde levou (P3.6).
 *
 * É o critério de pronto do item, por escrito no plano. As definições são as
 * MESMAS da matriz de eficiência: "em 1h" é o corretor falando (não a LIA), e
 * "venda" é a etapa do funil.
 */
function QuemRecebeu({
  tenantId,
  campaignId,
  de,
  ate,
}: {
  tenantId: string;
  campaignId: string;
  de: string;
  ate: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['campanha-corretores', tenantId, campaignId, de, ate],
    queryFn: () => carregarCorretoresDaCampanha(tenantId, campaignId, de, ate),
    enabled: !!tenantId && !!campaignId,
  });

  if (isLoading || !data) return null;

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Quem recebeu
      </p>
      {data.linhas.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhum lead desta campanha chegou a um corretor no período.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {data.linhas.map((c) => (
            <li key={c.quem} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-2 py-1.5 text-xs">
              <span className="font-medium">{c.quem}</span>
              <span className="tabular-nums text-muted-foreground">
                {c.recebidos} recebido{c.recebidos === 1 ? '' : 's'}
                {' · '}{taxa(c.atendidos_1h, c.recebidos).texto} em 1h
                {' · '}{taxa(c.visita, c.recebidos).texto} chegou à visita
                {c.minutos_medio != null && ` · 1º contato em ${inteiro(c.minutos_medio)} min`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.sem_corretor > 0 && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
          {inteiro(data.sem_corretor)} lead(s) pagos desta campanha não chegaram a corretor nenhum.
        </p>
      )}
    </div>
  );
}

function Nivel({
  titulo,
  linhas,
  campo,
}: {
  titulo: string;
  linhas: LinhaDeDetalhe[];
  campo: 'adset_nome' | 'ad_nome';
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      {linhas.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nada neste período.</p>
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {linhas.map((l, i) => (
            <li key={String(l.ad_id ?? l.adset_id ?? i)} className="flex items-baseline justify-between gap-2 px-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">{l[campo] || '(sem nome)'}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {reaisExatos(l.gasto)}
                {l.leads_meta > 0 && ` · ${l.leads_meta} leads · ${reaisExatos(l.custo_por_lead)}/lead`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
