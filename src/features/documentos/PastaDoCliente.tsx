/**
 * Pasta do cliente (P4.7) — a aba Documentos da proposta.
 *
 * O QUE ESTAVA AQUI ANTES: dois checklists que pintavam de verde pelo índice
 * da lista contra um booleano da etapa. "Documentos do vendedor" ficava verde
 * porque a proposta foi enviada ao proponente, não porque algum documento
 * existisse. Nenhum arquivo era olhado; nenhum arquivo era guardado.
 *
 * O QUE A TELA FAZ AGORA: mostra o que existe de verdade no bucket privado, o
 * que falta, e abre cada documento para conferência com a imagem ao lado.
 *
 * A REGRA 1 APARECE EM LETRA, o tempo todo: enquanto uma pessoa não confirmar,
 * o campo lido pela LIA é chamado de sugestão e o documento é chamado de "falta
 * conferir". Um número lido por máquina que a tela apresenta como fato é a
 * forma mais silenciosa de errar o cadastro de alguém.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Check, Clock3, FileText, Loader2, Sparkles, Upload,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { avisoDaPasta, comoFoiLido, ROTULO_DO_STATUS, resumoDaPasta } from './documentos';
import {
  carregarPasta, carregarTipos, enviarDocumento,
  type DocumentoDaPasta, type TipoNaPasta,
} from './documentosService';
import { ConferenciaDeDocumento } from './ConferenciaDeDocumento';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

interface Props {
  tenantId: string;
  leadId: string | null | undefined;
  proposalId?: string | null;
}

export function PastaDoCliente({ tenantId, leadId, proposalId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [conferindo, setConferindo] = useState<string | null>(null);
  const [enviandoTipo, setEnviandoTipo] = useState<string | null>(null);

  const habilitado = !!tenantId && tenantId !== 'owner' && !!leadId;

  const pasta = useQuery({
    queryKey: ['pasta-cliente', tenantId, leadId],
    queryFn: () => carregarPasta(tenantId, leadId!),
    enabled: habilitado,
  });
  const tipos = useQuery({
    queryKey: ['documento-tipos'],
    queryFn: carregarTipos,
    enabled: habilitado,
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ['pasta-cliente'] });

  const enviar = useMutation({
    mutationFn: ({ tipo, arquivo }: { tipo: string; arquivo: File }) =>
      enviarDocumento(tenantId, leadId!, tipo, arquivo, proposalId),
    onSuccess: () => {
      toast({
        title: 'Documento enviado',
        description: 'Ele entra como “aguardando conferência”. Nada vai para o cadastro antes de alguém confirmar.',
      });
      recarregar();
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Não deu para enviar', description: e.message }),
    onSettled: () => setEnviandoTipo(null),
  });

  // A proposta de rascunho ainda não tem lead: sem ele não há pasta, e dizer
  // isso é melhor que mostrar uma lista vazia que parece um cliente sem
  // documento nenhum.
  if (!leadId) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Esta proposta ainda não está ligada a um lead, então não há pasta de cliente para mostrar.
      </p>
    );
  }

  if (pasta.isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando a pasta…</p>;
  }

  // A função devolve nulo quando recusa. Sem este aviso a tela mostraria uma
  // pasta vazia a quem simplesmente não tem acesso a ela.
  if (pasta.isSuccess && pasta.data === null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>Documento pessoal é do cliente.</strong> Vê quem administra a imobiliária ou o
        corretor responsável por este lead — e a sua conta não é nenhum dos dois.
      </p>
    );
  }

  const aviso = avisoDaPasta(pasta.data);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{resumoDaPasta(pasta.data)}</p>
        {aviso && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {aviso}
          </p>
        )}
      </div>

      <ul className="divide-y rounded-lg border">
        {(pasta.data?.tipos ?? []).map((t) => (
          <LinhaDoTipo
            key={t.tipo}
            t={t}
            enviando={enviandoTipo === t.tipo && enviar.isPending}
            aoEscolher={(arquivo) => { setEnviandoTipo(t.tipo); enviar.mutate({ tipo: t.tipo, arquivo }); }}
            aoAbrir={setConferindo}
          />
        ))}
      </ul>

      {tipos.isSuccess && (tipos.data ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhum tipo de documento cadastrado — fale com quem administra a conta.
        </p>
      )}

      {conferindo && (
        <ConferenciaDeDocumento
          documentoId={conferindo}
          onFechar={() => setConferindo(null)}
          onMudou={recarregar}
        />
      )}
    </div>
  );
}

function LinhaDoTipo({
  t, enviando, aoEscolher, aoAbrir,
}: {
  t: TipoNaPasta;
  enviando: boolean;
  aoEscolher: (arquivo: File) => void;
  aoAbrir: (documentoId: string) => void;
}) {
  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            t.conferidos > 0
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
          }`}>
            {t.conferidos > 0 ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
          </span>
          <span className="font-medium">{t.nome}</span>
          {t.falta && <span className="text-xs text-muted-foreground">— falta</span>}
        </span>

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent">
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Enviar
          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) aoEscolher(f); }} />
        </label>
      </div>

      {(t.documentos ?? []).length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {t.documentos.map((d) => (
            <li key={d.id}>
              <button onClick={() => aoAbrir(d.id)}
                className="flex w-full flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.arquivo_nome || 'arquivo'}</span>
                <SeloDoStatus d={d} />
              </button>
              {comoFoiLido(d) && (
                <p className="mt-0.5 flex items-center gap-1 pl-2 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 shrink-0" /> {comoFoiLido(d)}
                </p>
              )}
              {d.status === 'recusado' && d.motivo_recusa && (
                <p className="mt-0.5 pl-2 text-[11px] text-red-600">Recusado: {d.motivo_recusa}</p>
              )}
              {d.status === 'conferido' && (
                <p className="mt-0.5 pl-2 text-[11px] text-muted-foreground">
                  Conferido em {dataBR(d.conferido_em)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SeloDoStatus({ d }: { d: DocumentoDaPasta }) {
  const cor = {
    conferido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    recusado: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    lido: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    enviado: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }[d.status];

  return (
    <span className="flex shrink-0 items-center gap-1">
      {d.alertas > 0 && d.status !== 'conferido' && (
        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" /> {d.alertas}
        </span>
      )}
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cor}`}>
        {ROTULO_DO_STATUS[d.status]}
      </span>
    </span>
  );
}
