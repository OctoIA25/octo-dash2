/**
 * Enviar comunicado pela tela: uma RPC. Quem recebe, o remetente e as
 * etiquetas saem do banco (enviar_comunicado → publicar_comunicado); aqui só
 * se valida o óbvio para o botão, e se traduz o erro.
 *
 * A.2 (20261005): público por cargo e por pessoa, prévia de quem recebe,
 * destino do clique (lançamento, material, Metas, Bolsão), "exige ciente" e a
 * lista de enviados com quem leu. Quem pode escolher o quê decide o banco
 * (opcoes_do_comunicado) — a tela só mostra o que veio.
 */
import { supabase } from '@/integrations/supabase/client';

export const LIMITES = { titulo: 120, mensagem: 2000 } as const;

export type Publico = 'todos' | 'equipes' | 'cargos' | 'pessoas';
/** Para onde o aviso leva ao tocar. Metas e Bolsão são telas: vão sem id. */
export type TipoDeDestino = 'lancamento' | 'material' | 'metas' | 'bolsao';
export interface Destino {
  tipo: TipoDeDestino;
  id?: string;
}

export const DESTINO_COM_ID: ReadonlySet<TipoDeDestino> = new Set(['lancamento', 'material']);

export interface NovoComunicado {
  tenantId: string;
  titulo: string;
  mensagem: string;
  importante: boolean;
  publico: Publico;
  equipeIds: string[];
  cargoIds?: string[];
  pessoaIds?: string[];
  destino?: Destino | null;
  /** Fica no sino de cada pessoa até ela clicar em "Ciente". */
  exigeCiente?: boolean;
  /** Uma por abertura do compositor: clicar duas vezes não duplica. */
  idempotencyKey: string;
}

type Escolha = Pick<NovoComunicado, 'publico' | 'equipeIds' | 'cargoIds' | 'pessoaIds'>;
type Rascunho = Pick<NovoComunicado, 'titulo' | 'mensagem' | 'destino'> & Escolha;

/** Os ids escolhidos para o público atual (os dos outros públicos não vão). */
export function escolhidos(c: Escolha): string[] {
  if (c.publico === 'equipes') return c.equipeIds;
  if (c.publico === 'cargos') return c.cargoIds ?? [];
  if (c.publico === 'pessoas') return c.pessoaIds ?? [];
  return [];
}

export function podeEnviar(c: Rascunho): boolean {
  const t = c.titulo.trim().length;
  const m = c.mensagem.trim().length;
  const destinoOk = !c.destino || !DESTINO_COM_ID.has(c.destino.tipo) || !!c.destino.id;
  return t > 0 && t <= LIMITES.titulo && m > 0 && m <= LIMITES.mensagem
    && (c.publico === 'todos' || escolhidos(c).length > 0)
    && destinoOk;
}

const MENSAGENS = new Map<string, string>([
  ['sem_permissao', 'Você só pode enviar para as suas equipes e para quem responde a você.'],
  ['sem_destinatarios', 'Ninguém recebe esse comunicado. Escolha outro público.'],
  ['equipe_invalida', 'Escolha ao menos uma equipe.'],
  ['cargo_invalido', 'Escolha ao menos um cargo.'],
  ['destinatario_desconhecido', 'Uma das pessoas escolhidas não está mais na casa. Revise a lista.'],
  ['lancamento_nao_encontrado', 'Esse lançamento não foi encontrado. Escolha outro.'],
  ['material_nao_encontrado', 'Esse material não está publicado. Escolha outro.'],
]);

export function mensagemDoErro(codigo?: string): string {
  return (codigo && MENSAGENS.get(codigo)) || 'Não deu para enviar. Tente de novo.';
}

/** Parâmetros do público. Só vai o que for usado: o envio simples chama a RPC do mesmo jeito de antes. */
function parametrosDoPublico(c: Escolha): Record<string, unknown> {
  const p: Record<string, unknown> = {
    p_publico_tipo: c.publico,
    p_equipe_ids: c.publico === 'equipes' ? c.equipeIds : [],
  };
  if (c.publico === 'cargos') p.p_cargo_ids = c.cargoIds ?? [];
  if (c.publico === 'pessoas') p.p_user_ids = c.pessoaIds ?? [];
  return p;
}

/** Devolve quantas pessoas receberam. */
export async function enviarComunicado(c: NovoComunicado): Promise<number> {
  const params: Record<string, unknown> = {
    p_tenant_id: c.tenantId,
    p_titulo: c.titulo.trim(),
    p_mensagem: c.mensagem.trim(),
    p_prioridade: c.importante ? 'importante' : 'normal',
    ...parametrosDoPublico(c),
    p_idempotency_key: c.idempotencyKey,
  };
  if (c.destino) {
    params.p_link_type = c.destino.tipo;
    params.p_link_id = DESTINO_COM_ID.has(c.destino.tipo) ? c.destino.id ?? null : null;
  }
  if (c.exigeCiente) params.p_exige_ciente = true;

  const { data, error } = await supabase.rpc('enviar_comunicado', params);
  if (error) throw new Error(mensagemDoErro(error.message));
  const linha = Array.isArray(data) ? data[0] : data;
  return Number(linha?.destinatarios ?? 0);
}

/** Uma pessoa como a tela mostra: o nome e "Corretor da Equipe A". */
export interface Pessoa {
  id: string;
  nome: string;
  cargo?: string | null;
  equipe?: string | null;
}

export interface OpcoesDoComunicado {
  equipes: { id: string; nome: string }[];
  /** Vazio para o gerente: cargo é recorte da casa inteira. */
  cargos: { id: string; nome: string; pessoas: number }[];
  pessoas: Pessoa[];
  lancamentos: { id: string; nome: string }[];
  materiais: { id: string; titulo: string }[];
}

const SEM_OPCOES: OpcoesDoComunicado = { equipes: [], cargos: [], pessoas: [], lancamentos: [], materiais: [] };

/** O que quem está logado pode escolher. Lança em erro. */
export async function carregarOpcoes(tenantId: string): Promise<OpcoesDoComunicado> {
  const { data, error } = await supabase.rpc('opcoes_do_comunicado', { p_tenant_id: tenantId });
  if (error) throw error;
  return { ...SEM_OPCOES, ...((data ?? {}) as Partial<OpcoesDoComunicado>) };
}

/** Para quem vai, nome por nome, antes de enviar. Não grava nada. */
export async function previaDoComunicado(tenantId: string, c: Escolha): Promise<Pessoa[]> {
  const { p_publico_tipo, p_equipe_ids } = parametrosDoPublico(c);
  const { data, error } = await supabase.rpc('previa_comunicado', {
    p_tenant_id: tenantId,
    p_publico_tipo,
    p_equipe_ids,
    p_cargo_ids: c.publico === 'cargos' ? c.cargoIds ?? [] : [],
    p_user_ids: c.publico === 'pessoas' ? c.pessoaIds ?? [] : [],
  });
  if (error) throw new Error(mensagemDoErro(error.message));
  return ((data ?? []) as { user_id: string; nome: string; cargo: string | null; equipe: string | null }[])
    .map((r) => ({ id: r.user_id, nome: r.nome, cargo: r.cargo, equipe: r.equipe }));
}

export interface ComunicadoEnviado {
  id: string;
  titulo: string;
  criadoEm: string;
  remetente: string;
  publico: string;
  importante: boolean;
  exigeCiente: boolean;
  destinatarios: number;
  leram: number;
  cientes: number;
}

/** O que a casa anunciou. A Diretoria vê todos; o gerente, os dele. Lança em erro. */
export async function carregarEnviados(tenantId: string): Promise<ComunicadoEnviado[]> {
  const { data, error } = await supabase.rpc('comunicados_enviados', { p_tenant_id: tenantId });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    titulo: String(r.titulo),
    criadoEm: String(r.created_at),
    remetente: String(r.remetente ?? ''),
    publico: String(r.publico ?? ''),
    importante: r.prioridade === 'importante',
    exigeCiente: r.exige_ciente === true,
    destinatarios: Number(r.destinatarios ?? 0),
    leram: Number(r.leram ?? 0),
    cientes: Number(r.cientes ?? 0),
  }));
}

export interface LeituraDaPessoa extends Pessoa {
  lidoEm: string | null;
  cienteEm: string | null;
  /** Recebeu como gestor de alguém (só nos avisos da LIA). */
  copiaGestor: boolean;
}

/** Quem leu e quem não leu, nome por nome. Lança em erro. */
export async function carregarLeitura(comunicadoId: string): Promise<LeituraDaPessoa[]> {
  const { data, error } = await supabase.rpc('leitura_do_comunicado', { p_comunicado_id: comunicadoId });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.user_id),
    nome: String(r.nome ?? ''),
    cargo: (r.cargo as string | null) ?? null,
    equipe: (r.equipe as string | null) ?? null,
    lidoEm: (r.lido_em as string | null) ?? null,
    cienteEm: (r.ciente_em as string | null) ?? null,
    copiaGestor: r.copia_gestor === true,
  }));
}

/**
 * Quem ainda falta e quem já fez. Num aviso que pede ciente, "fez" é dar
 * ciente — ler sem clicar em Ciente não conta.
 */
export function separarLeitura(
  pessoas: LeituraDaPessoa[],
  exigeCiente: boolean,
): { faltam: LeituraDaPessoa[]; fizeram: LeituraDaPessoa[] } {
  const fez = (p: LeituraDaPessoa) => (exigeCiente ? !!p.cienteEm : !!p.lidoEm);
  return { faltam: pessoas.filter((p) => !fez(p)), fizeram: pessoas.filter(fez) };
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Busca por nome, cargo ou equipe, sem ligar para acento e caixa. */
export function filtrarPessoas(pessoas: Pessoa[], termo: string): Pessoa[] {
  const t = semAcento(termo.trim());
  if (!t) return pessoas;
  return pessoas.filter((p) => semAcento([p.nome, p.cargo, p.equipe].filter(Boolean).join(' ')).includes(t));
}

/** O público em uma linha, como o aviso vai mostrar: "Toda a imobiliária", "Equipe A, Equipe B", "3 pessoas". */
export function rotuloDaEscolha(c: Escolha, opcoes: OpcoesDoComunicado): string {
  if (c.publico === 'todos') return 'Toda a imobiliária';
  const ids = new Set(escolhidos(c));
  if (ids.size === 0) return '';
  if (c.publico === 'equipes') return opcoes.equipes.filter((e) => ids.has(e.id)).map((e) => e.nome).join(', ');
  if (c.publico === 'cargos') return opcoes.cargos.filter((x) => ids.has(x.id)).map((x) => x.nome).join(', ');
  const nomes = opcoes.pessoas.filter((p) => ids.has(p.id)).map((p) => p.nome);
  return nomes.length === 1 ? nomes[0] : `${nomes.length} pessoas`;
}
