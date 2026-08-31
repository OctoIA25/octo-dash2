import JSZip from 'jszip';

/**
 * Preenche o template do Termo de Comissão Lotus (docx em
 * public/templates/termo-comissao-lotus.docx) com os dados informados
 * e dispara o download do arquivo final.
 *
 * O docx é um zip; os placeholders {{chave}} vivem em word/document.xml.
 * Chave sem valor vira lacuna "______" para preenchimento à mão.
 */

export type TermoComissaoData = Partial<Record<TermoField, string>>;

export type TermoField =
  | 'comprador1_nome' | 'comprador1_cpf' | 'comprador1_email'
  | 'comprador2_nome' | 'comprador2_cpf' | 'comprador2_email'
  | 'data_dia' | 'data_mes' | 'data_ano'
  | 'imovel_descricao1' | 'imovel_descricao2'
  | 'valor_venda' | 'valor_venda_extenso'
  | 'comissao_pct' | 'comissao_pct_extenso' | 'comissao_valor' | 'comissao_valor_extenso'
  | 'lotus_pct' | 'lotus_valor'
  | 'corretor1_pct' | 'corretor1_valor' | 'corretor1_nome' | 'corretor1_creci'
  | 'corretor2_pct' | 'corretor2_valor' | 'corretor2_nome' | 'corretor2_creci'
  | 'lotus_banco_agencia_conta' | 'lotus_pagamento_valor' | 'lotus_pagamento_data'
  | 'corretor1_pgto_valor' | 'corretor1_pgto_valor_extenso' | 'corretor1_pgto_nome'
  | 'corretor1_pgto_cpf' | 'corretor1_pix' | 'corretor1_pgto_data'
  | 'corretor2_pgto_valor' | 'corretor2_pgto_valor_extenso' | 'corretor2_pgto_nome'
  | 'corretor2_pgto_cpf' | 'corretor2_pix' | 'corretor2_pgto_data';

// Curta para não estourar a largura da linha no Word (lacuna longa quebra a linha em duas)
const BLANK = '______';

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Substitui todos os {{placeholders}} do XML; vazio vira lacuna. Pura, para teste. */
export function fillTemplate(xml: string, data: TermoComissaoData): string {
  return xml.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = data[key as TermoField]?.trim();
    return value ? escapeXml(value) : BLANK;
  });
}

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function trioPorExtenso(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto >= 10 && resto < 20) {
    partes.push(DEZ_A_DEZENOVE[resto - 10]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (d) partes.push(DEZENAS[d]);
    if (u) partes.push(UNIDADES[u]);
  }
  return partes.join(' e ');
}

/** Número inteiro por extenso em pt-BR (até bilhões). */
export function numeroPorExtenso(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const escalas: Array<[number, string, string]> = [
    [1_000_000_000, 'bilhão', 'bilhões'],
    [1_000_000, 'milhão', 'milhões'],
    [1_000, 'mil', 'mil'],
  ];
  const partes: string[] = [];
  for (const [base, singular, plural] of escalas) {
    const q = Math.floor(n / base);
    if (q) {
      // "mil" não leva "um" na frente
      const prefixo = base === 1_000 && q === 1 ? '' : `${trioPorExtenso(q)} `;
      partes.push(`${prefixo}${q === 1 ? singular : plural}`.trim());
      n %= base;
    }
  }
  if (n) partes.push(trioPorExtenso(n));
  return partes.join(' e ');
}

/** Valor monetário por extenso: 1500.5 → "um mil e quinhentos reais e cinquenta centavos". */
export function valorPorExtenso(valor: number): string {
  const reais = Math.floor(valor);
  const centavos = Math.round((valor - reais) * 100);
  const partes: string[] = [];
  if (reais > 0) partes.push(`${numeroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`);
  if (centavos > 0) partes.push(`${numeroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.join(' e ') || 'zero reais';
}

export const formatBRL = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const mesPorExtenso = (mesIndex: number) => MESES[mesIndex] ?? '';

export async function generateTermoComissao(data: TermoComissaoData, fileName: string): Promise<void> {
  const response = await fetch('/templates/termo-comissao-lotus.docx');
  if (!response.ok) throw new Error(`Falha ao carregar o template do termo (HTTP ${response.status})`);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('Template inválido: word/document.xml não encontrado');
  zip.file('word/document.xml', fillTemplate(await doc.async('string'), data));
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
