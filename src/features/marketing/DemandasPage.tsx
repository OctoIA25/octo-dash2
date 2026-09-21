/**
 * Marketing › Demandas (P3.7).
 *
 * Seis colunas, arrastar para mover, e o histórico de cada passo — que é o
 * critério de pronto do plano. O histórico é gravado por um gatilho no banco:
 * esta tela só o lê.
 *
 * O quadro existe para acabar com o pedido de peça por WhatsApp. Por isso
 * pedir é fácil (título e prazo bastam) e o briefing completo é opcional:
 * exigir tudo de uma vez faria a pessoa desistir e voltar ao WhatsApp.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { AlertTriangle, Clock, Loader2, Paperclip, Plus, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  carregarHistorico, carregarQuadro, criarDemanda, listarMembros, moverPara,
  salvarDemanda, subirAnexo, linkDoAnexo,
} from './demandasService';
import {
  COLUNAS, PRIORIDADES, ROTULO_DO_TIPO, TIPOS, estaAtrasada, faltaParaPedir,
  pedidoParaOCaio, porColuna, textoDoPrazo,
  type Demanda, type Status, type Tipo,
} from './demandas';

const hojeIso = () => new Date().toISOString().slice(0, 10);

/**
 * Escape fecha o modal.
 *
 * Visto no navegador em 21/09: sem isto, quem abre o card fica preso — o
 * único jeito de sair é acertar o X ou o fundo. É o básico que todo diálogo
 * precisa ter, e some justamente para quem usa teclado.
 */
function useEscapeFecha(aoFechar: () => void) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);
}

export function DemandasPage() {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [aberta, setAberta] = useState<Demanda | null>(null);
  const [arrastando, setArrastando] = useState<Demanda | null>(null);

  const { data: demandas, isLoading, isError, error } = useQuery({
    queryKey: ['mkt-demandas', tenantId],
    queryFn: () => carregarQuadro(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const colunas = useMemo(() => porColuna(demandas ?? []), [demandas]);
  const hoje = hojeIso();

  // Um toque curto não pode virar arraste: no celular, rolar o quadro
  // levantaria o card a cada gesto.
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const aoSoltar = async (e: DragEndEvent) => {
    setArrastando(null);
    const alvo = e.over?.id ? String(e.over.id) : null;
    const d = (demandas ?? []).find((x) => x.id === String(e.active.id));
    if (!d || !alvo || d.status === alvo) return;
    try {
      await moverPara(tenantId!, d, alvo as Status, 0);
      await qc.invalidateQueries({ queryKey: ['mkt-demandas', tenantId] });
    } catch (err) {
      // A política do banco recusa quem não pediu nem é responsável. A tela
      // diz isso em vez de deixar o card voltar sozinho sem explicação.
      toast({
        title: 'Não deu para mover',
        description: (err as Error).message.includes('policy')
          ? 'Só quem pediu, quem é responsável ou a gestão pode mover esta demanda.'
          : (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária.</p>;
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Demandas de marketing</h1>
          <p className="text-sm text-muted-foreground">
            Quem precisa de uma peça pede aqui. O quadro mostra em que pé está cada uma.
          </p>
        </div>
        <button
          onClick={() => setNovaAberta(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova demanda
        </button>
      </header>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {isError && (
        <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
          Não deu para ler o quadro: {(error as Error)?.message}
        </p>
      )}

      <DndContext
        sensors={sensores}
        onDragStart={(e) => setArrastando((demandas ?? []).find((d) => d.id === String(e.active.id)) ?? null)}
        onDragEnd={aoSoltar}
        onDragCancel={() => setArrastando(null)}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {COLUNAS.map((c) => (
            <Coluna
              key={c.id}
              id={c.id}
              rotulo={c.rotulo}
              demandas={colunas[c.id]}
              hoje={hoje}
              aoAbrir={setAberta}
            />
          ))}
        </div>
        <DragOverlay>
          {arrastando && <Card d={arrastando} hoje={hoje} arrastavel={false} />}
        </DragOverlay>
      </DndContext>

      {novaAberta && (
        <Formulario
          tenantId={tenantId}
          aoFechar={() => setNovaAberta(false)}
          aoSalvar={async (d) => {
            await criarDemanda(tenantId, d as Parameters<typeof criarDemanda>[1]);
            await qc.invalidateQueries({ queryKey: ['mkt-demandas', tenantId] });
            setNovaAberta(false);
            toast({ title: 'Demanda criada', description: 'Ela entrou em Solicitado.' });
          }}
        />
      )}

      {aberta && (
        <Detalhe
          tenantId={tenantId}
          demanda={aberta}
          aoFechar={() => setAberta(null)}
          aoMudar={async () => {
            await qc.invalidateQueries({ queryKey: ['mkt-demandas', tenantId] });
          }}
        />
      )}
    </div>
  );
}

function Coluna({
  id,
  rotulo,
  demandas,
  hoje,
  aoAbrir,
}: {
  id: Status;
  rotulo: string;
  demandas: Demanda[];
  hoje: string;
  aoAbrir: (d: Demanda) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const atrasadas = demandas.filter((d) => estaAtrasada(d, hoje)).length;

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-lg border ${isOver ? 'border-primary bg-primary/5' : 'bg-muted/20'}`}
    >
      <div className="flex items-baseline justify-between border-b px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {demandas.length}
          {atrasadas > 0 && <span className="ml-1 text-rose-600 dark:text-rose-400">· {atrasadas} atrasada{atrasadas > 1 ? 's' : ''}</span>}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {demandas.map((d) => (
          <Card key={d.id} d={d} hoje={hoje} aoAbrir={aoAbrir} />
        ))}
        {demandas.length === 0 && (
          <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">Nada aqui.</p>
        )}
      </div>
    </div>
  );
}

function Card({
  d,
  hoje,
  aoAbrir,
  arrastavel = true,
}: {
  d: Demanda;
  hoje: string;
  aoAbrir?: (d: Demanda) => void;
  arrastavel?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: d.id, disabled: !arrastavel });
  const atrasada = estaAtrasada(d, hoje);

  return (
    <div
      ref={setNodeRef}
      {...(arrastavel ? { ...listeners, ...attributes } : {})}
      onClick={() => aoAbrir?.(d)}
      className={`cursor-grab rounded-md border bg-background p-2.5 text-xs shadow-sm hover:border-primary ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <p className="font-medium leading-snug">{d.titulo}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">{ROTULO_DO_TIPO[d.tipo]}</span>
        {d.empreendimento && <span className="truncate">{d.empreendimento}</span>}
        {d.prioridade === 'alta' && <span className="text-rose-600 dark:text-rose-400">alta</span>}
      </p>
      <p className={`mt-1 flex items-center gap-1 text-[11px] ${
        atrasada ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
      }`}>
        {atrasada ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
        {textoDoPrazo(d, hoje)}
        {d.responsavel && <span className="ml-auto truncate">{d.responsavel}</span>}
      </p>
      {d.anexos.length > 0 && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Paperclip className="h-3 w-3" /> {d.anexos.length}
        </p>
      )}
    </div>
  );
}

/** O briefing. Título e prazo bastam para pedir; o resto ajuda quem produz. */
function Formulario({
  tenantId,
  aoFechar,
  aoSalvar,
}: {
  tenantId: string;
  aoFechar: () => void;
  aoSalvar: (d: Partial<Demanda> & { titulo: string; prazo: string }) => Promise<void>;
}) {
  const navigate = useNavigate();
  useEscapeFecha(aoFechar);
  const [d, setD] = useState<Partial<Demanda>>({ tipo: 'post', prioridade: 'media' });
  const [salvando, setSalvando] = useState(false);
  const { data: membros } = useQuery({
    queryKey: ['mkt-membros', tenantId],
    queryFn: () => listarMembros(tenantId),
    enabled: !!tenantId,
  });

  const faltas = faltaParaPedir(d);

  const campo = (k: keyof Demanda, rotulo: string, placeholder = '') => (
    <label className="block">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <input
        value={(d[k] as string) ?? ''}
        onChange={(e) => setD({ ...d, [k]: e.target.value })}
        placeholder={placeholder}
        className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={aoFechar}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Nova demanda</h2>
          <button onClick={aoFechar} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-2.5">
          {campo('titulo', 'Título *', 'Post do lançamento Gioviale')}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <select
                value={d.tipo ?? 'post'}
                onChange={(e) => setD({ ...d, tipo: e.target.value as Tipo })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm"
              >
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Prazo *</span>
              <input
                type="date"
                value={d.prazo ?? ''}
                onChange={(e) => setD({ ...d, prazo: e.target.value })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">Prioridade</span>
              <select
                value={d.prioridade ?? 'media'}
                onChange={(e) => setD({ ...d, prioridade: e.target.value as Demanda['prioridade'] })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm"
              >
                {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Responsável</span>
              <select
                value={d.responsavel_id ?? ''}
                onChange={(e) => setD({ ...d, responsavel_id: e.target.value || null })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">— ainda não —</option>
                {(membros ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </label>
          </div>
          {campo('objetivo', 'Objetivo', 'Gerar visitas ao plantão')}
          {campo('publico', 'Público', 'Famílias de Jundiaí, 30 a 45 anos')}
          {campo('formato', 'Formato', '1080x1080, story 9:16')}
          <label className="block">
            <span className="text-xs text-muted-foreground">Texto base</span>
            <textarea
              value={d.texto_base ?? ''}
              onChange={(e) => setD({ ...d, texto_base: e.target.value })}
              rows={3}
              className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>

          {/* O botão abre o chat do Caio com o pedido escrito — decidido com o
              chefe. Chamar o n8n direto dependeria de mudança do lado de lá. */}
          <button
            type="button"
            onClick={() => {
              const texto = pedidoParaOCaio(d);
              navigate(`/agentes-ia/agente-marketing?pergunta=${encodeURIComponent(texto)}`);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
          >
            <Sparkles className="h-3.5 w-3.5" /> Gerar rascunho com o Caio
          </button>
          <p className="text-[11px] text-muted-foreground">
            Abre o chat do Caio com o pedido já escrito, a partir do que você preencheu.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {faltas.length > 0 ? `Falta ${faltas.join(' e ')}.` : 'Pronto para pedir.'}
          </span>
          <div className="flex gap-2">
            <button onClick={aoFechar} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
              Cancelar
            </button>
            <button
              disabled={faltas.length > 0 || salvando}
              onClick={async () => {
                setSalvando(true);
                try {
                  await aoSalvar(d as Partial<Demanda> & { titulo: string; prazo: string });
                } finally {
                  setSalvando(false);
                }
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {salvando ? 'Criando…' : 'Criar demanda'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A demanda aberta: briefing, anexos e o histórico de cada passo. */
function Detalhe({
  tenantId,
  demanda,
  aoFechar,
  aoMudar,
}: {
  tenantId: string;
  demanda: Demanda;
  aoFechar: () => void;
  aoMudar: () => Promise<void>;
}) {
  const { toast } = useToast();
  useEscapeFecha(aoFechar);
  const [subindo, setSubindo] = useState(false);
  const { data: historico } = useQuery({
    queryKey: ['mkt-historico', tenantId, demanda.id],
    queryFn: () => carregarHistorico(tenantId, demanda.id),
  });

  const anexar = async (arquivo: File) => {
    setSubindo(true);
    try {
      const a = await subirAnexo(tenantId, demanda.id, arquivo);
      await salvarDemanda(tenantId, demanda, { anexos: [...demanda.anexos, a] });
      await aoMudar();
      toast({ title: 'Anexo enviado' });
    } catch (e) {
      toast({ title: 'Não deu para anexar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSubindo(false);
    }
  };

  const abrirAnexo = async (caminho: string) => {
    const url = await linkDoAnexo(caminho);
    if (url) window.open(url, '_blank', 'noopener');
    else toast({ title: 'Não deu para abrir o anexo', variant: 'destructive' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={aoFechar}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{demanda.titulo}</h2>
            <p className="text-xs text-muted-foreground">
              {ROTULO_DO_TIPO[demanda.tipo]}
              {demanda.empreendimento && ` · ${demanda.empreendimento}`}
              {demanda.solicitante && ` · pedida por ${demanda.solicitante}`}
            </p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>

        <dl className="space-y-1.5 text-xs">
          {demanda.objetivo && <Linha rotulo="Objetivo" valor={demanda.objetivo} />}
          {demanda.publico && <Linha rotulo="Público" valor={demanda.publico} />}
          {demanda.formato && <Linha rotulo="Formato" valor={demanda.formato} />}
          {demanda.texto_base && <Linha rotulo="Texto base" valor={demanda.texto_base} />}
          <Linha rotulo="Prazo" valor={textoDoPrazo(demanda, hojeIso())} />
        </dl>

        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Anexos</p>
          {demanda.anexos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum.</p>}
          <ul className="mt-1 space-y-1">
            {demanda.anexos.map((a) => (
              <li key={a.caminho}>
                <button
                  onClick={() => abrirAnexo(a.caminho)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> {a.nome}
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent">
            <Paperclip className="h-3.5 w-3.5" />
            {subindo ? 'Enviando…' : 'Anexar arquivo'}
            <input
              type="file"
              className="hidden"
              disabled={subindo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) anexar(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* O histórico que o critério de pronto do plano pede. Gravado por
            gatilho no banco: esta tela só lê. */}
        <div className="mt-4 border-t pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Histórico</p>
          <ol className="mt-1 space-y-1">
            {(historico ?? []).map((h, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="tabular-nums">{new Date(h.em).toLocaleString('pt-BR')}</span>
                {' — '}
                {h.de ? `${h.de} → ${h.para}` : `criada em ${h.para}`}
                {h.por && ` · ${h.por}`}
              </li>
            ))}
            {(historico ?? []).length === 0 && (
              <li className="text-xs text-muted-foreground">Sem passos registrados.</li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{rotulo}:</dt>
      <dd className="whitespace-pre-wrap">{valor}</dd>
    </div>
  );
}
