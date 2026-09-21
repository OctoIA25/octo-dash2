/**
 * Relatórios › Marketing › Anúncios (P3.6).
 *
 * Quatro leituras que o plano pede, e uma regra que atravessa todas:
 * PORCENTAGEM NUNCA APARECE SOZINHA. Medido em produção em 21/09, de 5.303
 * leads apenas 13 chegaram a Visita agendada. "0,2%" sozinho faria comparar
 * corretores por ruído; "0,2% (13 de 5.303)" diz na hora que a coluna está
 * medindo o preenchimento do funil, e não desempenho de gente.
 *
 * A CPA por construtora é a peça que funciona mesmo sem vínculo entre venda e
 * lead: os dois lados cruzam por empreendimento.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { percentual } from '@/features/kpis/utils/painelComercial';
import { reaisExatos } from './campanhas';
import {
  carregarCpa, carregarMatriz, carregarToques, listarVerbas, type LinhaDeCpa,
} from './anunciosService';
import { carregarCampanhas } from './campanhasService';
import { empreendimentoDaCampanha } from './campanhas';
import {
  consumoDaVerba, corDaTaxa, leituraDoSaldo, taxa, valeOlharToques,
  type Faixa, type LinhaDaMatriz, type LinhaDeToque, type Taxa,
} from './anuncios';

const COR: Record<Faixa, string> = {
  boa: 'text-emerald-700 dark:text-emerald-400',
  media: 'text-amber-700 dark:text-amber-400',
  ruim: 'text-rose-700 dark:text-rose-400',
  sem: 'text-muted-foreground',
};

const inteiro = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'));

export function AnunciosTab() {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId;
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [por, setPor] = useState<'corretor' | 'equipe'>('corretor');
  const [origem, setOrigem] = useState('');

  const de = `${mes}-01`;
  const ate = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0))
    .toISOString().slice(0, 10);

  const matriz = useQuery({
    queryKey: ['anuncios-matriz', tenantId, de, ate, por, origem],
    queryFn: () => carregarMatriz(tenantId!, { de, ate, por, origem }),
    enabled: !!tenantId && tenantId !== 'owner',
  });
  const cpa = useQuery({
    queryKey: ['anuncios-cpa', tenantId, de, ate],
    queryFn: () => carregarCpa(tenantId!, de, ate),
    enabled: !!tenantId && tenantId !== 'owner',
  });
  const verbas = useQuery({
    queryKey: ['anuncios-verbas', tenantId, mes],
    queryFn: () => listarVerbas(tenantId!, mes),
    enabled: !!tenantId && tenantId !== 'owner',
  });
  // O gasto vem da MESMA fonte da aba Campanhas. Uma segunda consulta para o
  // mesmo número daria duas verdades sobre quanto se gastou.
  const gasto = useQuery({
    queryKey: ['anuncios-gasto', tenantId, de, ate],
    queryFn: () => carregarCampanhas(tenantId!, de, ate),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const toques = useQuery({
    queryKey: ['anuncios-toques', tenantId, de, ate],
    queryFn: () => carregarToques(tenantId!, de, ate),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const origens = useMemo(() => {
    // As origens vêm do próprio recorte, e não de um cadastro: o filtro só
    // oferece o que existe no período, em vez de listar origem morta.
    const l = toques.data?.linhas ?? [];
    return l.map((x) => x.origem).filter((o) => o && o !== '(sem origem)');
  }, [toques.data]);

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-4 text-sm text-muted-foreground">Escolha uma imobiliária.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Anúncios</h2>
          <p className="text-xs text-muted-foreground">
            Eficiência por pessoa, custo por construtora e de onde o cliente veio de verdade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
          {origens.length > 0 && (
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
              aria-label="Filtrar por origem"
            >
              <option value="">Todas as origens</option>
              {origens.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          <div className="flex gap-1">
            {(['corretor', 'equipe'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPor(p)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  por === p ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'
                }`}
              >
                Por {p}
              </button>
            ))}
          </div>
        </div>
      </header>

      <MatrizSecao
        carregando={matriz.isLoading}
        erro={matriz.isError ? (matriz.error as Error)?.message : null}
        dados={matriz.data ?? null}
        por={por}
      />

      <CpaSecao
        carregando={cpa.isLoading}
        dados={cpa.data ?? null}
      />

      <VerbaSecao
        verbas={verbas.data ?? []}
        campanhas={gasto.data?.campanhas ?? []}
      />

      <ToquesSecao
        carregando={toques.isLoading}
        dados={toques.data ?? null}
      />
    </div>
  );
}

function Celula({ t }: { t: Taxa }) {
  return <span className={`tabular-nums ${COR[corDaTaxa(t)]}`}>{t.texto}</span>;
}

function MatrizSecao({
  carregando,
  erro,
  dados,
  por,
}: {
  carregando: boolean;
  erro: string | null;
  dados: Awaited<ReturnType<typeof carregarMatriz>>;
  por: 'corretor' | 'equipe';
}) {
  if (carregando) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>;
  }
  if (erro) {
    return <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">Não deu para ler a matriz: {erro}</p>;
  }
  if (!dados) return null;

  const { totais } = dados;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Matriz de eficiência por {por}</h3>

      {/* O desencontro declarado. Sem ele, a coluna de venda parece dizer que
          a casa vendeu 1 no mês — quando a planilha comercial diz outra coisa. */}
      {dados.vendas_na_planilha !== totais.venda && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Esta matriz mede o <strong>funil</strong>, que é o que o corretor movimenta: {totais.venda}{' '}
            lead(s) em Proposta assinada. A <strong>planilha comercial</strong> registra{' '}
            {dados.vendas_na_planilha} venda(s) no mesmo período. São duas contagens que ainda não se
            falam — a diferença é o assunto, não um erro de leitura.
          </span>
        </p>
      )}

      {totais.sem_responsavel > 0 && (
        <p className="flex items-start gap-2 rounded-md border p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {inteiro(totais.sem_responsavel)} de {inteiro(totais.leads)} leads do período não têm{' '}
          {por === 'equipe' ? 'equipe' : 'corretor'}. Eles entram nos totais abaixo — tirá-los faria
          toda taxa parecer melhor do que é.
        </p>
      )}

      {por === 'equipe' && dados.equipes_sem_membro > 0 && (
        <p className="text-xs text-muted-foreground">
          {dados.equipes_sem_membro} equipe(s) cadastrada(s) sem nenhum membro não aparecem aqui.
        </p>
      )}

      {dados.linhas.length === 0 ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          Nenhum lead com {por} no período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">{por === 'equipe' ? 'Equipe' : 'Corretor'}</th>
                <th className="px-3 py-2 text-right">Recebidos</th>
                <th className="px-3 py-2 text-right">Atendidos em 1h</th>
                <th className="px-3 py-2 text-right">1º atendimento</th>
                <th className="px-3 py-2 text-right">Visita</th>
                <th className="px-3 py-2 text-right">Proposta</th>
                <th className="px-3 py-2 text-right">Venda (funil)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dados.linhas.map((l: LinhaDaMatriz) => (
                <tr key={l.quem}>
                  <td className="px-3 py-2 font-medium">{l.quem}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.recebidos)}</td>
                  <td className="px-3 py-2 text-right"><Celula t={taxa(l.atendidos_1h, l.recebidos)} /></td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {l.minutos_medio == null ? '—' : `${inteiro(l.minutos_medio)} min`}
                  </td>
                  <td className="px-3 py-2 text-right"><Celula t={taxa(l.visita, l.recebidos)} /></td>
                  <td className="px-3 py-2 text-right"><Celula t={taxa(l.proposta, l.recebidos)} /></td>
                  <td className="px-3 py-2 text-right"><Celula t={taxa(l.venda, l.recebidos)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            "Atendidos em 1h" é o <strong>corretor</strong> falando com o lead — mensagem enviada por ele
            ou toque registrado. Não é a LIA, que responde em segundos e faria todo mundo aparecer com 100%.
          </p>
        </div>
      )}
    </section>
  );
}

function CpaSecao({
  carregando,
  dados,
}: {
  carregando: boolean;
  dados: Awaited<ReturnType<typeof carregarCpa>>;
}) {
  if (carregando || !dados) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Custo por venda, por construtora</h3>
      <p className="text-xs text-muted-foreground">
        Esta é a única leitura de retorno que fecha hoje: os dois lados cruzam por{' '}
        <strong>empreendimento</strong>, e não pelo lead. O gasto vem da campanha cujo nome traz o
        empreendimento entre colchetes; as vendas, da planilha comercial.
      </p>

      {dados.linhas.length === 0 ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          Nenhuma construtora com gasto ou venda no período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Construtora</th>
                <th className="px-3 py-2 text-right">Gasto</th>
                <th className="px-3 py-2 text-right">Vendas</th>
                <th className="px-3 py-2 text-right">Custo por venda</th>
                <th className="px-3 py-2 text-right">Comissão</th>
                <th className="px-3 py-2 text-right">Retorno sobre comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dados.linhas.map((l: LinhaDeCpa) => (
                <tr key={l.construtora}>
                  <td className="px-3 py-2 font-medium">{l.construtora}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(l.gasto)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.vendas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(l.cpa)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(l.vgc)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.roas_vgc == null ? '—' : `${String(l.roas_vgc).replace('.', ',')}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados.gasto_sem_construtora > 0 && (
        <p className="flex items-start gap-2 rounded-md border p-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {reaisExatos(dados.gasto_sem_construtora)} de gasto está em campanha que não casa com nenhum
          lançamento cadastrado — por isso a soma das linhas acima não fecha com o total de mídia.
        </p>
      )}
    </section>
  );
}

function ToquesSecao({
  carregando,
  dados,
}: {
  carregando: boolean;
  dados: Awaited<ReturnType<typeof carregarToques>>;
}) {
  if (carregando || !dados) return null;
  const { resumo } = dados;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Quem trouxe, e quem reencontrou</h3>

      {!valeOlharToques(resumo) ? (
        <p className="rounded-md border p-3 text-xs text-muted-foreground">
          Nenhum cliente entrou por duas origens diferentes neste período, então primeiro e último
          toque dizem a mesma coisa. Esta leitura só muda decisão quando há troca de origem.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {inteiro(resumo.clientes_repetidos)} cliente(s) entraram mais de uma vez, e{' '}
            <strong>{inteiro(resumo.trocaram_de_origem)}</strong> deles por uma origem diferente. Sem
            separar os dois toques, a origem que trouxe o cliente e a que o reencontrou recebem o mesmo
            crédito — e a primeira, que costuma ser a cara, parece pior do que é.
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2 text-right">Leads</th>
                  <th className="px-3 py-2 text-right">Trouxe</th>
                  <th className="px-3 py-2 text-right">Reencontrou</th>
                  <th className="px-3 py-2">Leitura</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dados.linhas.map((l: LinhaDeToque) => (
                  <tr key={l.origem}>
                    <td className="px-3 py-2 font-medium">{l.origem}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.leads)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.primeiro_toque)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inteiro(l.ultimo_toque)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{leituraDoSaldo(l) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              O mesmo cliente é reconhecido pelos oito últimos dígitos do telefone — é o que resolve o
              nono dígito escrito de formas diferentes. Quem não tem telefone conta como cliente próprio.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Verba planejada contra gasto real (P3.6).
 *
 * A verba é cadastrada por empreendimento ou por campanha; o gasto vem da
 * mesma fonte da aba Campanhas. Uma linha sem verba cadastrada NÃO aparece
 * aqui — a tela não inventa um planejamento que ninguém fez.
 */
function VerbaSecao({
  verbas,
  campanhas,
}: {
  verbas: Array<{ id: string; empreendimento: string | null; campaign_id: string | null; valor: number }>;
  campanhas: Array<{ campaign_id: string; campaign_nome: string; gasto: number }>;
}) {
  if (verbas.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Verba planejada × gasta</h3>
        <p className="rounded-md border p-3 text-xs text-muted-foreground">
          Nenhuma verba cadastrada para este mês. Sem o planejado, a tela não tem contra o que comparar
          o gasto — e inventar um alvo seria pior do que não mostrar a barra.
        </p>
      </section>
    );
  }

  const linhas = verbas.map((v) => {
    // Verba de campanha casa pelo id; verba de empreendimento soma todas as
    // campanhas cujo nome traz aquele empreendimento entre colchetes.
    const gasto = v.campaign_id
      ? campanhas.filter((c) => c.campaign_id === v.campaign_id).reduce((s, c) => s + c.gasto, 0)
      : campanhas
          .filter((c) => empreendimentoDaCampanha(c.campaign_nome) === (v.empreendimento ?? '').toUpperCase())
          .reduce((s, c) => s + c.gasto, 0);
    const alvo = v.campaign_id
      ? campanhas.find((c) => c.campaign_id === v.campaign_id)?.campaign_nome ?? v.campaign_id
      : v.empreendimento ?? '';
    return { id: v.id, alvo, planejado: v.valor, gasto, consumo: consumoDaVerba(v.valor, gasto) };
  });

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Verba planejada × gasta</h3>
      <div className="space-y-2 rounded-md border p-3">
        {linhas.map((l) => (
          <div key={l.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">{l.alvo}</span>
              <span className="tabular-nums text-muted-foreground">
                {reaisExatos(l.gasto)} de {reaisExatos(l.planejado)} · {l.consumo.texto}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
              <div
                className={`h-1.5 rounded-full ${
                  l.consumo.estado === 'ruim' ? 'bg-rose-500'
                    : l.consumo.estado === 'media' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${l.consumo.larguraDaBarra}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
