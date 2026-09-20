/**
 * A lista de leads com abas de ação (P1.8).
 *
 * Cada aba responde "o que eu faço agora", e não "em que estágio isto está" —
 * o Kanban já responde a segunda. As seis abas foram aprovadas pelo chefe em
 * 20/09/2026, com os números da Lotus na mesa.
 *
 * O CONTADOR E A LISTA VÊM DA MESMA CHAMADA, porque o plano define o item
 * como pronto quando os dois batem. Uma aba que promete 312 e abre com 280
 * destrói a confiança na tela inteira.
 *
 * As colunas que este arquivo NÃO calcula — sub-status, dias parado e score —
 * vêm dos itens anteriores, pelas mesmas funções que o Kanban usa. Recalcular
 * aqui criaria a terceira verdade sobre o mesmo lead.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  ABAS, buscarListaDeLeads, type AbaId, type ResultadoDaLista,
} from '../services/listaDeLeadsService';
import { buscarUltimaMovimentacao, type Movimentacao } from '../services/movimentacaoService';
import { buscarSinaisDeScore, buscarConfiguracaoDoScore } from '../services/scoreService';
import { seloDeParado } from '../utils/diasParado';
import { seloDeSubStatus } from '../utils/subStatus';
import {
  calcularScore, corDaTemperatura, PESOS_PADRAO, type PesosDoScore, type SinaisDoLead,
} from '../utils/score';

const POR_PAGINA = 50;

const soDigitos = (t: string) => t.replace(/\D/g, '');
const telefoneBonito = (t: string | null) => {
  const d = soDigitos(String(t ?? '')).replace(/^55/, '');
  if (d.length < 10) return t ?? '—';
  return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;
};

export function ListaDeLeadsSection() {
  const { tenantId } = useAuth();

  const [aba, setAba] = useState<AbaId>('todos');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pagina, setPagina] = useState(0);

  const [dados, setDados] = useState<ResultadoDaLista | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // As colunas dos itens anteriores, para as linhas VISÍVEIS apenas.
  const [movimentacoes, setMovimentacoes] = useState<Record<string, Movimentacao>>({});
  const [sinais, setSinais] = useState<Record<string, SinaisDoLead>>({});
  const [pesos, setPesos] = useState<PesosDoScore>(PESOS_PADRAO);
  const [pesoPorOrigem, setPesoPorOrigem] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') return;
    let cancelado = false;
    buscarConfiguracaoDoScore(tenantId).then((c) => {
      if (cancelado) return;
      setPesos(c.pesos);
      setPesoPorOrigem(c.porOrigem);
    });
    return () => { cancelado = true; };
  }, [tenantId]);

  const carregar = useCallback(async () => {
    if (!tenantId || tenantId === 'owner') { setCarregando(false); return; }
    setCarregando(true);
    try {
      const r = await buscarListaDeLeads(tenantId, {
        aba, busca: buscaAplicada, limite: POR_PAGINA, offset: pagina * POR_PAGINA,
      });
      setDados(r);
      setErro(null);

      // Enriquecimento só da página: 50 linhas, duas chamadas. Uma por linha
      // seria o N+1 que o P0.7 tirou da Central de Leads.
      const ids = r.linhas.map((l) => l.id);
      if (ids.length > 0) {
        const [mv, sn] = await Promise.all([
          buscarUltimaMovimentacao(tenantId, ids).catch(() => ({})),
          buscarSinaisDeScore(tenantId, ids).catch(() => ({})),
        ]);
        setMovimentacoes(mv);
        setSinais(sn);
      } else {
        setMovimentacoes({});
        setSinais({});
      }
    } catch (e) {
      // Erro não pode virar "nenhum lead": a tela diria que a imobiliária
      // está vazia quando o que houve foi uma falha de leitura.
      setErro((e as { message?: string })?.message ?? 'não foi possível carregar a lista');
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [tenantId, aba, buscaAplicada, pagina]);

  useEffect(() => { carregar(); }, [carregar]);

  const trocarAba = (nova: AbaId) => { setAba(nova); setPagina(0); };
  const aplicarBusca = () => { setBuscaAplicada(busca); setPagina(0); };

  const legenda = useMemo(() => ABAS.find((a) => a.id === aba)?.legenda ?? '', [aba]);
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total_na_aba / POR_PAGINA)) : 1;

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-text-secondary">Selecione uma imobiliária.</p>;
  }

  return (
    <div className="space-y-3 p-6">
      {/* Abas, cada uma com seu contador */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Abas da lista de leads">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          const n = dados?.contadores?.[a.id];
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => trocarAba(a.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                ativa
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {a.rotulo}
              {typeof n === 'number' && (
                <span className={`tabular-nums ${ativa ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-text-secondary">{legenda}</p>

      {/* Busca */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') aplicarBusca(); }}
            placeholder="Nome, telefone ou código do imóvel"
            aria-label="Buscar leads"
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-sm"
          />
          {busca && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => { setBusca(''); setBuscaAplicada(''); setPagina(0); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={aplicarBusca}
          className="h-9 rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Buscar
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Não foi possível carregar a lista: {erro}
          <button type="button" onClick={carregar} className="ml-2 font-medium underline">tentar de novo</button>
        </div>
      )}

      {carregando && !dados && (
        <div className="flex items-center gap-2 py-12 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> carregando…
        </div>
      )}

      {dados && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[1080px] text-left text-[13px]">
              <thead className="border-b border-border bg-slate-50 text-[11px] uppercase tracking-wide text-text-secondary dark:bg-slate-900/60">
                <tr>
                  <th className="px-3 py-2 font-semibold">Nome</th>
                  <th className="px-3 py-2 font-semibold">Telefone</th>
                  <th className="px-3 py-2 font-semibold">De quem é</th>
                  <th className="px-3 py-2 font-semibold">Etapa</th>
                  <th className="px-3 py-2 font-semibold">Parado</th>
                  <th className="px-3 py-2 font-semibold">Score</th>
                  <th className="px-3 py-2 font-semibold">Origem</th>
                  <th className="px-3 py-2 font-semibold">Imóvel</th>
                  <th className="px-3 py-2 font-semibold">Corretor</th>
                  <th className="px-3 py-2 font-semibold">Atividade</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => {
                  const mv = movimentacoes[l.id];
                  const parado = seloDeParado(mv?.ultima ?? l.ultima_movimentacao, mv?.fonte);
                  const bola = seloDeSubStatus(l.corretor, mv?.liaPassou, mv?.liaAtendeu);
                  const sn = sinais[l.id];
                  const av = sn
                    ? calcularScore(
                        { ...sn, peso_da_origem: pesoPorOrigem[String(l.origem ?? '').trim().toLowerCase()] ?? 0 },
                        pesos
                      )
                    : null;
                  return (
                    <tr key={l.id} className="border-b border-border/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-medium">{l.nome || 'Lead sem nome'}</td>
                      <td className="px-3 py-2 tabular-nums text-text-secondary">{telefoneBonito(l.telefone)}</td>
                      <td className="px-3 py-2">
                        {bola ? (
                          <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${bola.classe}`} title={bola.explicacao}>
                            {bola.texto}
                          </span>
                        ) : (
                          <span className="text-[12px] text-text-secondary">com o corretor</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{l.etapa || '—'}</td>
                      <td className="px-3 py-2">
                        {parado ? (
                          <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${parado.classe}`} title={parado.explicacao}>
                            {parado.texto}
                          </span>
                        ) : mv?.ultima ? (
                          <span className="text-[12px] text-text-secondary">em dia</span>
                        ) : (
                          <span className="text-[12px] italic text-text-secondary">sem registro</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {av ? (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${corDaTemperatura(av.temperatura)}`}
                            title={av.sinaisObservados === 0
                              ? 'Nenhum sinal observado ainda — ponto de partida, não avaliado.'
                              : `${av.score}/100`}
                          >
                            {av.score} {av.temperatura}
                          </span>
                        ) : (
                          <span className="text-[12px] text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{l.origem || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-text-secondary">{l.imovel || '—'}</td>
                      <td className="px-3 py-2 truncate max-w-[180px] text-text-secondary" title={l.corretor ?? ''}>
                        {l.corretor || <span className="italic">sem corretor</span>}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {l.tem_atividade ? 'agendada' : '—'}
                      </td>
                    </tr>
                  );
                })}
                {dados.linhas.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-[13px] text-text-secondary">
                      {buscaAplicada
                        ? `Nenhum lead nesta aba para “${buscaAplicada}”.`
                        : 'Nenhum lead nesta aba.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Rodapé de contexto — os três números que o plano pede */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-text-secondary">
              <strong className="tabular-nums">{dados.linhas.length}</strong> na tela ·{' '}
              <strong className="tabular-nums">{dados.total_na_aba}</strong> nesta aba ·{' '}
              <strong className="tabular-nums">{dados.total_na_base}</strong> na base
              {dados.sem_historico > 0 && (
                <>
                  {' '}·{' '}
                  <span title="O registro de movimentação começou em 10/09/2026. Estes leads ainda não têm histórico, e por isso não aparecem na aba Parados.">
                    <strong className="tabular-nums">{dados.sem_historico}</strong> sem histórico ainda
                  </span>
                </>
              )}
            </p>

            {totalPaginas > 1 && (
              <div className="flex items-center gap-2 text-[12px]">
                <button
                  type="button"
                  disabled={pagina === 0 || carregando}
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                  className="rounded-lg border border-border px-2.5 py-1 disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="tabular-nums text-text-secondary">
                  {pagina + 1} de {totalPaginas}
                </span>
                <button
                  type="button"
                  disabled={pagina + 1 >= totalPaginas || carregando}
                  onClick={() => setPagina((p) => p + 1)}
                  className="rounded-lg border border-border px-2.5 py-1 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
