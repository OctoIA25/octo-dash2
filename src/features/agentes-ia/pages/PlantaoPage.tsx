/**
 * LIA › Plantão (P2.4). Rota: /agentes-ia/plantao
 *
 * Quando a LIA não sabe responder, ela pergunta ao corretor. Isso já acontece
 * há meses — 1.540 perguntas em produção — mas só existia no WhatsApp dela: o
 * gestor não via a fila, e nada do que o corretor respondeu voltava para a base.
 *
 * As três abas são as três perguntas do gestor:
 *   Aguardando      — quem está esperando agora, e há quanto tempo
 *   Respondidas     — o que foi respondido, e o que já virou conhecimento
 *   Mais perguntadas— o que a LIA pergunta toda semana e devia saber sozinha
 *
 * O relógio anda no navegador (30 s), como no Painel de Distribuição do P1.3.
 */

import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookPlus, Clock, Loader2, MessageSquare, RefreshCw, Sparkles } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  carregarFila, salvarNaBase, type AbaDoPlantao, type FilaDoPlantao,
} from '../services/plantaoService';
import {
  agruparPorTema, esperaDe, quemRecebeu, tempoDeResposta,
  type PerguntaDoPlantao,
} from '../utils/plantao';

const ABAS: Array<{ id: AbaDoPlantao; rotulo: string; conta: (f: FilaDoPlantao) => number }> = [
  { id: 'aguardando', rotulo: 'Aguardando', conta: (f) => f.contadores.aguardando + f.contadores.expiradas },
  { id: 'respondidas', rotulo: 'Respondidas', conta: (f) => f.contadores.respondidas },
  { id: 'mais', rotulo: 'Mais perguntadas', conta: (f) => f.contadores.por_aprender },
];

export function PlantaoPage() {
  const { user, isGestao, isOwner } = useAuthContext();
  const tenantId = user?.tenantId;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [aba, setAba] = useState<AbaDoPlantao>('aguardando');
  const [agora, setAgora] = useState(() => Date.now());
  const [salvando, setSalvando] = useState<PerguntaDoPlantao | null>(null);

  // O relógio da aba Aguardando precisa andar sozinho; nas outras não há relógio.
  useEffect(() => {
    if (aba !== 'aguardando') return;
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [aba]);

  const { data: fila, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['plantao', tenantId, aba],
    queryFn: () => carregarFila(tenantId!, aba),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const grupos = useMemo(
    () => (aba === 'mais' && fila ? agruparPorTema(fila.linhas) : []),
    [aba, fila]
  );

  // Mesmo portão da Telemetria: a fila expõe o nome de cada lead e a resposta
  // de cada colega da imobiliária inteira.
  if (!isGestao && !isOwner) return <Navigate to="/agentes-ia/agente-marketing" replace />;

  if (!tenantId || tenantId === 'owner') {
    return <Aviso texto="Escolha uma imobiliária para ver o plantão." />;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MessageSquare className="h-5 w-5 text-primary" />
            Plantão da LIA
          </h1>
          <p className="text-sm text-muted-foreground">
            O que a LIA não soube responder e mandou para um corretor. Últimos {fila?.dias ?? 90} dias.
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
            {fila && (
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                {a.conta(fila)}
              </span>
            )}
          </button>
        ))}
      </nav>

      {isLoading && <Aviso texto="Carregando o plantão…" carregando />}
      {isError && (
        <Aviso texto={`Não deu para ler o plantão: ${(error as Error)?.message ?? 'erro desconhecido'}`} erro />
      )}

      {fila && !isLoading && !isError && (
        <>
          {aba === 'aguardando' && (
            <ListaAguardando fila={fila} agora={agora} />
          )}
          {aba === 'respondidas' && (
            <ListaRespondidas linhas={fila.linhas} onSalvar={setSalvando} />
          )}
          {aba === 'mais' && (
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
    </div>
  );
}

// ------------------------------------------------------------

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

function ListaAguardando({ fila, agora }: { fila: FilaDoPlantao; agora: number }) {
  if (fila.linhas.length === 0) {
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
      <ul className="space-y-2">
        {fila.linhas.map((p) => {
          const espera = esperaDe(p.criado_em, fila.espera_maxima_minutos, agora);
          return (
            <li key={p.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{p.pergunta}</span>
                <span className={`inline-flex items-center gap-1 text-sm tabular-nums ${espera?.classe ?? ''}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {espera?.texto ?? 'sem data'}
                  {p.status === 'expirada' && ' · expirou'}
                </span>
              </div>
              {p.contexto && <p className="mt-1 text-sm text-muted-foreground">{p.contexto}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {p.lead_nome ?? 'lead sem nome'} · com {quemRecebeu(p)}
                {p.nudges > 0 && ` · ${p.nudges} lembrete${p.nudges > 1 ? 's' : ''}`}
                {p.empreendimento_nome && ` · ${p.empreendimento_nome}`}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ListaRespondidas({
  linhas,
  onSalvar,
}: {
  linhas: PerguntaDoPlantao[];
  onSalvar: (p: PerguntaDoPlantao) => void;
}) {
  if (linhas.length === 0) return <Aviso texto="Nenhuma pergunta respondida no período." />;
  return (
    <ul className="space-y-2">
      {linhas.map((p) => (
        <li key={p.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{p.pergunta}</span>
            <span className="text-xs text-muted-foreground">
              {quemRecebeu(p)} respondeu {tempoDeResposta(p) ?? ''}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{p.resposta}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {p.aprovada_para_base ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Sparkles className="h-3 w-3" /> na base
              </span>
            ) : p.fora_do_canal ? (
              /* 331 das 1.540 respostas reais são só o aviso de que o corretor
                 falou direto com o cliente. Não há resposta para ensinar. */
              <span className="text-xs text-muted-foreground">
                resolvida fora do canal — não há resposta para salvar
              </span>
            ) : (
              <button
                onClick={() => onSalvar(p)}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
              >
                <BookPlus className="h-3.5 w-3.5" /> Salvar na base
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
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
        onErro(r.motivo === 'conteudo_vazio' ? 'A resposta está vazia.' : (r.motivo ?? 'erro'));
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
