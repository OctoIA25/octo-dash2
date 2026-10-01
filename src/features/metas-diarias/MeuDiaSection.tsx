/**
 * A.4 · Meu dia — a tela do corretor pela manhã, no topo do Início.
 *
 * Em cima, o compromisso (os campos mudam pela atuação). No meio, a agenda de
 * hoje, puxada do que já está marcado — ele não digita. Embaixo, as três filas,
 * só com lead dele. O realizado vem de evento, nunca do que ele digitar de novo.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buscarConfiguracaoDoScore, buscarSinaisDeScore } from '@/features/leads/services/scoreService';
import { filaDeResgate } from './filaDeResgate';
import {
  carregarMeuDia, lancarCompromisso, leadsDoCorretor, ROTULO_DO_CAMPO,
  type Campo, type MeuDia, type Numeros,
} from './metasDiariasService';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
// meu_dia devolve no máximo 20 vencidas e 20 parados (os mais antigos). Na
// Lotus há corretor com 87 parados: lista cheia vira "20+", nunca um "20" falso.
const LIMITE_DA_LISTA = 20;
const dataBR = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

export function MeuDiaSection({ tenantId }: { tenantId: string }) {
  const dia = useQuery({ queryKey: ['meu-dia', tenantId], queryFn: () => carregarMeuDia(tenantId) });

  if (dia.isLoading) return <Moldura><p className="text-[13px] text-text-secondary">Carregando o seu dia…</p></Moldura>;
  if (dia.isError || !dia.data) {
    return <Moldura><p role="alert" className="text-[13px] text-rose-600 dark:text-rose-400">Não deu para carregar o seu dia.</p></Moldura>;
  }
  return <Moldura><ConteudoDoDia tenantId={tenantId} dia={dia.data} /></Moldura>;
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Meu dia" className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-[15px] font-semibold text-slate-900 dark:text-slate-100">Meu dia</h2>
      {children}
    </section>
  );
}

function ConteudoDoDia({ tenantId, dia }: { tenantId: string; dia: MeuDia }) {
  return (
    <div className="space-y-4">
      <Compromisso tenantId={tenantId} dia={dia} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Agenda dia={dia} />
        <Filas tenantId={tenantId} dia={dia} />
      </div>
    </div>
  );
}

function Compromisso({ tenantId, dia }: { tenantId: string; dia: MeuDia }) {
  const qc = useQueryClient();
  const [rascunho, setRascunho] = useState<Numeros>(() => dia.compromisso?.prometido ?? {});
  const [editando, setEditando] = useState(!dia.compromisso);
  const lancar = useMutation({
    mutationFn: () => lancarCompromisso(tenantId, rascunho),
    onSuccess: () => { setEditando(false); qc.invalidateQueries({ queryKey: ['meu-dia', tenantId] }); },
  });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium">Compromisso de hoje</p>
        {dia.compromisso && (
          <p className="text-[12px] text-text-secondary">
            Lançado às {hora(dia.compromisso.lancado_em)}
            {dia.compromisso.atrasado && <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">· depois das {dia.corte}</span>}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {dia.campos.map((campo: Campo) => (
          <label key={campo} className="rounded-lg border border-border px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{ROTULO_DO_CAMPO[campo]}</span>
            {editando ? (
              <Input
                aria-label={ROTULO_DO_CAMPO[campo]}
                type="number" min={0} max={99} inputMode="numeric"
                className="mt-1 h-8"
                value={rascunho[campo] ?? ''}
                onChange={(e) => setRascunho((r) => ({ ...r, [campo]: e.target.value === '' ? undefined : Number(e.target.value) }))}
              />
            ) : (
              <span className="mt-1 block text-[18px] font-semibold tabular-nums">
                {dia.realizado[campo]} <span className="text-[13px] font-normal text-text-secondary">de {dia.compromisso?.prometido[campo] ?? 0}</span>
              </span>
            )}
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {editando ? (
          <>
            <Button size="sm" onClick={() => lancar.mutate()} disabled={lancar.isPending}>
              {dia.compromisso ? 'Salvar' : 'Lançar compromisso'}
            </Button>
            {dia.compromisso && <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>}
            {lancar.isError && <span role="alert" className="text-[12px] text-rose-600">{(lancar.error as Error).message}</span>}
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditando(true)}>Corrigir o compromisso</Button>
        )}
        {!dia.compromisso && (
          <span className="text-[12px] text-text-secondary">Até as {dia.corte} conta como no horário; depois, fica marcado — não bloqueia.</span>
        )}
      </div>
    </div>
  );
}

function Agenda({ dia }: { dia: MeuDia }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">Agenda de hoje</p>
      {dia.agenda.length === 0 && dia.tarefas.length === 0 ? (
        <p className="text-[12.5px] text-text-secondary">Nada marcado para hoje na sua agenda.</p>
      ) : (
        <ul className="space-y-1.5">
          {dia.agenda.map((a) => (
            <li key={a.id} className="flex items-baseline gap-2 text-[13px]">
              <span className="w-12 shrink-0 tabular-nums text-text-secondary">{a.horario ?? '—'}</span>
              <span className="min-w-0">
                <span className="font-medium">{a.lead_nome || a.titulo}</span>
                <span className="text-text-secondary"> · {a.titulo}{a.imovel ? ` · ${a.imovel}` : ''}</span>
                {a.status === 'concluido' && <span className="ml-1 text-emerald-600">✓</span>}
              </span>
            </li>
          ))}
          {dia.tarefas.map((t) => (
            <li key={t.id} className="flex items-baseline gap-2 text-[13px]">
              <span className="w-12 shrink-0 text-text-secondary">tarefa</span>
              <span>{t.titulo}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Filas({ tenantId, dia }: { tenantId: string; dia: MeuDia }) {
  const ids = useMemo(() => dia.meus_leads.map((l) => l.id), [dia.meus_leads]);
  const resgate = useQuery({
    queryKey: ['meu-dia-resgate', tenantId, ids.join(',')],
    queryFn: async () => {
      const [sinais, config] = await Promise.all([buscarSinaisDeScore(tenantId, ids), buscarConfiguracaoDoScore(tenantId)]);
      return filaDeResgate(leadsDoCorretor(dia), sinais, config);
    },
    enabled: ids.length > 0,
  });
  const atencao = dia.vencidas.length + dia.parados.length;
  const atencaoCortada = dia.vencidas.length >= LIMITE_DA_LISTA || dia.parados.length >= LIMITE_DA_LISTA;

  return (
    <div className="space-y-3">
      <Fila titulo="Pontos de atenção" quantos={atencao} cortada={atencaoCortada} vazio="Nenhuma atividade vencida e nenhum lead parado há mais de 7 dias.">
        {dia.vencidas.map((v) => (
          <li key={`v-${v.id}`}>{v.lead_nome || v.titulo} <span className="text-text-secondary">· venceu em {dataBR(v.data)} · {v.titulo}</span></li>
        ))}
        {dia.parados.map((p) => (
          <li key={`p-${p.lead_id}`}>{p.nome} <span className="text-text-secondary">· parado há {p.dias} dias · {p.etapa}</span></li>
        ))}
      </Fila>
      <Fila titulo="Dá para resgatar hoje" quantos={resgate.data?.length ?? 0}
        vazio={resgate.isLoading ? 'Calculando…' : resgate.isError ? 'Não deu para calcular o score agora.' : 'Nenhum lead seu com sinal de resgate hoje.'}>
        {(resgate.data ?? []).map((r) => (
          <li key={r.id}>{r.nome} <span className="text-text-secondary">· score {r.score} · {r.motivo}</span></li>
        ))}
      </Fila>
      <Fila titulo="A Lia precisa de você" quantos={dia.lia.length} vazio="Nenhuma dúvida do Plantão esperando por você.">
        {dia.lia.map((q) => <li key={q.id}>{q.pergunta}</li>)}
      </Fila>
    </div>
  );
}

function Fila({ titulo, quantos, cortada = false, vazio, children }: {
  titulo: string; quantos: number; cortada?: boolean; vazio: string; children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium">{titulo} <span className="tabular-nums text-text-secondary">({quantos}{cortada ? '+' : ''})</span></p>
      {quantos === 0 ? <p className="text-[12.5px] text-text-secondary">{vazio}</p> : <ul className="space-y-1 text-[13px]">{children}</ul>}
    </div>
  );
}
