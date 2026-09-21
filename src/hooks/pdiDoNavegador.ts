/**
 * O PDI que ficou no navegador (P3.4).
 *
 * Até 21/09/2026 o PDI vivia em `localStorage['octodash_pdis']`, filtrado por
 * e-mail e sem nenhuma noção de imobiliária. Quem escreveu um plano e trocou
 * de computador perdeu o plano.
 *
 * Estas funções são puras de propósito: a decisão de subir é da pessoa, e o
 * que aqui se faz é só olhar o que existe e traduzir para o formato do banco.
 * Nada apaga nada por conta própria.
 */

import type { PDI } from './usePDI';

export const CHAVE_ANTIGA = 'octodash_pdis';

/**
 * A linha como ela está guardada no navegador.
 *
 * O `id` era um `Date.now()` — número, e único só naquele navegador. No banco
 * o id é uuid, então o formato antigo ganha um tipo próprio em vez de afrouxar
 * o `PDI` de hoje para caber nos dois.
 */
export type PdiGuardado = Omit<PDI, 'id'> & { id?: number | string };

/**
 * O que está guardado naquele navegador para aquela pessoa.
 *
 * Devolve lista vazia em vez de estourar quando não há nada, quando o
 * conteúdo não é o esperado, ou quando o navegador recusa o acesso — janela
 * anônima e "bloquear dados de sites" fazem `localStorage` lançar exceção, e
 * a tela não pode quebrar por causa disso.
 */
export function lerDoNavegador(email: string): PdiGuardado[] {
  if (!email) return [];
  try {
    const bruto = localStorage.getItem(CHAVE_ANTIGA);
    if (!bruto) return [];
    const todos = JSON.parse(bruto);
    if (!Array.isArray(todos)) return [];
    const alvo = email.toLowerCase();
    return todos.filter(
      (p): p is PdiGuardado =>
        !!p && typeof p === 'object' && String(p.corretor_email ?? '').toLowerCase() === alvo
    );
  } catch {
    return [];
  }
}

/**
 * Traduz uma linha do navegador para o formato do banco.
 *
 * O `id` antigo era `Date.now()` — um número, único só naquele navegador. Ele
 * NÃO vem junto: no banco o id é uuid, e reaproveitar o antigo faria duas
 * pessoas que criaram um PDI no mesmo milissegundo colidirem.
 *
 * `origem: 'navegador'` é o que deixa dar para separar depois o que foi
 * migrado do que nasceu na tela, caso alguma migração saia torta.
 */
export function paraOBanco(pdi: PdiGuardado, tenantId: string, email: string) {
  return {
    tenant_id: tenantId,
    corretor_email: email.toLowerCase(),
    tipo: pdi.tipo ?? 'individual',
    competencia: pdi.competencia ?? '',
    nivel_atual: pdi.nivel_atual ?? 'iniciante',
    nivel_desejado: pdi.nivel_desejado ?? 'intermediario',
    progresso: Number(pdi.progresso) || 0,
    acoes: Array.isArray(pdi.acoes) ? pdi.acoes : [],
    sections: Array.isArray(pdi.sections) ? pdi.sections : [],
    // Data vazia é NULL, e não string vazia: a coluna é `date` e '' não é data.
    prazo: pdi.prazo || null,
    status: pdi.status ?? 'planejado',
    observacoes: pdi.observacoes ?? '',
    ordem: Number(pdi.ordem) || 0,
    criador_email: pdi.criador_email ?? null,
    criador_nome: pdi.criador_nome ?? null,
    atribuido_por_admin: !!pdi.atribuido_por_admin,
    origem: 'navegador' as const,
  };
}

/**
 * Tira do navegador SÓ o que é daquela pessoa, e só depois de subir.
 *
 * O PDI de um colega que usou a mesma máquina continua onde está: apagar a
 * chave inteira levaria junto o plano de alguém que nunca pediu nada.
 */
export function limparDoNavegador(email: string): void {
  if (!email) return;
  try {
    const bruto = localStorage.getItem(CHAVE_ANTIGA);
    if (!bruto) return;
    const todos = JSON.parse(bruto);
    if (!Array.isArray(todos)) return;
    const alvo = email.toLowerCase();
    const resto = todos.filter(
      (p) => String(p?.corretor_email ?? '').toLowerCase() !== alvo
    );
    if (resto.length === 0) localStorage.removeItem(CHAVE_ANTIGA);
    else localStorage.setItem(CHAVE_ANTIGA, JSON.stringify(resto));
  } catch {
    // Não conseguir limpar não é motivo para desfazer o que já subiu.
  }
}
