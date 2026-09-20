/**
 * Base de conhecimento do empreendimento (P2.3).
 *
 * O que a LIA responde quando a pergunta NÃO é de preço nem metragem — isso
 * vem da consulta direta (P2.1). Aqui ficam book, memorial, regulamento, FAQ
 * e resposta de plantão aprovada.
 *
 * O "TESTAR BUSCA" É A RAZÃO DE SER DESTA TELA. Ele responde a pergunta que
 * o gestor não consegue fazer de outro jeito: "a Lia acharia isso?". Sem ele,
 * a única forma de descobrir que a base não responde é um cliente perguntando.
 */

import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  TIPOS_DE_DOCUMENTO, listarDocumentos, criarDocumento, alterarDocumento,
  apagarDocumento, testarBusca, type DocumentoKb, type TrechoEncontrado,
} from '../services/baseDeConhecimentoService';

interface Props {
  tenantId?: string | null;
  lancamentoId: string;
}

const rotuloDoTipo = (t: string) =>
  TIPOS_DE_DOCUMENTO.find((x) => x.valor === t)?.rotulo ?? 'Outro';

const SELO: Record<string, string> = {
  indexado: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  pendente: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  erro: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

const vencido = (d: DocumentoKb) =>
  !!d.valido_ate && new Date(`${d.valido_ate}T23:59:59`) < new Date();

export function BaseDeConhecimentoSection({ tenantId, lancamentoId }: Props) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<DocumentoKb[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [abrindoNovo, setAbrindoNovo] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoTipo, setNovoTipo] = useState('memorial');
  const [novoTexto, setNovoTexto] = useState('');
  const [novaValidade, setNovaValidade] = useState('');

  const [pergunta, setPergunta] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [achados, setAchados] = useState<TrechoEncontrado[] | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDocs(await listarDocumentos(lancamentoId));
      setErro(null);
    } catch (e) {
      setErro((e as { message?: string })?.message ?? 'não foi possível carregar');
    } finally {
      setCarregando(false);
    }
  }, [lancamentoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const adicionar = async () => {
    if (!novoTitulo.trim() || !novoTexto.trim()) {
      toast({ title: 'Preencha o título e o texto', variant: 'destructive' });
      return;
    }
    try {
      await criarDocumento(tenantId ?? '', lancamentoId, {
        titulo: novoTitulo, tipo: novoTipo, conteudo: novoTexto,
        valido_ate: novaValidade || null,
      });
      setNovoTitulo(''); setNovoTexto(''); setNovaValidade(''); setAbrindoNovo(false);
      await carregar();
      toast({ title: 'Documento adicionado', className: 'bg-green-500/10 border-green-500/50' });
    } catch (e) {
      toast({
        title: 'Não foi possível adicionar',
        description: (e as { message?: string })?.message, variant: 'destructive',
      });
    }
  };

  const buscar = async () => {
    setBuscando(true);
    try {
      setAchados(await testarBusca(lancamentoId, pergunta));
    } catch (e) {
      toast({
        title: 'A busca falhou',
        description: (e as { message?: string })?.message, variant: 'destructive',
      });
      setAchados(null);
    } finally {
      setBuscando(false);
    }
  };

  const pendentes = docs.filter((d) => d.status_indexacao === 'pendente' && d.ativo).length;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Base de conhecimento</h2>
        <p className="text-xs text-text-secondary mt-1">
          O que a Lia responde quando a pergunta não é de preço nem metragem — essas ela consulta
          direto nas tipologias. Aqui ficam book, memorial, regulamento, perguntas frequentes e
          respostas de plantão.
        </p>
      </div>

      {erro && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {erro} <button type="button" onClick={carregar} className="font-medium underline">tentar de novo</button>
        </p>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 py-6 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> carregando…
        </div>
      ) : (
        <>
          {docs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-[13px] text-text-secondary">
              Nenhum documento ainda. Um memorial ou uma lista de perguntas frequentes já faz a Lia
              parar de dizer “não sei” para as perguntas mais comuns.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[13.5px] font-medium">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                      <span className="truncate">{d.titulo}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {rotuloDoTipo(d.tipo)}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-secondary">
                      <span className={`rounded px-1.5 py-0.5 font-medium ${SELO[d.status_indexacao]}`}>
                        {d.status_indexacao === 'indexado'
                          ? `${d.qtd_trechos} trecho(s)`
                          : d.status_indexacao === 'pendente'
                            ? 'aguardando indexação'
                            : 'erro ao indexar'}
                      </span>
                      {!d.ativo && <span className="italic">inativo — não é usado</span>}
                      {vencido(d) && (
                        <span className="font-medium text-rose-600 dark:text-rose-400">
                          vencido em {new Date(`${d.valido_ate}T12:00:00`).toLocaleDateString('pt-BR')} — não é usado
                        </span>
                      )}
                      {d.erro_indexacao && <span className="truncate">{d.erro_indexacao}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="flex items-center gap-1 text-[11.5px] text-text-secondary">
                      <input
                        type="checkbox"
                        checked={d.ativo}
                        aria-label={`Ativo: ${d.titulo}`}
                        onChange={async (e) => {
                          await alterarDocumento(d.id, { ativo: e.target.checked });
                          carregar();
                        }}
                      />
                      ativo
                    </label>
                    <button
                      type="button"
                      aria-label={`Remover ${d.titulo}`}
                      onClick={async () => { await apagarDocumento(d.id); carregar(); }}
                      className="text-rose-600 hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pendentes > 0 && (
            // O gestor precisa saber que o documento está lá mas ainda não
            // responde nada — senão ele testa, não acha, e conclui que a base
            // não funciona.
            <p className="text-[11.5px] text-amber-700 dark:text-amber-400">
              <strong>{pendentes}</strong> documento(s) aguardando indexação. Enquanto não forem
              indexados, eles não aparecem na busca — a Lia indexa no servidor dela.
            </p>
          )}

          {!abrindoNovo ? (
            <button
              type="button"
              onClick={() => setAbrindoNovo(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium"
            >
              <Plus className="h-4 w-4" /> Documento
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  aria-label="Título do documento"
                  placeholder="Ex: Memorial descritivo"
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                />
                <select
                  aria-label="Tipo do documento"
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {TIPOS_DE_DOCUMENTO.map((t) => (
                    <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                  ))}
                </select>
                <div>
                  <input
                    type="date"
                    aria-label="Válido até"
                    value={novaValidade}
                    onChange={(e) => setNovaValidade(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  <p className="mt-0.5 text-[10.5px] text-text-secondary">
                    válido até (opcional) — depois disso a Lia não usa
                  </p>
                </div>
              </div>
              <textarea
                aria-label="Texto do documento"
                placeholder="Cole aqui o texto do memorial, do regulamento ou as perguntas frequentes."
                value={novoTexto}
                onChange={(e) => setNovoTexto(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button" onClick={adicionar}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-[13px] font-semibold text-white"
                >
                  Adicionar
                </button>
                <button
                  type="button" onClick={() => setAbrindoNovo(false)}
                  className="text-[13px] text-text-secondary hover:underline"
                >
                  cancelar
                </button>
              </div>
            </div>
          )}

          {/* Testar busca — a razão de ser da tela */}
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Testar busca
            </p>
            <p className="mt-0.5 mb-2 text-[12px] text-text-secondary">
              Faça uma pergunta como o cliente faria. É assim que se descobre se a Lia acharia a
              resposta — sem esperar um cliente perguntar.
            </p>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="Pergunta de teste"
                  placeholder="Ex: tem varanda gourmet?"
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
                  className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={buscar}
                disabled={buscando || !pergunta.trim()}
                className="h-9 rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {buscando ? 'buscando…' : 'Buscar'}
              </button>
            </div>

            {achados !== null && (
              achados.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-amber-700 dark:text-amber-400">
                  Nada encontrado. Com essa pergunta a Lia <strong>não responderia</strong> — ela
                  abriria um plantão em vez de inventar.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {achados.map((a) => (
                    <li key={a.trecho_id} className="rounded-lg border border-border p-2">
                      <p className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
                        <span className="truncate">{a.documento_titulo} · {rotuloDoTipo(a.documento_tipo)}</span>
                        <span className="shrink-0 tabular-nums">
                          {a.modo === 'significado' ? 'por significado' : 'por palavra'}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[12.5px]">{a.texto}</p>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}
