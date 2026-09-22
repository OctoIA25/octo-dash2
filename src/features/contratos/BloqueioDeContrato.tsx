/**
 * O bloqueio por contrato pendente (P4.3).
 *
 * É A PRIMEIRA TELA DO SISTEMA QUE IMPEDE O USO DA DASH. Até aqui, o único
 * portão era o login. Um defeito neste arquivo tranca a equipe inteira para
 * fora do CRM — por isso ele é curto, a decisão de bloquear mora numa função
 * pura e testada (`deveBloquear`), e tudo FALHA ABRINDO.
 *
 * As três travas, decididas com o chefe em 21/09:
 *   1. erro na consulta não bloqueia ninguém;
 *   2. administrador e dono da plataforma nunca são bloqueados — se fossem,
 *      um contrato atribuído por engano trancaria também quem o desfaria;
 *   3. documento que exige assinatura eletrônica não bloqueia, porque a
 *      integração não existe e a pessoa ficaria presa sem saída.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, FileSignature, Loader2, LogOut } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  contratosComFirma, contratosParaAceitar, deveBloquear, type ContratoPendente,
} from './contratos';
import {
  aceitarContrato, carregarPendentes, gerarPdfDoContrato, registrarPdf, subirPdfNoPerfil,
} from './contratosService';

/**
 * Envolve a Dash. Devolve as crianças quando não há nada a bloquear — que é
 * o caminho de todo mundo, quase sempre.
 */
export function BloqueioDeContrato({ children }: { children: React.ReactNode }) {
  const { user, isOwner, tenantId } = useAuthContext();

  const pendentes = useQuery({
    queryKey: ['contratos-pendentes', user?.id, tenantId],
    queryFn: carregarPendentes,
    enabled: !!user?.id,
    // Sem repetição automática: se falhou, a Dash abre. Tentar de novo só
    // adiaria a abertura de quem não tem contrato nenhum.
    retry: false,
    staleTime: 60_000,
  });

  const bloquear = useMemo(
    () => deveBloquear({
      // `isLoading` conta como "ainda não sei": não bloqueia.
      pendentes: pendentes.isSuccess ? pendentes.data : undefined,
      systemRole: user?.systemRole,
      isOwner,
    }),
    [pendentes.isSuccess, pendentes.data, user?.systemRole, isOwner]
  );

  if (!bloquear) return <>{children}</>;

  return <TelaDeAceite pendentes={pendentes.data ?? []} aoAceitarTudo={() => pendentes.refetch()} />;
}

function TelaDeAceite({
  pendentes, aoAceitarTudo,
}: {
  pendentes: ContratoPendente[];
  aoAceitarTudo: () => void;
}) {
  const { user, tenantId, logout } = useAuthContext();
  const { toast } = useToast();

  const paraAceitar = contratosParaAceitar(pendentes);
  const comFirma = contratosComFirma(pendentes);

  const [indice, setIndice] = useState(0);
  const [rolouAteOFim, setRolouAteOFim] = useState(false);
  const [concordou, setConcordou] = useState(false);
  const [aceitando, setAceitando] = useState(false);

  const atual = paraAceitar[indice];

  const aceitar = async () => {
    if (!atual) return;
    setAceitando(true);
    try {
      const r = await aceitarContrato(atual.id);

      // O PDF é a cópia legível do registro. Se falhar, o aceite continua
      // valendo — por isso ele não derruba o fluxo.
      try {
        const pdf = await gerarPdfDoContrato({
          titulo: atual.titulo, corpo: atual.corpo, versao: atual.versao,
          hash: r.hash, aceito_em: r.aceito_em, ip: null,
          nomeDaPessoa: user?.name || user?.email || '',
        });
        const caminho = await subirPdfNoPerfil(atual.tenant_id, user!.id, pdf, atual.titulo);
        await registrarPdf(atual.id, caminho);
      } catch (e) {
        console.error('Aceite registrado, mas o PDF não foi salvo:', e);
      }

      if (indice + 1 < paraAceitar.length) {
        setIndice(indice + 1);
        setRolouAteOFim(false);
        setConcordou(false);
      } else {
        toast({ title: 'Tudo aceito', description: 'Obrigado — a Dash já está liberada.' });
        aoAceitarTudo();
      }
    } catch (e) {
      toast({ title: 'Não deu para aceitar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setAceitando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-lg border bg-background shadow-lg">
        <header className="border-b p-5">
          <div className="flex items-start gap-3">
            <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold">
                {paraAceitar.length === 1
                  ? 'Você tem 1 documento para aceitar'
                  : `Você tem ${paraAceitar.length} documentos para aceitar`}
              </h1>
              <p className="text-xs text-muted-foreground">
                A Dash fica disponível assim que você aceitar. Leia com calma — o aceite fica
                registrado com data, hora e origem.
              </p>
            </div>
          </div>

          {paraAceitar.length > 1 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Documento {indice + 1} de {paraAceitar.length}
            </p>
          )}
        </header>

        {atual && (
          <>
            <div className="border-b px-5 py-3">
              <h2 className="font-medium">{atual.titulo}</h2>
              {atual.versao > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  Versão {atual.versao} — o texto mudou desde a anterior.
                </p>
              )}
            </div>

            <div
              className="flex-1 overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-relaxed"
              // Medir ao montar: um documento curto cabe na tela, nenhuma
              // rolagem acontece, e sem isto o botão ficaria travado para
              // sempre — a pessoa presa fora da Dash sem saída.
              ref={(el) => {
                if (el && el.scrollHeight <= el.clientHeight + 24) setRolouAteOFim(true);
              }}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setRolouAteOFim(true);
              }}
            >
              {atual.corpo}
            </div>

            <footer className="border-t p-4">
              {comFirma.length > 0 && (
                <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Há também {comFirma.length} documento(s) que exigem <strong>assinatura
                    eletrônica</strong>. Eles não se aceitam por aqui e não impedem o uso da Dash —
                    o Jurídico vai enviar por fora.
                  </span>
                </p>
              )}

              <label className="mb-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={concordou}
                  disabled={!rolouAteOFim}
                  onChange={(e) => setConcordou(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className={rolouAteOFim ? '' : 'text-muted-foreground'}>
                  Li e concordo com o documento acima.
                  {!rolouAteOFim && ' (role o texto até o fim para liberar)'}
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => logout?.()}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sair da conta
                </button>
                <button
                  onClick={aceitar}
                  disabled={!concordou || aceitando}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {aceitando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Aceitar
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
