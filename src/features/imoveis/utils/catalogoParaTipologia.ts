/**
 * Converte uma linha do catálogo (planilha) numa tipologia (banco) — P2.1.
 *
 * A PLANILHA TEM UMA LINHA POR EMPREENDIMENTO, NÃO POR TIPOLOGIA, e os campos
 * são faixas em texto: `2-3`, `até 4 suítes`, `3 - 4 cobertas`. Medido nas 84
 * linhas em 23/09/2026, estes são os formatos que aparecem de verdade:
 *
 *   dormitórios  2-3 (15x) · 2 (8x) · 3-4 · 1-3 · 2-4 · "2- 3 dormitórios" · "3 e 4 suítes"
 *   suítes       1 (10x) · "sem suíte" (9x) · "até 3" · "sim (varia com a metragem)"
 *   vagas        1 (10x) · 1-2 (8x) · "3 - 4 cobertas" · "até duas" · "sim cobertas" · 21
 *   valor        "R$ 974.653,85" · "Médio-alto" (4x)
 *   e em TODAS   "-" significa "não informado", não um valor
 *
 * AS TRÊS REGRAS QUE ESTE MÓDULO SEGUE
 *
 * 1. Faixa numérica explícita vira o MENOR número: `2-3` → 2. É a mesma lógica
 *    do "a partir de" que o preço já usa, e é o que dá para afirmar.
 * 2. "até N" vira NULO, não N. "Até 4 suítes" quer dizer que existem plantas
 *    com menos — o mínimo não está escrito, e chutar 4 diria ao cliente que
 *    toda unidade tem quatro suítes.
 * 3. Texto que não é número vira NULO e é preservado inteiro em `observacao`.
 *    Nada se perde, e ninguém precisa voltar à planilha para conferir.
 *
 * E UMA QUARTA, SOBRE A DATA DO PREÇO: ela fica NULA de propósito. A planilha
 * tem uma coluna "Atualizado em (auto)", preenchida por script a cada edição da
 * LINHA — não do preço. Usá-la como `preco_atualizado_em` afirmaria que o preço
 * foi conferido naquele dia, que é exatamente o erro que o cabeçalho da
 * migration de tipologias alerta. Nula, a regra do aviso acrescenta "sujeito a
 * confirmação com o corretor" — que é a verdade sobre um preço de planilha.
 */

export interface LinhaDoCatalogo {
  codigo?: string;
  empreendimento: string;
  tipo?: string;
  valor?: string;
  vagas?: string;
  dormitorios?: string;
  suites?: string;
}

export interface TipologiaImportada {
  nome: string;
  dormitorios: number | null;
  suites: number | null;
  vagas: number | null;
  preco_a_partir: number | null;
  /** Sempre nulo na importação — ver a quarta regra no cabeçalho. */
  preco_atualizado_em: null;
  observacao: string;
}

/**
 * O teto que o banco também impõe (`tipologias_numeros_ck`): acima disto,
 * dormitório, suíte ou vaga é erro de digitação, não dado.
 */
export const MAXIMO_PLAUSIVEL = 20;

/** "-", "–", vazio e espaços são "não informado". */
export const vazio = (t: string | undefined | null): boolean => {
  const s = String(t ?? '').trim();
  return s === '' || s === '-' || s === '–' || s === '—';
};

/**
 * O MENOR número de uma faixa escrita em texto, ou null.
 *
 * `2-3` → 2 · `2- 3 dormitórios` → 2 · `3 - 4 cobertas` → 3 · `1` → 1
 * `sem suíte` → 0 · `até 3` → null · `sim cobertas` → null · `-` → null
 */
export function menorDaFaixa(texto: string | undefined | null): number | null {
  if (vazio(texto)) return null;
  const t = String(texto).trim().toLowerCase();

  // "sem suíte", "sem vaga": zero é uma afirmação, e é diferente de não saber.
  if (/^sem\s/.test(t)) return 0;

  // "até N" não diz o mínimo. Idem "a partir de N"? Esse diz — mas não aparece
  // nos dados, então não invento tratamento para o que não existe.
  //
  // O limite de palavra vai à MÃO, e não com `\b`: em JavaScript o `é` não é
  // caractere de palavra, então `/\baté\b/` NÃO casa com "até 4 suítes" — o
  // `\b` depois do `é` nunca acontece. Escrevi assim na primeira versão e o
  // teste pegou: "até 4 suítes" virava 4, dizendo ao cliente que toda unidade
  // tem quatro suítes.
  if (/(^|[\s(])at[ée]([\s)]|$)/.test(t)) return null;

  const numeros = (t.match(/\d+/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (numeros.length === 0) return null;

  const menor = Math.min(...numeros);

  // Fora da faixa plausível vira NULO, não o número.
  //
  // A planilha tem "21" em vagas, uma vez — quase certamente erro de digitação
  // (o vizinho na coluna é "2"). O banco já recusa acima de 20, e na primeira
  // versão isso custou a LINHA INTEIRA do Vigóre: o insert falhava e o preço e
  // os dormitórios dele iam junto. Um campo implausível não pode derrubar os
  // outros três.
  //
  // E não corrijo para 2: adivinhar o que a pessoa quis digitar é pior do que
  // dizer que não se sabe. O texto cru fica na observação e o relatório aponta.
  return menor >= 0 && menor <= MAXIMO_PLAUSIVEL ? menor : null;
}

/**
 * "R$ 974.653,85" → 974653.85. Texto que não é preço → null.
 *
 * "Médio-alto" aparece 4 vezes na coluna de valor: é faixa de mercado, não
 * número, e vira null em vez de zero.
 */
/**
 * O menor preço que se aceita como preço de imóvel.
 *
 * Sem um piso, o regex abaixo aceitaria qualquer dígito solto: uma célula com
 * "Fase 2" viraria **R$ 2,00**, e a LIA diria isso ao cliente. O mais barato da
 * planilha é R$ 281.295 — mil reais é folga enorme e ainda barra o absurdo.
 * O que ficar abaixo vira nulo e aparece no relatório da importação.
 */
export const PRECO_MINIMO_PLAUSIVEL = 1000;

export function precoBRL(texto: string | undefined | null): number | null {
  if (vazio(texto)) return null;
  const t = String(texto).trim();
  const m = t.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= PRECO_MINIMO_PLAUSIVEL ? n : null;
}

/** Os códigos de uma célula: `L012; L023; L025` → três. */
export function codigosDaCelula(texto: string | undefined | null): string[] {
  if (vazio(texto)) return [];
  return String(texto)
    .split(/[;,/]/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^L\d{2,4}$/.test(c));
}

/**
 * O nome da tipologia. Sai do que a planilha diz sobre dormitórios, porque é o
 * que o corretor reconhece na tela — e "Conforme catálogo" quando nem isso há.
 */
export function nomeDaTipologia(linha: LinhaDoCatalogo): string {
  const d = String(linha.dormitorios ?? '').trim();
  if (!vazio(d) && /\d/.test(d)) {
    const limpo = d.replace(/\s*(dormit[óo]rios?|dorms?|su[íi]tes?)\s*/gi, '').replace(/\s+/g, ' ').trim();
    return `${limpo} dorms (conforme catálogo)`;
  }
  return 'Conforme catálogo';
}

export function montarTipologia(linha: LinhaDoCatalogo): TipologiaImportada {
  const cru: string[] = [];
  const guardar = (rot: string, v: string | undefined) => {
    if (!vazio(v)) cru.push(`${rot}: ${String(v).trim()}`);
  };
  guardar('dormitórios', linha.dormitorios);
  guardar('suítes', linha.suites);
  guardar('vagas', linha.vagas);
  guardar('valor', linha.valor);

  const observacao = [
    'Importado do catálogo da equipe em 23/09/2026, sem metragem — a planilha não tem essa coluna.',
    'Uma linha por empreendimento: as faixas ainda precisam virar tipologias separadas.',
    cru.length ? `Como está na planilha — ${cru.join(' · ')}.` : 'A planilha não traz dormitórios, suítes, vagas nem valor.',
  ].join(' ');

  return {
    nome: nomeDaTipologia(linha),
    dormitorios: menorDaFaixa(linha.dormitorios),
    suites: menorDaFaixa(linha.suites),
    vagas: menorDaFaixa(linha.vagas),
    preco_a_partir: precoBRL(linha.valor),
    preco_atualizado_em: null,
    observacao,
  };
}
