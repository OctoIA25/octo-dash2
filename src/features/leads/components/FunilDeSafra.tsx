/**
 * A.5 · Funil de safra — só os leads que ENTRARAM no período.
 *
 * O funil de sempre mistura quem entrou ontem com quem entrou em março: a
 * venda de setembro pode ser de um lead antigo, e comparar meses não diz se
 * a captação melhorou ou se a base velha maturou. Aqui cada etapa conta só a
 * safra do período — separada por Lançamento e Pronto, cujos ciclos são
 * diferentes demais para dividir uma média.
 */
import { useQuery } from '@tanstack/react-query';
import { InfoMetrica } from '@/features/kpis/components/KpiComponents';
import { ETAPAS_DO_FUNIL_INTERESSADO, rotuloDaEtapa } from '@/features/leads/utils/funnelStages';
import { carregarFunilDeSafra, type Atuacao } from '@/features/leads/services/funilDeSafraService';

const ATUACOES: { id: Atuacao; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'lancamento', rotulo: 'Lançamento' },
  { id: 'pronto', rotulo: 'Pronto' },
];

const dataBR = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
const pct = (parte: number, todo: number) => (todo > 0 ? `${Math.round((parte / todo) * 100)}%` : '—');

/** Todos · Lançamento · Pronto — o mesmo recorte vale para os dois funis da Visão Geral. */
export function SeletorDeAtuacao({ valor, onChange }: { valor: Atuacao; onChange: (a: Atuacao) => void }) {
  return (
    <div role="group" aria-label="Atuação" className="flex rounded-lg border border-border p-0.5">
      {ATUACOES.map((a) => (
        <button
          key={a.id}
          type="button"
          aria-pressed={valor === a.id}
          onClick={() => onChange(a.id)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
            valor === a.id ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-text-secondary hover:text-foreground'
          }`}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

export function FunilDeSafra({ tenantId, periodo, atuacao }: {
  tenantId: string | null | undefined;
  /** Null quando as datas livres estão incompletas ou invertidas. */
  periodo: { de: string; ate: string } | null;
  atuacao: Atuacao;
}) {
  const pronto = !!tenantId && tenantId !== 'owner' && !!periodo;
  const safra = useQuery({
    queryKey: ['funil-de-safra', tenantId, periodo?.de, periodo?.ate, atuacao],
    queryFn: () => carregarFunilDeSafra(tenantId!, periodo!, ETAPAS_DO_FUNIL_INTERESSADO, atuacao),
    enabled: pronto,
  });

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card/60 p-5">
      <div>
        <h3 className="text-[15px] font-semibold">Funil de safra</h3>
        <p className="text-[12px] text-text-secondary">
          {periodo ? `Só os leads que entraram de ${dataBR(periodo.de)} a ${dataBR(periodo.ate)}` : 'Só os leads que entraram no período'}
        </p>
      </div>

      {!periodo ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-[13px] text-text-secondary">
          Complete as duas datas do período personalizado no filtro acima — a de início não pode vir depois da de fim.
        </p>
      ) : safra.isLoading ? (
        <p className="text-[13px] text-text-secondary">Carregando a safra…</p>
      ) : safra.isError ? (
        <p role="alert" className="text-[13px] text-rose-600 dark:text-rose-400">Não deu para carregar a safra.</p>
      ) : !safra.data || safra.data.entraram === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-[13px] text-text-secondary">
          Sem dados: nenhum lead {atuacao === 'todos' ? '' : `de ${atuacao === 'lancamento' ? 'lançamento' : 'pronto'} `}entrou neste período.
        </p>
      ) : (
        <ConteudoDaSafra s={safra.data} />
      )}
    </div>
  );
}

function ConteudoDaSafra({ s }: { s: NonNullable<Awaited<ReturnType<typeof carregarFunilDeSafra>>> }) {
  const foraDaMediana = s.entraram - s.fecharamComData;
  return (
    <>
      <p className="text-[13px]"><b className="tabular-nums">{s.entraram}</b> leads entraram no período</p>
      <ul className="space-y-1.5">
        {ETAPAS_DO_FUNIL_INTERESSADO.map((etapa, i) => {
          const n = s.porEtapa[i] ?? 0;
          return (
            <li key={etapa} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[12.5px]">
              <span className="truncate text-text-secondary">{rotuloDaEtapa(etapa)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span className="block h-full rounded-full bg-blue-500" style={{ width: `${s.entraram ? (n / s.entraram) * 100 : 0}%` }} />
              </span>
              <span className="tabular-nums">{n} · {pct(n, s.entraram)}</span>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-3 sm:grid-cols-3">
        <Numero rotulo="Fechou" chave="safra.fechou" valor={pct(s.fecharam, s.entraram)}
          detalhe={`${s.fecharam} de ${s.entraram}`} />
        <Numero rotulo="Dias até fechar" chave="safra.medianaDias"
          valor={s.medianaDias == null ? 'Sem dados' : `${s.medianaDias.toLocaleString('pt-BR')} dias`}
          detalhe={`mediana · ${foraDaMediana} ficaram de fora do cálculo`} />
        <Numero rotulo="Safra viva" chave="safra.viva" valor={String(s.viva)}
          detalhe={`não fecharam e seguem andando · ${s.arquivados} arquivados`} />
      </div>

      {s.inicioDoHistorico && (
        <p className="text-[11.5px] text-text-secondary">
          O registro de etapas começa em {dataBR(s.inicioDoHistorico)}; para leads anteriores, vale a etapa atual do card.
        </p>
      )}
    </>
  );
}

function Numero({ rotulo, chave, valor, detalhe }: { rotulo: string; chave: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {rotulo} <InfoMetrica metricKey={chave} label={rotulo} />
      </p>
      <p className="mt-0.5 text-[20px] font-semibold tabular-nums">{valor}</p>
      <p className="text-[11.5px] text-text-secondary">{detalhe}</p>
    </div>
  );
}
