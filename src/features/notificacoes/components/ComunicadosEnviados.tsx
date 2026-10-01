/**
 * Enviados (A.2): o que a casa anunciou, quantos leram e, ao abrir um, QUEM
 * leu e quem não leu — nome por nome, não uma contagem. A Diretoria vê todos
 * os comunicados da casa (inclusive os da LIA); o gerente, os dele. Quem decide
 * é o banco (comunicados_enviados / leitura_do_comunicado).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  carregarEnviados, carregarLeitura, separarLeitura,
  type ComunicadoEnviado, type LeituraDaPessoa,
} from '../services/comunicadosService';

export const CHAVE_ENVIADOS = 'comunicados-enviados';

const quando = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
const horario = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function ComunicadosEnviados({ tenantId }: { tenantId: string }) {
  const [aberto, setAberto] = useState<ComunicadoEnviado | null>(null);
  const enviados = useQuery({
    queryKey: [CHAVE_ENVIADOS, tenantId],
    queryFn: () => carregarEnviados(tenantId),
  });

  if (enviados.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (enviados.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        Não deu para carregar os comunicados enviados.
        <Button variant="outline" size="sm" onClick={() => enviados.refetch()}>Tentar de novo</Button>
      </div>
    );
  }
  const lista = enviados.data ?? [];
  if (lista.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Megaphone className="h-5 w-5 text-slate-500" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-50">Nenhum comunicado enviado ainda</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Quando você enviar um comunicado, ele aparece aqui com quantas pessoas já leram.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {lista.map((c) => <LinhaDoEnviado key={c.id} comunicado={c} onAbrir={() => setAberto(c)} />)}
      </ul>
      {aberto && <LeituraDoComunicado comunicado={aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}

function LinhaDoEnviado({ comunicado: c, onAbrir }: { comunicado: ComunicadoEnviado; onAbrir: () => void }) {
  const feitos = c.exigeCiente ? c.cientes : c.leram;
  const pct = c.destinatarios > 0 ? Math.round((feitos / c.destinatarios) * 100) : 0;
  return (
    <li>
      <button type="button" onClick={onAbrir}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-800/50 dark:focus-visible:bg-slate-800/50 sm:px-5">
        <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{c.remetente}</span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <span className="sr-only">para</span>
          <span>{c.publico}</span>
          <span aria-hidden>·</span>
          <time dateTime={c.criadoEm} title={horario(c.criadoEm)}>{quando(c.criadoEm)}</time>
        </span>
        <span className="text-[15px] font-semibold leading-6 text-slate-900 dark:text-slate-50">
          {c.titulo}
          {c.importante && (
            <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 align-[2px] text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Importante</span>
          )}
          {c.exigeCiente && (
            <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 align-[2px] text-[11px] font-semibold text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">Pede ciente</span>
          )}
        </span>
        <span className="flex items-center gap-3">
          <span className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
            <span className="block h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
          </span>
          <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
            {c.leram} de {c.destinatarios} leram
            {c.exigeCiente && <> · {c.cientes} deram ciente</>}
          </span>
        </span>
      </button>
    </li>
  );
}

function LeituraDoComunicado({ comunicado: c, onFechar }: { comunicado: ComunicadoEnviado; onFechar: () => void }) {
  const leitura = useQuery({
    queryKey: ['comunicado-leitura', c.id],
    queryFn: () => carregarLeitura(c.id),
  });
  const { faltam, fizeram } = separarLeitura(leitura.data ?? [], c.exigeCiente);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{c.titulo}</DialogTitle>
          <DialogDescription>
            {c.remetente} para {c.publico} · {horario(c.criadoEm)}
          </DialogDescription>
        </DialogHeader>

        {leitura.isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : leitura.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-rose-600 dark:text-rose-400">
            Não deu para carregar quem leu.
            <Button variant="outline" size="sm" onClick={() => leitura.refetch()}>Tentar de novo</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <Grupo
              titulo={c.exigeCiente ? 'Ainda não deram ciente' : 'Ainda não leram'}
              pessoas={faltam} tom="pendente"
              vazio={c.exigeCiente ? 'Todo mundo já deu ciente.' : 'Todo mundo já leu.'}
              detalheDoTempo={(p) => (c.exigeCiente && p.lidoEm ? `abriu ${horario(p.lidoEm)}, sem ciente` : null)}
            />
            <Grupo
              titulo={c.exigeCiente ? 'Deram ciente' : 'Leram'}
              pessoas={fizeram} tom="feito"
              vazio={c.exigeCiente ? 'Ninguém deu ciente ainda.' : 'Ninguém leu ainda.'}
              detalheDoTempo={(p) => {
                const em = c.exigeCiente ? p.cienteEm : p.lidoEm;
                return em ? horario(em) : null;
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Grupo({ titulo, pessoas, tom, vazio, detalheDoTempo }: {
  titulo: string;
  pessoas: LeituraDaPessoa[];
  tom: 'pendente' | 'feito';
  vazio: string;
  detalheDoTempo: (p: LeituraDaPessoa) => string | null;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <span className={`h-2 w-2 rounded-full ${tom === 'pendente' ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden />
        {titulo} <span className="font-normal tabular-nums text-slate-500">({pessoas.length})</span>
      </h3>
      {pessoas.length === 0 ? (
        <p className="text-sm text-slate-500">{vazio}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {pessoas.map((p) => {
            const tempo = detalheDoTempo(p);
            const papel = p.cargo && p.equipe ? `${p.cargo} da ${p.equipe}` : p.cargo || p.equipe;
            return (
              <li key={p.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{p.nome}</span>
                  {papel && <span className="ml-1.5 text-slate-500">{papel}</span>}
                  {p.copiaGestor && <span className="ml-1.5 text-xs text-slate-400">(como gestor)</span>}
                </span>
                {tempo && <span className="shrink-0 text-xs tabular-nums text-slate-500">{tempo}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
