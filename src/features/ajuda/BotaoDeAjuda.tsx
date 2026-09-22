/**
 * O (?) que o plano pede em cada tela (P4.9).
 *
 * "Botão (?) em cada tela abre o artigo daquela tela." Montado uma vez só, ao
 * lado do botão de suporte, porque ele já aparece em toda a Dash — espalhar um
 * (?) por página seria trinta pontos para manter e vinte e oito para esquecer.
 *
 * Qual artigo abrir sai da ROTA (ver `moduloDaRota`). E quando não há artigo
 * para a tela, o botão não finge: diz que não há e oferece perguntar, que é a
 * saída que a ajuda tem.
 */

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle, Loader2, MessageSquare, X } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { moduloDaRota, nadaEncontrado } from './ajuda';
import { buscarAjuda, perguntar } from './ajudaService';

export function BotaoDeAjuda() {
  const { tenantId } = useAuthContext();
  const { toast } = useToast();
  const location = useLocation();
  const [aberto, setAberto] = useState(false);
  const [pergunta, setPergunta] = useState('');
  const [enviando, setEnviando] = useState(false);

  const modulo = moduloDaRota(location.pathname);
  const habilitado = !!tenantId && tenantId !== 'owner';

  const artigos = useQuery({
    queryKey: ['ajuda-da-tela', tenantId, modulo],
    queryFn: () => buscarAjuda(tenantId!, undefined, modulo),
    // Só busca quando abre: o (?) está em toda tela, e buscar sempre seria uma
    // consulta a cada navegação para uma gaveta que quase nunca é aberta.
    enabled: habilitado && aberto,
  });

  if (!habilitado) return null;

  return (
    <>
      <div className="fixed bottom-6 right-24 z-40">
        <button
          onClick={() => setAberto(true)}
          aria-label="Ajuda desta tela"
          title="Ajuda desta tela"
          className="rounded-full bg-white p-4 text-slate-700 shadow-lg transition-all hover:shadow-xl dark:bg-slate-800 dark:text-slate-200">
          <HelpCircle className="h-6 w-6" />
        </button>
      </div>

      {aberto && (
        <Gaveta
          modulo={modulo}
          carregando={artigos.isLoading}
          artigos={artigos.data ?? []}
          pergunta={pergunta}
          enviando={enviando}
          onPergunta={setPergunta}
          onFechar={() => setAberto(false)}
          onEnviar={async () => {
            setEnviando(true);
            try {
              await perguntar(tenantId, pergunta, modulo, location.pathname);
              toast({
                title: 'Dúvida enviada',
                description: 'Ela chega a quem administra e aparece em Ajuda › Minhas dúvidas.',
              });
              setPergunta('');
              setAberto(false);
            } catch (e) {
              toast({ variant: 'destructive', title: 'Não deu para enviar',
                description: (e as Error).message });
            } finally { setEnviando(false); }
          }}
        />
      )}
    </>
  );
}

function Gaveta({
  modulo, carregando, artigos, pergunta, enviando, onPergunta, onFechar, onEnviar,
}: {
  modulo: string;
  carregando: boolean;
  artigos: Array<{ id: string; titulo: string; texto: string; tipo: string }>;
  pergunta: string;
  enviando: boolean;
  onPergunta: (v: string) => void;
  onFechar: () => void;
  onEnviar: () => void;
}) {
  useEscapeFecha(onFechar);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-4 sm:p-6"
      onClick={onFechar} role="presentation">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label="Ajuda desta tela">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <HelpCircle className="h-4 w-4" /> Ajuda desta tela
            <span className="text-[11px] font-normal text-muted-foreground">({modulo})</span>
          </h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1.5 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {carregando && <p className="text-xs text-muted-foreground">Procurando…</p>}

          {!carregando && artigos.length === 0 && (
            <p className="text-sm text-muted-foreground">{nadaEncontrado('')}</p>
          )}

          <ul className="space-y-3">
            {artigos.map((a) => (
              <li key={a.id}>
                <p className="text-sm font-medium">{a.titulo}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{a.texto}</p>
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t p-3">
          <textarea value={pergunta} onChange={(e) => onPergunta(e.target.value)} rows={2}
            placeholder="Não achou? Pergunte à administração…"
            className="w-full rounded-md border bg-background p-2 text-sm" />
          <button onClick={onEnviar} disabled={enviando || pergunta.trim().length < 5}
            className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
            Perguntar
          </button>
          {/* A pergunta leva a tela junto: metade da dúvida é o contexto. */}
          <p className="mt-1 text-center text-[10px] text-muted-foreground">
            A tela em que você está vai junto com a pergunta.
          </p>
        </footer>
      </div>
    </div>
  );
}
