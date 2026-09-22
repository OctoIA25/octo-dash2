/**
 * O relógio do prazo, no card do lead (P1.1).
 *
 * O plano pede: *"Card do lead: relógio 'atender em 42 min' enquanto não
 * atendido"*.
 *
 * O DETALHE QUE FAZ ESTE MÓDULO EXISTIR: 42 minutos de QUÊ.
 *
 * O prazo é de uma hora **de expediente**, e o expediente é 9h–20h de segunda a
 * sexta. Um relógio de parede diria "faltam 14 horas" para um lead que chegou
 * na sexta às 19h30 — quando o que falta são 30 minutos de trabalho, que só
 * correm na segunda. E diria "atrasado há 60 horas" no domingo à noite para um
 * lead que ainda tem a hora inteira pela frente.
 *
 * Por isso a conta usa `minutosUteisEntre`, a MESMA função que calculou o
 * prazo. Duas contas diferentes para o mesmo relógio é como o card passaria a
 * cobrar um prazo que o servidor não cobra.
 */

import { minutosUteisEntre, JANELA_PADRAO } from '../../../server/distribuicao/janela.js';

export type Situacao = 'sem_prazo' | 'atendido' | 'correndo' | 'estourado';

export interface Relogio {
  situacao: Situacao;
  /** Minutos ÚTEIS que faltam (ou que já passaram, quando estourado). */
  minutos: number;
  texto: string;
}

/** "42 min", "2h 05", "3 dias" — o quanto, em linguagem de gente. */
export function emPalavras(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const horas = Math.floor(m / 60);
  // Acima de um dia de expediente (11h), contar em horas deixa de ajudar.
  if (horas >= 11) {
    const dias = Math.round(horas / 11);
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }
  return `${horas}h ${String(m % 60).padStart(2, '0')}`;
}

/**
 * Quanto falta para o corretor atender este lead.
 *
 * `prazoAte` vem do extrato da distribuição — a Dash não grava prazo em
 * `leads`, porque quem atribui é a Lia. `atendidoEm` preenchido para o relógio
 * de vez: atendido é atendido, mesmo fora do prazo.
 */
export function relogioDoPrazo({
  prazoAte,
  atendidoEm = null,
  agora = new Date(),
  janela = JANELA_PADRAO,
}: {
  prazoAte: string | Date | null | undefined;
  atendidoEm?: string | Date | null;
  agora?: Date;
  janela?: unknown;
}): Relogio {
  if (atendidoEm) return { situacao: 'atendido', minutos: 0, texto: 'atendido' };

  const prazo = prazoAte instanceof Date ? prazoAte : prazoAte ? new Date(prazoAte) : null;
  // Sem prazo o card não inventa um: lead que a Lia ainda não passou não tem
  // relógio, e mostrar "atender em 60 min" ali seria cobrar do corretor um
  // lead que não é dele.
  if (!prazo || Number.isNaN(prazo.getTime())) {
    return { situacao: 'sem_prazo', minutos: 0, texto: '' };
  }

  if (agora > prazo) {
    const minutos = minutosUteisEntre(prazo, agora, janela);
    return { situacao: 'estourado', minutos, texto: `atrasado ${emPalavras(minutos)}` };
  }

  const minutos = minutosUteisEntre(agora, prazo, janela);
  return { situacao: 'correndo', minutos, texto: `atender em ${emPalavras(minutos)}` };
}

/** A cor do selo. Vermelho só quando estourou — amarelo na última meia hora. */
export function corDoRelogio(r: Relogio): string {
  if (r.situacao === 'estourado') return 'text-red-700 bg-red-100 dark:bg-red-950/50 dark:text-red-300';
  if (r.situacao === 'atendido') return 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300';
  if (r.minutos <= 30) return 'text-amber-800 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300';
  return 'text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300';
}
