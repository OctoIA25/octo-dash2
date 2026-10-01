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
    remetente?: { tipo?: string } & Perfil;
    publico?: string;
    prioridade?: string;
    sobre?: string;
    /** Retrato de quem recebeu, gravado pelo banco (20261002_destinatario_nos_avisos). */
    destinatario?: Perfil;
    /** Na cópia do gestor: retrato de sobre quem é o aviso. */
    sobre_perfil?: Perfil;
  } | null;
}

/** Retrato de uma pessoa no momento do aviso. */
export interface Perfil {
  nome?: string;
  cargo?: string;
  equipe?: string;
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

/** Uma pessoa (ou um público) na linha de rota: o nome e, quando há, "Corretor da Equipe Jardins". */
export interface Pessoa {
  nome: string;
  detalhe?: string;
}

/** Quem mandou o aviso: uma pessoa, a LIA, ou a parte do sistema que o gerou. */
export type Origem =
  | ({ tipo: 'usuario'; iniciais: string; papel?: string } & Pessoa)
  | { tipo: 'lia'; nome: string }
  | { tipo: 'sistema'; nome: string };

export interface Rota {
  origem: Origem;
  /** Para quem foi: a equipe/casa inteira, ou a pessoa que recebeu. */
  destino?: Pessoa;
  /** Na cópia do gestor: sobre quem é o problema. */
  sobre?: Pessoa;
  importante: boolean;
}

/** "Gil Gerente" → "GG"; "Ana" → "A"; e-mail (sem nome no cadastro) → a 1ª letra. */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (partes[0][0] + ultima).toUpperCase();
}

/** Cargo e equipe em texto corrido: "Corretor da Equipe Jardins", "Diretoria", "Equipe Centro". */
export function detalheDe(perfil?: Perfil): string | undefined {
  if (perfil?.cargo && perfil.equipe) return `${perfil.cargo} da ${perfil.equipe}`;
  return perfil?.cargo || perfil?.equipe || undefined;
}

/** Públicos que não dizem quem é a pessoa ("Você" não ajuda quem vê a caixa de outro). */
const PUBLICOS_PESSOAIS = new Set(['Você', 'Você, como gestor']);

/**
 * De onde veio e para quem foi — a linha que a tela mostra em cada aviso.
 * Para uma equipe ou a casa toda, o destino é o público; para uma pessoa, é o
 * nome dela com cargo e equipe. A cópia do gestor diz também sobre quem é.
 */
export function rotaDe(item: ItemComMetadata): Rota {
  // metadata é jsonb: pode chegar string, número ou null das linhas antigas.
  const m = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const r = m.remetente;
  const origem: Origem =
    r?.tipo === 'lia'
      ? { tipo: 'lia', nome: r.nome || 'LIA' }
      : r?.nome
        ? { tipo: 'usuario', nome: r.nome, papel: r.cargo, detalhe: detalheDe(r), iniciais: iniciaisDe(r.nome) }
        : { tipo: 'sistema', nome: tipoDe(item.type).origem };

  const d = m.destinatario;
  const destino: Pessoa | undefined =
    m.publico && !PUBLICOS_PESSOAIS.has(m.publico)
      ? { nome: m.publico }
      : d?.nome
        ? { nome: d.nome, detalhe: detalheDe(d) }
        : m.publico
          ? { nome: m.publico }
          : undefined;

  const sobre: Pessoa | undefined = m.sobre ? { nome: m.sobre, detalhe: detalheDe(m.sobre_perfil) } : undefined;

  return { origem, destino, sobre, importante: m.prioridade === 'importante' };
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

/** semId: o destino é uma tela, não um registro (Metas, Bolsão) — o comunicado vai sem link_id. */
const ROTAS = new Map<string, { rota: (id: string) => string; rotulo: string; semId?: boolean }>([
  // /lead/:id usa um número montado na tela (id_lead), não o UUID do banco:
  // o lead abre na própria página de notificações, como o Chat faz.
  ['lead', { rota: (id) => `/notificacoes?lead=${encodeURIComponent(id)}`, rotulo: 'Abrir lead' }],
  ['mkt_demanda', { rota: () => '/marketing/demandas', rotulo: 'Ver demanda' }],
  ['recrutamento', { rota: () => '/recrutamento', rotulo: 'Ver candidato' }],
  ['bolsao', { rota: () => '/bolsao', rotulo: 'Ver no bolsão', semId: true }],
  ['lancamento', { rota: (id) => `/imoveis/lancamentos/${encodeURIComponent(id)}`, rotulo: 'Ver lançamento' }],
  ['material', { rota: (id) => `/materiais?material=${encodeURIComponent(id)}`, rotulo: 'Abrir material' }],
  ['metas', { rota: () => '/metas', rotulo: 'Ver metas', semId: true }],
  ['imovel', { rota: () => '/imoveis', rotulo: 'Ver imóvel' }],
  ['condominio', { rota: () => '/imoveis', rotulo: 'Ver condomínio' }],
  ['agenda_event', { rota: () => '/atividades', rotulo: 'Ver atividades' }],
]);

/** Para onde o clique leva. null = o item não é clicável. */
export function destinoDoLink(linkType?: string, linkId?: string): string | null {
  const link = linkType ? ROTAS.get(linkType) : undefined;
  if (!link) return null;
  if (link.semId) return link.rota('');
  return linkId ? link.rota(linkId) : null;
}

/** Pede ciente e ainda não deu: fica não lido até o botão "Ciente" (A.2). */
export function aguardaCiente(n: { exigeCiente: boolean; cienteEm?: string }): boolean {
  return n.exigeCiente && !n.cienteEm;
}

/** O nome do botão diz o que acontece ao clicar ("Abrir lead", não "Abrir"). */
export function rotuloDoLink(linkType?: string): string {
  return (linkType && ROTAS.get(linkType)?.rotulo) || 'Abrir';
}
