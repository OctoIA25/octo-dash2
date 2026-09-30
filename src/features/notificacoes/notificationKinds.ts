/**
 * Tipo de notificação → aba, ícone, cor, etiquetas, tempo na tela e destino.
 *
 * TABELAS, não cadeias de if: tipo novo é uma linha nova. `Map` e não objeto
 * literal: um `type` chamado "constructor" ou "toString" acharia a propriedade
 * herdada do Object e quebraria a tela.
 *
 * Tipo que não está aqui cai em "Sistema" — é o caso de info/warning, que vêm
 * de vários produtores (imóvel pendente, recrutamento, anúncio desconhecido,
 * demandas).
 */
import { AlertTriangle, Ban, CalendarClock, Info, Megaphone, PhoneCall, type LucideIcon } from 'lucide-react';

export type Categoria = 'comunicado' | 'alerta' | 'sistema';
export type Tom = 'azul' | 'ambar' | 'rosa' | 'cinza';

export interface TipoDeNotificacao {
  categoria: Categoria;
  icone: LucideIcon;
  tom: Tom;
  /** Etiqueta de origem quando a linha não traz metadata.remetente (as antigas e as do sistema). */
  origem: string;
}

/** O mínimo que estas funções leem de uma notificação. */
export interface ItemComMetadata {
  type?: string;
  metadata?: {
    remetente?: { tipo?: string; nome?: string; cargo?: string };
    publico?: string;
    prioridade?: string;
    sobre?: string;
  } | null;
}

const TIPOS = new Map<string, TipoDeNotificacao>([
  ['comunicado', { categoria: 'comunicado', icone: Megaphone, tom: 'azul', origem: 'Comunicado' }],
  ['alerta', { categoria: 'alerta', icone: AlertTriangle, tom: 'ambar', origem: 'Alerta' }],
  ['activity_pending', { categoria: 'alerta', icone: CalendarClock, tom: 'ambar', origem: 'Agenda' }],
  ['blocked', { categoria: 'alerta', icone: Ban, tom: 'rosa', origem: 'Distribuição' }],
  ['cadencia_toque', { categoria: 'alerta', icone: PhoneCall, tom: 'ambar', origem: 'Cadência' }],
]);
const SISTEMA: TipoDeNotificacao = { categoria: 'sistema', icone: Info, tom: 'cinza', origem: 'Sistema' };

export function tipoDe(type?: string): TipoDeNotificacao {
  return (type && TIPOS.get(type)) || SISTEMA;
}

export const CLASSES_DO_TOM: Record<Tom, { fundo: string; icone: string; borda: string }> = {
  azul: { fundo: 'bg-blue-50 dark:bg-blue-500/15', icone: 'text-blue-600 dark:text-blue-400', borda: 'border-l-blue-500' },
  ambar: { fundo: 'bg-amber-50 dark:bg-amber-500/15', icone: 'text-amber-600 dark:text-amber-400', borda: 'border-l-amber-500' },
  rosa: { fundo: 'bg-rose-50 dark:bg-rose-500/15', icone: 'text-rose-600 dark:text-rose-400', borda: 'border-l-rose-500' },
  cinza: { fundo: 'bg-slate-100 dark:bg-slate-800', icone: 'text-slate-500 dark:text-slate-400', borda: 'border-l-slate-400' },
};

export interface Etiqueta {
  texto: string;
  destaque?: boolean;
}

/** De onde veio, para quem foi, sobre quem é, e se é importante. */
export function etiquetasDe(item: ItemComMetadata): Etiqueta[] {
  const m = item.metadata ?? {};
  const r = m.remetente;
  const origem = r?.nome ? [r.cargo, r.nome].filter(Boolean).join(' · ') : tipoDe(item.type).origem;
  const etiquetas: Etiqueta[] = [{ texto: origem }];
  if (m.publico) etiquetas.push({ texto: `Para: ${m.publico}` });
  if (m.sobre) etiquetas.push({ texto: `Sobre: ${m.sobre}` });
  if (m.prioridade === 'importante') etiquetas.push({ texto: 'Importante', destaque: true });
  return etiquetas;
}

/**
 * Quanto tempo o aviso fica na tela. A cadência mantém os 60 s decididos em
 * 16/09: o toque é agora, e o aviso precisa ser visto na hora.
 */
export function duracaoDoAviso(item: ItemComMetadata): number {
  if (item.type === 'cadencia_toque') return 60_000;
  if (tipoDe(item.type).categoria === 'alerta' || item.metadata?.prioridade === 'importante') return 10_000;
  return 6_000;
}

const ROTAS = new Map<string, (id: string) => string>([
  // /lead/:id usa um número montado na tela (id_lead), não o UUID do banco:
  // o lead abre na própria página de notificações, como o Chat faz.
  ['lead', (id) => `/notificacoes?lead=${encodeURIComponent(id)}`],
  ['mkt_demanda', () => '/marketing/demandas'],
  ['recrutamento', () => '/recrutamento'],
  ['bolsao', () => '/bolsao'],
  ['imovel', () => '/imoveis'],
  ['condominio', () => '/imoveis'],
  ['agenda_event', () => '/atividades'],
]);

/** Para onde o clique leva. null = o item não é clicável. */
export function destinoDoLink(linkType?: string, linkId?: string): string | null {
  const rota = linkType ? ROTAS.get(linkType) : undefined;
  return rota && linkId ? rota(linkId) : null;
}
