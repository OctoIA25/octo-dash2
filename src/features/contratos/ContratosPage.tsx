/**
 * Jurídico › Contratos do corretor (P4.3).
 *
 * Modelo com variáveis, atribuição por pessoa / cargo / todos, e o relatório de
 * quem aceitou.
 *
 * A atribuição SIMULA antes de criar, e essa é a decisão que mais muda a tela:
 * medido em produção em 21/09, o CPF está preenchido em 0 de 126 membros, o
 * CRECI em 10 e o nível em 15. Atribuir às cegas criaria contrato com lacuna
 * para quase todo mundo — e um contrato com lacuna só aparece como problema
 * depois do aceite, quando já não dá para desfazer.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Check, FileSignature, Loader2, Plus, Send, Users, X,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { useToast } from '@/hooks/use-toast';
import { carregarCargos } from '@/features/cargos/cargosService';
import {
  VALORES_DE_EXEMPLO, VARIAVEIS_DO_MODELO, avisoDeQuemFalta, preencherPrevia,
  variaveisDesconhecidas, variaveisUsadas,
  type ModeloDeContrato, type ResultadoDaAtribuicao,
} from './contratos';
import {
  atribuir, cancelarAtribuicao, carregarModelos, carregarRelatorio, salvarModelo,
} from './contratosService';

const inputCls = 'h-8 w-full rounded-md border bg-background px-2 text-xs';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR') : '—';

export function ContratosPage() {
  const { tenantId } = useAuthContext();
  const qc = useQueryClient();

  const [editando, setEditando] = useState<ModeloDeContrato | 'novo' | null>(null);
  const [atribuindo, setAtribuindo] = useState<ModeloDeContrato | null>(null);
  const [relatorioDe, setRelatorioDe] = useState<ModeloDeContrato | null>(null);

  const modelos = useQuery({
    queryKey: ['contrato-modelos', tenantId],
    queryFn: () => carregarModelos(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária para ver os contratos.</p>;
  }

  const recusado = modelos.isSuccess && modelos.data === null;

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contratos do corretor</h1>
          <p className="text-xs text-muted-foreground">
            Modelo com variáveis, atribuição e aceite registrado com data, hora e origem.
          </p>
        </div>
        <button onClick={() => setEditando('novo')}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
          <Plus className="h-3.5 w-3.5" /> Novo modelo
        </button>
      </header>

      {recusado && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><strong>Contratos são de quem administra a imobiliária.</strong> O banco recusa a leitura para a sua conta.</span>
        </p>
      )}

      {modelos.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}

      {modelos.data?.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Nenhum modelo ainda. O primeiro costuma ser o contrato de associação.
        </div>
      )}

      <ul className="grid gap-2">
        {(modelos.data ?? []).map((m) => (
          <li key={m.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-medium">{m.titulo}</span>
                  {m.versao > 1 && (
                    <span className="text-[10px] text-muted-foreground">versão {m.versao}</span>
                  )}
                  {m.exige_assinatura_eletronica && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      exige assinatura eletrônica
                    </span>
                  )}
                </div>
                {m.descricao && <p className="mt-0.5 text-xs text-muted-foreground">{m.descricao}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {m.aceitos} aceite(s) nesta versão
                  {m.pendentes > 0 && ` · ${m.pendentes} pendente(s)`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => setEditando(m)}
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent">Editar</button>
                <button onClick={() => setAtribuindo(m)}
                  className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-accent">
                  <Send className="h-3 w-3" /> Atribuir
                </button>
                <button onClick={() => setRelatorioDe(m)}
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent">Quem aceitou</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editando && (
        <EditorDeModelo
          modelo={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvar={async (m) => {
            await salvarModelo(tenantId, m);
            setEditando(null);
            await qc.invalidateQueries({ queryKey: ['contrato-modelos'] });
          }}
        />
      )}

      {atribuindo && (
        <Atribuidor
          modelo={atribuindo}
          tenantId={tenantId}
          onFechar={() => setAtribuindo(null)}
          onPronto={async () => {
            setAtribuindo(null);
            await qc.invalidateQueries({ queryKey: ['contrato-modelos'] });
          }}
        />
      )}

      {relatorioDe && (
        <Relatorio modelo={relatorioDe} onFechar={() => setRelatorioDe(null)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// O modelo
// ------------------------------------------------------------
function EditorDeModelo({
  modelo, onFechar, onSalvar,
}: {
  modelo: ModeloDeContrato | null;
  onFechar: () => void;
  onSalvar: (m: import('./contratosService').ModeloParaSalvar) => Promise<void>;
}) {
  useEscapeFecha(onFechar);
  const { toast } = useToast();

  const [titulo, setTitulo] = useState(modelo?.titulo ?? '');
  const [descricao, setDescricao] = useState(modelo?.descricao ?? '');
  const [corpo, setCorpo] = useState(modelo?.corpo ?? '');
  const [exige, setExige] = useState(modelo?.exige_assinatura_eletronica ?? false);
  const [novaVersao, setNovaVersao] = useState(false);
  const [nota, setNota] = useState('');
  const [vendoPrevia, setVendoPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const desconhecidas = useMemo(() => variaveisDesconhecidas(corpo), [corpo]);
  const usadas = useMemo(() => variaveisUsadas(corpo), [corpo]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar} role="presentation">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog"
        aria-label={modelo ? `Editar ${modelo.titulo}` : 'Novo modelo'}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{modelo ? 'Editar modelo' : 'Novo modelo'}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Título</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Descrição</span>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} />
          </label>

          <div className="rounded-md border p-2.5">
            <p className="mb-1.5 text-[11px] font-medium">Variáveis disponíveis</p>
            <div className="flex flex-wrap gap-1">
              {VARIAVEIS_DO_MODELO.map((v) => (
                <button key={v.chave} type="button" title={v.descricao}
                  onClick={() => setCorpo((c) => `${c}{{${v.chave}}}`)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
                    usadas.includes(v.chave)
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}>
                  {`{{${v.chave}}}`}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Clique para inserir. As verdes já estão no texto. O contrato só é atribuído a quem
              tem esses dados preenchidos no cadastro.
            </p>
          </div>

          {desconhecidas.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                O texto usa <strong>{desconhecidas.map((v) => `{{${v}}}`).join(', ')}</strong>, que não
                existe. Vai aparecer no contrato exatamente assim — provavelmente é erro de digitação.
              </span>
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              Texto do contrato
              <button type="button" onClick={() => setVendoPrevia(!vendoPrevia)}
                className="normal-case tracking-normal underline underline-offset-2">
                {vendoPrevia ? 'voltar a editar' : 'ver prévia preenchida'}
              </button>
            </span>
            {vendoPrevia ? (
              <div className="min-h-[240px] whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                {preencherPrevia(corpo, VALORES_DE_EXEMPLO)}
              </div>
            ) : (
              <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={14}
                className="w-full rounded-md border bg-background p-2 font-mono text-xs" />
            )}
          </label>

          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={exige} onChange={(e) => setExige(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5" />
            <span>
              <strong>Exige assinatura eletrônica.</strong> O aceite por clique é recusado, e a Dash
              não bloqueia por este documento. A integração com assinatura eletrônica{' '}
              <strong>ainda não existe no sistema</strong> — quem marcar isto precisa enviar o
              documento por fora.
            </span>
          </label>

          {modelo && (
            <div className="rounded-md border p-2.5">
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={novaVersao} onChange={(e) => setNovaVersao(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5" />
                <span>
                  <strong>Publicar como versão {modelo.versao + 1}</strong> — quem já aceitou a
                  anterior recebe uma atribuição nova e volta a ser bloqueado até aceitar.
                </span>
              </label>
              {novaVersao && (
                <input value={nota} onChange={(e) => setNota(e.target.value)}
                  className={`${inputCls} mt-2`} placeholder="O que mudou nesta versão" />
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Cancelar
          </button>
          <button
            disabled={salvando}
            onClick={async () => {
              if (!titulo.trim() || !corpo.trim()) {
                toast({ title: 'Título e texto são obrigatórios', variant: 'destructive' });
                return;
              }
              setSalvando(true);
              try {
                await onSalvar({
                  id: modelo?.id ?? null, titulo: titulo.trim(), corpo, descricao,
                  exigeAssinaturaEletronica: exige, novaVersao, nota,
                });
                toast({ title: 'Modelo salvo' });
              } catch (e) {
                toast({ title: 'Não deu para salvar', description: (e as Error).message, variant: 'destructive' });
              } finally {
                setSalvando(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// A atribuição — simula antes de criar
// ------------------------------------------------------------
function Atribuidor({
  modelo, tenantId, onFechar, onPronto,
}: {
  modelo: ModeloDeContrato;
  tenantId: string;
  onFechar: () => void;
  onPronto: () => Promise<void>;
}) {
  useEscapeFecha(onFechar);
  const { toast } = useToast();

  const [alvo, setAlvo] = useState<'todos' | 'cargo'>('todos');
  const [cargoId, setCargoId] = useState('');
  const [previa, setPrevia] = useState<ResultadoDaAtribuicao | null>(null);

  const cargos = useQuery({
    queryKey: ['cargos', tenantId],
    queryFn: () => carregarCargos(tenantId),
  });

  const simular = useMutation({
    mutationFn: () => atribuir(tenantId, modelo.id, alvo, alvo === 'cargo' ? cargoId || null : null, false),
    onSuccess: setPrevia,
    onError: (e: Error) => toast({ title: 'Não deu para conferir', description: e.message, variant: 'destructive' }),
  });

  const confirmar = useMutation({
    mutationFn: () => atribuir(tenantId, modelo.id, alvo, alvo === 'cargo' ? cargoId || null : null, true),
    onSuccess: async (r) => {
      toast({
        title: r.criadas > 0 ? `${r.criadas} contrato(s) atribuídos` : 'Nada novo para atribuir',
        description: r.ja_tinham > 0 ? `${r.ja_tinham} já tinham esta versão.` : undefined,
      });
      await onPronto();
    },
    onError: (e: Error) => toast({ title: 'Não deu para atribuir', description: e.message, variant: 'destructive' }),
  });

  const aviso = avisoDeQuemFalta(previa);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onFechar} role="presentation">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Atribuir ${modelo.titulo}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Atribuir “{modelo.titulo}”</h2>
            <p className="text-xs text-muted-foreground">Versão {modelo.versao}</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 grid gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Para quem</span>
            <select value={alvo} onChange={(e) => { setAlvo(e.target.value as 'todos' | 'cargo'); setPrevia(null); }}
              className={inputCls}>
              <option value="todos">Toda a equipe</option>
              <option value="cargo">Um cargo</option>
            </select>
          </label>
          {alvo === 'cargo' && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Cargo</span>
              <select value={cargoId} onChange={(e) => { setCargoId(e.target.value); setPrevia(null); }}
                className={inputCls}>
                <option value="">Escolha…</option>
                {(cargos.data?.cargos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!previa && (
          <button onClick={() => simular.mutate()} disabled={simular.isPending || (alvo === 'cargo' && !cargoId)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50">
            {simular.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
            Conferir quem receberia
          </button>
        )}

        {previa && (
          <>
            <div className="mb-3 rounded-md border p-3 text-xs">
              <p><strong>{previa.criadas}</strong> pessoa(s) receberiam o contrato.</p>
              {previa.ja_tinham > 0 && (
                <p className="text-muted-foreground">{previa.ja_tinham} já têm esta versão.</p>
              )}
            </div>

            {aviso && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{aviso}</span>
                </p>
                <ul className="mt-2 grid gap-0.5 pl-5">
                  {previa.faltando.map((p) => (
                    <li key={p.user_id}>
                      {p.email} <span className="opacity-70">— falta {p.campos.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setPrevia(null)}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
                Mudar
              </button>
              <button
                onClick={() => confirmar.mutate()}
                disabled={confirmar.isPending || previa.criadas === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                {confirmar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Atribuir às {previa.criadas} completas
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Quem aceitou
// ------------------------------------------------------------
function Relatorio({ modelo, onFechar }: { modelo: ModeloDeContrato; onFechar: () => void }) {
  useEscapeFecha(onFechar);
  const { toast } = useToast();
  const qc = useQueryClient();

  const r = useQuery({
    queryKey: ['contrato-relatorio', modelo.id],
    queryFn: () => carregarRelatorio(modelo.id),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => cancelarAtribuicao(id),
    onSuccess: async () => {
      toast({ title: 'Atribuição cancelada' });
      await qc.invalidateQueries({ queryKey: ['contrato-relatorio', modelo.id] });
      await qc.invalidateQueries({ queryKey: ['contrato-modelos'] });
    },
    onError: (e: Error) => toast({ title: 'Não deu para cancelar', description: e.message, variant: 'destructive' }),
  });

  const d = r.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onFechar} role="presentation">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Quem aceitou ${modelo.titulo}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Quem aceitou “{modelo.titulo}”</h2>
            {d && (
              <p className="text-xs text-muted-foreground">
                Versão atual {d.versao_atual} · {d.aceitos_versao_atual} aceite(s) nela ·{' '}
                {d.pendentes} pendente(s)
              </p>
            )}
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {r.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        )}

        {d && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Pessoa</th>
                  <th className="px-3 py-2">Versão</th>
                  <th className="px-3 py-2">Aceite</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {d.linhas.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Ninguém recebeu este contrato ainda.
                  </td></tr>
                )}
                {d.linhas.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.email}</td>
                    <td className="px-3 py-2">
                      {l.versao}
                      {l.versao_antiga && (
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          antiga
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {l.status === 'aceito' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                          <Check className="h-3 w-3" /> {dataBR(l.aceito_em)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">pendente</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {l.ip || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.status === 'pendente' && (
                        <button onClick={() => cancelar.mutate(l.id)} disabled={cancelar.isPending}
                          className="rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent disabled:opacity-50">
                          cancelar
                        </button>
                      )}
                      {l.tem_pdf && (
                        <span className="ml-1 text-[10px] text-muted-foreground">PDF no perfil</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <FileSignature className="mt-0.5 h-3 w-3 shrink-0" />
          O aceite fica registrado com data, hora, origem e a identificação do texto aceito. Quem
          aceitou uma versão antiga leu outro documento — a marca “antiga” é para isso.
        </p>
      </div>
    </div>
  );
}
