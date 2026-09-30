/**
 * LIA › Plantão (P2.4). Rota: /agentes-ia/plantao
 *
 * Quando a LIA não sabe responder, ela pergunta ao corretor. Isso já acontece
 * há meses, mas só existia no WhatsApp dela: o gestor não via a fila, e nada
 * do que o corretor respondeu voltava para a base.
 *
 * AS DUAS ESCALAS, medidas em 26/09 — a tela precisa servir às duas:
 *   Japi   1.540 perguntas (jul–ago), 4 pendentes, 38 expiradas. Calada desde
 *          27/08. É a base em que esta tela foi desenhada.
 *   Lotus  11 perguntas (21–24/09), TODAS respondidas, nenhuma pendente. A
 *          LIA de lá grava só ao responder, então a aba "Aguardando" fica
 *          vazia por construção — e dizer "ninguém esperando" ali seria
 *          afirmar o que a tela não sabe.
 *
 * As três abas são as três perguntas do gestor:
 *   Aguardando      — quem está esperando agora, e há quanto tempo
 *   Respondidas     — o que foi respondido, e o que já virou conhecimento
 *   Mais perguntadas— o que a LIA pergunta toda semana e devia saber sozinha
 *
 * 30/09 — O CORRETOR ENTRA, E A TELA GANHA RESUMO, PERÍODO E ÁREA.
 * Pedido do chefe: cada chamado diz a equipe e o corretor e abre a conversa,
 * como em Comunicados; em cima, quantos a LIA abriu e quantos esperam, por
 * área (Lançamentos × Prontos) e por período, o mês por padrão. Quem vê o quê
 * é do banco (`plantao_visiveis`): corretor as suas, gestor a equipe e as sem
 * dono, diretoria tudo. A tela não recalcula o recorte — só esconde o que o
 * corretor não usa ("Mais perguntadas" e "Salvar na base", que ensinam a LIA
 * para a casa inteira), e o banco recusa do mesmo jeito.
 *
 * Sem agrupar por dia, ao contrário de Comunicados: é uma fila, e a pergunta
 * que espera há mais tempo tem de ficar no topo, não num grupo "Anteriores".
 *
 * O relógio anda no navegador (30 s), como no Painel de Distribuição do P1.3.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, ArrowUpRight, BookPlus, Bot, Clock, Loader2, MessageSquare, RefreshCw, Sparkles,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { OpenConversationLink } from '@/features/chat/components/OpenConversationLink';
import { CriarLeadQuickModal } from '@/features/leads/components/CriarLeadQuickModal';
import { fetchKanbanLeadDaConversa, type KanbanLead } from '@/features/leads/services/leadsService';
import {
  carregarFila, responderPergunta, salvarNaBase,
  type AbaDoPlantao, type AreaDoPlantao, type FilaDoPlantao, type FiltroDoPlantao,
} from '../services/plantaoService';
import {
  agruparPorTema, datasDoPeriodo, duracao, esperaDe, quemRecebeu, tempoDeResposta,
  type PerguntaDoPlantao, type PeriodoPronto,
} from '../utils/plantao';

const ABAS: Array<{ id: AbaDoPlantao; rotulo: string; conta: (f: FilaDoPlantao) => number; soGestao?: boolean }> = [
  { id: 'aguardando', rotulo: 'Aguardando', conta: (f) => f.contadores.aguardando + f.contadores.expiradas },
  { id: 'respondidas', rotulo: 'Respondidas', conta: (f) => f.contadores.respondidas },
  { id: 'mais', rotulo: 'Mais perguntadas', conta: (f) => f.contadores.por_aprender, soGestao: true },
];

type Periodo = PeriodoPronto | 'personalizado';

const PERIODOS: Array<{ id: Periodo; rotulo: string }> = [
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes_passado', rotulo: 'Mês passado' },
  { id: '7dias', rotulo: '7 dias' },
  { id: 'personalizado', rotulo: 'Personalizado' },
];

export function PlantaoPage() {
  const { user, isGestao, isOwner } = useAuthContext();
  const tenantId = user?.tenantId;
  const { toast } = useToast();
  const qc = useQueryClient();
  const gestao = isGestao || isOwner;

  const [aba, setAba] = useState<AbaDoPlantao>('aguardando');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [personalizado, setPersonalizado] = useState(() => datasDoPeriodo('mes'));
  const [equipe, setEquipe] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [salvando, setSalvando] = useState<PerguntaDoPlantao | null>(null);
  const [leadAberto, setLeadAberto] = useState<KanbanLead | null>(null);

  // O relógio da aba Aguardando precisa andar sozinho; nas outras não há relógio.
  useEffect(() => {
    if (aba !== 'aguardando') return;
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [aba]);

  const filtro: FiltroDoPlantao = {
    ...(periodo === 'personalizado' ? personalizado : datasDoPeriodo(periodo)),
    equipe,
  };
  // Datas trocadas não são período: não vai ao banco, e a tela diz por quê.
  const periodoValido = !!filtro.de && !!filtro.ate && filtro.de <= filtro.ate;

  // Com filtros, cada clique é uma consulta nova. Sem guardar a anterior, o
  // resumo e os próprios filtros sumiam a cada clique até o banco responder.
  // A lista não aproveita a anterior (seriam as linhas de outra aba): ela
  // espera, e o resumo fica esmaecido enquanto isso.
  const { data: fila, isLoading, isError, error, refetch, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['plantao', tenantId, aba, filtro.de, filtro.ate, filtro.equipe],
    queryFn: () => carregarFila(tenantId!, aba, filtro),
    enabled: !!tenantId && tenantId !== 'owner' && periodoValido,
    placeholderData: keepPreviousData,
  });

  const grupos = useMemo(
    () => (aba === 'mais' && fila ? agruparPorTema(fila.linhas) : []),
    [aba, fila]
  );

  // Trocar o período zera a área: o chip escolhido pode não existir no novo
  // período, e a lista ficaria filtrada por algo que a tela não mostra.
  const trocarPeriodo = (p: Periodo) => {
    setPeriodo(p);
    setEquipe(null);
  };

  const abrirLead = async (leadId: string) => {
    const lead = await fetchKanbanLeadDaConversa(tenantId!, leadId, []);
    if (lead) setLeadAberto(lead);
    else toast({ title: 'Lead não encontrado', description: 'Ele pode ter sido arquivado ou transferido.', variant: 'destructive' });
  };

  if (!tenantId || tenantId === 'owner') {
    return <Aviso texto="Escolha uma imobiliária para ver o plantão." />;
  }

  // O corretor só tem as suas; escolher área não lhe diz nada.
  const areas = fila && fila.recorte !== 'proprias' ? fila.equipes ?? [] : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MessageSquare className="h-5 w-5 text-primary" />
            Plantão da LIA
          </h1>
          <p className="text-sm text-muted-foreground">
            O que a LIA não soube responder e mandou para um corretor.
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

      <div className="flex flex-wrap items-center gap-3">
        <Escolha
          rotulo="Período"
          opcoes={PERIODOS.map((p) => ({ id: p.id, rotulo: p.rotulo }))}
          valor={periodo}
          onEscolher={trocarPeriodo}
        />
        {periodo === 'personalizado' && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Input
              type="date"
              aria-label="De"
              value={personalizado.de}
              onChange={(e) => { setPersonalizado((v) => ({ ...v, de: e.target.value })); setEquipe(null); }}
              className="h-8 w-auto"
            />
            até
            <Input
              type="date"
              aria-label="Até"
              value={personalizado.ate}
              onChange={(e) => { setPersonalizado((v) => ({ ...v, ate: e.target.value })); setEquipe(null); }}
              className="h-8 w-auto"
            />
          </div>
        )}
        {areas.length > 1 && (
          <Escolha
            rotulo="Área"
            opcoes={[
              { id: null, rotulo: 'Todas' },
              ...areas.map((a) => ({ id: a.id, rotulo: nomeDaArea(a), conta: a.total })),
            ]}
            valor={equipe}
            onEscolher={setEquipe}
          />
        )}
      </div>

      {!periodoValido && <Aviso texto="A data inicial está depois da final." erro />}

      {fila && periodoValido && !isError && (
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Resumo fila={fila} />
        </div>
      )}

      <Escolha
        rotulo="Situação"
        opcoes={ABAS.filter((a) => gestao || !a.soGestao).map((a) => ({
          id: a.id, rotulo: a.rotulo, conta: fila ? a.conta(fila) : undefined,
        }))}
        valor={aba}
        onEscolher={(id) => setAba(id)}
      />

      {periodoValido && (isLoading || isPlaceholderData) && <Aviso texto="Carregando o plantão…" carregando />}
      {isError && (
        <Aviso texto={`Não deu para ler o plantão: ${(error as Error)?.message ?? 'erro desconhecido'}`} erro />
      )}

      {fila && periodoValido && !isLoading && !isPlaceholderData && !isError && (
        <>
          <RecorteDaFila fila={fila} />
          {aba === 'aguardando' && (
            <ListaAguardando fila={fila} agora={agora} onAbrirLead={abrirLead} />
          )}
          {aba === 'respondidas' && (
            <ListaRespondidas fila={fila} onSalvar={gestao ? setSalvando : undefined} onAbrirLead={abrirLead} />
          )}
          {aba === 'mais' && gestao && (
            <MaisPerguntadas grupos={grupos} total={fila.contadores.na_janela} onSalvar={setSalvando} />
          )}
        </>
      )}

      {salvando && (
        <DialogoSalvarNaBase
          pergunta={salvando}
          onFechar={() => setSalvando(null)}
          onSalvou={(geral) => {
            setSalvando(null);
            toast({
              title: 'Salvo na base',
              description: geral
                ? 'Entrou como conhecimento geral da imobiliária — a LIA já responde com isso.'
                : 'A LIA já responde essa pergunta sozinha no empreendimento.',
            });
            qc.invalidateQueries({ queryKey: ['plantao', tenantId] });
          }}
          onErro={(m) => toast({ title: 'Não deu para salvar', description: m, variant: 'destructive' })}
        />
      )}

      <CriarLeadQuickModal
        isOpen={leadAberto !== null}
        onClose={() => setLeadAberto(null)}
        tenantId={tenantId}
        editingLead={leadAberto}
        leadType={leadAberto?.lead_type}
      />
    </div>
  );
}

// ------------------------------------------------------------

/** Pergunta sem corretor identificado não tem equipe: é da coordenação. */
const nomeDaArea = (a: Pick<AreaDoPlantao, 'nome'>) => a.nome ?? 'Sem equipe';

/** Grupo de botões do jeito de Comunicados: um escolhido por vez (aria-pressed). */
function Escolha<T extends string | null>({
  rotulo,
  opcoes,
  valor,
  onEscolher,
}: {
  rotulo: string;
  opcoes: Array<{ id: T; rotulo: string; conta?: number }>;
  valor: T;
  onEscolher: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {opcoes.map((o) => (
        <button
          key={o.id ?? 'todas'}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => onEscolher(o.id)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            valor === o.id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          {o.rotulo}
          {o.conta !== undefined && (
            <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums ${
              valor === o.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            }`}>
              {o.conta}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Os números do período e da área escolhidos. Vêm do mesmo recorte da lista,
 * no banco — a tela não soma nada, para o cartão nunca dizer 20 com a lista
 * mostrando 12.
 */
function Resumo({ fila }: { fila: FilaDoPlantao }) {
  const c = fila.contadores;
  const atrasadas = c.atrasadas ?? 0;
  const mediana = c.mediana_resposta_min ?? null;
  const semTempo = c.respostas_sem_tempo ?? 0;
  const notaDoTempo =
    mediana !== null
      ? `mediana de ${c.respostas_medidas}${semTempo > 0 ? ` · ${semTempo} sem tempo medido` : ''}`
      : semTempo > 0
        ? `${semTempo} sem tempo medido`
        : 'nada respondido no período';
  const cartoes: Array<{ rotulo: string; valor: string | number; nota?: string; alerta?: boolean }> = [
    { rotulo: 'Abertos pela LIA', valor: c.na_janela },
    {
      rotulo: 'Pendentes',
      valor: c.aguardando + c.expiradas,
      nota: atrasadas > 0 ? `${atrasadas} além de ${fila.espera_maxima_minutos} min` : 'nenhum atrasado',
      alerta: atrasadas > 0,
    },
    { rotulo: 'Respondidos', valor: c.respondidas },
    {
      rotulo: 'Tempo de resposta',
      valor: mediana === null ? '—' : duracao(mediana),
      // null é "nenhuma resposta medida", não "zero minutos". E a resposta
      // gravada junto com a pergunta não tem tempo: a nota diz quantas.
      nota: notaDoTempo,
    },
  ];
  return (
    <dl aria-label="Resumo do período" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cartoes.map((k) => (
        <div key={k.rotulo} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{k.rotulo}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{k.valor}</dd>
          {k.nota && (
            <dd className={`mt-0.5 text-xs ${k.alerta ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {k.nota}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * Até onde esta pessoa enxerga, e o que ficou de fora.
 *
 * Sem isto a lista chega curta sem explicação, e quem lê conclui que a casa
 * não trabalhou. O recorte vem do banco — a tela não o recalcula, para não
 * existirem duas respostas para "quem vê o quê".
 *
 * `sem_dono_oculto` só é maior que zero para o CORRETOR: decisão de 27/09 —
 * pergunta sem responsável é a que se perde, então todo gestor a vê.
 */
function RecorteDaFila({ fila }: { fila: FilaDoPlantao }) {
  const ocultas = fila.contadores.sem_dono_oculto;
  if (fila.recorte === 'imobiliaria' && ocultas === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {fila.recorte === 'equipe' && 'Mostrando as suas e as da sua equipe. '}
      {fila.recorte === 'proprias' && 'Mostrando só as suas. '}
      {ocultas > 0 && (
        <>
          <strong>{ocultas}</strong> do período {ocultas === 1 ? 'ficou de fora' : 'ficaram de fora'} por não
          ter corretor identificado — {ocultas === 1 ? 'ela é' : 'elas são'} de quem coordena, e seu gestor{' '}
          {ocultas === 1 ? 'a vê' : 'as vê'}.
        </>
      )}
    </p>
  );
}

function Aviso({ texto, carregando, erro }: { texto: string; carregando?: boolean; erro?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border p-4 text-sm ${
        erro ? 'border-rose-200 text-rose-700 dark:border-rose-900 dark:text-rose-300' : 'text-muted-foreground'
      }`}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {texto}
    </div>
  );
}

/** Acima disto o contexto abre cortado em 2 linhas, com "Ver mais" — como em Comunicados. */
const CONTEXTO_LONGO = 180;

/**
 * Um chamado, no desenho de Comunicados: de quem → para quem e de que área,
 * o tempo à direita, a pergunta como assunto, o contexto e as ações.
 * `atrasado` pinta a faixa à esquerda — é a urgência de Comunicados.
 */
function Chamado({
  p,
  tempo,
  atrasado,
  onAbrirLead,
  acao,
  children,
}: {
  p: PerguntaDoPlantao;
  tempo: ReactNode;
  atrasado?: boolean;
  onAbrirLead: (leadId: string) => void;
  /** A ação principal, primeira da linha de ações (ex.: Responder). */
  acao?: ReactNode;
  children?: ReactNode;
}) {
  const [expandido, setExpandido] = useState(false);
  const longo = (p.contexto?.length ?? 0) > CONTEXTO_LONGO;
  return (
    <li className="relative flex gap-3.5 px-4 py-4 sm:px-5">
      {atrasado && <span className="absolute inset-y-0 left-0 w-1 bg-rose-500" aria-hidden />}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white" aria-hidden>
        <Bot className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">LIA</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
            <span className="sr-only">para</span>
            <span className="text-slate-700 dark:text-slate-300">{quemRecebeu(p)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {nomeDaArea({ nome: p.equipe_nome ?? null })}
            </span>
          </p>
          <span className="shrink-0 pt-0.5 text-xs">{tempo}</span>
        </div>

        <h3 className="mt-1 text-[15px] font-semibold leading-6 text-slate-900 dark:text-slate-50">{p.pergunta}</h3>

        {p.contexto && (
          <p className={`mt-1 max-w-[75ch] whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-400 ${
            longo && !expandido ? 'line-clamp-2' : ''
          }`}>
            {p.contexto}
          </p>
        )}

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {p.lead_nome ?? 'lead sem nome'}
          {p.nudges > 0 && ` · ${p.nudges} lembrete${p.nudges > 1 ? 's' : ''}`}
          {p.empreendimento_nome && ` · ${p.empreendimento_nome}`}
          {p.escalada_em && (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {' · '}diretor avisado em{' '}
              {new Date(p.escalada_em).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </p>

        {children}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {acao}
          {p.lead_id && (
            <button
              type="button"
              onClick={() => onAbrirLead(p.lead_id!)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-500/60"
            >
              Abrir lead <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <OpenConversationLink phone={p.lead_telefone} contactName={p.lead_nome} className="text-xs" />
          {longo && (
            <button
              type="button"
              onClick={() => setExpandido((v) => !v)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
            >
              {expandido ? 'Ver menos' : 'Ver mais'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

const CAIXA_DA_LISTA =
  'divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900';

function ListaAguardando({
  fila,
  agora,
  onAbrirLead,
}: {
  fila: FilaDoPlantao;
  agora: number;
  onAbrirLead: (leadId: string) => void;
}) {
  if (fila.linhas.length === 0) {
    /*
     * FILA VAZIA TEM DOIS MOTIVOS, E ELES SÃO OPOSTOS.
     *
     * Esta aba dizia sempre "Ninguém esperando". Na Lotus isso é falso: a LIA
     * de lá só grava a pergunta QUANDO O CORRETOR RESPONDE, então nenhuma
     * linha nasce pendente — 11 de 11 estão como respondida, zero pendente,
     * zero expirada. A tela não vê a fila; a fila não está vazia.
     *
     * Medido em 26/09, e é a diferença entre "está tudo em dia" e "não temos
     * como saber". O gestor que lê a primeira não vai atrás de nada.
     *
     * Reconhece pelo formato do que existe: nunca houve pendente NEM expirada,
     * mas houve resposta. Uma casa em que a fila de fato esvaziou teria pelo
     * menos uma expirada no histórico, ou nada nenhum.
     */
    const naoVeAFila =
      fila.contadores.aguardando === 0 &&
      fila.contadores.expiradas === 0 &&
      fila.contadores.respondidas > 0;

    if (naoVeAFila) {
      return (
        <Aviso texto={
          'Esta tela não consegue mostrar quem está esperando agora. A LIA desta imobiliária ' +
          'registra a pergunta só no momento em que o corretor responde — por isso ' +
          `as ${fila.contadores.respondidas} do período aparecem em "Respondidas" e nenhuma passa por aqui. ` +
          'Não quer dizer que ninguém esteja esperando.'
        } />
      );
    }
    return (
      <Aviso texto="Ninguém esperando. Toda pergunta do período já foi respondida ou expirou fora dele." />
    );
  }
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Régua de {fila.espera_maxima_minutos} min
        {!fila.configurado && ' (padrão — ninguém configurou ainda)'}. Passou disso, fica em vermelho.
      </p>
      <ul className={CAIXA_DA_LISTA}>
        {fila.linhas.map((p) => {
          const espera = esperaDe(p.criado_em, fila.espera_maxima_minutos, agora);
          return (
            <Chamado
              key={p.id}
              p={p}
              atrasado={espera?.estourou}
              onAbrirLead={onAbrirLead}
              tempo={
                <span className={`inline-flex items-center gap-1 tabular-nums ${espera?.classe ?? ''}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {espera?.texto ?? 'sem data'}
                  {p.status === 'expirada' && ' · expirou'}
                </span>
              }
              acao={<ResponderAqui perguntaId={p.id} />}
            />
          );
        })}
      </ul>
    </>
  );
}

function ListaRespondidas({
  fila,
  onSalvar,
  onAbrirLead,
}: {
  fila: FilaDoPlantao;
  /** Ausente para o corretor: salvar na base ensina a LIA para a casa inteira. */
  onSalvar?: (p: PerguntaDoPlantao) => void;
  onAbrirLead: (leadId: string) => void;
}) {
  const linhas = fila.linhas;
  if (linhas.length === 0) {
    // "Nenhuma" e "nenhuma que você possa ver" levam a decisões opostas. Com
    // perguntas escondidas por falta de dono, dizer a primeira seria mentir —
    // é o mesmo erro do "Ninguém esperando" que esta tela já corrigiu.
    return fila.contadores.sem_dono_oculto > 0 ? (
      <Aviso texto={
        `Nenhuma respondida que você possa ver. ${fila.contadores.sem_dono_oculto} do período ` +
        'não têm corretor identificado, e ficam com quem coordena a equipe.'
      } />
    ) : (
      <Aviso texto="Nenhuma pergunta respondida no período." />
    );
  }
  return (
    <ul className={CAIXA_DA_LISTA}>
      {linhas.map((p) => (
        <Chamado
          key={p.id}
          p={p}
          onAbrirLead={onAbrirLead}
          tempo={
            <span className="text-slate-500 dark:text-slate-400">
              respondeu {tempoDeResposta(p) ?? ''}
            </span>
          }
          acao={<AcaoDaRespondida p={p} onSalvar={onSalvar} />}
        >
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-sm text-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
            {p.resposta}
          </p>
          <SeloDeEntrega entrega={p.entrega} />
        </Chamado>
      ))}
    </ul>
  );
}

/** A primeira ação de uma respondida: se já ensina a LIA, ou o botão que a ensina (só gestão). */
function AcaoDaRespondida({ p, onSalvar }: { p: PerguntaDoPlantao; onSalvar?: (p: PerguntaDoPlantao) => void }) {
  if (p.aprovada_para_base) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <Sparkles className="h-3 w-3" /> na base
      </span>
    );
  }
  if (!onSalvar) return null;
  if (p.fora_do_canal) {
    /* Na Japi, 331 das 1.540 respostas são só o aviso de que o corretor
       falou direto com o cliente. Não há resposta para ensinar. */
    return <span className="text-xs text-muted-foreground">resolvida fora do canal — não há resposta para salvar</span>;
  }
  return (
    <button
      onClick={() => onSalvar(p)}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-accent"
    >
      <BookPlus className="h-3.5 w-3.5" /> Salvar na base
    </button>
  );
}

function MaisPerguntadas({
  grupos,
  total,
  onSalvar,
}: {
  grupos: ReturnType<typeof agruparPorTema>;
  total: number;
  onSalvar: (p: PerguntaDoPlantao) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  if (grupos.length === 0) return <Aviso texto="Sem perguntas no período para agrupar." />;
  return (
    <>
      <p className="text-xs text-muted-foreground">
        {total} perguntas agrupadas por assunto. Salvar uma resposta na base tira o assunto inteiro
        do plantão da próxima vez.
      </p>
      <ul className="space-y-2">
        {grupos.map((g) => (
          <li key={g.tema} className="rounded-md border">
            <button
              onClick={() => setAberto(aberto === g.tema ? null : g.tema)}
              className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-accent/50"
            >
              <span className="font-medium">{g.rotulo}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {g.total} {g.total === 1 ? 'pergunta' : 'perguntas'}
                {g.naBase > 0 && ` · ${g.naBase} na base`}
              </span>
            </button>
            {aberto === g.tema && (
              <div className="border-t p-3">
                {g.ensinaveis.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nada para ensinar aqui: as respostas deste assunto já estão na base ou foram
                    resolvidas fora do canal.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {g.ensinaveis.slice(0, 20).map((p) => (
                      <li key={p.id} className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{p.pergunta}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.resposta}</p>
                        </div>
                        <button
                          onClick={() => onSalvar(p)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                        >
                          <BookPlus className="h-3.5 w-3.5" /> Salvar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * A validade é o ponto do plano: "com prompt de validade". Uma resposta de
 * plantão envelhece — condição de pagamento, promoção, horário de obra — e
 * documento vencido nunca volta na busca (regra do P2.3).
 */
function DialogoSalvarNaBase({
  pergunta,
  onFechar,
  onSalvou,
  onErro,
}: {
  pergunta: PerguntaDoPlantao;
  onFechar: () => void;
  onSalvou: (geral: boolean) => void;
  onErro: (msg: string) => void;
}) {
  const [titulo, setTitulo] = useState(pergunta.pergunta.slice(0, 120));
  const [conteudo, setConteudo] = useState(pergunta.resposta ?? '');
  const [validoAte, setValidoAte] = useState('');
  const [salvando, setSalvando] = useState(false);

  const enviar = async () => {
    setSalvando(true);
    try {
      const r = await salvarNaBase(pergunta.id, titulo, conteudo, validoAte || null);
      if (!r.ok) {
        onErro(
          r.motivo === 'conteudo_vazio' ? 'A resposta está vazia.'
          : r.motivo === 'sem_acesso' ? 'Só a gestão salva na base, e só o que ela enxerga.'
          : (r.motivo ?? 'erro')
        );
        return;
      }
      onSalvou(!!r.geral);
    } catch (e) {
      onErro((e as Error)?.message ?? 'erro inesperado');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
      <div className="w-full max-w-lg rounded-lg bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold">Salvar na base de conhecimento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {pergunta.empreendimento_nome
            ? `Entra na base de ${pergunta.empreendimento_nome}.`
            : 'Esta pergunta não está amarrada a um empreendimento, então entra como conhecimento geral da imobiliária — vale para qualquer cliente.'}
        </p>

        <label className="mt-3 block text-sm">
          Título
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} />
        </label>

        <label className="mt-3 block text-sm">
          O que a LIA vai responder
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
          />
        </label>

        <label className="mt-3 block text-sm">
          Vale até <span className="text-muted-foreground">(em branco = não vence)</span>
          <Input type="date" value={validoAte} onChange={(e) => setValidoAte(e.target.value)} />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={salvando || !conteudo.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Responder a pergunta sem sair da fila.
 *
 * Até 26/09 a tela mostrava o que a LIA não soube responder e não havia
 * NADA a fazer com aquilo: quem respondia era o corretor, no WhatsApp. O
 * gestor que estava olhando a fila e sabia a resposta não tinha por onde.
 *
 * Ao gravar, a LIA recebe `plantao.respondida` e leva a resposta ao lead na
 * voz dela — é o que fecha o ciclo que o P2.4 desenhou.
 */
function ResponderAqui({ perguntaId }: { perguntaId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');

  const responder = useMutation({
    mutationFn: () => responderPergunta(perguntaId, texto),
    onSuccess: (r) => {
      if (r.ok) {
        toast({ title: 'Respondida', description: 'A LIA leva a resposta ao lead.' });
        setAberto(false);
        setTexto('');
        qc.invalidateQueries({ queryKey: ['plantao'] });
        return;
      }
      /*
       * "Já respondida" não é erro do usuário: é outro gestor que chegou
       * antes, e o caso é comum. Mostra o que já foi dito em vez de um erro
       * seco, senão a pessoa reescreve a mesma coisa.
       */
      if (r.motivo === 'ja_respondida') {
        toast({
          title: 'Outra pessoa já respondeu',
          description: r.resposta ?? '',
        });
        setAberto(false);
        qc.invalidateQueries({ queryKey: ['plantao'] });
        return;
      }
      toast({
        title: 'Não deu para responder',
        description:
          r.motivo === 'resposta_vazia' ? 'Escreva a resposta antes de enviar.'
          : r.motivo === 'sem_acesso'   ? 'Você não tem acesso a esta pergunta.'
          : 'Tente de novo.',
        variant: 'destructive',
      });
    },
    onError: () =>
      toast({ title: 'Não deu para responder', description: 'Tente de novo.', variant: 'destructive' }),
  });

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Responder
      </button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        autoFocus
        placeholder="O que responder ao lead?"
        className="w-full rounded-md border bg-background p-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => responder.mutate()}
          disabled={responder.isPending || !texto.trim()}
          className="h-8 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {responder.isPending ? 'Enviando…' : 'Enviar ao lead'}
        </button>
        <button
          type="button"
          onClick={() => { setAberto(false); setTexto(''); }}
          className="h-8 rounded-md border px-3 text-xs hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * O que a LIA fez com a resposta que saiu daqui.
 *
 * "Respondida" na Dash NÃO quer dizer entregue ao lead: a LIA sempre devolve
 * 200 e diz o desfecho no corpo. Uma pergunta que ela devolveu como
 * `desconhecida` ficava verde nesta tela, e o gestor ia embora achando o
 * cliente atendido.
 *
 * Nulo = a resposta não saiu da Dash (veio do WhatsApp). Aí não há entrega
 * nossa para relatar, e inventar um selo aqui seria criar dúvida onde não há.
 */
function SeloDeEntrega({ entrega }: { entrega?: string | null }) {
  if (!entrega) return null;

  const selos: Record<string, { texto: string; classe: string }> = {
    entregue: {
      texto: 'a LIA levou ao lead',
      classe: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    na_fila: {
      texto: 'indo para a LIA…',
      classe: 'bg-muted text-muted-foreground',
    },
    ja_resolvida: {
      texto: 'a LIA já tinha resolvido — o lead não recebeu este texto',
      classe: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    },
    nao_achou: {
      texto: 'a LIA não encontrou esta pergunta — ninguém recebeu',
      classe: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    },
    falhou: {
      texto: 'não chegou à LIA',
      classe: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    },
  };

  const selo = selos[entrega];
  // Desfecho que a LIA passe a devolver e nós ainda não conheçamos: mostra o
  // nome cru em vez de sumir. Selo ausente leria como "entregue".
  if (!selo) {
    return (
      <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        entrega: {entrega}
      </span>
    );
  }
  return (
    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${selo.classe}`}>
      {selo.texto}
    </span>
  );
}
