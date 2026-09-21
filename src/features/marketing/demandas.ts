/**
 * Kanban de demandas de marketing (P3.7) — as regras, fora do componente.
 */

export const COLUNAS = [
  { id: 'solicitado', rotulo: 'Solicitado' },
  { id: 'briefing', rotulo: 'Briefing' },
  { id: 'producao', rotulo: 'Produção' },
  { id: 'revisao', rotulo: 'Revisão' },
  { id: 'aprovado', rotulo: 'Aprovado' },
  { id: 'publicado', rotulo: 'Publicado' },
] as const;

export type Status = (typeof COLUNAS)[number]['id'];

export const TIPOS = [
  { id: 'post', rotulo: 'Post' },
  { id: 'reels', rotulo: 'Reels' },
  { id: 'anuncio', rotulo: 'Anúncio' },
  { id: 'landing', rotulo: 'Landing page' },
  { id: 'impresso', rotulo: 'Impresso' },
  { id: 'video', rotulo: 'Vídeo' },
  { id: 'outro', rotulo: 'Outro' },
] as const;

export type Tipo = (typeof TIPOS)[number]['id'];

export const PRIORIDADES = [
  { id: 'baixa', rotulo: 'Baixa' },
  { id: 'media', rotulo: 'Média' },
  { id: 'alta', rotulo: 'Alta' },
] as const;

export interface Anexo {
  nome: string;
  caminho: string;
  tipo?: string;
  tamanho?: number;
}

export interface Demanda {
  id: string;
  titulo: string;
  tipo: Tipo;
  status: Status;
  prioridade: 'baixa' | 'media' | 'alta';
  prazo: string;
  ordem: number;
  objetivo: string;
  publico: string;
  formato: string;
  texto_base: string;
  referencias: string[];
  anexos: Anexo[];
  lancamento_id: string | null;
  empreendimento: string | null;
  solicitante_id: string | null;
  solicitante: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  criada_em: string;
}

export const ROTULO_DO_STATUS: Record<Status, string> =
  Object.fromEntries(COLUNAS.map((c) => [c.id, c.rotulo])) as Record<Status, string>;

export const ROTULO_DO_TIPO: Record<Tipo, string> =
  Object.fromEntries(TIPOS.map((t) => [t.id, t.rotulo])) as Record<Tipo, string>;

/**
 * A demanda está atrasada?
 *
 * O prazo só pesa enquanto há o que fazer. Depois de publicada, um prazo
 * vencido é história — pintá-lo de vermelho faria o quadro parecer em chamas
 * por trabalho que já saiu.
 */
export function estaAtrasada(d: Pick<Demanda, 'prazo' | 'status'>, hoje: string): boolean {
  if (d.status === 'publicado' || d.status === 'aprovado') return false;
  return !!d.prazo && d.prazo < hoje;
}

/** Quantos dias faltam (negativo = atrasada). Comparação por texto, sem fuso. */
export function diasAte(prazo: string, hoje: string): number {
  const p = Date.UTC(+prazo.slice(0, 4), +prazo.slice(5, 7) - 1, +prazo.slice(8, 10));
  const h = Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10));
  return Math.round((p - h) / 86400000);
}

export function textoDoPrazo(d: Pick<Demanda, 'prazo' | 'status'>, hoje: string): string {
  const n = diasAte(d.prazo, hoje);
  if (d.status === 'publicado') return 'publicado';
  if (n < 0) return `${-n} dia${-n === 1 ? '' : 's'} atrasada`;
  if (n === 0) return 'vence hoje';
  if (n === 1) return 'vence amanhã';
  return `em ${n} dias`;
}

/**
 * O que falta para a demanda poder ser pedida.
 *
 * Título e prazo são o mínimo — o plano faz o prazo obrigatório. Objetivo e
 * público NÃO são obrigatórios aqui de propósito: quem pede às vezes só sabe
 * "quero um post do Gioviale", e travar o pedido faria a pessoa desistir e
 * mandar por WhatsApp, que é o que este quadro existe para acabar.
 */
export function faltaParaPedir(
  d: Partial<Pick<Demanda, 'titulo' | 'prazo'>>
): string[] {
  const faltas: string[] = [];
  if (!d.titulo?.trim()) faltas.push('título');
  if (!d.prazo) faltas.push('prazo');
  return faltas;
}

/**
 * O pedido pronto para o Caio.
 *
 * O botão abre o chat com este texto escrito — decidido com o chefe em 21/09.
 * Chamar o n8n direto dependeria de mudança do lado de lá; assim funciona
 * hoje, e a pessoa vê o que vai ser pedido antes de enviar.
 *
 * Só entra no texto o que está preenchido: um pedido com "Público: (vazio)"
 * ensina a IA a ignorar o campo.
 */
export function pedidoParaOCaio(d: Partial<Demanda>): string {
  const linhas: string[] = [
    `Preciso de um rascunho para uma peça de marketing imobiliário.`,
    `Tipo: ${ROTULO_DO_TIPO[(d.tipo as Tipo) ?? 'post']}`,
  ];
  if (d.titulo?.trim()) linhas.push(`Tema: ${d.titulo.trim()}`);
  if (d.empreendimento) linhas.push(`Empreendimento: ${d.empreendimento}`);
  if (d.objetivo?.trim()) linhas.push(`Objetivo: ${d.objetivo.trim()}`);
  if (d.publico?.trim()) linhas.push(`Público: ${d.publico.trim()}`);
  if (d.formato?.trim()) linhas.push(`Formato: ${d.formato.trim()}`);
  linhas.push('', 'Escreva a chamada principal e o texto de apoio.');
  return linhas.join('\n');
}

/** Agrupa por coluna, respeitando a ordem de cada uma. */
export function porColuna(demandas: Demanda[]): Record<Status, Demanda[]> {
  const mapa = Object.fromEntries(COLUNAS.map((c) => [c.id, [] as Demanda[]])) as Record<Status, Demanda[]>;
  for (const d of demandas ?? []) {
    if (mapa[d.status]) mapa[d.status].push(d);
  }
  for (const c of COLUNAS) {
    mapa[c.id].sort((a, b) => a.ordem - b.ordem || a.prazo.localeCompare(b.prazo));
  }
  return mapa;
}

/**
 * Quem precisa ser avisado quando a demanda muda de coluna.
 *
 * O plano pede dois avisos: ao responsável quando é atribuído, e ao
 * solicitante quando é aprovado. Ninguém é avisado da própria ação — receber
 * notificação do que você acabou de fazer só ensina a ignorar notificação.
 */
export function quemAvisar(
  antes: Pick<Demanda, 'status' | 'responsavel_id'>,
  depois: Pick<Demanda, 'status' | 'responsavel_id' | 'titulo'>,
  quemMexeu: string | null
): Array<{ userId: string; titulo: string; corpo: string }> {
  const avisos: Array<{ userId: string; titulo: string; corpo: string }> = [];

  if (depois.responsavel_id && depois.responsavel_id !== antes.responsavel_id
      && depois.responsavel_id !== quemMexeu) {
    avisos.push({
      userId: depois.responsavel_id,
      titulo: 'Nova demanda para você',
      corpo: `"${depois.titulo}" foi atribuída a você.`,
    });
  }
  return avisos;
}

/** O aviso ao solicitante quando a peça é aprovada. */
export function avisoDeAprovacao(
  antes: Pick<Demanda, 'status'>,
  depois: Pick<Demanda, 'status' | 'titulo' | 'solicitante_id'>,
  quemMexeu: string | null
): { userId: string; titulo: string; corpo: string } | null {
  if (antes.status === 'aprovado' || depois.status !== 'aprovado') return null;
  if (!depois.solicitante_id || depois.solicitante_id === quemMexeu) return null;
  return {
    userId: depois.solicitante_id,
    titulo: 'Sua demanda foi aprovada',
    corpo: `"${depois.titulo}" está aprovada e pronta para publicar.`,
  };
}
