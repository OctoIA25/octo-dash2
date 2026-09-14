/**
 * Aba "Rascunhos": cadastros de imóvel salvos incompletos (status `rascunho`),
 * que ainda não entraram no fluxo de aprovação.
 *
 * Quem vê cada rascunho é o mesmo gate de edição do resto do cadastro
 * (`podeEditarImovel`): corretor vê os próprios, gestor os da atuação/equipe,
 * administrador todos. Como a RLS é por tenant, o filtro é de UI — igual ao
 * botão "Editar imóvel" do modal de detalhes.
 *
 * "Continuar cadastro" abre o próprio CriarImovelForm (como MeusImoveisTab):
 * lá o rascunho é salvo, publicado ou excluído, então a lista recarrega
 * sempre que o formulário fecha.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { FilePen, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  excluirRascunho,
  listarRascunhos,
  nomesDosAutores,
  type RascunhoImovel,
} from '@/features/imoveis/services/rascunhosService';
import { podeEditarImovel } from '@/features/imoveis/utils/podeEditarImovel';
import { buildEditDataFromLocal } from '@/features/imoveis/utils/buildEditDataFromLocal';
import { mapCaptadoresPorId, useCaptadores } from '@/features/imoveis/hooks/useCaptadores';
import { CriarImovelForm } from './CriarImovelForm';

export interface RascunhosTabProps {
  equipeUserIds?: string[];
  equipeEmails?: string[];
  onPublicado?: () => void;
}

const formatar = (iso: string | null | undefined, padrao: string) => {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), padrao);
  } catch {
    return '—';
  }
};
const dataCurta = (iso?: string | null) => formatar(iso, 'dd/MM/yyyy');
const dataHora = (iso?: string | null) => formatar(iso, "dd/MM/yyyy 'às' HH:mm");

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const RascunhosTab = ({ equipeUserIds, equipeEmails, onPublicado }: RascunhosTabProps) => {
  const { user, tenantId, isOwner } = useAuthContext();
  // Owner sem impersonation fica no tenant 'owner': não há cadastro para listar.
  const podeUsar = Boolean(tenantId && tenantId !== 'owner');

  const { data: captadores = [] } = useCaptadores(podeUsar ? tenantId : undefined);
  const nomePorId = useMemo(() => mapCaptadoresPorId(captadores), [captadores]);

  const [rascunhos, setRascunhos] = useState<RascunhoImovel[]>([]);
  const [nomesAutores, setNomesAutores] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Em estado (não derivado a cada render): o formulário re-hidrata quando initialData muda.
  const [editando, setEditando] = useState<ReturnType<typeof buildEditDataFromLocal> | null>(null);
  const [excluindo, setExcluindo] = useState<RascunhoImovel | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!podeUsar || !tenantId) return;
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarRascunhos(tenantId);
      setRascunhos(lista);
      setNomesAutores(await nomesDosAutores(tenantId, lista.map((r) => r.criado_por ?? '')));
    } catch (e) {
      setErro(mensagemDe(e));
      toast.error('Não foi possível carregar os rascunhos', { description: mensagemDe(e) });
    } finally {
      setCarregando(false);
    }
  }, [podeUsar, tenantId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const visiveis = useMemo(
    () =>
      rascunhos.filter((r) =>
        podeEditarImovel({
          temRegistroLocal: true,
          isPlatformOwner: isOwner,
          systemRole: user?.systemRole,
          userId: user?.id,
          userEmail: user?.email,
          // ponytail: sem captadorEmail — rascunho não está no XML, o elo é só por id.
          captadorId: r.captador_id,
          captador2Id: r.captador_2_id,
          criadoPor: r.criado_por,
          finalidade: r.finalidade,
          permissions: user?.permissions,
          equipeUserIds,
          equipeEmails,
        }),
      ),
    [rascunhos, isOwner, user?.systemRole, user?.id, user?.email, user?.permissions, equipeUserIds, equipeEmails],
  );

  const confirmarExclusao = async () => {
    if (!tenantId || !excluindo) return;
    setSalvando(true);
    try {
      await excluirRascunho(tenantId, excluindo.codigo_imovel);
      toast.success('Rascunho excluído', { description: excluindo.codigo_imovel });
    } catch (e) {
      // O motivo mais comum é o rascunho já ter sido publicado/excluído em outra aba: recarregar mostra o estado real.
      toast.error('Não foi possível excluir o rascunho', { description: mensagemDe(e) });
    } finally {
      setSalvando(false);
      setExcluindo(null);
    }
    await carregar();
  };

  if (!podeUsar) {
    return (
      <div className="text-center py-12 text-text-secondary">
        Selecione uma imobiliária para ver os rascunhos de imóvel.
      </div>
    );
  }

  const acoes = (r: RascunhoImovel) => (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() => setEditando(buildEditDataFromLocal(r))}
        aria-label={`Continuar cadastro do rascunho ${r.codigo_imovel}`}
      >
        <FilePen className="h-4 w-4 mr-2" aria-hidden="true" />
        Continuar cadastro
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-red-600 hover:text-red-700"
        onClick={() => setExcluindo(r)}
        aria-label={`Excluir rascunho ${r.codigo_imovel}`}
      >
        <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
        Excluir rascunho
      </Button>
    </div>
  );

  const titulo = (r: RascunhoImovel) => r.titulo?.trim() || 'Sem título';
  const responsavel = (r: RascunhoImovel) =>
    (r.criado_por && (nomesAutores[r.criado_por] || nomePorId[r.criado_por])) || '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <FilePen className="h-6 w-6 text-amber-500" aria-hidden="true" />
            Rascunhos
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Cadastros salvos incompletos. Eles não aparecem no catálogo nem nos portais até serem publicados.
          </p>
        </div>
        <Button variant="outline" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 mr-2 ${carregando ? 'animate-spin' : ''}`} aria-hidden="true" />
          Atualizar
        </Button>
      </div>

      {carregando ? (
        <div className="text-center py-12 text-text-secondary">Carregando rascunhos...</div>
      ) : erro ? (
        <div className="text-center py-12 text-red-600">Não foi possível carregar a lista: {erro}</div>
      ) : visiveis.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card/40">
          <FilePen className="h-10 w-10 mx-auto text-text-secondary mb-3" aria-hidden="true" />
          <p className="text-text-primary font-medium">Nenhum rascunho</p>
          <p className="text-sm text-text-secondary mt-1">Cadastros salvos como rascunho aparecem aqui.</p>
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Título</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Cidade</th>
                  <th className="px-3 py-2 font-medium">Responsável</th>
                  <th className="px-3 py-2 font-medium">Criado em</th>
                  <th className="px-3 py-2 font-medium">Última alteração</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <tr key={r.id} className="border-t border-border align-middle">
                    <td className="px-3 py-2 font-mono font-semibold text-text-primary whitespace-nowrap">{r.codigo_imovel}</td>
                    <td className="px-3 py-2 text-text-primary">{titulo(r)}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{r.tipo || '—'}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{r.cidade || '—'}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{responsavel(r)}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{dataCurta(r.created_at)}</td>
                    <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{dataHora(r.updated_at)}</td>
                    <td className="px-3 py-2"><Badge variant="secondary">Rascunho</Badge></td>
                    <td className="px-3 py-2">{acoes(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3">
            {visiveis.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-text-primary">{r.codigo_imovel}</p>
                    <p className="text-text-primary truncate">{titulo(r)}</p>
                  </div>
                  <Badge variant="secondary">Rascunho</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-text-secondary">Tipo</dt>
                  <dd className="text-text-primary">{r.tipo || '—'}</dd>
                  <dt className="text-text-secondary">Cidade</dt>
                  <dd className="text-text-primary">{r.cidade || '—'}</dd>
                  <dt className="text-text-secondary">Responsável</dt>
                  <dd className="text-text-primary">{responsavel(r)}</dd>
                  <dt className="text-text-secondary">Criado em</dt>
                  <dd className="text-text-primary">{dataCurta(r.created_at)}</dd>
                  <dt className="text-text-secondary">Última alteração</dt>
                  <dd className="text-text-primary">{dataHora(r.updated_at)}</dd>
                </dl>
                {acoes(r)}
              </li>
            ))}
          </ul>
        </>
      )}

      <CriarImovelForm
        isOpen={Boolean(editando)}
        onClose={() => {
          setEditando(null);
          void carregar();
        }}
        onSuccess={() => {
          // Publicou ou excluiu: o catálogo da página também muda.
          onPublicado?.();
          void carregar();
        }}
        initialData={editando ?? undefined}
        isEdit
      />

      <AlertDialog open={Boolean(excluindo)} onOpenChange={(aberto) => { if (!aberto && !salvando) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rascunho?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir este rascunho{excluindo ? ` (${excluindo.codigo_imovel})` : ''}? As informações preenchidas
              serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={salvando}
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); void confirmarExclusao(); }}
            >
              {salvando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo…</> : 'Excluir rascunho'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
