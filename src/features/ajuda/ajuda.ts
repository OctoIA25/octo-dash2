/**
 * Ajuda (P4.9) — a parte que pensa, sem tela e sem banco.
 */

import type { Artigo, Duvida } from './ajudaService';

/**
 * De que módulo é a tela em que a pessoa está.
 *
 * É o que o (?) usa para abrir o artigo certo. O mapa é por PREFIXO de rota, e
 * a rota mais específica ganha: `/financeiro/conciliacao` e `/financeiro` são a
 * mesma ajuda, mas `/juridico/proposta` tem a sua.
 */
const MODULO_POR_ROTA: Array<[string, string]> = [
  ['/juridico', 'juridico'],
  ['/financeiro', 'financeiro'],
  ['/reunioes', 'reunioes'],
  ['/materiais', 'materiais'],
  ['/cargos', 'gestao-equipe'],
  ['/gestao-equipe', 'gestao-equipe'],
  ['/recrutamento', 'recrutamento'],
  ['/imoveis', 'imoveis'],
  ['/metricas', 'metricas'],
  ['/relatorios', 'metricas'],
  ['/marketing', 'marketing'],
  ['/bolsao', 'leads'],
  ['/leads', 'leads'],
  ['/comercial', 'leads'],
];

export function moduloDaRota(rota: string | null | undefined): string {
  const r = (rota ?? '').toLowerCase();
  // Do mais específico para o mais geral: a lista já está nessa ordem, e o
  // primeiro prefixo que casa vence.
  for (const [prefixo, modulo] of MODULO_POR_ROTA) {
    if (r === prefixo || r.startsWith(`${prefixo}/`)) return modulo;
  }
  return 'geral';
}

export const ROTULO_DA_DUVIDA: Record<Duvida['status'], string> = {
  aberta: 'Esperando resposta',
  respondida: 'Respondida',
  publicada: 'No FAQ',
};

/**
 * O que dizer quando a busca não acha.
 *
 * "Nenhum resultado" é um beco sem saída. A ajuda tem um jeito de sair dele —
 * perguntar — e é isso que a frase oferece.
 */
export function nadaEncontrado(termo: string): string {
  const t = termo.trim();
  return t
    ? `Nada encontrado para “${t}”. Pergunte à administração — a resposta fica aqui para a próxima pessoa.`
    : 'Ainda não há nada escrito para esta tela. Pergunte à administração.';
}

/** Separa o manual do FAQ mantendo a ordem que a busca devolveu. */
export function separarPorTipo(artigos: Artigo[] | null | undefined) {
  const todos = artigos ?? [];
  return {
    manual: todos.filter((a) => a.tipo === 'manual'),
    faq: todos.filter((a) => a.tipo === 'faq'),
  };
}

/** Quantas dúvidas esperam alguém. É o número que vira contador no menu. */
export const duvidasAbertas = (d: Duvida[] | null | undefined): number =>
  (d ?? []).filter((x) => x.status === 'aberta').length;

/**
 * O primeiro pedaço do texto, para a lista.
 *
 * Corta em espaço, nunca no meio da palavra: "conta corre…" faz quem lê achar
 * que a frase é outra.
 */
export function previa(texto: string | null | undefined, limite = 160): string {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= limite) return t;
  const corte = t.slice(0, limite);
  const espaco = corte.lastIndexOf(' ');
  return `${corte.slice(0, espaco > 40 ? espaco : limite)}…`;
}
