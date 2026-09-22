/**
 * A tela de conferência (P4.7, Regra 1).
 *
 * "A IA nunca grava direto: sugere, uma pessoa confere COM A IMAGEM AO LADO e
 * confirma." O lado a lado não é estética — é o que torna a conferência
 * possível. Campos sem o documento visível viram um formulário que a pessoa
 * aprova no automático, e aí a leitura da máquina passa a valer sem ninguém ter
 * olhado.
 *
 * O botão diz "Confirmar" e não "Salvar" de propósito: o que se faz aqui é
 * assumir a responsabilidade pelo que está escrito, e o banco grava quem foi.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { useToast } from '@/hooks/use-toast';
import {
  camposParaConfirmar, comoFoiLido, confiancaEmTexto, faltaPreencher, valorInicial,
} from './documentos';
import {
  abrirDocumento, confirmarDocumento, recusarDocumento, verDocumento,
  type CampoDoDocumento,
} from './documentosService';

interface Props {
  documentoId: string;
  onFechar: () => void;
  onMudou: () => void;
}

export function ConferenciaDeDocumento({ documentoId, onFechar, onMudou }: Props) {
  const { toast } = useToast();
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [url, setUrl] = useState<string | null>(null);
  const [erroDoArquivo, setErroDoArquivo] = useState(false);

  useEscapeFecha(onFechar);

  const doc = useQuery({
    queryKey: ['documento', documentoId],
    queryFn: () => abrirDocumento(documentoId),
  });

  // O endereço é assinado e dura 5 minutos (bucket privado, Regra 5). Buscado
  // ao abrir, não ao montar a lista: assinar tudo de uma vez espalharia
  // endereços válidos de documentos que ninguém chegou a abrir.
  useEffect(() => {
    let vivo = true;
    if (!doc.data?.arquivo) return;
    verDocumento(doc.data.arquivo)
      .then((u) => { if (vivo) setUrl(u); })
      .catch(() => { if (vivo) setErroDoArquivo(true); });
    return () => { vivo = false; };
  }, [doc.data?.arquivo]);

  const campos = doc.data?.campos ?? [];
  const pendentes = useMemo(() => faltaPreencher(campos, edicoes), [campos, edicoes]);
  const jaConferido = doc.data?.status === 'conferido';

  const confirmar = useMutation({
    mutationFn: () => confirmarDocumento(documentoId, camposParaConfirmar(campos, edicoes)),
    onSuccess: (r) => {
      if (!r.confirmado) {
        // O banco recusou o lote inteiro. Mostrar os motivos é o que permite
        // corrigir; um "não foi possível salvar" mandaria a pessoa adivinhar.
        toast({
          variant: 'destructive',
          title: 'Ainda não dá para confirmar',
          description: (r.erros ?? []).map((e) => e.mensagem).join(' · '),
        });
        doc.refetch();
        return;
      }
      toast({ title: 'Documento conferido', description: 'Agora ele vale como dado do cliente.' });
      onMudou();
      onFechar();
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Não deu para confirmar', description: e.message }),
  });

  const recusar = useMutation({
    mutationFn: (motivo: string) => recusarDocumento(documentoId, motivo),
    onSuccess: () => { onMudou(); onFechar(); },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Não deu para recusar', description: e.message }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar} role="presentation">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label="Conferência de documento">

        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {doc.data?.arquivo_nome || 'Documento'}
            </h2>
            {comoFoiLido(doc.data ?? { status: 'enviado', lido_por: null }) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 shrink-0" />
                {comoFoiLido(doc.data!)}
              </p>
            )}
          </div>
          <button onClick={onFechar} aria-label="Fechar"
            className="rounded-md p-1.5 hover:bg-accent"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
          {/* A IMAGEM, à esquerda. Sem ela a conferência é aprovação no escuro. */}
          <div className="min-h-[240px] overflow-auto border-b bg-muted/40 md:border-b-0 md:border-r">
            {erroDoArquivo ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                Não deu para abrir o arquivo. Sem vê-lo não há como conferir —
                tente de novo ou recuse o documento.
              </p>
            ) : !url ? (
              <p className="p-6 text-center text-xs text-muted-foreground">Abrindo o documento…</p>
            ) : /\.pdf($|\?)/i.test(doc.data?.arquivo ?? '') ? (
              <object data={url} type="application/pdf" className="h-full min-h-[420px] w-full">
                <p className="p-6 text-center text-xs">
                  <a href={url} target="_blank" rel="noreferrer" className="underline">
                    Abrir o PDF numa aba
                  </a>
                </p>
              </object>
            ) : (
              <img src={url} alt="Documento enviado" className="w-full" />
            )}
          </div>

          {/* OS CAMPOS, à direita. */}
          <div className="min-h-0 overflow-auto p-4">
            {doc.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

            {jaConferido && (
              <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                Já conferido. Reabrir não desfaz nada — confirmar de novo grava por cima.
              </p>
            )}

            <div className="space-y-3">
              {campos.map((c) => (
                <CampoDeConferencia key={c.campo} c={c}
                  valor={edicoes[c.campo] ?? valorInicial(c)}
                  aoMudar={(v) => setEdicoes((p) => ({ ...p, [c.campo]: v }))} />
              ))}
            </div>

            {campos.length === 0 && !doc.isLoading && (
              <p className="text-xs text-muted-foreground">
                Este tipo não tem campos cadastrados para conferência.
              </p>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <button
            onClick={() => {
              const motivo = window.prompt('Por que este documento está sendo recusado?');
              if (motivo?.trim()) recusar.mutate(motivo.trim());
            }}
            disabled={recusar.isPending}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            Recusar
          </button>

          <div className="flex items-center gap-3">
            {pendentes.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Falta preencher: {pendentes.join(', ')}
              </span>
            )}
            <button
              onClick={() => confirmar.mutate()}
              disabled={confirmar.isPending || pendentes.length > 0 || campos.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {confirmar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Confirmar
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function CampoDeConferencia({
  c, valor, aoMudar,
}: {
  c: CampoDoDocumento;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const conf = confiancaEmTexto(c.confianca);
  const ruim = c.validacao === 'erro';
  const duvidoso = c.validacao === 'alerta';

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">
          {c.rotulo}
          {c.obrigatorio && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {/* A confiança fica visível: é o que diz à pessoa onde olhar com calma. */}
        {conf && !c.valor_final && (
          <span className={duvidoso ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>
            leitura {conf}
          </span>
        )}
      </span>

      <input
        type={c.formato === 'data' ? 'date' : 'text'}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className={`mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm ${
          ruim ? 'border-red-400' : duvidoso ? 'border-amber-400' : ''
        }`}
      />

      {c.mensagem && (
        <span className={`mt-1 flex items-start gap-1 text-[11px] ${
          ruim ? 'text-red-600' : 'text-amber-700 dark:text-amber-400'
        }`}>
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {c.mensagem}
        </span>
      )}
    </label>
  );
}
