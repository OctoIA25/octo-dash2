// ============================================================
// Cadastro de ORIGEM de lead (P0.4 do plano).
//
// O problema, medido em 18/09/2026 nas 5.235 linhas de `leads`: a origem é o
// texto cru que a integração manda, e só isso. Daí 17 valores distintos que
// misturam três coisas diferentes:
//
//   origem de verdade ... ZAP Imóveis · Instagram · Facebook · Site · Imovelweb
//   MÉTODO de entrada ... Excel (938) · Manual (40) · API (1)
//   CONSTRUTORA ......... Santa Angela (1.399)   <- o exemplo do plano
//
// E a mesma origem aparece cinco vezes, fragmentando todo relatório:
//   Lia (Japi Terceiros) 2.553 · Lia (Lotus Brokers) 97 ·
//   Lia (Japi Lançamentos) 4 · Lia · teste 2 · Lia · cadastro de Octo 1
//
// Este módulo é PURO e espelha o desenho que `canalClassifier` já usa para
// canal: uma SUGESTÃO automática, que a escolha salva pelo admin sobrepõe.
// A sugestão só agrupa o que é mecânico (mesmo prefixo, caixa diferente);
// decidir que "Santa Angela" é parceria e não origem é do negócio, não do
// código — por isso o cadastro existe.
// ============================================================

/** Chave de comparação: sem acento, minúscula, espaços colapsados. */
export function chaveOrigem(texto: string | null | undefined): string {
  return (texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Agrupamentos MECÂNICOS — os que não dependem de decisão de negócio.
 *
 * Só entra aqui o que é a mesma origem escrita de formas diferentes pelo
 * próprio sistema. Nada que exija saber como a imobiliária opera.
 */
const SUGESTOES: Array<{ origem: string; test: (k: string) => boolean }> = [
  // As cinco variantes vêm todas do mesmo lugar: a LIA carimba o nome do
  // tenant ou do teste junto. "Lia (Japi Terceiros)", "Lia · teste" etc.
  { origem: 'LIA', test: (k) => /^lia\b/.test(k) },
  // Entrada por planilha/importação: é MÉTODO, não origem. Agrupar já evita
  // que "Excel" (938 leads) apareça como se fosse um canal de captação.
  { origem: 'Importação', test: (k) => k === 'excel' || k === 'importacao' || k === 'planilha' },
  // "API" fica de FORA: entrada por API não é cadastro manual, e se ela conta
  // como origem é decisão do negócio. O cadastro existe pra isso.
  { origem: 'Cadastro manual', test: (k) => k === 'manual' },
];

/**
 * A origem sugerida para um texto cru. `null` quando nenhuma regra mecânica
 * casa — aí vale o próprio texto, e o admin decide no cadastro.
 */
export function sugerirOrigem(textoBruto: string | null | undefined): string | null {
  const k = chaveOrigem(textoBruto);
  if (!k) return null;
  return SUGESTOES.find((r) => r.test(k))?.origem ?? null;
}

/** Uma origem cadastrada pela imobiliária. */
export interface OrigemCadastrada {
  id: string;
  /** Identificador estável que as integrações usam. O nome pode mudar sem quebrar relatório. */
  codigo: string;
  nome: string;
  /** Cor nas listas e gráficos. */
  cor: string;
  /** Posição nas listas e gráficos. */
  ordem: number;
  /** Entra no cálculo de CAC (Meta sim, indicação não). */
  midiaPaga: boolean;
  /** Lead gerado pelo próprio corretor ou por indicação — usado para bônus. */
  organica: boolean;
  ativo: boolean;
}

/** Texto cru que chega da integração → código da origem cadastrada. */
export type TabelaDeConversao = Record<string, string>;

/**
 * A origem de um texto cru. Precedência, a mesma de `resolveCanal`:
 *
 *   1. conversão salva pelo admin  (a decisão do negócio)
 *   2. sugestão mecânica           (mesma origem escrita diferente)
 *   3. o próprio texto             (nada a decidir ainda)
 */
export function resolverOrigem(
  textoBruto: string | null | undefined,
  conversoes: TabelaDeConversao,
  cadastro: OrigemCadastrada[],
): string {
  const texto = (textoBruto || '').trim();
  if (!texto) return 'Não informado';

  const codigo = conversoes[chaveOrigem(texto)];
  if (codigo) {
    const origem = cadastro.find((o) => o.codigo === codigo);
    if (origem) return origem.nome;
  }

  return sugerirOrigem(texto) ?? texto;
}

/**
 * Cor e posição de uma origem, para os gráficos. `null` quando ela não está
 * cadastrada — quem desenha cai na paleta por índice, como sempre fez.
 */
export function aparenciaDaOrigem(
  nome: string,
  cadastro: OrigemCadastrada[],
): { cor: string; ordem: number } | null {
  const k = chaveOrigem(nome);
  const achou = cadastro.find((o) => chaveOrigem(o.nome) === k || chaveOrigem(o.codigo) === k);
  return achou ? { cor: achou.cor, ordem: achou.ordem } : null;
}
