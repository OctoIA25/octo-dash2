/**
 * Atas de reunião (P4.8) — a parte que pensa, sem tela e sem banco.
 *
 * A REGRA DO PLANO — "revisão humana antes de criar as tarefas" — aparece aqui
 * como uma coisa só: nada vira tarefa enquanto houver linha sem responsável
 * APONTADO. O que a transcrição chamou de responsável é uma palavra, não uma
 * pessoa, e criar tarefa a partir de palavra é criar tarefa para ninguém.
 */

import type { Ata, AtaNaLista, TarefaDaAta } from './atasService';

export const ROTULO_DO_STATUS: Record<AtaNaLista['status'], string> = {
  enviada: 'Aguardando leitura',
  lida: 'Lida — falta revisar',
  revisada: 'Tarefas criadas',
};

/** As que contam: descartada não é tarefa, e o que já está na agenda saiu da fila. */
export const tarefasVivas = (t: TarefaDaAta[] | null | undefined): TarefaDaAta[] =>
  (t ?? []).filter((x) => !x.descartada);

/**
 * Quem ainda não foi apontado.
 *
 * Devolve a LISTA, e não um booleano, porque a tela precisa dizer QUAIS —
 * "falta apontar alguém" sem dizer quem manda a pessoa procurar no escuro.
 */
export const semResponsavel = (t: TarefaDaAta[] | null | undefined): TarefaDaAta[] =>
  tarefasVivas(t).filter((x) => !x.responsavel_email && !x.na_agenda);

export function podeCriarTarefas(a: Ata | null | undefined): boolean {
  if (!a || a.tarefas_criadas_em) return false;
  const vivas = tarefasVivas(a.tarefas);
  return vivas.length > 0 && semResponsavel(a.tarefas).length === 0;
}

/**
 * Por que o botão está desligado.
 *
 * Um botão cinza sem explicação é a forma mais comum de a pessoa achar que o
 * sistema quebrou.
 */
export function porQueNaoPodeCriar(a: Ata | null | undefined): string | null {
  if (!a) return null;
  if (a.tarefas_criadas_em) return 'As tarefas desta ata já foram criadas.';
  const vivas = tarefasVivas(a.tarefas);
  if (vivas.length === 0) return 'Esta ata não tem nenhuma tarefa para criar.';
  const faltam = semResponsavel(a.tarefas);
  if (faltam.length === 0) return null;
  const nomes = faltam
    .map((t) => t.responsavel_texto || t.descricao)
    .slice(0, 3)
    .join('; ');
  return `Falta apontar quem é: ${nomes}${faltam.length > 3 ? ` e mais ${faltam.length - 3}` : ''}.`;
}

/** O placar da lista: conta o que falta, como o resto da Dash. */
export function resumoDaAta(a: AtaNaLista): string {
  if (a.tarefas_criadas) return `${a.tarefas} tarefa(s) na agenda.`;
  if (a.status === 'enviada') return 'Ainda não foi lida.';
  if (a.tarefas === 0) return 'Sem tarefas combinadas.';
  if (a.sem_responsavel > 0) {
    return `${a.tarefas} tarefa(s), ${a.sem_responsavel} sem responsável apontado.`;
  }
  return `${a.tarefas} tarefa(s) prontas para criar.`;
}

/**
 * O mapa mental em lista indentada.
 *
 * Nível fora de 1–6 vira 1: uma indentação inventada empurra a linha para fora
 * da tela e ninguém entende por quê. O plano fala em renderizar com markmap;
 * uma lista indentada entrega a mesma informação sem trazer biblioteca nova
 * para desenhar sete linhas.
 */
export const nivelSeguro = (n: unknown): number =>
  Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 6 ? (n as number) : 1;

export function mapaEmLista(
  mapa: Array<{ nivel: number; texto: string }> | null | undefined
): Array<{ nivel: number; texto: string }> {
  return (mapa ?? [])
    .filter((m) => (m?.texto ?? '').trim())
    .map((m) => ({ nivel: nivelSeguro(m.nivel), texto: m.texto.trim() }));
}

/** O que a LIA leu e o que ela não leu — dito sem rodeio. */
export function comoFoiLida(a: Ata | null | undefined): string | null {
  if (!a) return null;
  if (a.erro_leitura) {
    return `A LIA não conseguiu estruturar esta ata (${a.erro_leitura}). Dá para escrever à mão.`;
  }
  if (a.status === 'enviada') return 'Ainda não foi lida. As tarefas podem ser escritas à mão.';
  if (a.lido_por === 'ia' && !a.tarefas_criadas_em) {
    return 'A LIA leu e propôs as tarefas. Falta uma pessoa apontar cada responsável.';
  }
  return null;
}
