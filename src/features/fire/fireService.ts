/**
 * A.6 · Fire — tudo passa pelas funções do banco (20261011_fire.sql): a tela
 * não lê nem escreve as tabelas. Pontuar é do relógio (a cada 10 minutos).
 */
import { supabase } from '@/integrations/supabase/client';
import type { Classificado, EventoFire, Pontuacao, Recorde, StatusEdicao } from './fire';

export interface EdicaoResumo { id: string; nome: string; inicio: string; fim: string; status: StatusEdicao }
export interface Desafio {
  id: string; descricao: string; evento: EventoFire; quantidade: number; desde: string; prazo: string; pontos: number; cumpriram: number;
}
export interface Edicao extends EdicaoResumo {
  processado_em: string | null;
  encerrada_em: string | null;
  pontuacao: Pontuacao | null;
  desafios: Desafio[];
  classificacao: Classificado[];
  sem_atuacao: string[];
}
export interface PainelFire {
  pode_gerir: boolean;
  eu: string;
  edicoes: EdicaoResumo[];
  edicao: Edicao | null;
  recordes: Recorde[];
}
export interface PontoDoExtrato {
  id: string;
  evento: EventoFire | 'desafio';
  origem_tipo: 'imovel' | 'visita' | 'proposta' | 'venda' | 'desafio';
  origem_id: string;
  lead_id: string | null;
  descricao: string | null;
  pontos: number;
  data: string;
  estorno_de: string | null;
  estorno_motivo: string | null;
  estornado: boolean;
}

const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Só a diretoria mexe na campanha.',
  periodo_invalido: 'O fim tem que ser depois do início.',
  pontuacao_invalida: 'Pontos são números inteiros de 0 a 1000.',
  edicao_nao_e_rascunho: 'Só o rascunho muda. Depois de ativar, a regra fica como foi combinada.',
  edicao_ja_terminou: 'Essa edição já terminou: ajuste o fim antes de ativar.',
  ja_existe_edicao_ativa: 'Já existe uma edição ativa. Encerre a atual antes de ativar outra.',
  edicao_nao_ativa: 'A edição não está ativa — encerrada não recebe ponto nem estorno.',
  edicao_encerrada: 'A edição está encerrada: a classificação dela não muda mais.',
  prazo_fora_da_edicao: 'O desafio tem que caber dentro da edição.',
  desafio_ja_pontuou: 'Alguém já cumpriu esse desafio: ele não sai mais.',
  motivo_obrigatorio: 'Escreva o motivo do estorno (pelo menos 5 letras).',
  estorno_nao_se_estorna: 'Um estorno não se estorna.',
  so_rascunho_se_exclui: 'Só o rascunho se exclui.',
};
function erro(e: { message?: string } | null): Error {
  const m = e?.message ?? '';
  if (m.includes('fire_estorno_uma_vez')) return new Error('Esse ponto já foi estornado.');
  return new Error(MENSAGENS[m] ?? 'Não deu para concluir. Tente de novo.');
}

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw erro(error);
  return data as T;
}

export const carregarPainel = (tenantId: string, edicaoId?: string | null) =>
  rpc<PainelFire>('fire_painel', { p_tenant_id: tenantId, p_edicao_id: edicaoId ?? null });

export const carregarExtrato = (edicaoId: string, userId: string) =>
  rpc<PontoDoExtrato[]>('fire_extrato', { p_edicao_id: edicaoId, p_user_id: userId });

export const salvarEdicao = (tenantId: string, e: { id?: string | null; nome: string; inicio: string; fim: string; pontuacao: Pontuacao }) =>
  rpc<string>('fire_salvar_edicao', { p_tenant_id: tenantId, p_id: e.id ?? null, p_nome: e.nome, p_inicio: e.inicio, p_fim: e.fim, p_pontuacao: e.pontuacao });

export const ativarEdicao = (edicaoId: string) => rpc<number>('fire_ativar', { p_edicao_id: edicaoId });
export const encerrarEdicao = (edicaoId: string) => rpc<void>('fire_encerrar', { p_edicao_id: edicaoId });
export const excluirEdicao = (edicaoId: string) => rpc<void>('fire_excluir_edicao', { p_edicao_id: edicaoId });

export const salvarDesafio = (edicaoId: string, d: { descricao: string; evento: EventoFire; quantidade: number; desde: string; prazo: string; pontos: number }) =>
  rpc<string>('fire_salvar_desafio', {
    p_edicao_id: edicaoId, p_descricao: d.descricao, p_evento: d.evento, p_quantidade: d.quantidade,
    p_desde: d.desde, p_prazo: d.prazo, p_pontos: d.pontos,
  });
export const removerDesafio = (desafioId: string) => rpc<void>('fire_remover_desafio', { p_desafio_id: desafioId });

export const estornarPonto = (pontoId: string, motivo: string) => rpc<string>('fire_estornar', { p_ponto_id: pontoId, p_motivo: motivo });
