/**
 * Gráfico de evolução (P3.3).
 *
 * Uma métrica por vez, com seletor — decidido com o chefe em 21/09. As quatro
 * que o plano pede não convivem num eixo só: 37 vendas, R$ 14,46 M de VGV,
 * R$ 498 mil de ticket e 4,57% de comissão desenhariam três retas coladas no
 * chão e uma barra sozinha lá em cima.
 *
 * O período do gráfico é escolhido à parte do mês dos contadores, e o título
 * diz qual é. Um gráfico de evolução preso a um mês não tem o que evoluir — e
 * é escolhendo 6 meses que se vê a régua virar de dias para meses.
 */

import { useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CalendarPlus, Flag, Info, Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { carregarEvolucao, criarEvento, type Evolucao } from '../services/painelComercialService';
import {
  METRICAS, baldesRestantes, ehUmMesSo, eventosNoRecorte, janela, linhaDaMeta,
  montarPontos, resumoDaMedia, ritmoNecessario, rotuloDoBalde, valorDe,
  type ChaveMetrica,
} from '../utils/evolucao';
import type { Filtros } from '../utils/filtrosDoPainel';

/** Quantos meses o gráfico olha para trás, contando o mês escolhido. */
const JANELAS = [
  { meses: 1, rotulo: 'o mês' },
  { meses: 3, rotulo: '3 meses' },
  { meses: 6, rotulo: '6 meses' },
  { meses: 12, rotulo: '12 meses' },
];

interface Props {
  tenantId: string;
  /** O mês dos contadores, no formato AAAA-MM. O gráfico termina nele. */
  mes: string;
  tipo: string;
  filtros: Filtros;
}

export function EvolucaoDoPainel({ tenantId, mes, tipo, filtros }: Props) {
  const [metrica, setMetrica] = useState<ChaveMetrica>('vendas');
  const [meses, setMeses] = useState(1);
  const [ver7, setVer7] = useState(false);
  const [ver30, setVer30] = useState(false);
  const [comparar, setComparar] = useState(true);

  const { de, ate } = useMemo(() => janela(mes, meses), [mes, meses]);

  const { data: ev, isLoading, isError, error } = useQuery({
    queryKey: ['painel-evolucao', tenantId, de, ate, tipo, JSON.stringify(filtros)],
    queryFn: () => carregarEvolucao(tenantId, { de, ate, tipo, filtros }),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  return (
    <section className="rounded-lg border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Evolução</h2>
          <p className="text-[11px] text-muted-foreground">
            {meses === 1 ? `${rotuloDoBalde(`${mes}-01`, 'mes')}, dia a dia` : `${meses} meses até ${rotuloDoBalde(`${mes}-01`, 'mes')}`}
            {ev && ` · ${ev.granularidade === 'dia' ? 'um ponto por dia' : 'um ponto por mês'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {METRICAS.map((m) => (
            <button
              key={m.chave}
              onClick={() => setMetrica(m.chave)}
              className={`rounded-md border px-2 py-0.5 text-xs ${
                metrica === m.chave ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'
              }`}
            >
              {m.rotulo}
            </button>
          ))}
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="h-6 rounded-md border bg-background px-1.5 text-xs"
            aria-label="Período do gráfico"
          >
            {JANELAS.map((j) => (
              <option key={j.meses} value={j.meses}>
                {j.rotulo}
              </option>
            ))}
          </select>
        </div>
      </header>

      {isLoading && (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {isError && (
        <p className="p-4 text-sm text-rose-700 dark:text-rose-300">
          Não deu para ler a evolução: {(error as Error)?.message ?? 'erro desconhecido'}
        </p>
      )}
      {ev && (
        <Grafico
          ev={ev}
          metrica={metrica}
          filtros={filtros}
          ver7={ver7}
          ver30={ver30}
          comparar={comparar}
          setVer7={setVer7}
          setVer30={setVer30}
          setComparar={setComparar}
        />
      )}
      <CadastroDeEvento tenantId={tenantId} />
    </section>
  );
}

function Grafico({
  ev,
  metrica,
  filtros,
  ver7,
  ver30,
  comparar,
  setVer7,
  setVer30,
  setComparar,
}: {
  ev: Evolucao;
  metrica: ChaveMetrica;
  filtros: Filtros;
  ver7: boolean;
  ver30: boolean;
  comparar: boolean;
  setVer7: (v: boolean) => void;
  setVer30: (v: boolean) => void;
  setComparar: (v: boolean) => void;
}) {
  const def = METRICAS.find((m) => m.chave === metrica)!;
  const pontos = useMemo(
    () => montarPontos(ev.serie, ev.anterior.serie, metrica, ev.granularidade),
    [ev, metrica]
  );
  const valores = useMemo(() => ev.serie.map((b) => valorDe(b, metrica)), [ev.serie, metrica]);
  const r7 = useMemo(() => resumoDaMedia(valores, 7), [valores]);
  const r30 = useMemo(() => resumoDaMedia(valores, 30), [valores]);

  // A meta e o ritmo só existem para "vendas": a tela Metas guarda alvo de
  // vendas e de comissão, e nenhum de VGV, ticket ou % — inventar um alvo para
  // essas três seria desenhar uma linha que não veio de lugar nenhum.
  const temMeta = metrica === 'vendas';
  const umMes = ehUmMesSo(ev.de, ev.ate);
  const meta = linhaDaMeta(temMeta ? ev.metas?.vendas : null, ev.serie.length, ev.granularidade, umMes);
  const feito = ev.serie.reduce((s, b) => s + b.vendas, 0);
  const ritmo = ritmoNecessario(
    temMeta && umMes && ev.granularidade === 'dia' ? ev.metas?.vendas : null,
    feito,
    baldesRestantes(ev.serie, ev.hoje)
  );

  const eventos = useMemo(() => eventosNoRecorte(ev.eventos ?? [], filtros), [ev.eventos, filtros]);
  const semNada = valores.every((v) => v == null || v === 0);

  return (
    <div className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        <Interruptor ligado={comparar} aoTrocar={setComparar} rotulo="Comparar com o período anterior" />
        <Interruptor ligado={ver7} aoTrocar={setVer7} rotulo="Média de 7" aviso={r7.texto} />
        <Interruptor ligado={ver30} aoTrocar={setVer30} rotulo="Média de 30" aviso={r30.texto} />
      </div>

      {/* O aviso que evita o gestor olhar uma reta no zero achando que quebrou.
          Agosto realmente não tem venda: as 37 estão todas em setembro. */}
      {comparar && ev.anterior.vazio && (
        <p className="mb-2 flex items-start gap-1.5 rounded-md border p-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          O período anterior ({ev.anterior.de} a {ev.anterior.ate}) não tem venda registrada. A linha
          tracejada fica no zero porque foi zero, não por falta de leitura.
        </p>
      )}

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={64} tickFormatter={(v) => def.formatar(v as number)} />
            <Tooltip content={<Dica metrica={metrica} anteriorVazio={ev.anterior.vazio} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {/* Somável vira barra; média vira linha. Barra de ticket médio
                convidaria a somar duas colunas, e a soma de duas médias não é
                média de nada. */}
            {def.somavel ? (
              <Bar dataKey="atual" name={def.rotulo} fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            ) : (
              // `connectNulls` explícito, e não herdado do padrão da
              // biblioteca. O que está em jogo: ticket de dia sem venda é
              // AUSENTE, e ligar os pontos por cima do buraco afirmaria que o
              // ticket "ficou" em R$ 480 mil nos treze dias sem venda de
              // setembro. Medido no navegador: a linha vai de 02/09 a 17/09 e
              // para. Escrito aqui porque um padrão de biblioteca muda de
              // versão e isto é regra de leitura, não preferência visual.
              <Line type="monotone" dataKey="atual" name={def.rotulo} stroke="hsl(var(--primary))" dot={false} strokeWidth={2} connectNulls={false} />
            )}

            {comparar && (
              <Line
                type="monotone"
                dataKey="anterior"
                name="Período anterior"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 4"
                dot={false}
                strokeWidth={1.5}
                connectNulls={false}
              />
            )}
            {ver7 && r7.pontos > 0 && (
              <Line type="monotone" dataKey="m7" name="Média de 7" stroke="#0ea5e9" dot={false} strokeWidth={1.5} connectNulls={false} />
            )}
            {ver30 && r30.pontos > 0 && (
              <Line type="monotone" dataKey="m30" name="Média de 30" stroke="#8b5cf6" dot={false} strokeWidth={1.5} connectNulls={false} />
            )}

            {meta.porBalde != null && (
              <ReferenceLine y={meta.porBalde} stroke="#16a34a" strokeDasharray="4 3"
                label={{ value: 'meta', position: 'insideTopRight', fontSize: 10, fill: '#16a34a' }} />
            )}
            {ritmo.porBalde != null && ritmo.porBalde > 0 && (
              <ReferenceLine y={ritmo.porBalde} stroke="#f59e0b" strokeDasharray="2 3"
                label={{ value: 'ritmo necessário', position: 'insideBottomRight', fontSize: 10, fill: '#f59e0b' }} />
            )}

            {eventos.map((e) => (
              <ReferenceLine
                key={e.id}
                x={rotuloDoBalde(e.em, ev.granularidade)}
                stroke="#64748b"
                strokeDasharray="2 2"
                label={{ value: e.titulo, position: 'top', fontSize: 9, fill: '#64748b' }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {semNada && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Nenhuma venda neste recorte — o gráfico está vazio porque não há o que mostrar, não por erro.
        </p>
      )}

      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Meta: {meta.texto}</span>
        <span>Ritmo necessário: {ritmo.texto}</span>
        {eventos.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Flag className="h-3 w-3" /> {eventos.length} evento{eventos.length > 1 ? 's' : ''} no período
          </span>
        )}
      </p>
    </div>
  );
}

function Interruptor({
  ligado,
  aoTrocar,
  rotulo,
  aviso,
}: {
  ligado: boolean;
  aoTrocar: (v: boolean) => void;
  rotulo: string;
  aviso?: string | null;
}) {
  // Com aviso, o interruptor não acende: ligar desenharia uma linha vazia e a
  // pessoa ficaria procurando o que não existe. O motivo fica no lugar dele.
  const travado = !!aviso;
  return (
    <button
      type="button"
      disabled={travado}
      onClick={() => aoTrocar(!ligado)}
      title={aviso ?? undefined}
      className={`rounded-md border px-2 py-0.5 ${
        travado
          ? 'cursor-not-allowed text-muted-foreground/60'
          : ligado
            ? 'border-primary bg-primary/10 text-primary'
            : 'text-muted-foreground'
      }`}
    >
      {rotulo}
      {travado && <span className="ml-1">({aviso})</span>}
    </button>
  );
}

function Dica({
  metrica,
  anteriorVazio,
  active,
  payload,
  label,
}: {
  metrica: ChaveMetrica;
  anteriorVazio: boolean;
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number | null; payload?: Record<string, unknown> }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const def = METRICAS.find((m) => m.chave === metrica)!;
  const p = payload[0]?.payload as { emAnterior?: string | null } | undefined;

  return (
    <div className="rounded-md border bg-background p-2 text-[11px] shadow-sm">
      <p className="font-medium">{label}</p>
      {payload.map((s) => (
        <p key={String(s.dataKey)} className="tabular-nums">
          {String(s.dataKey) === 'atual' ? def.rotulo
            : String(s.dataKey) === 'anterior' ? `Anterior${p?.emAnterior ? ` (${p.emAnterior})` : ''}`
            : String(s.dataKey) === 'm7' ? 'Média de 7' : 'Média de 30'}
          : {def.formatar(s.value ?? null)}
        </p>
      ))}
      {anteriorVazio && <p className="text-muted-foreground">o período anterior não teve venda</p>}
    </div>
  );
}

/** Cadastro simples das bandeirinhas, como o plano pede. Só a gestão escreve. */
function CadastroDeEvento({ tenantId }: { tenantId: string }) {
  const { isAdmin } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [em, setEm] = useState('');
  const [titulo, setTitulo] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (!isAdmin) return null;

  const salvar = async () => {
    if (!em || !titulo.trim()) return;
    setSalvando(true);
    try {
      await criarEvento(tenantId, { em, titulo });
      await qc.invalidateQueries({ queryKey: ['painel-evolucao'] });
      setEm('');
      setTitulo('');
      toast({ title: 'Evento marcado', description: 'A bandeirinha aparece no gráfico do período.' });
    } catch (e) {
      toast({ title: 'Não deu para marcar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <details className="border-t px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
        <CalendarPlus className="h-3 w-3" /> Marcar um evento no gráfico
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={em}
          onChange={(e) => setEm(e.target.value)}
          className="h-7 rounded-md border bg-background px-2 text-xs"
        />
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Início campanha Serrah"
          className="h-7 min-w-[200px] flex-1 rounded-md border bg-background px-2 text-xs"
        />
        <button
          onClick={salvar}
          disabled={salvando || !em || !titulo.trim()}
          className="h-7 rounded-md border px-2.5 text-xs hover:bg-accent disabled:opacity-50"
        >
          {salvando ? 'Marcando…' : 'Marcar'}
        </button>
      </div>
    </details>
  );
}
