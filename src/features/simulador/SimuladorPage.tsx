/**
 * Ferramentas › Simulador de fluxo de pagamento (P2.2).
 *
 * A tela não calcula nada: chama `calcularFluxo` a cada tecla e desenha o que
 * volta. Os avisos e os impedimentos vêm de lá também — a tela não tem opinião
 * sobre regra de construtora, e é assim que tem de ser.
 *
 * O ESTADO MAIS IMPORTANTE DESTA TELA É "NÃO HÁ TABELA CADASTRADA".
 * Enquanto a condição da construtora não for cadastrada, o simulador diz isso
 * e não simula. É o estado normal hoje, não uma falha.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Ban, Calculator, Copy, FileDown, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { calcularFluxo, type Balao, type Entradas } from './fluxo';
import {
  buscarCondicaoVigente, buscarLancamentos, buscarTipologiasDisponiveis, salvarSimulacao,
} from './simuladorService';

const emReais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Texto digitado → centavos. "389.000,50" e "389000.5" chegam ao mesmo lugar. */
const paraCentavos = (texto: string): number => {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const NOME_DA_PARCELA: Record<string, string> = {
  ato: 'Ato', mensal: 'Mensal', balao: 'Balão',
  financiamento: 'Financiamento na entrega', pos_chaves: 'Pós-chaves',
};

export default function SimuladorPage() {
  const { tenantId, user } = useAuthContext();

  const [lancamentoId, setLancamentoId] = useState('');
  const [tipologiaId, setTipologiaId] = useState('');
  const [renda, setRenda] = useState('');
  const [ato, setAto] = useState('');
  const [atoData, setAtoData] = useState(() => new Date().toISOString().slice(0, 10));
  const [mensaisQtd, setMensaisQtd] = useState('36');
  const [fgts, setFgts] = useState('');
  const [financiado, setFinanciado] = useState('');
  const [posChaves, setPosChaves] = useState('');
  const [posChavesQtd, setPosChavesQtd] = useState('');
  const [baloes, setBaloes] = useState<Balao[]>([]);
  const [salvando, setSalvando] = useState(false);

  const lancamentos = useQuery({
    queryKey: ['simulador-lancamentos', tenantId],
    queryFn: () => buscarLancamentos(tenantId!),
    enabled: !!tenantId && tenantId !== 'owner',
  });

  const tipologias = useQuery({
    queryKey: ['simulador-tipologias', lancamentoId],
    queryFn: () => buscarTipologiasDisponiveis(lancamentoId),
    enabled: !!lancamentoId,
  });

  const condicao = useQuery({
    queryKey: ['simulador-condicao', lancamentoId],
    queryFn: () => buscarCondicaoVigente(lancamentoId),
    enabled: !!lancamentoId,
  });

  const tipologia = tipologias.data?.find((t) => t.id === tipologiaId);
  const valorUnidadeCentavos = tipologia?.preco_a_partir
    ? Math.round(Number(tipologia.preco_a_partir) * 100)
    : 0;

  const entradas: Entradas = useMemo(() => ({
    valorUnidadeCentavos,
    rendaFamiliarCentavos: renda ? paraCentavos(renda) : null,
    atoCentavos: paraCentavos(ato),
    atoData,
    mensaisQtd: Math.max(0, Number(mensaisQtd) || 0),
    baloes,
    fgtsCentavos: paraCentavos(fgts),
    financiadoCentavos: paraCentavos(financiado),
    posChavesCentavos: paraCentavos(posChaves),
    posChavesQtd: Math.max(0, Number(posChavesQtd) || 0),
  }), [valorUnidadeCentavos, renda, ato, atoData, mensaisQtd, baloes, fgts, financiado, posChaves, posChavesQtd]);

  const fluxo = useMemo(
    () => (condicao.data ? calcularFluxo(entradas, condicao.data) : null),
    [entradas, condicao.data],
  );

  const resumoParaWhatsApp = () => {
    if (!fluxo || !tipologia) return '';
    const linhas = [
      `*${lancamentos.data?.find((l) => l.id === lancamentoId)?.nome ?? ''} — ${tipologia.nome}*`,
      `Valor: ${emReais(valorUnidadeCentavos)}`,
      `Ato: ${emReais(entradas.atoCentavos)}`,
      entradas.mensaisQtd > 0
        ? `${entradas.mensaisQtd}x de ${emReais(fluxo.mensalAteChavesCentavos)} até as chaves` : null,
      ...baloes.map((b) => `Balão no mês ${b.mes}: ${emReais(b.valorCentavos)}`),
      entradas.financiadoCentavos > 0 ? `Financiamento na entrega: ${emReais(entradas.financiadoCentavos)}` : null,
      '',
      'Valores sujeitos a correção'
        + (condicao.data?.indice_obra ? ` pelo ${condicao.data.indice_obra}` : '')
        + ' e a confirmação com a construtora.',
    ].filter(Boolean);
    return linhas.join('\n');
  };

  const copiar = async () => {
    await navigator.clipboard.writeText(resumoParaWhatsApp());
    toast.success('Resumo copiado');
  };

  const salvar = async () => {
    if (!fluxo || !tenantId || !user?.id) return;
    setSalvando(true);
    try {
      await salvarSimulacao({
        tenantId, corretorId: user.id, lancamentoId,
        tipologiaId: tipologiaId || null,
        condicaoId: condicao.data?.id ?? null,
        entradas, resultado: fluxo,
        condicaoNome: condicao.data?.nome ?? '',
      });
      toast.success('Simulação salva');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para salvar a simulação');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Simulador de fluxo de pagamento</h1>
        <p className="text-sm text-muted-foreground">
          As regras vêm da tabela de condição da construtora. O simulador não inventa condição.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------------- o formulário ---------------- */}
        <section className="space-y-4 rounded-xl border bg-white p-5 dark:bg-slate-900">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Empreendimento">
              <Select value={lancamentoId} onValueChange={(v) => { setLancamentoId(v); setTipologiaId(''); }}>
                <SelectTrigger><SelectValue placeholder="Escolha o empreendimento" /></SelectTrigger>
                <SelectContent>
                  {(lancamentos.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            <Campo rotulo="Tipologia">
              <Select value={tipologiaId} onValueChange={setTipologiaId} disabled={!lancamentoId}>
                <SelectTrigger><SelectValue placeholder="Escolha a tipologia" /></SelectTrigger>
                <SelectContent>
                  {(tipologias.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id} disabled={!t.disponivel}>
                      {t.nome}
                      {t.preco_a_partir ? ` — ${emReais(Math.round(Number(t.preco_a_partir) * 100))}` : ' — sem preço'}
                      {t.disponivel ? '' : ' (indisponível)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          </div>

          {/* O estado que hoje é o normal: não há tabela cadastrada. */}
          {lancamentoId && condicao.isSuccess && !condicao.data && (
            <Faixa tom="amber" icone={Ban}>
              <strong>Nenhuma tabela de condição cadastrada para este empreendimento.</strong> O
              simulador não calcula sem ela — entrada mínima, prazo e regra de balão são da
              construtora, e chutar qualquer um deles vira promessa num PDF com o logo da casa.
              Cadastre em <em>Configurações › Condições de pagamento</em>.
            </Faixa>
          )}

          {condicao.data && (
            <p className="text-xs text-muted-foreground">
              Tabela em uso: <strong>{condicao.data.nome}</strong>
              {condicao.data.vigente_de && ` · vigente desde ${condicao.data.vigente_de}`}
              {condicao.data.indice_obra && ` · corrigida pelo ${condicao.data.indice_obra}`}
            </p>
          )}

          {tipologia?.preco_atualizado_em && diasDesde(tipologia.preco_atualizado_em) > 30 && (
            <Faixa tom="amber" icone={AlertTriangle}>
              O preço desta tipologia foi conferido em {tipologia.preco_atualizado_em}, há mais de
              30 dias. Confirme com a construtora antes de apresentar.
            </Faixa>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Renda familiar" dica="Opcional. Sem ela não há % da renda.">
              <Input value={renda} onChange={(e) => setRenda(e.target.value)} placeholder="R$ 0,00" />
            </Campo>
            <Campo rotulo="Ato (entrada)">
              <Input value={ato} onChange={(e) => setAto(e.target.value)} placeholder="R$ 0,00" />
            </Campo>
            <Campo rotulo="Data do ato">
              <Input type="date" value={atoData} onChange={(e) => setAtoData(e.target.value)} />
            </Campo>
            <Campo rotulo="Nº de mensais até as chaves">
              <Input type="number" min={0} value={mensaisQtd} onChange={(e) => setMensaisQtd(e.target.value)} />
            </Campo>
            <Campo rotulo="FGTS">
              <Input value={fgts} onChange={(e) => setFgts(e.target.value)} placeholder="R$ 0,00" />
            </Campo>
            <Campo rotulo="Financiamento na entrega">
              <Input value={financiado} onChange={(e) => setFinanciado(e.target.value)} placeholder="R$ 0,00" />
            </Campo>
            <Campo rotulo="Saldo pós-chaves" dica="Só quando a construtora carrega saldo depois da entrega.">
              <Input value={posChaves} onChange={(e) => setPosChaves(e.target.value)} placeholder="R$ 0,00" />
            </Campo>
            <Campo rotulo="Em quantos meses">
              <Input type="number" min={0} value={posChavesQtd} onChange={(e) => setPosChavesQtd(e.target.value)} />
            </Campo>
          </div>

          {/* ---- balões ---- */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Balões</Label>
              <Button type="button" variant="outline" size="sm"
                onClick={() => setBaloes((b) => [...b, { mes: 12, valorCentavos: 0 }])}>
                + Balão
              </Button>
            </div>
            {baloes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum balão.</p>}
            {baloes.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="number" min={1} className="w-24" value={b.mes}
                  onChange={(e) => setBaloes((lista) => lista.map((x, j) =>
                    j === i ? { ...x, mes: Number(e.target.value) || 1 } : x))} />
                <span className="text-xs text-muted-foreground">º mês</span>
                <Input className="flex-1" placeholder="R$ 0,00"
                  defaultValue={b.valorCentavos ? String(b.valorCentavos / 100) : ''}
                  onChange={(e) => setBaloes((lista) => lista.map((x, j) =>
                    j === i ? { ...x, valorCentavos: paraCentavos(e.target.value) } : x))} />
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => setBaloes((lista) => lista.filter((_, j) => j !== i))}>
                  Remover
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- o resultado ---------------- */}
        <aside className="space-y-4">
          {!fluxo && (
            <div className="rounded-xl border bg-white p-5 text-sm text-muted-foreground dark:bg-slate-900">
              <Calculator className="mb-2 h-5 w-5" />
              Escolha o empreendimento e a tipologia para simular.
            </div>
          )}

          {fluxo?.impedimentos.map((i) => (
            <Faixa key={i.campo} tom="red" icone={Ban}>{i.texto}</Faixa>
          ))}

          {fluxo && fluxo.impedimentos.length === 0 && (
            <>
              <div className="rounded-xl border bg-white p-5 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Mensal até as chaves</p>
                <p className="text-3xl font-semibold">{emReais(fluxo.mensalAteChavesCentavos)}</p>
                {fluxo.pctDaRenda != null && (
                  <p className={`mt-1 text-sm ${fluxo.pctDaRenda > 30 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {fluxo.pctDaRenda}% da renda declarada
                  </p>
                )}
                <dl className="mt-4 space-y-1 text-sm">
                  <Linha rotulo="Total até as chaves" valor={emReais(fluxo.totalAteChavesCentavos)} />
                  <Linha rotulo="Financiamento na entrega" valor={emReais(fluxo.financiamentoCentavos)} />
                  {fluxo.saldoPosChavesCentavos > 0 && (
                    <Linha rotulo="Saldo pós-chaves" valor={emReais(fluxo.saldoPosChavesCentavos)} />
                  )}
                  <Linha rotulo="Chaves em" valor={fluxo.dataDasChaves} />
                </dl>
              </div>

              {fluxo.avisos.map((a) => (
                <Faixa key={a.campo + a.texto} tom="amber" icone={AlertTriangle}>{a.texto}</Faixa>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button onClick={salvar} disabled={salvando || !tipologiaId}>
                  <Save className="mr-1.5 h-4 w-4" /> Salvar no lead
                </Button>
                <Button variant="outline" onClick={copiar}>
                  <Copy className="mr-1.5 h-4 w-4" /> Copiar resumo
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <FileDown className="mr-1.5 h-4 w-4" /> Folha para o cliente
                </Button>
              </div>

              <div className="rounded-xl border bg-white dark:bg-slate-900">
                <header className="border-b px-4 py-2.5 text-sm font-semibold">Mês a mês</header>
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {fluxo.parcelas.map((p, i) => (
                        <tr key={i}>
                          <td className="px-4 py-1.5 text-muted-foreground">{p.mes === 0 ? '—' : p.mes}</td>
                          <td className="px-2 py-1.5">{NOME_DA_PARCELA[p.tipo]}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{p.data}</td>
                          <td className="px-4 py-1.5 text-right font-medium">{emReais(p.valorCentavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {condicao.data?.indice_obra && (
                  <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                    Estimativa: os valores até as chaves são corrigidos pelo{' '}
                    {condicao.data.indice_obra} e não estão projetados aqui.
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

const diasDesde = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{rotulo}</Label>
      {children}
      {dica && <p className="text-[11px] text-muted-foreground">{dica}</p>}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}

function Faixa({ tom, icone: Icone, children }: {
  tom: 'amber' | 'red'; icone: typeof AlertTriangle; children: React.ReactNode;
}) {
  const cores = tom === 'red'
    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  return (
    <p className={`flex gap-2 rounded-lg border p-3 text-sm ${cores}`}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
