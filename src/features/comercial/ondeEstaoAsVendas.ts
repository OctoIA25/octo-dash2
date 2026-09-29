/**
 * Onde estão as vendas que o recorte não mostrou.
 *
 * A Conferência abre no mês corrente. A planilha da Lotus parou de receber
 * venda nova em 01/09 — então a tela nascia dizendo "Nenhuma venda da
 * planilha neste recorte", com 37 vendas guardadas logo atrás, de janeiro a
 * agosto. Quem lê conclui que a casa não vendeu nada.
 *
 * É o mesmo erro do "Ninguém esperando" do Plantão e do "nenhum cargo criado"
 * do seletor: a tela afirma ausência quando deveria dizer onde as coisas
 * estão.
 *
 * Módulo puro de propósito: assim o teste chama ESTA função, e não uma cópia
 * dela escrita no arquivo de teste.
 */
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Só o que a frase precisa: quantas são e o intervalo em palavras. */
export interface OndeEstao {
  quantas: number;
  periodo: string;
}

function rotulo(iso: string): string | null {
  // Fatiar em vez de `new Date`: "2026-01-15" vira 14/01 em fuso negativo, e
  // a frase passaria a citar o mês errado na virada.
  const [ano, mes] = iso.split('-');
  const i = Number(mes) - 1;
  if (!ano || !MESES[i]) return null;
  return `${MESES[i]} de ${ano}`;
}

export function ondeEstaoAsVendas(
  linhas: Array<{ data_assinatura?: string | null }>,
): OndeEstao | null {
  const datas = linhas
    .map((l) => (l.data_assinatura ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  // Sem nenhuma venda em lugar nenhum, a frase antiga é a verdadeira: não há.
  if (linhas.length === 0) return null;

  // Há vendas, mas nenhuma com data utilizável. Dizer o intervalo seria
  // inventar; dizer a quantidade não é.
  if (datas.length === 0) return { quantas: linhas.length, periodo: 'sem data de assinatura' };

  const de = rotulo(datas[0]);
  const ate = rotulo(datas[datas.length - 1]);
  if (!de || !ate) return { quantas: linhas.length, periodo: 'sem data de assinatura' };

  return {
    quantas: linhas.length,
    periodo: de === ate ? `em ${de}` : `de ${de} a ${ate}`,
  };
}
