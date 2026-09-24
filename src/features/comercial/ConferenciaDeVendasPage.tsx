/**
 * Comercial › Conferência de vendas (P4.4).
 *
 * A venda nasce da proposta assinada e traz consigo o que foi calculado NAQUELE
 * dia: percentual da construtora, imposto e nível do corretor. Nada disso muda
 * depois — promover alguém em outubro não reescreve o que a casa pagou em
 * setembro.
 *
 * A tela existe para uma pergunta: o que entrou bate com o que era para entrar?
 * Por isso a divergência é o único vermelho, e por isso o rodapé confere a
 * própria soma em vez de prometer que bate.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Calculator, Check, DownloadCloud, FileText, Info, Loader2, X,
} from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useEscapeFecha } from '@/hooks/useEscapeFecha';
import { useToast } from '@/hooks/use-toast';
import {
  COR_DO_STATUS, ROTULO_DO_STATUS, avisoDaComissaoDaProposta, divergencia,
  reaisExatos, repassesDaVenda, rotuloDoNivel, totaisConferem,
  type StatusDaVenda, type VendaNaLista,
} from './vendas';
import { ConferenciaDaPlanilha } from './ConferenciaDaPlanilha';
import {
  carregarConferencia, carregarConstrutoras, carregarDetalhe, carregarEquipe,
  gravarRepasses, importarAssinadas, linkDaNotaFiscal, marcarRepassePago,
  salvarConferencia, subirNotaFiscal,
} from './vendasService';

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDoMes = () => `${new Date().toISOString().slice(0, 7)}-01`;

const dataBR = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

export function ConferenciaDeVendasPage() {
  const { tenantId } = useAuthContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [de, setDe] = useState(primeiroDoMes);
  const [ate, setAte] = useState(hoje);
  const [status, setStatus] = useState('');
  const [construtoraId, setConstrutoraId] = useState('');
  const [corretorId, setCorretorId] = useState('');
  /*
   * De onde a tela lê — item 5 do chefe, 24/09.
   *
   * São dois conjuntos DIFERENTES, e por isso um seletor em vez de uma soma:
   * a planilha é o histórico importado (congelado em 01/09) e o CRM são as
   * propostas assinadas. Somar inventaria venda; escolher deixa claro o que
   * se está olhando.
   *
   * A planilha entra como padrão porque foi o que ele pediu para ver.
   */
  const [fonte, setFonte] = useState<'planilha' | 'crm'>('planilha');
  const [aberta, setAberta] = useState<VendaNaLista | null>(null);

  const filtros = { de, ate, status, construtoraId, corretorId };

  const conferencia = useQuery({
    queryKey: ['conferencia-vendas', tenantId, de, ate, status, construtoraId, corretorId],
    queryFn: () => carregarConferencia(tenantId!, filtros),
    // Não busca o que a tela não vai mostrar: na planilha, esta consulta seria
    // uma ida ao banco por troca de filtro, sem nada na tela para usá-la.
    enabled: !!tenantId && tenantId !== 'owner' && fonte === 'crm',
  });

  const construtoras = useQuery({
    queryKey: ['construtoras-filtro', tenantId],
    queryFn: () => carregarConstrutoras(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const equipe = useQuery({
    queryKey: ['equipe-repasse', tenantId],
    queryFn: () => carregarEquipe(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const importar = useMutation({
    mutationFn: () => importarAssinadas(tenantId!),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['conferencia-vendas'] });
      toast({
        title: r.criadas > 0 ? `${r.criadas} venda(s) trazidas do CRM` : 'Nada novo para trazer',
        description: r.criadas > 0
          ? `${r.ja_existiam} já estavam aqui.`
          : `As ${r.ja_existiam} propostas assinadas com valor já viraram venda.`,
      });
    },
    onError: (e: Error) => toast({ title: 'Não deu para importar', description: e.message, variant: 'destructive' }),
  });

  const dados = conferencia.data;
  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);
  const totais = dados?.totais;
  const fechamento = totaisConferem(linhas, totais);

  // Antes do early return: um hook depois dele deixa de rodar quando não há
  // tenant, e o React quebra na próxima renderização com outra contagem.
  /*
   * Quantas linhas ainda não têm folha. A líquida delas é desconhecida, e por
   * isso elas ficam de fora do total — dizer isso é o que impede alguém de
   * somar o rodapé e achar que é a margem do mês.
   */
  const semFolha = (linhas ?? []).filter((l) => l.comissao_liquida == null).length;

  const corretoresNaLista = useMemo(() => {
    const m = new Map<string, string>();
    linhas.forEach((l) => { if (l.corretor_id) m.set(l.corretor_id, l.corretor); });
    return [...m.entries()];
  }, [linhas]);

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-muted-foreground">Escolha uma imobiliária para conferir as vendas.</p>;
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Conferência de vendas</h1>
          <p className="text-xs text-muted-foreground">
            {fonte === 'planilha'
              ? 'A planilha comercial importada. Ela parou de receber venda nova em 01/09 — o que entrou depois está no CRM.'
              : 'Cada venda nasce de uma proposta assinada no CRM, com a comissão calculada no dia.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            {(['planilha', 'crm'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFonte(f)}
                className={`rounded px-2.5 py-1 font-medium ${
                  fonte === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {f === 'planilha' ? 'Planilha' : 'CRM'}
              </button>
            ))}
          </div>
          {fonte === 'crm' && (
            <button
              onClick={() => importar.mutate()}
              disabled={importar.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              {importar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
              Trazer assinadas do CRM
            </button>
          )}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Campo rotulo="De">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputCls} />
        </Campo>
        {fonte === 'crm' && (
        <>
        <Campo rotulo="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {(Object.keys(ROTULO_DO_STATUS) as StatusDaVenda[]).map((s) => (
              <option key={s} value={s}>{ROTULO_DO_STATUS[s]}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Construtora">
          <select value={construtoraId} onChange={(e) => setConstrutoraId(e.target.value)} className={inputCls}>
            <option value="">Todas</option>
            {(construtoras.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Corretor">
          <select value={corretorId} onChange={(e) => setCorretorId(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {corretoresNaLista.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </Campo>
        </>
        )}
      </div>

      {/* A planilha tem os filtros dela: o tipo do negocio e o corretor por
          NOME, porque la o corretor e texto e nem todo nome casa com membro. */}
      {fonte === 'planilha' && <ConferenciaDaPlanilha de={de} ate={ate} />}

      {fonte === 'crm' && conferencia.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {fonte === 'crm' && conferencia.isError && (
        <p className="rounded-md border border-rose-200 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
          Não deu para ler a conferência: {(conferencia.error as Error)?.message}
        </p>
      )}

      {fonte === 'crm' && dados && (
        <>
          {totais!.divergentes > 0 && (
            <Aviso tom="rose" icone={<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}>
              <strong>{totais!.divergentes} venda(s) com divergência.</strong> O valor que entrou não bate com a
              comissão calculada. Abra cada uma para ver a diferença.
            </Aviso>
          )}

          {totais!.sem_percentual > 0 && (
            <Aviso tom="amber" icone={<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}>
              <strong>{totais!.sem_percentual} venda(s) com comissão zerada.</strong> Elas nasceram sem casar com
              nenhuma construtora cadastrada, então não há percentual para aplicar. Cadastre a construtora do
              empreendimento e traga as assinadas de novo.
            </Aviso>
          )}

          {semFolha > 0 && (
            <Aviso tom="amber" icone={<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}>
              <strong>{semFolha} venda(s) sem folha de repasse calculada.</strong> A líquida delas aparece
              como “—”, e elas <em>não entram</em> no total de comissão líquida abaixo. A líquida é a comissão
              menos o corretor e o gerente — sem a folha, não há o que subtrair.
            </Aviso>
          )}

          {!fechamento.confere && (
            <Aviso tom="rose" icone={<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}>
              <strong>O rodapé não bate com as linhas em {fechamento.campo}:</strong> a soma das linhas dá{' '}
              {reaisExatos(fechamento.soma)} e o rodapé mostra {reaisExatos(fechamento.rodape)}. Não use estes
              totais até isto ser resolvido.
            </Aviso>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Empreendimento</th>
                  <th className="px-3 py-2">Corretor</th>
                  <th className="px-3 py-2 text-right">VGV</th>
                  <th className="px-3 py-2 text-right">Bruta</th>
                  <th className="px-3 py-2 text-right">Líquida</th>
                  <th className="px-3 py-2 text-right">Recebido</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Repasses</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhuma venda no período. A venda aparece aqui quando a proposta entra em “Proposta Assinada”.
                  </td></tr>
                )}
                {linhas.map((v) => {
                  const d = divergencia(v);
                  return (
                    <tr key={v.id} onClick={() => setAberta(v)}
                      className="cursor-pointer hover:bg-accent/50">
                      <td className="px-3 py-2 whitespace-nowrap">{dataBR(v.data_venda)}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{v.empreendimento || '—'}</span>
                        {v.construtora && <span className="ml-1 text-muted-foreground">· {v.construtora}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {v.corretor || '—'}
                        <span className="ml-1 text-[10px] text-muted-foreground">({rotuloDoNivel(v.nivel_corretor)})</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(v.vgv)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{reaisExatos(v.comissao_bruta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {/* Sem folha calculada a líquida é DESCONHECIDA, e não
                            zero nem igual à bruta: mostrar a bruta afirmaria
                            que a casa fica com 100% da comissão. */}
                        {v.comissao_liquida == null
                          ? <span className="font-normal text-muted-foreground" title="Falta calcular a folha de repasse desta venda">—</span>
                          : reaisExatos(v.comissao_liquida)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${d ? 'text-rose-700 dark:text-rose-300' : ''}`}>
                        {v.valor_recebido == null ? '—' : reaisExatos(v.valor_recebido)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${COR_DO_STATUS[v.status]}`}>
                          {ROTULO_DO_STATUS[v.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {v.repasses === 0 ? 'não calculados' : `${v.repasses_pagos}/${v.repasses} pagos`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* OS TOTAIS FORA DA TABELA, de propósito. Dentro do <tfoot> eles
              herdavam o rolamento horizontal dela: visto no navegador em
              21/09, o "a receber" ficava fora da tela justamente na largura
              em que a Dash é usada — e um total que some é pior que um total
              ausente, porque ninguém procura o que não sabe que existe. */}
          {linhas.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Total rotulo="VGV" valor={reaisExatos(totais!.vgv)} />
              <Total rotulo="Comissão bruta" valor={reaisExatos(totais!.comissao_bruta)} />
              <Total rotulo="Imposto" valor={reaisExatos(totais!.imposto)} />
              <Total rotulo="Comissão líquida" valor={reaisExatos(totais!.comissao_liquida)} forte />
              <Total rotulo="Recebido" valor={reaisExatos(totais!.recebido)} />
              <Total rotulo="A receber" valor={reaisExatos(totais!.a_receber)}
                nota="só as vendas sem data de recebimento" />
            </div>
          )}
        </>
      )}

      {aberta && (
        <GavetaDaVenda
          venda={aberta}
          tenantId={tenantId}
          equipe={equipe.data ?? []}
          onFechar={() => setAberta(null)}
          onMudou={() => qc.invalidateQueries({ queryKey: ['conferencia-vendas'] })}
        />
      )}
    </div>
  );
}

const inputCls = 'h-8 rounded-md border bg-background px-2 text-xs';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

function Aviso({
  tom, icone, children,
}: { tom: 'rose' | 'amber'; icone: React.ReactNode; children: React.ReactNode }) {
  const cls = tom === 'rose'
    ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
    : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300';
  return (
    <p className={`mb-3 flex items-start gap-2 rounded-md border p-2.5 text-xs ${cls}`}>
      {icone}<span>{children}</span>
    </p>
  );
}

/**
 * A gaveta da venda: dados, nota, recebimento e repasses.
 *
 * Escape fecha — a primeira coisa que faltou no quadro de demandas do P3.7, e
 * que prendeu quem testava dentro do modal.
 */
function GavetaDaVenda({
  venda, tenantId, equipe, onFechar, onMudou,
}: {
  venda: VendaNaLista;
  tenantId: string;
  equipe: Parameters<typeof repassesDaVenda>[1];
  onFechar: () => void;
  onMudou: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  useEscapeFecha(onFechar);

  const detalhe = useQuery({
    queryKey: ['venda-detalhe', venda.id],
    queryFn: () => carregarDetalhe(venda.id),
  });

  const [nfNumero, setNfNumero] = useState(venda.nf_numero ?? '');
  const [nfData, setNfData] = useState(venda.nf_data ?? '');
  const [nfArquivo, setNfArquivo] = useState<string | null>(null);
  const [previstoEm, setPrevistoEm] = useState(venda.recebimento_previsto_em ?? '');
  const [recebidoEm, setRecebidoEm] = useState(venda.recebido_em ?? '');
  const [valorRecebido, setValorRecebido] = useState(
    venda.valor_recebido == null ? '' : String(venda.valor_recebido)
  );
  const [subindo, setSubindo] = useState(false);

  const arquivoAtual = (detalhe.data?.venda?.nf_arquivo as string | null) ?? nfArquivo;

  const salvar = useMutation({
    mutationFn: () => salvarConferencia(venda.id, {
      nfNumero,
      nfData: nfData || null,
      nfArquivo: arquivoAtual,
      previstoEm: previstoEm || null,
      recebidoEm: recebidoEm || null,
      valorRecebido: valorRecebido === '' ? null : Number(valorRecebido.replace(',', '.')),
      observacao: '',
    }),
    onSuccess: () => {
      toast({ title: 'Conferência salva' });
      qc.invalidateQueries({ queryKey: ['venda-detalhe', venda.id] });
      onMudou();
    },
    onError: (e: Error) => toast({ title: 'Não deu para salvar', description: e.message, variant: 'destructive' }),
  });

  const calcular = useMutation({
    mutationFn: async () => {
      const r = repassesDaVenda(venda, equipe);
      if ('impedimento' in r) throw new Error(r.impedimento);
      return gravarRepasses(venda.id, r.linhas);
    },
    onSuccess: (r) => {
      toast({ title: `${r.gravados} repasse(s) calculados`, description: `Somando ${reaisExatos(r.soma)}.` });
      qc.invalidateQueries({ queryKey: ['venda-detalhe', venda.id] });
      onMudou();
    },
    onError: (e: Error) => toast({ title: 'Não deu para calcular', description: e.message, variant: 'destructive' }),
  });

  const pagar = useMutation({
    mutationFn: ({ id, pago }: { id: string; pago: boolean }) => marcarRepassePago(id, pago),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venda-detalhe', venda.id] });
      onMudou();
    },
    onError: (e: Error) => toast({ title: 'Não deu para marcar', description: e.message, variant: 'destructive' }),
  });

  const subir = async (arquivo: File) => {
    setSubindo(true);
    try {
      const caminho = await subirNotaFiscal(tenantId, venda.id, arquivo);
      setNfArquivo(caminho);
      await salvarConferencia(venda.id, {
        nfNumero, nfData: nfData || null, nfArquivo: caminho,
        previstoEm: previstoEm || null, recebidoEm: recebidoEm || null,
        valorRecebido: valorRecebido === '' ? null : Number(valorRecebido.replace(',', '.')),
        observacao: '',
      });
      toast({ title: 'Nota fiscal anexada' });
      qc.invalidateQueries({ queryKey: ['venda-detalhe', venda.id] });
      onMudou();
    } catch (e) {
      toast({ title: 'Não deu para anexar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSubindo(false);
    }
  };

  const abrirNota = async () => {
    if (!arquivoAtual) return;
    const url = await linkDaNotaFiscal(arquivoAtual);
    if (url) window.open(url, '_blank', 'noopener');
    else toast({ title: 'Não deu para abrir a nota', variant: 'destructive' });
  };

  const d = divergencia({ ...venda, valor_recebido: valorRecebido === '' ? null : Number(valorRecebido.replace(',', '.')) });
  const avisoProposta = avisoDaComissaoDaProposta(venda);
  const repasses = detalhe.data?.repasses ?? [];
  const previa = repasses.length === 0 ? repassesDaVenda(venda, equipe) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onFechar}
      role="presentation"
    >
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Venda ${venda.empreendimento}`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{venda.empreendimento || 'Venda'}</h2>
            <p className="text-xs text-muted-foreground">
              {dataBR(venda.data_venda)} · {venda.construtora ?? 'sem construtora'} ·{' '}
              {venda.tipo === 'lancamento' ? 'Lançamento' : 'Terceiros'}
            </p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {d && (
          <Aviso tom="rose" icone={<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}>
            <strong>Divergência de {reaisExatos(Math.abs(d.valor))}.</strong> {d.texto}
          </Aviso>
        )}
        {avisoProposta && (
          <Aviso tom="amber" icone={<Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}>{avisoProposta}</Aviso>
        )}

        <section className="mb-5 rounded-lg border">
          <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">Dados da venda</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 text-xs">
            <Linha rotulo="VGV" valor={reaisExatos(venda.vgv)} />
            <Linha rotulo="Comissão" valor={`${String(venda.comissao_pct).replace('.', ',')}%`} />
            <Linha rotulo="Bruta" valor={reaisExatos(venda.comissao_bruta)} />
            <Linha rotulo={`Imposto (${String(venda.imposto_pct).replace('.', ',')}%)`} valor={reaisExatos(venda.imposto_valor)} />
            <Linha
              rotulo="Líquida"
              valor={venda.comissao_liquida == null
                ? 'falta calcular a folha'
                : reaisExatos(venda.comissao_liquida)}
              forte
            />
            <Linha rotulo="Corretor" valor={`${venda.corretor || '—'} · ${rotuloDoNivel(venda.nivel_corretor)}`} />
          </dl>
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            O nível e o percentual ficaram congelados no dia da assinatura. Mudar o cadastro agora não altera
            esta venda — é o que garante que a folha de setembro continue sendo a de setembro.
          </p>
        </section>

        <section className="mb-5 rounded-lg border">
          <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">Nota fiscal</h3>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            <Campo rotulo="Número">
              <input value={nfNumero} onChange={(e) => setNfNumero(e.target.value)} className={inputCls} />
            </Campo>
            <Campo rotulo="Data">
              <input type="date" value={nfData} onChange={(e) => setNfData(e.target.value)} className={inputCls} />
            </Campo>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent">
              {subindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {arquivoAtual ? 'Trocar arquivo' : 'Anexar nota'}
              <input type="file" className="hidden" accept=".pdf,.xml,image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }} />
            </label>
            {arquivoAtual && (
              <button onClick={abrirNota} className="text-xs underline underline-offset-2">Ver a nota anexada</button>
            )}
          </div>
        </section>

        <section className="mb-5 rounded-lg border">
          <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">Recebimento</h3>
          <div className="grid gap-2 p-3 sm:grid-cols-3">
            <Campo rotulo="Previsto para">
              <input type="date" value={previstoEm} onChange={(e) => setPrevistoEm(e.target.value)} className={inputCls} />
            </Campo>
            <Campo rotulo="Recebido em">
              <input type="date" value={recebidoEm} onChange={(e) => setRecebidoEm(e.target.value)} className={inputCls} />
            </Campo>
            <Campo rotulo="Valor recebido">
              {/* A BRUTA, e não a líquida: é ela que a construtora deposita.
                  O repasse sai depois, da casa para o corretor. */}
              <input inputMode="decimal" value={valorRecebido} placeholder={String(venda.comissao_bruta)}
                onChange={(e) => setValorRecebido(e.target.value)} className={inputCls} />
            </Campo>
          </div>
          <div className="flex justify-end border-t px-3 py-2">
            <button onClick={() => salvar.mutate()} disabled={salvar.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
              {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar conferência
            </button>
          </div>
        </section>

        <section className="mb-5 rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
            <h3 className="text-sm font-semibold">Repasses</h3>
            <button onClick={() => calcular.mutate()} disabled={calcular.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50">
              {calcular.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
              {repasses.length === 0 ? 'Calcular' : 'Recalcular'}
            </button>
          </div>

          {previa && 'impedimento' in previa && (
            <p className="flex items-start gap-2 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {previa.impedimento}
            </p>
          )}

          {repasses.length === 0 && previa && 'linhas' in previa && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Prévia pelas Regras de Comissão Lotus, com o nível congelado da venda. Clique em Calcular para gravar.
            </p>
          )}

          <ul className="divide-y">
            {(repasses.length > 0
              ? repasses
              : (previa && 'linhas' in previa ? previa.linhas.map((l, i) => ({
                  id: `previa-${i}`, papel: l.papel, parte: l.parte, nivel: l.nivel,
                  percentual: l.percentual, valor: l.valor, status: 'a_pagar' as const, pago_em: null,
                })) : [])
            ).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-medium">{r.parte}</span>
                  <span className="ml-1 text-muted-foreground">
                    {r.papel}{r.nivel ? ` · ${rotuloDoNivel(r.nivel)}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{reaisExatos(r.valor)}</span>
                  {!String(r.id).startsWith('previa-') && (
                    <button
                      onClick={() => pagar.mutate({ id: r.id, pago: r.status !== 'pago' })}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        r.status === 'pago'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {r.status === 'pago' ? <><Check className="h-3 w-3" /> pago</> : 'marcar pago'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {(detalhe.data?.historico?.length ?? 0) > 0 && (
          <section className="rounded-lg border">
            <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">Histórico</h3>
            <ul className="divide-y">
              {detalhe.data!.historico.map((h, i) => (
                <li key={i} className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{h.campo}</span>
                  {': '}{h.de ?? '—'} → {h.para ?? '—'}
                  {h.justificativa && <em> · {h.justificativa}</em>}
                  <span className="ml-1">({h.autor}, {new Date(h.em).toLocaleString('pt-BR')})</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Total({
  rotulo, valor, forte, nota,
}: { rotulo: string; valor: string; forte?: boolean; nota?: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={`tabular-nums ${forte ? 'text-sm font-semibold' : 'text-sm'}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[10px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={`text-right tabular-nums ${forte ? 'font-semibold' : ''}`}>{valor}</dd>
    </>
  );
}
