/**
 * Equipe › Materiais de estudo (P4.2).
 *
 * Plano de carreira, regras de comissão, regimento, scripts e treinamentos num
 * lugar só — com versão e leitura obrigatória com aceite.
 *
 * Duas coisas dão o tom:
 *
 *  1. O PLANO DE CARREIRA NÃO É UM TEXTO GUARDADO. Os níveis e percentuais
 *     vêm do motor de comissão, o mesmo que calcula os repasses. Um texto
 *     copiado ficaria desatualizado no primeiro reajuste, e o corretor estaria
 *     lendo a regra errada justamente sobre quanto ele ganha.
 *
 *  2. A LEITURA É POR VERSÃO. Revisar o regimento devolve todo mundo à fila de
 *     "precisa ler" — é isso que faz o gestor descobrir quem ainda não viu a
 *     mudança, em vez de confiar num "já leram" de seis meses atrás.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, BookOpen, Check, ExternalLink, FileText, Loader2, Plus, Search, X,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { useToast } from '@/hooks/use-toast';
import {
  ORDEM_DAS_CATEGORIAS, ROTULO_DA_CATEGORIA, avisoDePendentes, filtrar, paraQuem,
  planoDeCarreira, porCategoria, quantosFaltam, saltoEntreNiveis,
  type CategoriaDeMaterial, type Material, type TipoDeMaterial,
} from './materiais';
import {
  arquivarMaterial, carregarMateriais, carregarPendentes, carregarRelatorio,
  linkDoArquivo, registrarLeitura, salvarMaterial, subirArquivo,
} from './materiaisService';

const inputCls = 'h-8 w-full rounded-md border bg-background px-2 text-xs';

const dataBR = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const reais = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    .replace(/\u00A0/g, ' ');

export function MateriaisPage() {
  const { tenantId } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<CategoriaDeMaterial | ''>('');
  const [aberto, setAberto] = useState<Material | null>(null);
  const [editando, setEditando] = useState<Material | 'novo' | null>(null);
  const [relatorioDe, setRelatorioDe] = useState<Material | null>(null);

  const quadro = useQuery({
    queryKey: ['materiais', tenantId],
    queryFn: () => carregarMateriais(tenantId!, true),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const pendentes = useQuery({
    queryKey: ['materiais-pendentes', tenantId],
    queryFn: () => carregarPendentes(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const podeGerir = quadro.data?.pode_gerir ?? false;

  const lista = useMemo(() => {
    const todos = quadro.data?.materiais ?? [];
    const porBusca = filtrar(todos, busca);
    return categoria ? porBusca.filter((m) => m.categoria === categoria) : porBusca;
  }, [quadro.data, busca, categoria]);

  const grupos = useMemo(() => porCategoria(lista), [lista]);
  const aviso = avisoDePendentes(pendentes.data);

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária para ver os materiais.</p>;
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Materiais de estudo</h1>
          <p className="text-xs text-muted-foreground">
            Plano de carreira, regras de comissão, regimento, scripts e treinamentos.
          </p>
        </div>
        {podeGerir && (
          <button onClick={() => setEditando('novo')}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <Plus className="h-3.5 w-3.5" /> Novo material
          </button>
        )}
      </header>

      {aviso && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{aviso}</span>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Título, resumo ou dentro do texto" className={`${inputCls} pl-7`} />
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Categoria</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDeMaterial | '')}
            className={`${inputCls} w-auto`}>
            <option value="">Todas</option>
            {ORDEM_DAS_CATEGORIAS.map((c) => (
              <option key={c} value={c}>{ROTULO_DA_CATEGORIA[c]}</option>
            ))}
          </select>
        </label>
      </div>

      {quadro.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}

      {quadro.data && grupos.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          {busca || categoria
            ? 'Nenhum material encontrado com esse filtro.'
            : 'Nenhum material ainda. O primeiro costuma ser o plano de carreira.'}
        </div>
      )}

      <div className="grid gap-5">
        {grupos.map((g) => (
          <section key={g.categoria}>
            <h2 className="mb-2 text-sm font-semibold">{g.rotulo}</h2>
            <ul className="grid gap-2">
              {g.materiais.map((m) => (
                <li key={m.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button onClick={() => setAberto(m)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="font-medium">{m.titulo}</span>
                        {m.novo && (
                          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                            novo
                          </span>
                        )}
                        {m.obrigatorio && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            obrigatório
                          </span>
                        )}
                        {m.rascunho && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium">
                            rascunho
                          </span>
                        )}
                        {m.versao > 1 && (
                          <span className="text-[10px] text-muted-foreground">versão {m.versao}</span>
                        )}
                      </div>
                      {m.resumo && <p className="mt-0.5 text-xs text-muted-foreground">{m.resumo}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {paraQuem(m)}
                        {m.aceito_em
                          ? ` · você aceitou em ${dataBR(m.aceito_em)}`
                          : m.lido_em
                            ? ` · você abriu em ${dataBR(m.lido_em)}`
                            : m.obrigatorio ? ' · você ainda não aceitou' : ''}
                      </p>
                    </button>
                    {podeGerir && (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex gap-1">
                          <button onClick={() => setEditando(m)}
                            className="rounded-md border px-2 py-0.5 text-[10px] hover:bg-accent">
                            Editar
                          </button>
                          {m.obrigatorio && (
                            <button onClick={() => setRelatorioDe(m)}
                              className="rounded-md border px-2 py-0.5 text-[10px] hover:bg-accent">
                              Quem leu
                            </button>
                          )}
                        </div>
                        {m.aceitaram != null && m.obrigatorio && (
                          <span className="text-[10px] text-muted-foreground">
                            {m.aceitaram} aceite(s)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {aberto && (
        <LeitorDeMaterial
          material={aberto}
          onFechar={() => setAberto(null)}
          onRegistrar={async (aceitar) => {
            await registrarLeitura(aberto.id, aceitar);
            if (aceitar) toast({ title: 'Registrado', description: 'Obrigado — a leitura ficou registrada.' });
            await Promise.all([
              qc.invalidateQueries({ queryKey: ['materiais'] }),
              qc.invalidateQueries({ queryKey: ['materiais-pendentes'] }),
            ]);
            if (aceitar) setAberto(null);
          }}
        />
      )}

      {editando && (
        <EditorDeMaterial
          material={editando === 'novo' ? null : editando}
          tenantId={tenantId}
          onFechar={() => setEditando(null)}
          onSalvar={async (m) => {
            const r = await salvarMaterial(tenantId, m);
            toast({
              title: `"${r.titulo}" salvo`,
              description: r.releitura > 0
                ? `Versão ${r.versao}. ${r.releitura} pessoa(s) que já tinham lido precisam ler de novo.`
                : r.publicado ? 'Publicado.' : 'Salvo como rascunho.',
            });
            setEditando(null);
            await qc.invalidateQueries({ queryKey: ['materiais'] });
          }}
          onArquivar={async (id) => {
            const r = await arquivarMaterial(id);
            toast({ title: `"${r.titulo}" arquivado` });
            setEditando(null);
            await qc.invalidateQueries({ queryKey: ['materiais'] });
          }}
        />
      )}

      {relatorioDe && (
        <RelatorioDeLeitura material={relatorioDe} onFechar={() => setRelatorioDe(null)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Ler o material
// ------------------------------------------------------------
function LeitorDeMaterial({
  material, onFechar, onRegistrar,
}: {
  material: Material;
  onFechar: () => void;
  onRegistrar: (aceitar: boolean) => Promise<void>;
}) {
  useEscapeFecha(onFechar);
  const { toast } = useToast();
  const [marcando, setMarcando] = useState(false);
  const [rolouAteOFim, setRolouAteOFim] = useState(false);

  const abrirArquivo = async () => {
    if (!material.arquivo) return;
    const url = await linkDoArquivo(material.arquivo);
    if (url) window.open(url, '_blank', 'noopener');
    else toast({ title: 'Não deu para abrir o arquivo', variant: 'destructive' });
  };

  const jaAceitou = !!material.aceito_em;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar} role="presentation">
      <div className="flex h-full w-full max-w-2xl flex-col bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={material.titulo}>
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <h2 className="text-lg font-semibold">{material.titulo}</h2>
            <p className="text-xs text-muted-foreground">
              {ROTULO_DA_CATEGORIA[material.categoria]}
              {material.versao > 1 && ` · versão ${material.versao}`}
              {material.publicado_em && ` · publicado em ${dataBR(material.publicado_em)}`}
            </p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto p-5"
          // MEDIR AO MONTAR, e não só ao rolar: um material curto cabe na tela
          // inteira, nenhum evento de rolagem dispara, e o botão "Li e entendi"
          // ficaria travado para sempre — o material obrigatório seria
          // impossível de aceitar. Visto no navegador em 21/09.
          ref={(el) => {
            if (el && el.scrollHeight <= el.clientHeight + 24) setRolouAteOFim(true);
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setRolouAteOFim(true);
          }}
        >
          {material.tipo === 'niveis_de_comissao' && <PlanoDeCarreira />}

          {material.tipo === 'texto' && (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{material.conteudo}</div>
          )}

          {material.tipo === 'arquivo' && (
            <div className="grid gap-3">
              {material.conteudo && (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{material.conteudo}</p>
              )}
              <button onClick={abrirArquivo}
                className="inline-flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                <FileText className="h-3.5 w-3.5" /> Abrir o arquivo
              </button>
            </div>
          )}

          {material.tipo === 'link' && (
            <div className="grid gap-3">
              {material.conteudo && (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{material.conteudo}</p>
              )}
              <a href={material.link_url ?? '#'} target="_blank" rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir o vídeo
              </a>
            </div>
          )}
        </div>

        {material.obrigatorio && (
          <div className="border-t p-4">
            {jaAceitou ? (
              <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                Você declarou que leu e entendeu em {dataBR(material.aceito_em)}.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {rolouAteOFim
                    ? 'Confirme que leu e entendeu — fica registrado com data e hora.'
                    : 'Role o material até o fim para poder confirmar.'}
                </p>
                <button
                  disabled={!rolouAteOFim || marcando}
                  onClick={async () => {
                    setMarcando(true);
                    try { await onRegistrar(true); } finally { setMarcando(false); }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                  {marcando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Li e entendi
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * O plano de carreira, desenhado do motor de comissão.
 *
 * Nenhum número aqui é digitado: eles vêm da mesma tabela que calcula os
 * repasses da venda. Se a casa mudar um percentual, esta tela muda junto.
 */
function PlanoDeCarreira() {
  const degraus = planoDeCarreira(20000);
  const saltos = saltoEntreNiveis(degraus);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Cada nível leva um percentual da sua ponta da comissão. O exemplo usa uma venda com{' '}
        <strong>{reais(20000)}</strong> de comissão total.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Nível</th>
              <th className="px-3 py-2 text-right">Você leva</th>
              <th className="px-3 py-2 text-right">Exemplo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {degraus.map((d) => (
              <tr key={d.nivel}>
                <td className="px-3 py-2 font-medium">{d.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.percentual}%</td>
                <td className="px-3 py-2 text-right tabular-nums">{reais(d.exemplo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">O que muda a cada degrau</h3>
        <ul className="grid gap-1 text-sm">
          {saltos.map((s) => (
            <li key={`${s.de}-${s.para}`} className="text-muted-foreground">
              De <strong className="text-foreground">{s.de}</strong> para{' '}
              <strong className="text-foreground">{s.para}</strong>: mais {s.pontos} pontos
              percentuais — {reais((20000 * s.pontos) / 100)} a mais na venda do exemplo.
            </li>
          ))}
        </ul>
      </div>

      <p className="rounded-md border p-2.5 text-[11px] text-muted-foreground">
        Estes números saem da mesma regra que calcula o repasse da sua venda — não são uma cópia.
        Quando um Líder Direto participa, ele leva a diferença entre o seu percentual e o dele, e a
        casa fica com o resto.
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Criar e editar
// ------------------------------------------------------------
function EditorDeMaterial({
  material, tenantId, onFechar, onSalvar, onArquivar,
}: {
  material: Material | null;
  tenantId: string;
  onFechar: () => void;
  onSalvar: (m: import('./materiaisService').MaterialParaSalvar) => Promise<void>;
  onArquivar: (id: string) => Promise<void>;
}) {
  useEscapeFecha(onFechar);
  const { toast } = useToast();

  const [titulo, setTitulo] = useState(material?.titulo ?? '');
  const [resumo, setResumo] = useState(material?.resumo ?? '');
  const [categoria, setCategoria] = useState<CategoriaDeMaterial>(material?.categoria ?? 'outros');
  const [tipo, setTipo] = useState<TipoDeMaterial>(material?.tipo ?? 'texto');
  const [conteudo, setConteudo] = useState(material?.conteudo ?? '');
  const [linkUrl, setLinkUrl] = useState(material?.link_url ?? '');
  const [arquivo, setArquivo] = useState<string | null>(material?.arquivo ?? null);
  const [obrigatorio, setObrigatorio] = useState(material?.obrigatorio ?? false);
  const [publicar, setPublicar] = useState(material ? !material.rascunho : true);
  const [novaVersao, setNovaVersao] = useState(false);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);

  const subir = async (f: File) => {
    setSubindo(true);
    try {
      setArquivo(await subirArquivo(tenantId, f));
      toast({ title: 'Arquivo anexado' });
    } catch (e) {
      toast({ title: 'Não deu para anexar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSubindo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar} role="presentation">
      <div className="h-full w-full max-w-lg overflow-y-auto bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog"
        aria-label={material ? `Editar ${material.titulo}` : 'Novo material'}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{material ? 'Editar material' : 'Novo material'}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-2.5">
          <Campo rotulo="Título">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Resumo">
            <input value={resumo} onChange={(e) => setResumo(e.target.value)} className={inputCls}
              placeholder="Uma linha sobre o que é" />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Categoria">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDeMaterial)}
                className={inputCls}>
                {ORDEM_DAS_CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{ROTULO_DA_CATEGORIA[c]}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Formato">
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeMaterial)} className={inputCls}>
                <option value="texto">Texto</option>
                <option value="arquivo">Arquivo (PDF, slides)</option>
                <option value="link">Vídeo ou página</option>
                <option value="niveis_de_comissao">Plano de carreira (do motor)</option>
              </select>
            </Campo>
          </div>

          {tipo === 'niveis_de_comissao' && (
            <p className="rounded-md border p-2 text-[11px] text-muted-foreground">
              Este formato <strong>não guarda texto</strong>: a tela desenha os níveis e percentuais a
              partir da mesma regra que calcula os repasses. Assim eles nunca ficam desatualizados.
            </p>
          )}

          {tipo !== 'niveis_de_comissao' && (
            <Campo rotulo={tipo === 'texto' ? 'Conteúdo' : 'Introdução (opcional)'}>
              <textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)}
                rows={tipo === 'texto' ? 10 : 3}
                className="w-full rounded-md border bg-background p-2 text-xs" />
            </Campo>
          )}

          {tipo === 'link' && (
            <Campo rotulo="Endereço">
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={inputCls}
                placeholder="https://" />
            </Campo>
          )}

          {tipo === 'arquivo' && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent">
                {subindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {arquivo ? 'Trocar arquivo' : 'Anexar arquivo'}
                <input type="file" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }} />
              </label>
              {arquivo && <span className="text-[11px] text-muted-foreground">anexado</span>}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={obrigatorio} onChange={(e) => setObrigatorio(e.target.checked)}
              className="h-3.5 w-3.5" />
            Leitura obrigatória (pede “Li e entendi” e fica registrado)
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={publicar} onChange={(e) => setPublicar(e.target.checked)}
              className="h-3.5 w-3.5" />
            Publicado (desmarcado, fica como rascunho e só quem gere vê)
          </label>

          {material && (
            <div className="rounded-md border p-2.5">
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={novaVersao} onChange={(e) => setNovaVersao(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5" />
                <span>
                  <strong>Publicar como versão {material.versao + 1}</strong> — use quando o conteúdo
                  mudou de verdade. Quem já leu volta para a fila de “precisa ler”.
                </span>
              </label>
              {novaVersao && (
                <input value={nota} onChange={(e) => setNota(e.target.value)}
                  className={`${inputCls} mt-2`} placeholder="O que mudou nesta versão" />
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-between gap-2">
          {material ? (
            <button onClick={() => void onArquivar(material.id)}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">
              Arquivar
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onFechar} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
              Cancelar
            </button>
            <button
              disabled={salvando}
              onClick={async () => {
                if (!titulo.trim()) {
                  toast({ title: 'O material precisa de um título', variant: 'destructive' });
                  return;
                }
                setSalvando(true);
                try {
                  await onSalvar({
                    id: material?.id ?? null, titulo: titulo.trim(), resumo,
                    categoria, tipo, conteudo, arquivo, linkUrl,
                    obrigatorio, publico: 'todos', publicar, novaVersao, nota,
                  });
                } catch (e) {
                  toast({ title: 'Não deu para salvar', description: (e as Error).message, variant: 'destructive' });
                } finally {
                  setSalvando(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

// ------------------------------------------------------------
// Quem leu
// ------------------------------------------------------------
function RelatorioDeLeitura({ material, onFechar }: { material: Material; onFechar: () => void }) {
  useEscapeFecha(onFechar);
  const r = useQuery({
    queryKey: ['material-relatorio', material.id],
    queryFn: () => carregarRelatorio(material.id),
  });

  const d = r.data;
  const falta = d ? quantosFaltam(material, d.alcanca) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onFechar} role="presentation">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Quem leu ${material.titulo}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Quem leu “{material.titulo}”</h2>
            {d && (
              <p className="text-xs text-muted-foreground">
                Versão {d.versao} · alcança {d.alcanca} pessoa(s)
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

        {falta && (
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {falta}
          </p>
        )}

        {d && (
          <ul className="divide-y rounded-md border">
            {d.pessoas.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{p.email}</span>
                {p.aceito_em ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <Check className="h-3 w-3" /> {dataBR(p.aceito_em)}
                  </span>
                ) : p.lido_em ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                    abriu, não aceitou
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    não abriu
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <BookOpen className="mt-0.5 h-3 w-3 shrink-0" />
          A leitura é desta versão. Quem leu uma versão anterior aparece como “não abriu”, porque o
          texto mudou desde então.
        </p>
      </div>
    </div>
  );
}
