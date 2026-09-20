/**
 * O painel ao vivo da distribuição (P1.3) — a parte que só desenha.
 *
 * Mostra o que aconteceu nas últimas 24 h: quantos leads a Lia consultou,
 * quantos foram enviados, atendidos e quantos venceram o prazo — e a linha do
 * tempo de cada acontecimento, com o PORQUÊ.
 *
 * O extrato é a fonte, não um estado calculado: cada linha é um
 * acontecimento, e é por isso que dá para responder "por que este lead foi
 * para este corretor" meses depois.
 *
 * ZERO É UM NÚMERO PLAUSÍVEL, e foi assim que outros painéis desta base
 * enganaram por meses. Painel vazio porque a Lia ainda não consultou é
 * diferente de painel vazio porque não chegou lead — e a tela diz qual é.
 */

import { AlertTriangle, CheckCircle2, Send, Search } from 'lucide-react';
import { TEXTO_DO_MOTIVO } from './regraDoServidor';

export interface EventoDistribuicao {
  id: string;
  lead_id: string | null;
  lead_ref: string | null;
  evento: string;
  corretor_id: string | null;
  motivo: string;
  tipo: string | null;
  prazo_ate: string | null;
  origem: string;
  created_at: string;
}

interface Props {
  eventos: EventoDistribuicao[];
  /** id do corretor -> como chamá-lo na tela. */
  nomes: Record<string, string>;
  /** Houve algum acontecimento algum dia? Separa "ainda não começou" de "hoje não veio". */
  jaHouveAlgum: boolean;
  agora?: Date;
}

const TEXTO_DO_EVENTO: Record<string, string> = {
  consultado: 'a Lia perguntou de quem é',
  enviado: 'a Lia atribuiu',
  atendido: 'o corretor atendeu',
  expirou: 'passou do prazo sem atendimento',
  roleta: 'foi para o próximo da fila',
  bolsao: 'foi para o bolsão',
  manual: 'alguém atribuiu na mão',
};

const COR_DO_EVENTO: Record<string, string> = {
  consultado: 'bg-slate-400',
  enviado: 'bg-blue-500',
  atendido: 'bg-emerald-500',
  expirou: 'bg-rose-500',
  roleta: 'bg-amber-500',
  bolsao: 'bg-amber-500',
  manual: 'bg-violet-500',
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Em quanto tempo o prazo vence — ou há quanto venceu.
 *
 * Devolve nulo quando não há prazo: lead que foi para a Lia ou para ninguém
 * não tem relógio correndo, e inventar um "0 min" ali seria dizer que
 * venceu.
 */
export function situacaoDoPrazo(prazoAte: string | null, agora: Date) {
  if (!prazoAte) return null;
  const t = Date.parse(prazoAte);
  if (!Number.isFinite(t)) return null;
  const minutos = Math.round((t - agora.getTime()) / 60000);
  if (minutos < 0) return { texto: `venceu há ${-minutos} min`, cor: 'text-rose-600 dark:text-rose-400' };
  if (minutos <= 15) return { texto: `vence em ${minutos} min`, cor: 'text-amber-600 dark:text-amber-400' };
  return { texto: `vence em ${minutos} min`, cor: 'text-slate-500 dark:text-slate-400' };
}

/**
 * Os leads cujo relógio JÁ PAROU — foram atendidos ou já venceram.
 *
 * Sem isto, a linha do "a Lia atribuiu" de um lead atendido no prazo passaria
 * a exibir "venceu há 40 min" em vermelho assim que o prazo daquele momento
 * passasse. O gestor leria um lead perdido onde houve um lead atendido, e é o
 * tipo de alarme falso que faz o painel inteiro perder a confiança.
 */
function relogioParado(eventos: EventoDistribuicao[]) {
  const parados = new Set<string>();
  for (const ev of eventos) {
    const chave = ev.lead_id ?? ev.lead_ref;
    if (chave && (ev.evento === 'atendido' || ev.evento === 'expirou')) parados.add(chave);
  }
  return parados;
}

/** Os contadores da janela, contados das MESMAS linhas que a lista mostra. */
export function contar(eventos: EventoDistribuicao[]) {
  const por = (e: string) => eventos.filter((x) => x.evento === e).length;
  return {
    consultados: por('consultado'),
    enviados: por('enviado'),
    atendidos: por('atendido'),
    expirados: por('expirou'),
  };
}

const Contador = ({ icone: Icone, rotulo, valor, cor }: {
  icone: typeof Search; rotulo: string; valor: number; cor: string;
}) => (
  <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
      <Icone className={`h-3.5 w-3.5 ${cor}`} />
      {rotulo}
    </p>
    <p className="mt-1 text-[26px] font-semibold tabular-nums leading-none">{valor}</p>
  </div>
);

export function ExtratoDistribuicao({ eventos, nomes, jaHouveAlgum, agora = new Date() }: Props) {
  const c = contar(eventos);
  const parados = relogioParado(eventos);
  const nomeDe = (id: string | null) => (id ? nomes[id] || id.slice(0, 8) : null);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Contador icone={Search} rotulo="Consultas" valor={c.consultados} cor="text-slate-500" />
        <Contador icone={Send} rotulo="Enviados" valor={c.enviados} cor="text-blue-500" />
        <Contador icone={CheckCircle2} rotulo="Atendidos" valor={c.atendidos} cor="text-emerald-500" />
        <Contador icone={AlertTriangle} rotulo="Venceram" valor={c.expirados} cor="text-rose-500" />
      </div>
      <p className="text-[12px] text-text-secondary">
        Nas últimas 24 horas. Contados das mesmas linhas listadas abaixo.
      </p>

      {eventos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-[13px] text-text-secondary">
          {jaHouveAlgum
            ? 'Nenhum lead passou pela distribuição nas últimas 24 horas.'
            : 'A Lia ainda não consultou a regra nenhuma vez. Enquanto ela não consultar, este painel fica vazio — e isso não é falha da tela.'}
        </p>
      ) : (
        <ul className="rounded-xl border border-border bg-card/60 p-4">
          {eventos.map((ev) => {
            const chave = ev.lead_id ?? ev.lead_ref;
            const prazo = chave && parados.has(chave) ? null : situacaoDoPrazo(ev.prazo_ate, agora);
            const quem = nomeDe(ev.corretor_id);
            return (
              <li
                key={ev.id}
                className="relative pl-5 pb-3 last:pb-0 before:absolute before:left-1 before:top-0 before:bottom-0 before:w-px before:bg-border"
              >
                <span className="absolute left-0 top-[6px] h-2 w-2 rounded-full ring-2 ring-card">
                  <span className={`block h-2 w-2 rounded-full ${COR_DO_EVENTO[ev.evento] ?? 'bg-slate-400'}`} />
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-medium">
                    {TEXTO_DO_EVENTO[ev.evento] ?? ev.evento}
                    {quem ? <span className="text-text-secondary"> — {quem}</span> : null}
                  </p>
                  <span className="shrink-0 text-[11px] tabular-nums text-text-secondary">{hora(ev.created_at)}</span>
                </div>
                <p className="truncate text-[12px] text-text-secondary">
                  {TEXTO_DO_MOTIVO[ev.motivo] ?? ev.motivo}
                  {ev.lead_ref ? ` · lead ${ev.lead_ref}` : ''}
                  {ev.origem !== 'lia' ? ` · por ${ev.origem}` : ''}
                  {prazo ? <span className={`ml-1 ${prazo.cor}`}>· {prazo.texto}</span> : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
