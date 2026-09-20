/**
 * A tabela de pontos do score, em Configurações (P1.7).
 *
 * O plano diz do Aether: "os critérios não aparecem em lugar nenhum… não há
 * tela explicando por que um lead tem 32 e outro 94". Esta tela é o oposto
 * disso — cada peso visível, editável, e um exemplo vivo mostrando o que a
 * conta faz com os números que estão na tela agora.
 *
 * Calibrar score é iterativo: o número certo só aparece depois de olhar o
 * resultado. Por isso os pesos ficam no banco, e não no código.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  calcularScore, corDaTemperatura, PESOS_PADRAO, type PesosDoScore,
} from '../utils/score';
import { buscarConfiguracaoDoScore, salvarPesosDoScore } from '../services/scoreService';

interface Props {
  tenantId?: string | null;
  isAdmin?: boolean;
}

/** Os sinais, na ordem em que o plano os lista. */
const SINAIS: Array<{ chave: keyof PesosDoScore; rotulo: string }> = [
  { chave: 'peso_respondeu', rotulo: 'Respondeu à Lia' },
  { chave: 'peso_resposta_ate_10min', rotulo: 'Respondeu em até 10 minutos' },
  { chave: 'peso_resposta_ate_1h', rotulo: 'Respondeu em até 1 hora' },
  { chave: 'peso_disse_o_que_procura', rotulo: 'Disse o que procura' },
  { chave: 'peso_renda_compativel', rotulo: 'Renda ou faixa de valor compatível' },
  { chave: 'peso_renda_incompativel', rotulo: 'Renda ou faixa de valor incompatível' },
  { chave: 'peso_pediu_visita', rotulo: 'Pediu visita ou aceitou agendar' },
  { chave: 'peso_pediu_simulacao', rotulo: 'Pediu simulação ou condição de pagamento' },
  { chave: 'peso_origem_maximo', rotulo: 'Teto do bônus por origem' },
  { chave: 'peso_conversou_3_dias', rotulo: 'Conversou nos últimos 3 dias' },
  { chave: 'peso_sem_resposta_7_dias', rotulo: 'Sem conversa há 7 dias ou mais' },
  { chave: 'peso_so_pesquisando', rotulo: 'Disse que só está pesquisando' },
];

/** Quais sinais a Lia precisa reportar — a Dash não tem como saber sozinha. */
const VEM_DA_LIA = new Set<keyof PesosDoScore>([
  'peso_renda_compativel',
  'peso_renda_incompativel',
  'peso_pediu_simulacao',
  'peso_so_pesquisando',
]);

const Numero = ({ id, valor, onChange, disabled, min = -100 }: {
  id: string; valor: number; onChange: (n: number) => void; disabled?: boolean; min?: number;
}) => (
  <input
    id={id}
    type="number"
    min={min}
    max={100}
    disabled={disabled}
    value={valor}
    onChange={(e) => onChange(Math.max(min, Math.min(100, Number(e.target.value) || 0)))}
    className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-right text-sm tabular-nums disabled:opacity-50"
  />
);

export function ScoreConfigPanel({ tenantId, isAdmin }: Props) {
  const { toast } = useToast();
  const [pesos, setPesos] = useState<PesosDoScore>(PESOS_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') { setCarregando(false); return; }
    let cancelado = false;
    setCarregando(true);
    buscarConfiguracaoDoScore(tenantId)
      .then((c) => { if (!cancelado) setPesos(c.pesos); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [tenantId]);

  /**
   * Um exemplo vivo, com os pesos que estão na tela AGORA.
   *
   * Sem isto, o gestor mexe num número e só descobre o efeito dias depois,
   * olhando o quadro. Aqui ele vê na hora o que a conta faz.
   */
  const exemplos = useMemo(() => ([
    {
      nome: 'Respondeu rápido e pediu visita',
      r: calcularScore({ respondeu: true, minutos_para_responder: 4, pediu_visita: true, disse_o_que_procura: true }, pesos),
    },
    {
      nome: 'Só pesquisando, sem conversa há 10 dias',
      r: calcularScore({ respondeu: true, so_pesquisando: true, sem_resposta_ha_dias: 10 }, pesos),
    },
    {
      nome: 'Nenhum sinal observado',
      r: calcularScore({}, pesos),
    },
  ]), [pesos]);

  const salvar = async () => {
    if (!tenantId) return;
    setSalvando(true);
    try {
      await salvarPesosDoScore(tenantId, pesos);
      toast({ title: 'Tabela de pontos salva', className: 'bg-green-500/10 border-green-500/50' });
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: (e as { message?: string })?.message ?? 'erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-text-secondary">Selecione uma imobiliária.</p>;
  }
  if (carregando) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> carregando…
      </div>
    );
  }

  const trava = !isAdmin || salvando;
  const faixasInvalidas = pesos.limite_morno >= pesos.limite_quente;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <p className="text-[13px] text-text-secondary">
          Todo lead começa no ponto de partida e os sinais somam ou subtraem. A{' '}
          <strong>temperatura sai do score</strong> — os dois nunca se contradizem. O score{' '}
          <strong>não distribui lead</strong>: ele informa e ordena, e quem decide de quem é o lead
          continua sendo a regra da distribuição.
        </p>

        <div className="mt-4 flex items-center justify-between gap-4 border-b border-border py-2">
          <label htmlFor="ponto-de-partida" className="text-[13.5px] font-medium">Ponto de partida</label>
          <Numero id="ponto-de-partida" min={0} valor={pesos.ponto_de_partida}
            disabled={trava} onChange={(n) => setPesos((p) => ({ ...p, ponto_de_partida: n }))} />
        </div>

        {SINAIS.map(({ chave, rotulo }) => (
          <div key={chave} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
            <label htmlFor={`peso-${chave}`} className="text-[13px]">
              {rotulo}
              {VEM_DA_LIA.has(chave) && (
                <span
                  className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                  title="A Dash não tem como observar este sinal sozinha: ele chega pela Lia, que é quem conversa com o lead."
                >
                  vem da Lia
                </span>
              )}
            </label>
            <Numero
              id={`peso-${chave}`}
              min={chave === 'peso_origem_maximo' ? 0 : -100}
              valor={pesos[chave] as number}
              disabled={trava}
              onChange={(n) => setPesos((p) => ({ ...p, [chave]: n }))}
            />
          </div>
        ))}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="limite-morno" className="text-[13px]">A partir daqui é <strong>Morno</strong></label>
            <Numero id="limite-morno" min={1} valor={pesos.limite_morno}
              disabled={trava} onChange={(n) => setPesos((p) => ({ ...p, limite_morno: n }))} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="limite-quente" className="text-[13px]">A partir daqui é <strong>Quente</strong></label>
            <Numero id="limite-quente" min={2} valor={pesos.limite_quente}
              disabled={trava} onChange={(n) => setPesos((p) => ({ ...p, limite_quente: n }))} />
          </div>
        </div>
        {faixasInvalidas && (
          <p className="mt-2 text-[12px] font-medium text-rose-600 dark:text-rose-400">
            O limite de Morno precisa ser menor que o de Quente — senão não existe faixa Morno.
          </p>
        )}

        <div className="mt-5 rounded-lg border border-border bg-background p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Com estes pesos, agora
          </p>
          <ul className="mt-2 space-y-1.5">
            {exemplos.map((e) => (
              <li key={e.nome} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-text-secondary">{e.nome}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${corDaTemperatura(e.r.temperatura)}`}>
                  {e.r.score} · {e.r.temperatura}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={salvar}
            disabled={trava || faixasInvalidas}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setPesos(PESOS_PADRAO)}
            disabled={trava}
            className="text-[13px] font-medium text-text-secondary hover:underline disabled:opacity-50"
          >
            Voltar à tabela do plano
          </button>
          {!isAdmin && (
            <span className="text-[12px] text-text-secondary">
              Só quem administra a imobiliária muda a tabela.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
