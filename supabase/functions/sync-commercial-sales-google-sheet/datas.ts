/**
 * A data como a planilha de vendas escreve. Fica num arquivo sem dependências
 * para o teste rodar no Node (o resto do importador é do Deno).
 */
export function parseDate(value: string | null | undefined, fallbackYear: number): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Barra ou ponto: as vendas de setembro da planilha nova vieram "22.09.2026"
  // (03/10). Lidas como vazias, entravam sem data e a ponte as ignorava.
  const brDate = raw.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (brDate) {
    const day = Number(brDate[1]);
    const month = Number(brDate[2]);
    let year = brDate[3] ? Number(brDate[3]) : fallbackYear;
    if (year < 100) year += 2000;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    }
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  return null;
}
