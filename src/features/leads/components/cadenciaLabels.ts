/**
 * Vocabulário da cadência — rótulos e cores em um lugar só, no molde de
 * CLASSIFICACAO_ESTILOS.
 *
 * As tags vêm do app da LIA, que pode inventar uma nova a qualquer momento.
 * Por isso `rotuloDaTag` NUNCA esconde o que não conhece: devolve a própria
 * tag legível. Sumir com a linha seria pior do que mostrar um nome feio.
 */

/** As 12 tags observadas em produção (set/2026). Lista aberta de propósito. */
export const TAG_LABELS: Record<string, string> = {
  pos_apresentacao: 'Após apresentar imóvel',
  pre_visita_proposta: 'Antes da visita/proposta',
  aguardando_consulta: 'Aguardando consulta',
  aguardando_decisao: 'Aguardando decisão',
  pos_qualificacao: 'Após qualificar',
  silencio_quente: 'Silêncio de lead quente',
  pos_foto: 'Após enviar fotos',
  aguardando_curto: 'Retorno curto',
  aguardando_qualificacao: 'Aguardando qualificação',
  interesse_alto: 'Interesse alto',
  aguardando_hoje: 'Retorno no mesmo dia',
  aguardando_contato: 'Aguardando contato',
};

/** Tag desconhecida vira "Pos Novo Assunto" em vez de sumir da tela. */
export function rotuloDaTag(tag: string | null | undefined): string {
  if (!tag) return 'Sem assunto';
  return TAG_LABELS[tag] ?? tag.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export interface EstiloResultado {
  label: string;
  /** Cor do ponto na timeline. */
  dot: string;
  /** Cor do texto do badge. */
  texto: string;
}

export const RESULTADO_ESTILOS: Record<string, EstiloResultado> = {
  respondido: { label: 'Respondeu', dot: 'bg-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400' },
  visita_agendada: { label: 'Agendou visita', dot: 'bg-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400' },
  sem_resposta: { label: 'Sem resposta', dot: 'bg-slate-300 dark:bg-slate-600', texto: 'text-slate-500' },
  aguardando: { label: 'Agendada', dot: 'bg-blue-500', texto: 'text-blue-600 dark:text-blue-400' },
  expirado: { label: 'Expirou', dot: 'bg-amber-500', texto: 'text-amber-600 dark:text-amber-400' },
  cancelado: { label: 'Cancelada', dot: 'bg-slate-300 dark:bg-slate-600', texto: 'text-slate-500' },
  escalado: { label: 'Passou ao corretor', dot: 'bg-violet-500', texto: 'text-violet-600 dark:text-violet-400' },
  opt_out: { label: 'Pediu para parar', dot: 'bg-rose-500', texto: 'text-rose-600 dark:text-rose-400' },
  desconhecido: { label: 'Sem status', dot: 'bg-slate-300 dark:bg-slate-600', texto: 'text-slate-500' },
};

export const estiloDoResultado = (r: string): EstiloResultado =>
  RESULTADO_ESTILOS[r] ?? RESULTADO_ESTILOS.desconhecido;

/**
 * "há 2 h", "há 3 d". Minutos viram horas e horas viram dias porque a coluna é
 * estreita e ninguém decide nada com a precisão de minuto.
 */
export function duracaoCurta(minutos: number | null | undefined): string | null {
  if (minutos == null || minutos < 0) return null;
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 60 * 24) return `${Math.round(minutos / 60)} h`;
  return `${Math.round(minutos / (60 * 24))} d`;
}

/** Data curta no formato que o resto do modal usa. */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
