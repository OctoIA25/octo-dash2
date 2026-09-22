/**
 * Contratos do corretor com aceite (P4.3) — as contas, fora do componente.
 *
 * A regra que atravessa o arquivo: NADA AQUI DECIDE SOZINHO QUE ALGUÉM ESTÁ
 * BLOQUEADO. O bloqueio é a primeira tela do sistema que impede o uso da Dash,
 * e um defeito nele tranca a equipe inteira para fora. Por isso a decisão é
 * explícita, testada, e FALHA ABRINDO: na dúvida, a Dash abre.
 */

export type StatusDoContrato = 'pendente' | 'aceito' | 'assinado' | 'cancelado';

export interface ContratoPendente {
  id: string;
  titulo: string;
  corpo: string;
  versao: number;
  hash: string;
  tenant_id: string;
  exige_assinatura_eletronica: boolean;
  criada_em: string;
}

export interface ModeloDeContrato {
  id: string;
  titulo: string;
  descricao: string;
  corpo: string;
  versao: number;
  exige_assinatura_eletronica: boolean;
  ativo: boolean;
  pendentes: number;
  aceitos: number;
}

export interface QuemFalta {
  user_id: string;
  email: string;
  campos: string[];
}

export interface ResultadoDaAtribuicao {
  simulacao: boolean;
  modelo: string;
  versao: number;
  criadas: number;
  ja_tinham: number;
  faltando: QuemFalta[];
}

/** As variáveis que o modelo pode usar, com o que cada uma vira. */
export const VARIAVEIS_DO_MODELO: Array<{ chave: string; descricao: string }> = [
  { chave: 'nome', descricao: 'Nome da pessoa' },
  { chave: 'cpf', descricao: 'CPF (vem dos dados cadastrais)' },
  { chave: 'creci', descricao: 'CRECI' },
  { chave: 'nivel', descricao: 'Nível de comissão' },
  { chave: 'email', descricao: 'E-mail' },
  { chave: 'imobiliaria', descricao: 'Nome da imobiliária' },
  { chave: 'data', descricao: 'Data de hoje' },
];

const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: 'nome', cpf: 'CPF', creci: 'CRECI', nivel: 'nível de comissão',
};

/**
 * Decide se a Dash deve ser bloqueada.
 *
 * TRÊS TRAVAS, nesta ordem, e a ordem importa:
 *
 *  1. ERRO NUNCA BLOQUEIA. Se a consulta falhou, a rede caiu ou o banco
 *     recusou, `pendentes` chega indefinido e a Dash abre. Um bloqueio que
 *     depende de uma consulta dar certo tranca todo mundo no dia em que ela
 *     falhar — e ninguém conseguiria entrar para consertar.
 *
 *  2. QUEM ADMINISTRA NUNCA É BLOQUEADO. Um contrato atribuído por engano a
 *     "todos" trancaria também quem poderia desfazê-lo, e aí só se resolveria
 *     no banco. Decidido com o chefe em 21/09.
 *
 *  3. O QUE EXIGE ASSINATURA ELETRÔNICA NÃO BLOQUEIA. A integração não existe
 *     no sistema; bloquear por um documento que ninguém tem como aceitar
 *     deixaria a pessoa presa sem saída.
 */
export function deveBloquear(ctx: {
  pendentes: ContratoPendente[] | null | undefined;
  systemRole?: string | null;
  isOwner?: boolean;
}): boolean {
  if (!Array.isArray(ctx?.pendentes)) return false;
  if (ctx.isOwner) return false;
  if (ctx.systemRole === 'admin' || ctx.systemRole === 'owner') return false;
  return ctx.pendentes.some((c) => !c.exige_assinatura_eletronica);
}

/** Os contratos que a tela de bloqueio pede para aceitar, na ordem. */
export function contratosParaAceitar(pendentes: ContratoPendente[] | null | undefined): ContratoPendente[] {
  return (pendentes ?? []).filter((c) => !c.exige_assinatura_eletronica);
}

/** Os que estão travados esperando firma — aparecem, mas sem botão. */
export function contratosComFirma(pendentes: ContratoPendente[] | null | undefined): ContratoPendente[] {
  return (pendentes ?? []).filter((c) => c.exige_assinatura_eletronica);
}

/**
 * O aviso de quem ficou de fora da atribuição.
 *
 * Medido em produção em 21/09: CPF preenchido em 0 de 126 membros, CRECI em
 * 10, nível em 15. Sem este aviso, o gestor atribuiria um contrato e só
 * descobriria a lacuna depois do aceite — quando já não dá para desfazer.
 */
export function avisoDeQuemFalta(r: ResultadoDaAtribuicao | null | undefined): string | null {
  const fora = r?.faltando?.length ?? 0;
  if (!r || fora === 0) return null;

  const porCampo = new Map<string, number>();
  for (const p of r.faltando) {
    for (const c of p.campos ?? []) porCampo.set(c, (porCampo.get(c) ?? 0) + 1);
  }
  const detalhe = [...porCampo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([campo, n]) => `${n} sem ${ROTULO_DO_CAMPO[campo] ?? campo}`)
    .join(', ');

  return `${fora} pessoa${fora === 1 ? '' : 's'} ${fora === 1 ? 'ficou' : 'ficaram'} de fora por falta de dado no cadastro (${detalhe}). ` +
    'Um contrato com lacuna não serve como documento — preencha o cadastro e atribua de novo.';
}

/** As variáveis que o corpo usa e que não existem no catálogo. */
export function variaveisDesconhecidas(corpo: string): string[] {
  const conhecidas = new Set(VARIAVEIS_DO_MODELO.map((v) => v.chave));
  const achadas = [...(corpo ?? '').matchAll(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(achadas.filter((v) => !conhecidas.has(v)))];
}

/** As variáveis que o corpo de fato usa — para a prévia dizer o que vai trocar. */
export function variaveisUsadas(corpo: string): string[] {
  const conhecidas = new Set(VARIAVEIS_DO_MODELO.map((v) => v.chave));
  const achadas = [...(corpo ?? '').matchAll(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(achadas.filter((v) => conhecidas.has(v)))];
}

/** Troca as variáveis por valores — só para a PRÉVIA na tela de quem escreve. */
export function preencherPrevia(corpo: string, valores: Record<string, string>): string {
  let saida = corpo ?? '';
  for (const [k, v] of Object.entries(valores ?? {})) {
    saida = saida.split(`{{${k}}}`).join(v ?? '');
  }
  return saida;
}

/** Exemplo para a prévia, para quem escreve ver o formato sem abrir dado de ninguém. */
export const VALORES_DE_EXEMPLO: Record<string, string> = {
  nome: 'Ana Souza',
  cpf: '123.456.789-00',
  creci: '54321-F',
  nivel: 'pleno',
  email: 'ana@imobiliaria.com.br',
  imobiliaria: 'Lotus Brokers',
  data: '21/09/2026',
};

/**
 * Uma mensagem legível a partir do que o servidor devolveu.
 *
 * Vale a pena por causa de ONDE ela aparece: quem vê este texto está bloqueado
 * fora da Dash e não tem outra tela para onde ir. Visto no navegador em 21/09,
 * a pessoa recebia "[object Object]" — o servidor devolve o erro como objeto, e
 * passá-lo direto ao `Error` vira isso.
 */
export function mensagemDeErro(corpo: unknown, padrao = 'Não deu para registrar o aceite.'): string {
  if (typeof corpo === 'string' && corpo.trim()) return corpo.trim();
  if (corpo && typeof corpo === 'object') {
    const o = corpo as Record<string, unknown>;
    for (const chave of ['message', 'error', 'msg', 'detail']) {
      const v = o[chave];
      if (typeof v === 'string' && v.trim()) return v.trim();
      // O erro pode vir aninhado: { error: { message: '...' } }
      if (v && typeof v === 'object') {
        const dentro = (v as Record<string, unknown>).message;
        if (typeof dentro === 'string' && dentro.trim()) return dentro.trim();
      }
    }
  }
  return padrao;
}

/**
 * O carimbo de aceite que vai no rodapé do PDF.
 *
 * O hash é o que liga o papel ao texto aceito: se alguém trocar uma vírgula
 * depois, o hash não confere mais. Sem ele o PDF seria só uma impressão.
 */
export function carimboDeAceite(a: {
  aceito_em: string;
  ip: string | null;
  hash: string;
  titulo: string;
  versao: number;
}): string[] {
  const quando = new Date(a.aceito_em).toLocaleString('pt-BR');
  return [
    `Aceite registrado em ${quando}.`,
    `Origem: ${a.ip || 'não registrada'}.`,
    `Documento: ${a.titulo} — versão ${a.versao}.`,
    `Identificação do texto (SHA-256): ${a.hash}`,
    'Este registro comprova a concordância com o texto acima, exatamente como impresso.',
  ];
}
