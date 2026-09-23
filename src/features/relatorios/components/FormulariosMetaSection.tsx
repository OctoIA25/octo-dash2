/**
 * Marketing › Formulários da Meta (P2.7).
 *
 * A captação da Meta era toda-ou-nada por imobiliária. Em produção, UM
 * formulário responde por 119 dos 125 leads: desligar a integração para conter
 * os outros dois custaria os 119. Aqui cada formulário tem o seu interruptor.
 *
 * Todo contador vem com legenda, como o plano pede — "Sem direcionamento: 2"
 * não diz nada sozinho.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Loader2, RefreshCw } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  alternar, baixarLeads, carregarPainel, sincronizar, type FormularioDaMeta,
} from '../services/formulariosMetaService';
import {
  AVISO_DA_CAPTACAO, contadores, desde, destinoDoFormulario, motivoParaBaixar,
} from '../utils/formulariosMeta';

export function FormulariosMetaSection() {
  const { user, isGestao, isOwner } = useAuthContext();
  const tenantId = user?.tenantId;
  const { toast } = useToast();
  const qc = useQueryClient();
  const podeMexer = isGestao || isOwner;

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { data: painel, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['meta-formularios', tenantId],
    queryFn: () => carregarPainel(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const cards = useMemo(() => contadores(painel?.contadores ?? null), [painel]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ['meta-formularios', tenantId] });

  const mexer = async (formIds: string[], campo: 'captacao_ativa' | 'lia_atende', valor: boolean) => {
    if (!tenantId || formIds.length === 0) return;
    setOcupado(campo);
    try {
      await alternar(tenantId, formIds, campo, valor);
      await recarregar();
    } catch (e) {
      toast({ title: 'Não deu para salvar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const sincronizarAgora = async () => {
    if (!tenantId) return;
    setOcupado('sincronizar');
    try {
      const r = await sincronizar(tenantId);
      toast({ title: `${r.formularios} formulário(s) na lista`, description: 'Só os nomes — nenhum lead foi baixado.' });
      await recarregar();
    } catch (e) {
      toast({ title: 'Não deu para sincronizar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const baixar = async (f: FormularioDaMeta) => {
    if (!tenantId) return;
    setOcupado(`baixar:${f.form_id}`);
    try {
      const r = await baixarLeads(tenantId, f.form_id, !f.baixado_ate);
      const partes: string[] = [];
      if (r.criados) partes.push(`${r.criados} lead(s) importado(s), sem mensagem da LIA`);
      if (r.completados) partes.push(`${r.completados} com campanha completada`);
      if (r.ja_tinham) partes.push(`${r.ja_tinham} já estavam completos`);
      if (r.falhas.length) partes.push(`${r.falhas.length} falharam`);
      toast({
        title: `${r.encontrados} encontrado(s) na Meta`,
        description: partes.length ? partes.join(' · ') : 'Nada novo por lá.',
      });
      await recarregar();
    } catch (e) {
      toast({ title: 'Não deu para baixar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-4 text-sm text-muted-foreground">Escolha uma imobiliária.</p>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Formulários da Meta</h2>
          <p className="text-sm text-muted-foreground">
            Um interruptor por formulário, em vez de ligar e desligar a integração inteira.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          {podeMexer && (
            <button
              onClick={sincronizarAgora}
              disabled={ocupado === 'sincronizar'}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              {ocupado === 'sincronizar' && <Loader2 className="h-4 w-4 animate-spin" />}
              Buscar formulários na Meta
            </button>
          )}
        </div>
      </header>

      <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        {AVISO_DA_CAPTACAO}
      </p>

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {isError && (
        <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
          Não deu para ler os formulários: {(error as Error)?.message ?? 'erro desconhecido'}
        </p>
      )}

      {painel && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <div
                key={c.chave}
                className={`rounded-lg border p-3 ${
                  c.alerta ? 'border-amber-300 dark:border-amber-800' : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {c.rotulo}
                  </span>
                  {c.alerta && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
                </div>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">{c.valor}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{c.legenda}</p>
              </div>
            ))}
          </div>

          {podeMexer && selecionados.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-accent/40 p-2 text-sm">
              <span className="text-muted-foreground">{selecionados.size} selecionado(s):</span>
              {(
                [
                  ['captacao_ativa', true, 'Ligar captação'],
                  ['captacao_ativa', false, 'Desligar captação'],
                  ['lia_atende', true, 'Ligar LIA'],
                  ['lia_atende', false, 'Desligar LIA'],
                ] as const
              ).map(([campo, valor, rotulo]) => (
                <button
                  key={rotulo}
                  onClick={() => mexer([...selecionados], campo, valor)}
                  disabled={ocupado === campo}
                  className="rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}

          {painel.linhas.length === 0 ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">
              Nenhum formulário ainda. Use “Buscar formulários na Meta” — a lista vem de lá, inclusive os
              que nunca receberam lead, para dar tempo de desligar antes do primeiro.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {podeMexer && <th className="w-8 p-2" />}
                    <th className="p-2 text-left">Formulário</th>
                    <th className="p-2 text-left">Destino</th>
                    <th className="p-2 text-right">Leads</th>
                    {/* O lado da Meta, ao lado do nosso — é a conferência que
                        o chefe pediu. "—" quando o formulário nunca foi
                        sincronizado: zero diria "conferi e bate". */}
                    <th className="p-2 text-right">Na Meta</th>
                    <th className="p-2 text-right">24 h</th>
                    <th className="p-2 text-left">Último</th>
                    <th className="p-2 text-center">Captação</th>
                    <th className="p-2 text-center">LIA</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {painel.linhas.map((f) => {
                    const motivo = motivoParaBaixar(f);
                    return (
                      <tr key={f.form_id} className="border-t">
                        {podeMexer && (
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={selecionados.has(f.form_id)}
                              onChange={() =>
                                setSelecionados((antes) => {
                                  const proximo = new Set(antes);
                                  if (proximo.has(f.form_id)) proximo.delete(f.form_id);
                                  else proximo.add(f.form_id);
                                  return proximo;
                                })
                              }
                            />
                          </td>
                        )}
                        <td className="p-2">
                          {/* Sem nome é formulário que o webhook registrou antes da
                              primeira sincronização — o id é o que se tem. */}
                          <div className="font-medium">{f.nome ?? `Formulário ${f.form_id}`}</div>
                          <div className="text-[11px] text-muted-foreground">{f.form_id}</div>
                          {/* O que não migrou fica NA LINHA do formulário, e
                              não só no contador do topo: saber que 3 leads se
                              perderam não ajuda sem saber onde. */}
                          {(f.eventos_travados + f.eventos_parados) > 0 && (
                            <div className="mt-0.5 text-[11px] text-rose-700 dark:text-rose-400">
                              {f.eventos_travados + f.eventos_parados} lead(s) não migraram
                              {f.ultimo_erro ? ` · ${f.ultimo_erro}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={f.destino === 'pega_tudo' ? 'text-amber-700 dark:text-amber-400' : ''}>
                            {destinoDoFormulario(f)}
                          </span>
                        </td>
                        <td className="p-2 text-right tabular-nums">{f.leads_na_base}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {f.leads_na_meta == null ? '—' : f.leads_na_meta}
                        </td>
                        <td className="p-2 text-right tabular-nums">{f.novos_24h}</td>
                        <td className="p-2 text-[11px] text-muted-foreground">{desde(f.ultimo_lead_em)}</td>
                        <td className="p-2 text-center">
                          <Interruptor
                            ligado={f.captacao_ativa}
                            podeMexer={podeMexer}
                            onChange={(v) => mexer([f.form_id], 'captacao_ativa', v)}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Interruptor
                            ligado={f.lia_atende}
                            podeMexer={podeMexer}
                            onChange={(v) => mexer([f.form_id], 'lia_atende', v)}
                          />
                        </td>
                        <td className="p-2 text-right">
                          {podeMexer && motivo && (
                            <button
                              onClick={() => baixar(f)}
                              disabled={ocupado === `baixar:${f.form_id}`}
                              title={motivo}
                              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                            >
                              {ocupado === `baixar:${f.form_id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              Baixar leads
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Interruptor({
  ligado,
  podeMexer,
  onChange,
}: {
  ligado: boolean;
  podeMexer: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={!podeMexer}
      onClick={() => onChange(!ligado)}
      aria-pressed={ligado}
      className={`inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
        ligado ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white transition-transform ${ligado ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}
