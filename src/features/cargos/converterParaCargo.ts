/**
 * Passar alguém do arranjo individual para um cargo, SEM mudar o que ela vê.
 *
 * O problema que isto resolve está escrito em `permissoesDeSidebar`: "COM
 * CARGO, O CARGO MANDA". No instante em que alguém ganha um cargo, o pacote do
 * cargo substitui tudo o que ela tinha configurado individualmente.
 *
 * E hoje ninguém tem cargo — são 127 pessoas no arranjo individual, com 12
 * combinações diferentes só na Lotus. Pôr o seletor de cargo na tela de Equipe
 * sem isto faria o gestor achar que está promovendo alguém e, de quebra,
 * reescrever o menu inteiro daquela pessoa.
 *
 * A saída é a que o próprio banco já previa: `membro_definir_cargo` aceita
 * exceções junto com o cargo. Cargo + exceções = exatamente o que a pessoa já
 * via. Depois o gestor limpa as exceções quando quiser padronizar — mas aí é
 * uma decisão dele, tomada olhando.
 */

import type { SidebarPermission } from '@/types/permissions';

export interface ExcecaoDeMembro {
  codigo: string;
  concede: boolean;
  motivo: string;
}

/**
 * As exceções que fazem `cargo + exceções` dar exatamente `atual`.
 *
 * `concede: true`  — a pessoa tem e o cargo não dá.
 * `concede: false` — o cargo dá e a pessoa não tem.
 *
 * Ordenado pelo código para o resultado ser estável: sem isso, dois cálculos
 * iguais gerariam linhas em ordens diferentes e o teste de idempotência
 * acusaria diferença onde não há.
 */
export function excecoesQuePreservam(
  atual: readonly SidebarPermission[],
  pacoteDoCargo: readonly string[],
  motivo = 'Mantido do acesso individual anterior',
): ExcecaoDeMembro[] {
  const tem = new Set<string>(atual);
  const daCargo = new Set<string>(pacoteDoCargo);

  const excecoes: ExcecaoDeMembro[] = [];
  for (const codigo of tem) if (!daCargo.has(codigo)) excecoes.push({ codigo, concede: true, motivo });
  for (const codigo of daCargo) if (!tem.has(codigo)) excecoes.push({ codigo, concede: false, motivo });

  return excecoes.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * O que a pessoa passa a ver: o pacote do cargo com as exceções aplicadas.
 *
 * Existe para o teste poder fechar o ciclo — aplicar o que `excecoesQuePreservam`
 * devolveu e conferir que dá no mesmo. É a única forma de provar a preservação
 * sem reimplementar a regra do outro lado e provar que as duas cópias
 * concordam, que não prova nada.
 */
export function aplicarExcecoes(
  pacoteDoCargo: readonly string[],
  excecoes: readonly ExcecaoDeMembro[],
): string[] {
  const efetivo = new Set<string>(pacoteDoCargo);
  for (const e of excecoes) {
    if (e.concede) efetivo.add(e.codigo);
    else efetivo.delete(e.codigo);
  }
  return [...efetivo].sort();
}

/** O cargo que corresponde ao nível de acesso que a pessoa já tem. */
export function cargoDoMesmoNivel<T extends { id: string; role: string; nivel_acesso: number }>(
  cargos: readonly T[],
  role: string,
): T | null {
  // O menor nível entre os do mesmo papel: 'corretor' tem quatro cargos
  // (Financeiro, Jurídico, Atendimento, Corretor) e o certo para quem nunca
  // escolheu é o mais básico. Promover é ato deliberado de alguém.
  const candidatos = cargos.filter((c) => c.role === role);
  if (candidatos.length === 0) return null;
  return candidatos.reduce((menor, c) => (c.nivel_acesso < menor.nivel_acesso ? c : menor));
}
