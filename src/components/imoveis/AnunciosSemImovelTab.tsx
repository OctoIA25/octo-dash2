/**
 * Aba "Anúncios sem imóvel": todo anúncio de portal que mandou lead e não bate
 * com imóvel nenhum, de uma vez, com os leads que vieram por ele.
 *
 * POR QUE UMA ABA E NÃO O BOTÃO DO BOLSÃO
 * O "Identificar" do card só aparece para lead que está no Bolsão. Medido em
 * 14/set na Lótus: dos 21 leads de anúncio desconhecido do ZAP, 11 não tinham
 * card lá, e 4 anúncios inteiros não tinham nenhum — não havia onde amarrá-los.
 *
 * A amarração é a mesma do servidor (`amarrarAnuncio`): grava o de-para (lead
 * novo já entra certo) e troca o código de todos os leads do anúncio. A escolha
 * é só da lista — o servidor recusa código que não existe no cadastro.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, HelpCircle, Link2, Loader2, RefreshCw } from 'lucide-react';
import { linkDoAnuncioNoPortal } from '@/features/leads/utils/anuncioDoPortal';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ComboBox } from '@/components/ui/combobox';
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
  amarrarAnuncio,
  fetchAnunciosPendentes,
  fetchOpcoesDeAmarracao,
  type AnuncioPendente,
} from '@/features/leads/services/anunciosPendentesService';
import type { OpcaoDeAmarracao } from '@/features/leads/utils/opcoesDeAmarracao';

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function AnunciosSemImovelTab() {
  const { tenantId, isGestao } = useAuthContext();

  const [anuncios, setAnuncios] = useState<AnuncioPendente[]>([]);
  const [opcoes, setOpcoes] = useState<OpcaoDeAmarracao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Escolha por anúncio: cada bloco tem o seu campo.
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<AnuncioPendente | null>(null);
  const [salvando, setSalvando] = useState(false);

  const podeUsar = Boolean(tenantId && tenantId !== 'owner' && isGestao);

  const carregar = useCallback(async () => {
    if (!podeUsar || !tenantId) return;
    setCarregando(true);
    setErro(null);
    const [lista, opcoesDoCadastro] = await Promise.all([
      fetchAnunciosPendentes(tenantId),
      fetchOpcoesDeAmarracao(tenantId),
    ]);
    if (lista.error) setErro(lista.error);
    setAnuncios(lista.anuncios);
    setOpcoes(opcoesDoCadastro);
    setCarregando(false);
  }, [podeUsar, tenantId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const rotuloPorCodigo = useMemo(() => new Map(opcoes.map((o) => [o.value, o.label])), [opcoes]);

  const copiarId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Id copiado', { description: `${id} — cole na busca do Canal Pro` });
    } catch {
      toast.error('Não foi possível copiar', { description: id });
    }
  };

  const confirmar = async () => {
    if (!tenantId || !confirmando) return;
    const codigo = escolhas[confirmando.originListingId];
    if (!codigo) return;
    setSalvando(true);
    try {
      const r = await amarrarAnuncio(tenantId, confirmando.originListingId, codigo);
      if (!r.ok) {
        toast.error('Não foi possível amarrar', { description: r.error || 'tente de novo' });
        return;
      }
      toast.success('Anúncio amarrado', {
        description: `${rotuloPorCodigo.get(codigo) ?? codigo} · ${r.leadsAtualizados ?? 0} lead(s) atualizado(s)`,
      });
      setConfirmando(null);
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  if (!podeUsar) {
    return (
      <div className="text-center py-12 text-text-secondary">
        Só a gestão pode identificar anúncios.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-amber-500" />
            Anúncios sem imóvel
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Anúncios de portal que mandaram lead e não batem com nenhum imóvel. Ao amarrar, todos os leads
            do anúncio recebem o imóvel, e os próximos já chegam certos.
          </p>
        </div>
        <Button variant="outline" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 mr-2 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {carregando ? (
        <div className="text-center py-12 text-text-secondary">Carregando anúncios...</div>
      ) : erro ? (
        <div className="text-center py-12 text-red-600">Não foi possível carregar a lista: {erro}</div>
      ) : anuncios.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card/40">
          <Link2 className="h-10 w-10 mx-auto text-text-secondary mb-3" />
          <p className="text-text-primary font-medium">Nenhum anúncio pendente</p>
          <p className="text-sm text-text-secondary mt-1">Todo lead de portal chegou com imóvel identificado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {anuncios.map((anuncio) => {
            const escolhido = escolhas[anuncio.originListingId] ?? '';
            const link = linkDoAnuncioNoPortal(anuncio.portal, anuncio.originListingId);
            return (
              <div key={anuncio.originListingId} className="rounded-xl border border-border bg-card p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1 text-sm">
                    <p className="text-text-primary">
                      <span className="font-semibold">{anuncio.portal ?? 'Portal'}</span>
                      <span className="text-text-secondary"> · anúncio </span>
                      <span className="font-mono font-semibold">{anuncio.originListingId}</span>
                      {anuncio.codigoNoPortal && (
                        <>
                          <span className="text-text-secondary"> · chegou como </span>
                          <span className="font-mono">{anuncio.codigoNoPortal}</span>
                        </>
                      )}
                    </p>
                    <p className="text-text-secondary">
                      {anuncio.totalLeads} lead(s) · último em {dataHora(anuncio.ultimoLeadEm)}
                    </p>
                    {anuncio.dica && <p className="text-text-secondary">Pista: “{anuncio.dica}”</p>}
                  </div>
                  <div className="flex gap-2">
                    {link && (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ver no ZAP
                        </a>
                      </Button>
                    )}
                    {/* Anúncio desativado some do site; o id ainda acha no Canal Pro. */}
                    <Button variant="outline" size="sm" onClick={() => void copiarId(anuncio.originListingId)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar id
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-text-secondary">
                      <tr>
                        <th className="px-3 py-2 font-medium">Lead</th>
                        <th className="px-3 py-2 font-medium">Chegou em</th>
                        <th className="px-3 py-2 font-medium">Corretor</th>
                        <th className="px-3 py-2 font-medium">Etapa</th>
                        <th className="px-3 py-2 font-medium">Mensagem do portal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anuncio.leads.map((lead) => (
                        <tr key={lead.id} className="border-t border-border align-top">
                          <td className="px-3 py-2 text-text-primary whitespace-nowrap">{lead.nome || '—'}</td>
                          <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{dataHora(lead.criadoEm)}</td>
                          <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{lead.corretor || '—'}</td>
                          <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                            {lead.arquivado ? 'Arquivado' : lead.status || '—'}
                          </td>
                          <td className="px-3 py-2 text-text-secondary min-w-[18rem] whitespace-pre-line">
                            {lead.mensagem || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <ComboBox
                    className="sm:max-w-md"
                    options={opcoes}
                    value={escolhido}
                    onChange={(valor) => setEscolhas((atual) => ({ ...atual, [anuncio.originListingId]: valor }))}
                    placeholder="Busque o imóvel ou lançamento"
                    emptyText="Nada no cadastro com esse nome"
                    disabled={salvando}
                  />
                  <Button onClick={() => setConfirmando(anuncio)} disabled={!escolhido || salvando}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Amarrar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={Boolean(confirmando)} onOpenChange={(aberto) => { if (!aberto && !salvando) setConfirmando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Amarrar este anúncio?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmando && (
                <>
                  {confirmando.totalLeads} lead(s) do anúncio {confirmando.originListingId} vão receber{' '}
                  <strong>{rotuloPorCodigo.get(escolhas[confirmando.originListingId]) ?? escolhas[confirmando.originListingId]}</strong>,
                  e os próximos leads dele já chegam com esse imóvel.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={salvando}
              onClick={(e) => { e.preventDefault(); void confirmar(); }}
            >
              {salvando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gravando…</> : 'Amarrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
