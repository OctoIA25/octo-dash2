/**
 * Leitor de extrato OFX (P4.6) — conciliação bancária.
 *
 * Não há biblioteca de OFX no projeto, e trazer uma para ler quatro campos
 * seria mais dependência do que problema. O formato é antigo e simples; o que
 * ele tem são ARMADILHAS, e é delas que este arquivo trata:
 *
 *  1. AS ETIQUETAS NÃO FECHAM. O OFX é SGML, não XML: `<TRNAMT>-123.45` termina
 *     na quebra de linha, sem `</TRNAMT>`. Um leitor de XML recusa o arquivo
 *     inteiro.
 *
 *  2. O ARQUIVO QUASE NUNCA É UTF-8. Banco brasileiro exporta em Latin-1, e
 *     lido como UTF-8 o extrato vira "TRANSFERNCIA" ou "Transfer�ncia" — a
 *     descrição é o que a pessoa usa para reconhecer o lançamento.
 *
 *  3. A DATA VEM COM FUSO COLADO: `20260921120000[-3:BRT]`. Só os oito
 *     primeiros dígitos importam; o resto, lido como data, joga o movimento
 *     para o dia anterior.
 *
 *  4. O `FITID` É O QUE IMPEDE IMPORTAR DUAS VEZES. É o identificador que o
 *     banco dá a cada movimento; sem ele, reimportar o mesmo mês duplicaria o
 *     extrato inteiro e a conciliação passaria a casar dinheiro que não existe.
 */

export interface TransacaoDoExtrato {
  /** O identificador do banco. É a chave contra importação repetida. */
  fitid: string;
  data: string;
  /** Sempre positivo; o sentido fica em `tipo`. */
  valor: number;
  tipo: 'credito' | 'debito';
  descricao: string;
}

export interface ExtratoLido {
  transacoes: TransacaoDoExtrato[];
  periodo: { de: string | null; ate: string | null };
  conta: { banco: string | null; numero: string | null };
  /** O que o arquivo trazia e não deu para ler, com o motivo. */
  descartadas: Array<{ motivo: string; trecho: string }>;
}

/** Pega o valor de uma etiqueta que pode não fechar. */
function etiqueta(bloco: string, nome: string): string {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco);
  return (m?.[1] ?? '').trim();
}

/**
 * A data do OFX: `20260921`, `20260921120000` ou `20260921120000[-3:BRT]`.
 *
 * Só os oito primeiros dígitos entram. Mandar a string inteira para o
 * construtor de data faz o fuso puxar o movimento para o dia anterior — e um
 * extrato deslocado em um dia não casa com lançamento nenhum.
 */
export function dataDoOfx(bruto: string): string | null {
  const d = (bruto ?? '').replace(/[^0-9]/g, '').slice(0, 8);
  if (d.length !== 8) return null;
  const ano = Number(d.slice(0, 4));
  const mes = Number(d.slice(4, 6));
  const dia = Number(d.slice(6, 8));
  if (ano < 1990 || ano > 2999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/**
 * O valor: `-1234.56`, `1.234,56` ou `1234,56`.
 *
 * O OFX manda ponto decimal, mas exportador brasileiro às vezes escreve no
 * formato local. Ler "1.234,56" como número dá 1,234 — mil vezes menos, e o
 * erro passa despercebido porque o número continua plausível.
 */
export function valorDoOfx(bruto: string): number | null {
  let s = (bruto ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  const negativo = s.startsWith('-');
  s = s.replace(/^[+-]/, '');

  if (s.includes(',')) {
    // Vírgula é o decimal: o ponto que houver é separador de milhar.
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * Descobre a codificação pelo cabeçalho do arquivo.
 *
 * `CHARSET:1252` ou `ENCODING:USASCII` querem dizer Latin-1 na prática.
 * Ler errado não quebra nada — só estraga os acentos da descrição, que é
 * justamente o campo pelo qual a pessoa reconhece o movimento.
 */
export function codificacaoDoOfx(inicio: string): 'utf-8' | 'windows-1252' {
  const cabecalho = (inicio ?? '').slice(0, 600).toUpperCase();
  if (/CHARSET:\s*(1252|8859-1|ISO-8859-1)/.test(cabecalho)) return 'windows-1252';
  if (/ENCODING:\s*USASCII/.test(cabecalho)) return 'windows-1252';
  if (/CHARSET:\s*UTF-8/.test(cabecalho) || /ENCODING:\s*UTF-8/.test(cabecalho)) return 'utf-8';
  // Sem declaração, o mais provável num extrato brasileiro é Latin-1.
  return 'windows-1252';
}

/** Lê o extrato. Nunca lança: o que não dá para ler vira linha em `descartadas`. */
export function lerOfx(texto: string): ExtratoLido {
  const conteudo = texto ?? '';
  const descartadas: Array<{ motivo: string; trecho: string }> = [];
  const transacoes: TransacaoDoExtrato[] = [];

  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  for (const bloco of blocos) {
    const fitid = etiqueta(bloco, 'FITID');
    const data = dataDoOfx(etiqueta(bloco, 'DTPOSTED'));
    const valor = valorDoOfx(etiqueta(bloco, 'TRNAMT'));
    const descricao = etiqueta(bloco, 'MEMO') || etiqueta(bloco, 'NAME') || '';

    const curto = bloco.replace(/\s+/g, ' ').slice(0, 90);
    if (!fitid) { descartadas.push({ motivo: 'sem identificador do banco (FITID)', trecho: curto }); continue; }
    if (!data) { descartadas.push({ motivo: 'data ilegível', trecho: curto }); continue; }
    if (valor == null) { descartadas.push({ motivo: 'valor ilegível', trecho: curto }); continue; }
    if (valor === 0) { descartadas.push({ motivo: 'valor zero', trecho: curto }); continue; }

    transacoes.push({
      fitid,
      data,
      valor: Math.abs(valor),
      // O sinal do OFX manda, e não o TRNTYPE: há banco que escreve "OTHER"
      // em tudo, e aí o tipo viria errado para o extrato inteiro.
      tipo: valor < 0 ? 'debito' : 'credito',
      descricao: descricao.replace(/\s+/g, ' ').trim(),
    });
  }

  const datas = transacoes.map((t) => t.data).sort();

  return {
    transacoes,
    periodo: {
      de: dataDoOfx(etiqueta(conteudo, 'DTSTART')) ?? datas[0] ?? null,
      ate: dataDoOfx(etiqueta(conteudo, 'DTEND')) ?? datas[datas.length - 1] ?? null,
    },
    conta: {
      banco: etiqueta(conteudo, 'BANKID') || null,
      numero: etiqueta(conteudo, 'ACCTID') || null,
    },
    descartadas,
  };
}

/**
 * Lê o arquivo respeitando a codificação declarada.
 *
 * Duas passadas de propósito: a primeira só para achar o cabeçalho, que é
 * ASCII em qualquer codificação; a segunda já com a certa.
 */
export async function lerArquivoOfx(arquivo: File): Promise<ExtratoLido> {
  const bytes = await arquivo.arrayBuffer();
  const espiada = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 600));
  const codificacao = codificacaoDoOfx(espiada);
  const texto = new TextDecoder(codificacao, { fatal: false }).decode(bytes);
  return lerOfx(texto);
}

/** O resumo que a tela mostra antes de importar. */
export function resumoDoExtrato(e: ExtratoLido | null | undefined): string | null {
  const n = e?.transacoes?.length ?? 0;
  if (!e) return null;
  if (n === 0) return 'Nenhum movimento encontrado neste arquivo.';

  const entradas = e.transacoes.filter((t) => t.tipo === 'credito').length;
  const saidas = n - entradas;
  const periodo = e.periodo.de && e.periodo.ate
    ? ` de ${dataBr(e.periodo.de)} a ${dataBr(e.periodo.ate)}`
    : '';
  return `${n} movimento${n === 1 ? '' : 's'}${periodo} — ${entradas} entrada(s) e ${saidas} saída(s).`;
}

/**
 * O aviso do que o arquivo trouxe e não deu para ler.
 *
 * Importar em silêncio o que deu certo e esquecer o resto faria o extrato
 * fechar com o banco por acaso — e a diferença só apareceria no fim do mês.
 */
export function avisoDeDescartadas(e: ExtratoLido | null | undefined): string | null {
  const n = e?.descartadas?.length ?? 0;
  if (n === 0) return null;
  const motivos = new Map<string, number>();
  for (const d of e!.descartadas) motivos.set(d.motivo, (motivos.get(d.motivo) ?? 0) + 1);
  const detalhe = [...motivos.entries()].map(([m, q]) => `${q} ${m}`).join(', ');
  return `${n} movimento${n === 1 ? '' : 's'} do arquivo não ${n === 1 ? 'pôde' : 'puderam'} ser lido${n === 1 ? '' : 's'} (${detalhe}). ` +
    'Confira o extrato no banco antes de fechar o mês.';
}

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
