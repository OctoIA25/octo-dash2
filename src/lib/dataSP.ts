/**
 * Datas da casa, no dia de São Paulo.
 *
 * `new Date().toISOString()` dá o dia de Greenwich: das 21h à meia-noite já é
 * amanhã — e no último dia do mês, já é o mês seguinte. Foi assim que o
 * Financeiro abriu "de 01/10 até 30/09" e a Conferência com a data de amanhã
 * nos dois campos (30/09, à noite).
 */

/** "AAAA-MM-DD" do dia em São Paulo. */
export const hojeSP = (agora: Date = new Date()): string =>
  agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** "AAAA-MM" do mês em São Paulo. */
export const mesSP = (agora?: Date): string => hojeSP(agora).slice(0, 7);

export const primeiroDoMesSP = (agora?: Date): string => `${mesSP(agora)}-01`;

export const primeiroDoAnoSP = (agora?: Date): string => `${hojeSP(agora).slice(0, 4)}-01-01`;

export function ultimoDoMesSP(agora?: Date): string {
  const mes = mesSP(agora);
  const [a, m] = mes.split('-').map(Number);
  // Dia 0 do mês seguinte é o último deste. Em UTC, para não depender do fuso da máquina.
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** O mês anterior a "AAAA-MM". Sem `setMonth`, que no dia 31 pula um mês. */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
