/**
 * LIA › Agenda (P2.5). Rota: /agentes-ia/agenda
 *
 * O lead diz "me chama amanhã às 16h" e isso vira um retorno que não se perde.
 *
 * As cinco abas são as do plano, e "Hoje" e "Atrasados" se sobrepõem de
 * propósito: um retorno de hoje de manhã que não saiu está nas duas, e é
 * exatamente onde o gestor precisa tropeçar nele.
 *
 * A agenda inteira do tenant é visão de gestão — mesmo portão do Plantão. O que
 * o corretor vê do SEU lead fica no card, pela cadência que já existia.
 */

import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarClock, Loader2, RefreshCw, User } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  carregarAgenda, type Agenda, type AbaDaAgenda,
} from '../services/agendaLiaService';
import {
  ROTULO_DE_QUEM_PEDIU, fraseDoNaoIncomodar, quandoCurto, quemVaiFalar, situacaoDaLinha,
} from '../utils/agendaLia';

const ABAS: Array<{ id: AbaDaAgenda; rotulo: string }> = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'a_cumprir', rotulo: 'A cumprir' },
  { id: 'pedidos_pelo_lead', rotulo: 'Pedidos pelo lead' },
  { id: 'atrasados', rotulo: 'Atrasados' },
  { id: 'nao_sairam', rotulo: 'Não saíram' },
];

export function AgendaLiaPage() {
  const { user, isGestao, isOwner } = useAuthContext();
  const tenantId = user?.tenantId;
  const [aba, setAba] = useState<AbaDaAgenda>('hoje');
  const [agora, setAgora] = useState(() => Date.now());

  // "Atrasados" nasce do relógio passando: sem isto, uma linha que estoura com
  // a tela aberta continuaria dizendo "a cumprir" até alguém recarregar.
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: agenda, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['agenda-lia', tenantId, aba],
    queryFn: () => carregarAgenda(tenantId!, aba),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const naoIncomodar = useMemo(
    () => (agenda ? fraseDoNaoIncomodar(agenda.pode_falar_das, agenda.pode_falar_ate) : null),
    [agenda]
  );

  if (!isGestao && !isOwner) return <Navigate to="/agentes-ia/agente-marketing" replace />;
  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária para ver a agenda.</p>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarClock className="h-5 w-5 text-primary" />
            Agenda da LIA
          </h1>
          <p className="text-sm text-muted-foreground">
            Os retornos agendados — os que o cliente pediu e os que a LIA marcou sozinha.
            {naoIncomodar && (
              <>
                {' · '}
                {naoIncomodar}
                {agenda && !agenda.configurado && ' (padrão)'}
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      <nav className="flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              aba === a.id
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {a.rotulo}
            {agenda && (
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  (a.id === 'atrasados' || a.id === 'nao_sairam') && agenda.contadores[a.id] > 0
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'bg-muted'
                }`}
              >
                {agenda.contadores[a.id]}
              </span>
            )}
          </button>
        ))}
      </nav>

      {isLoading && (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando a agenda…
        </p>
      )}
      {isError && (
        <p className="rounded-md border border-rose-200 p-4 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
          Não deu para ler a agenda: {(error as Error)?.message ?? 'erro desconhecido'}
        </p>
      )}

      {agenda && !isLoading && !isError && <Lista agenda={agenda} aba={aba} agora={agora} />}
    </div>
  );
}

const VAZIO: Record<AbaDaAgenda, string> = {
  hoje: 'Nenhum retorno marcado para hoje.',
  a_cumprir: 'Nada agendado daqui para a frente.',
  pedidos_pelo_lead: 'Nenhum cliente pediu retorno no período. Quando a LIA começar a registrar "me chama amanhã às 16h", os pedidos aparecem aqui.',
  atrasados: 'Nenhum retorno passou da hora. É o que se quer ver aqui.',
  nao_sairam: 'Nenhum disparo falhou no período.',
};

function Lista({ agenda, aba, agora }: { agenda: Agenda; aba: AbaDaAgenda; agora: number }) {
  if (agenda.linhas.length === 0) {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">{VAZIO[aba]}</p>;
  }
  return (
    <ul className="space-y-2">
      {agenda.linhas.map((l) => {
        const sit = situacaoDaLinha(l, agora);
        const quem = quemVaiFalar(l);
        return (
          <li key={l.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-2 font-medium">
                <AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />
                {quandoCurto(l.quando, agora)}
                <span className="font-normal text-muted-foreground">· {l.lead_nome ?? 'lead sem nome'}</span>
              </span>
              <span className={`text-sm ${sit.classe}`}>{sit.texto}</span>
            </div>

            {l.motivo && <p className="mt-1 text-sm text-muted-foreground">{l.motivo}</p>}

            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span
                className={
                  l.pedido_por === 'lead'
                    ? 'rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                    : ''
                }
              >
                {ROTULO_DE_QUEM_PEDIU[l.pedido_por]}
              </span>
              {l.tentativas > 1 && <span>· {l.tentativas}ª tentativa</span>}
              {l.template && <span>· por template</span>}
              {quem && (
                <span className="inline-flex items-center gap-1">
                  · <User className="h-3 w-3" />
                  {quem}
                </span>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
