/**
 * Ajuda: manual + FAQ (P4.9).
 *
 * O item inteiro cabe numa frase do plano: "uma dúvida respondida vira FAQ
 * pesquisável". É o que a tela faz — e o que ela protege é o contrário disso:
 * a resposta que fica só no e-mail de quem perguntou, e a próxima pessoa
 * perguntando de novo.
 *
 * Por isso a busca lê o manual e o FAQ JUNTOS: quem procura não sabe (nem
 * quer saber) se o que ele quer está num artigo ou numa pergunta já respondida.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Check, HelpCircle, Loader2, MessageSquare, Plus, Search, Send, Bug,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { duvidasAbertas, nadaEncontrado, previa, ROTULO_DA_DUVIDA, separarPorTipo } from './ajuda';
import {
  buscarAjuda, filaDeDuvidas, minhasDuvidas, perguntar, problemasReportados,
  publicarNoFaq, responder, salvarArtigo,
  type Artigo, type Duvida,
} from './ajudaService';

type Aba = 'ajuda' | 'minhas' | 'fila' | 'problemas';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

export function AjudaPage() {
  const { tenantId } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [aba, setAba] = useState<Aba>('ajuda');
  const [termo, setTermo] = useState('');
  const [perguntando, setPerguntando] = useState(false);
  const [escrevendo, setEscrevendo] = useState(false);

  const habilitado = !!tenantId && tenantId !== 'owner';

  const artigos = useQuery({
    queryKey: ['ajuda', tenantId, termo],
    queryFn: () => buscarAjuda(tenantId!, termo),
    enabled: habilitado,
  });
  const minhas = useQuery({
    queryKey: ['ajuda-minhas', tenantId],
    queryFn: () => minhasDuvidas(tenantId!),
    enabled: habilitado,
  });
  // A fila e os problemas são de quem administra: a função devolve nulo para
  // os outros, e é assim que a tela sabe quais abas mostrar.
  const fila = useQuery({
    queryKey: ['ajuda-fila', tenantId],
    queryFn: () => filaDeDuvidas(tenantId!),
    enabled: habilitado,
  });
  const problemas = useQuery({
    queryKey: ['ajuda-problemas', tenantId],
    queryFn: () => problemasReportados(tenantId!),
    enabled: habilitado,
  });

  const administra = fila.isSuccess && fila.data !== null;
  const { manual, faq } = useMemo(() => separarPorTipo(artigos.data), [artigos.data]);

  if (!habilitado) {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária para abrir a ajuda.</p>;
  }

  const abas: Array<[Aba, string, number]> = [
    ['ajuda', 'Manual e FAQ', 0],
    ['minhas', 'Minhas dúvidas', duvidasAbertas(minhas.data)],
    ...(administra
      ? ([
          ['fila', 'Dúvidas da equipe', duvidasAbertas(fila.data)],
          ['problemas', 'Problemas reportados', (problemas.data ?? []).length],
        ] as Array<[Aba, string, number]>)
      : []),
  ];

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ajuda</h1>
          <p className="text-xs text-muted-foreground">
            O manual e as perguntas já respondidas, na mesma busca. Não achou? Pergunte —
            a resposta fica aqui para a próxima pessoa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {administra && (
            <button onClick={() => setEscrevendo(true)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
              <Plus className="h-3.5 w-3.5" /> Novo artigo
            </button>
          )}
          <button onClick={() => setPerguntando(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
            <MessageSquare className="h-3.5 w-3.5" /> Perguntar à administração
          </button>
        </div>
      </header>

      <nav className="mb-4 flex flex-wrap gap-1 border-b">
        {abas.map(([id, rotulo, n]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm ${
              aba === id ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {rotulo}
            {n > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {n}
              </span>
            )}
          </button>
        ))}
      </nav>

      {aba === 'ajuda' && (
        <>
          <label className="mb-3 flex items-center gap-2 rounded-md border px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input value={termo} onChange={(e) => setTermo(e.target.value)}
              placeholder="O que você quer saber?"
              className="h-9 w-full bg-transparent text-sm outline-none" />
          </label>

          {artigos.isLoading && <p className="text-xs text-muted-foreground">Procurando…</p>}

          {artigos.isSuccess && manual.length === 0 && faq.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {nadaEncontrado(termo)}
            </p>
          )}

          <ListaDeArtigos titulo="Manual" icone={BookOpen} artigos={manual} />
          <ListaDeArtigos titulo="Perguntas frequentes" icone={HelpCircle} artigos={faq} />
        </>
      )}

      {aba === 'minhas' && <MinhasDuvidas duvidas={minhas.data ?? []} />}

      {aba === 'fila' && (
        <FilaDeDuvidas
          duvidas={fila.data ?? []}
          aoResponder={async (id, texto) => {
            await responder(id, texto);
            qc.invalidateQueries({ queryKey: ['ajuda-fila'] });
            qc.invalidateQueries({ queryKey: ['ajuda'] });
          }}
          aoPublicar={async (id) => {
            const r = await publicarNoFaq(id);
            toast({
              title: r.ja_publicada ? 'Já estava no FAQ' : 'Publicado no FAQ',
              description: 'Quem procurar por isso vai achar sozinho.',
            });
            qc.invalidateQueries({ queryKey: ['ajuda-fila'] });
            qc.invalidateQueries({ queryKey: ['ajuda'] });
          }}
        />
      )}

      {aba === 'problemas' && <Problemas itens={problemas.data ?? []} />}

      {perguntando && (
        <PerguntarModal
          onFechar={() => setPerguntando(false)}
          onEnviar={async (texto) => {
            await perguntar(tenantId, texto, 'geral', '/ajuda');
            toast({ title: 'Dúvida enviada', description: 'Ela aparece em “Minhas dúvidas” até ser respondida.' });
            setPerguntando(false);
            qc.invalidateQueries({ queryKey: ['ajuda-minhas'] });
            qc.invalidateQueries({ queryKey: ['ajuda-fila'] });
          }}
        />
      )}

      {escrevendo && (
        <ArtigoModal
          onFechar={() => setEscrevendo(false)}
          onSalvar={async (a) => {
            await salvarArtigo(tenantId, a);
            toast({ title: 'Artigo salvo' });
            setEscrevendo(false);
            qc.invalidateQueries({ queryKey: ['ajuda'] });
          }}
        />
      )}
    </div>
  );
}

function ListaDeArtigos({
  titulo, icone: Icone, artigos,
}: { titulo: string; icone: typeof BookOpen; artigos: Artigo[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  if (artigos.length === 0) return null;

  return (
    <section className="mb-4">
      <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        <Icone className="h-4 w-4" /> {titulo}
      </h2>
      <ul className="divide-y rounded-lg border">
        {artigos.map((a) => (
          <li key={a.id}>
            <button onClick={() => setAberto(aberto === a.id ? null : a.id)}
              className="w-full px-3 py-2 text-left hover:bg-accent">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{a.titulo}</span>
                <span className="text-[10px] text-muted-foreground">{a.modulo}</span>
                {a.da_plataforma && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    manual da plataforma
                  </span>
                )}
              </span>
              {aberto !== a.id && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{previa(a.texto)}</span>
              )}
            </button>
            {aberto === a.id && (
              <p className="whitespace-pre-wrap px-3 pb-3 text-sm text-muted-foreground">{a.texto}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MinhasDuvidas({ duvidas }: { duvidas: Duvida[] }) {
  if (duvidas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Você ainda não perguntou nada.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {duvidas.map((d) => (
        <li key={d.id} className="px-3 py-2.5">
          <p className="text-sm font-medium">{d.pergunta}</p>
          <p className="text-[11px] text-muted-foreground">
            {dataBR(d.perguntou_em)} · {ROTULO_DA_DUVIDA[d.status]}
          </p>
          {d.resposta && (
            <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">{d.resposta}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function FilaDeDuvidas({
  duvidas, aoResponder, aoPublicar,
}: {
  duvidas: Duvida[];
  aoResponder: (id: string, texto: string) => Promise<void>;
  aoPublicar: (id: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  if (duvidas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Ninguém perguntou nada ainda.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {duvidas.map((d) => (
        <li key={d.id} className={`px-3 py-3 ${d.status === 'aberta' ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
          <p className="text-sm font-medium">{d.pergunta}</p>
          <p className="text-[11px] text-muted-foreground">
            {d.perguntou_email} · {dataBR(d.perguntou_em)}
            {/* De qual tela veio: metade da dúvida é o contexto. */}
            {d.tela ? ` · de ${d.tela}` : ''} · {ROTULO_DA_DUVIDA[d.status]}
          </p>

          <textarea
            value={textos[d.id] ?? d.resposta}
            onChange={(e) => setTextos((p) => ({ ...p, [d.id]: e.target.value }))}
            rows={3} placeholder="Responda aqui…"
            className="mt-2 w-full rounded-md border bg-background p-2 text-sm" />

          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                setSalvando(d.id);
                try {
                  await aoResponder(d.id, textos[d.id] ?? d.resposta);
                  toast({ title: 'Resposta salva' });
                } catch (e) {
                  toast({ variant: 'destructive', title: 'Não deu para responder',
                    description: (e as Error).message });
                } finally { setSalvando(null); }
              }}
              disabled={salvando === d.id || !(textos[d.id] ?? d.resposta).trim()}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">
              {salvando === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Salvar resposta
            </button>

            {/* O critério de pronto do item mora neste botão. */}
            <button
              onClick={async () => {
                try { await aoPublicar(d.id); }
                catch (e) {
                  toast({ variant: 'destructive', title: 'Não deu para publicar',
                    description: (e as Error).message });
                }
              }}
              disabled={!d.resposta.trim()}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
              title={d.resposta.trim() ? 'Vira pergunta frequente, achável por quem procurar'
                                       : 'Responda antes de publicar'}>
              <HelpCircle className="h-3 w-3" />
              {d.status === 'publicada' ? 'Já está no FAQ' : 'Publicar no FAQ'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Problemas({ itens }: { itens: Array<{ id: string; titulo: string; descricao: string; url: string; quando: string; quem: string | null; prioridade: string }> }) {
  if (itens.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nada reportado ainda. O botão de suporte, no canto da tela, é por onde as pessoas reportam.
      </p>
    );
  }
  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">
        O que as pessoas mandaram pelo botão “Reportar um problema”. Até setembro de 2026 isto
        era gravado e nunca lido por ninguém.
      </p>
      <ul className="divide-y rounded-lg border">
        {itens.map((p) => (
          <li key={p.id} className="px-3 py-2.5">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <Bug className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {p.titulo}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {p.prioridade}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {p.quem ?? 'autor desconhecido'} · {dataBR(p.quando)}
              {p.url ? ` · em ${p.url}` : ''}
            </p>
            {p.descricao && <p className="mt-1 whitespace-pre-wrap text-xs">{p.descricao}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function PerguntarModal({
  onFechar, onEnviar,
}: { onFechar: () => void; onEnviar: (texto: string) => Promise<void> }) {
  const { toast } = useToast();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar} role="presentation">
      <div className="w-full max-w-lg rounded-xl bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label="Perguntar à administração">
        <h2 className="text-sm font-semibold">Perguntar à administração</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A resposta chega para você — e, quando servir para os outros, vira uma pergunta
          frequente aqui.
        </p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
          placeholder="O que você quer saber?"
          className="mt-2 w-full rounded-md border bg-background p-2 text-sm" />
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Cancelar
          </button>
          <button
            onClick={async () => {
              setEnviando(true);
              try { await onEnviar(texto); }
              catch (e) {
                toast({ variant: 'destructive', title: 'Não deu para enviar',
                  description: (e as Error).message });
              } finally { setEnviando(false); }
            }}
            disabled={enviando || texto.trim().length < 5}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

function ArtigoModal({
  onFechar, onSalvar,
}: {
  onFechar: () => void;
  onSalvar: (a: { titulo: string; texto: string; modulo: string }) => Promise<void>;
}) {
  const { toast } = useToast();
  const [titulo, setTitulo] = useState('');
  const [modulo, setModulo] = useState('geral');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar} role="presentation">
      <div className="w-full max-w-2xl rounded-xl bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Novo artigo">
        <h2 className="text-sm font-semibold">Novo artigo do manual</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título"
            className="h-8 rounded-md border bg-background px-2 text-sm sm:col-span-2" />
          <input value={modulo} onChange={(e) => setModulo(e.target.value)} placeholder="Tela (ex.: leads)"
            className="h-8 rounded-md border bg-background px-2 text-sm" />
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10}
          placeholder="O texto do artigo…"
          className="mt-2 w-full rounded-md border bg-background p-2 text-sm" />
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Cancelar
          </button>
          <button
            onClick={async () => {
              setSalvando(true);
              try { await onSalvar({ titulo, texto, modulo }); }
              catch (e) {
                toast({ variant: 'destructive', title: 'Não deu para salvar',
                  description: (e as Error).message });
              } finally { setSalvando(false); }
            }}
            disabled={salvando || titulo.trim().length < 3}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
