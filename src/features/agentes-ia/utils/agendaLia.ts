/**
 * Agenda da LIA (P2.5) — como cada linha se lê na tela.
 *
 * Tudo em `America/Sao_Paulo`. O banco guarda UTC e o cliente vive em Brasília;
 * mostrar "16h" para um retorno que sai às 13h é a forma mais rápida de o
 * gestor deixar de confiar na tela.
 */

import type { LinhaDaAgenda, QuemPediu } from '../services/agendaLiaService';

const FUSO = 'America/Sao_Paulo';

export const ROTULO_DE_QUEM_PEDIU: Record<QuemPediu, string> = {
  lead: 'o cliente pediu',
  lia: 'cadência da LIA',
  corretor: 'agendado pelo corretor',
};

/** "hoje 16:00", "amanhã 09:30", "23/09 14:00" — sempre em Brasília. */
export function quandoCurto(iso: string | null | undefined, agora: number = Date.now()): string {
  if (!iso) return 'sem hora';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'sem hora';

  const dia = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: FUSO });
  const hora = new Date(t).toLocaleTimeString('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
  });

  const hoje = dia(agora);
  const amanha = dia(agora + 86_400_000);
  const ontem = dia(agora - 86_400_000);
  const dela = dia(t);

  if (dela === hoje) return `hoje ${hora}`;
  if (dela === amanha) return `amanhã ${hora}`;
  if (dela === ontem) return `ontem ${hora}`;
  const [, m, d] = dela.split('-');
  return `${d}/${m} ${hora}`;
}

export interface SituacaoDaLinha {
  texto: string;
  classe: string;
}

/**
 * O que aconteceu com aquela linha, em uma frase.
 *
 * "Não saiu" sem motivo é dito COMO ESTÁ. Em produção, 48 das 84 linhas que não
 * saíram não registram por quê; inventar uma explicação seria pior do que
 * admitir que o disparador não contou.
 */
export function situacaoDaLinha(l: LinhaDaAgenda, agora: number = Date.now()): SituacaoDaLinha {
  if (l.status === 'sent') {
    return { texto: `enviado ${quandoCurto(l.enviado_em, agora)}`, classe: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (l.status === 'expired') {
    const porque = l.erro || l.cancelado_por;
    return {
      texto: porque ? `não saiu — ${porque}` : 'não saiu, e o disparador não disse por quê',
      classe: 'text-rose-600 dark:text-rose-400',
    };
  }
  if (l.status === 'cancelled') {
    return {
      texto: l.cancelado_por === 'lead_returned' ? 'cancelado — o cliente voltou a falar' : 'cancelado',
      classe: 'text-slate-500 dark:text-slate-400',
    };
  }
  // pending
  const t = Date.parse(l.quando);
  if (Number.isFinite(t) && t <= agora) {
    return { texto: 'passou da hora e não saiu', classe: 'text-rose-600 dark:text-rose-400' };
  }
  return { texto: 'a cumprir', classe: 'text-slate-500 dark:text-slate-400' };
}

/**
 * O retorno pedido pelo lead que está com um corretor não é mandado pela LIA —
 * o corretor é avisado e fala ele mesmo. Decidido pelo chefe em 21/09/2026,
 * respondendo à pergunta que o próprio plano manda fazer.
 *
 * A tela precisa dizer isso: senão o gestor vê "a cumprir" e espera uma
 * mensagem da LIA que, de propósito, não vai sair.
 */
export function quemVaiFalar(l: LinhaDaAgenda): string | null {
  if (l.status !== 'pending' || l.pedido_por !== 'lead') return null;
  return l.corretor_id
    ? `${l.corretor_nome || 'o corretor do lead'} é quem fala — a LIA só avisa`
    : 'a LIA manda a mensagem';
}

/** A frase do plano, a partir da janela que o banco guarda pelo complemento. */
export function fraseDoNaoIncomodar(das: string, ate: string): string {
  const hhmm = (s: string) => String(s).slice(0, 5);
  return `Não incomodar antes das ${hhmm(das)} nem depois das ${hhmm(ate)}`;
}
