/**
 * Tipo de notificação → aba, ícone, cor, rota (de quem → para quem), tempo na tela e destino.
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

/** Quem mandou o aviso: uma pessoa, a LIA, ou a parte do sistema que o gerou. */
export type Origem =
  | { tipo: 'usuario'; nome: string; papel?: string; iniciais: string }
  | { tipo: 'lia'; nome: string }
  | { tipo: 'sistema'; nome: string };

export interface Rota {
  origem: Origem;
  /** Para quem foi. Ausente nas notificações de antes de 01/10. */
  destino?: string;
  importante: boolean;
}

/** "Gil Gerente" → "GG"; "Ana" → "A"; e-mail (sem nome no cadastro) → a 1ª letra. */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (partes[0][0] + ultima).toUpperCase();
}

/**
 * De onde veio e para quem foi — a linha que a tela mostra em cada aviso.
 * A cópia do gestor diz de quem é o problema ("Você, como gestor de João").
 */
export function rotaDe(item: ItemComMetadata): Rota {
  // metadata é jsonb: pode chegar string, número ou null das linhas antigas.
  const m = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const r = m.remetente;
  const origem: Origem =
    r?.tipo === 'lia'
      ? { tipo: 'lia', nome: r.nome || 'LIA' }
      : r?.nome
        ? { tipo: 'usuario', nome: r.nome, papel: r.cargo, iniciais: iniciaisDe(r.nome) }
        : { tipo: 'sistema', nome: tipoDe(item.type).origem };
  const destino = m.sobre ? `Você, como gestor de ${m.sobre}` : m.publico;
  return { origem, destino, importante: m.prioridade === 'importante' };
}

/**
 * A faixa à esquerda só onde há urgência: alerta ou comunicado importante em
 * âmbar, bloqueio em rosa. Comunicado comum não tem faixa — o avatar já diz tudo.
 * Devolve a classe de cor (Tailwind) ou null.
 */
export function acentoDoAviso(item: ItemComMetadata): string | null {
  const tipo = tipoDe(item.type);
  if (tipo.tom === 'rosa') return 'bg-rose-500';
  if (tipo.categoria === 'alerta' || rotaDe(item).importante) return 'bg-amber-500';
  return null;
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

const ROTAS = new Map<string, { rota: (id: string) => string; rotulo: string }>([
  // /lead/:id usa um número montado na tela (id_lead), não o UUID do banco:
  // o lead abre na própria página de notificações, como o Chat faz.
  ['lead', { rota: (id) => `/notificacoes?lead=${encodeURIComponent(id)}`, rotulo: 'Abrir lead' }],
  ['mkt_demanda', { rota: () => '/marketing/demandas', rotulo: 'Ver demanda' }],
  ['recrutamento', { rota: () => '/recrutamento', rotulo: 'Ver candidato' }],
  ['bolsao', { rota: () => '/bolsao', rotulo: 'Ver no bolsão' }],
  ['imovel', { rota: () => '/imoveis', rotulo: 'Ver imóvel' }],
  ['condominio', { rota: () => '/imoveis', rotulo: 'Ver condomínio' }],
  ['agenda_event', { rota: () => '/atividades', rotulo: 'Ver atividades' }],
]);

/** Para onde o clique leva. null = o item não é clicável. */
export function destinoDoLink(linkType?: string, linkId?: string): string | null {
  const link = linkType ? ROTAS.get(linkType) : undefined;
  return link && linkId ? link.rota(linkId) : null;
}

/** O nome do botão diz o que acontece ao clicar ("Abrir lead", não "Abrir"). */
export function rotuloDoLink(linkType?: string): string {
  return (linkType && ROTAS.get(linkType)?.rotulo) || 'Abrir';
}
