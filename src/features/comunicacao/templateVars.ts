/** Extrai os nomes das variáveis {{nome}} de um body, na ordem, sem repetir. */
export function extractVariables(body: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body || '')) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
