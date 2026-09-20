/**
 * Tipologias do empreendimento (P2.1).
 *
 * A tela edita uma lista inteira de uma vez, então o serviço grava a lista
 * inteira: cria as novas, atualiza as que mudaram e apaga as que saíram, numa
 * transação por lançamento. Gravar linha a linha deixaria a tela e o banco em
 * desacordo quando uma das chamadas falhasse no meio.
 */

import { supabase } from '@/lib/supabaseClient';
import type { Tipologia } from '../utils/tipologias';

const COLUNAS =
  'id, nome, dormitorios, suites, banheiros, vagas, area_privativa_m2, preco_a_partir, ' +
  'preco_atualizado_em, disponivel, unidades_disponiveis, planta_url, observacao, ordem';

export async function buscarTipologias(lancamentoId: string): Promise<Tipologia[]> {
  if (!lancamentoId) return [];
  const { data, error } = await supabase
    .from('tipologias')
    .select(COLUNAS)
    .eq('lancamento_id', lancamentoId)
    .order('ordem', { ascending: true });

  // Erro NÃO vira lista vazia: a tela acharia que o lançamento não tem
  // tipologia e o card cairia na reserva do texto antigo, silenciosamente.
  if (error) throw error;
  return (data ?? []) as unknown as Tipologia[];
}

const numeroOuNulo = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const inteiroOuNulo = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * Grava a lista inteira do lançamento.
 *
 * `ordem` é reescrita pela posição na lista: é o que a tela mostra, e deixar
 * a ordem antiga faria o arrastar não ter efeito depois de salvar.
 */
export async function salvarTipologias(
  tenantId: string,
  lancamentoId: string,
  lista: Tipologia[]
): Promise<void> {
  if (!tenantId || tenantId === 'owner' || !lancamentoId) {
    throw new Error('sem imobiliária ou lançamento');
  }

  const validas = lista.filter((t) => String(t.nome ?? '').trim() !== '');

  const linhas = validas.map((t, i) => ({
    ...(t.id ? { id: t.id } : {}),
    tenant_id: tenantId,
    lancamento_id: lancamentoId,
    nome: String(t.nome).trim(),
    dormitorios: inteiroOuNulo(t.dormitorios),
    suites: inteiroOuNulo(t.suites),
    banheiros: inteiroOuNulo(t.banheiros),
    vagas: inteiroOuNulo(t.vagas),
    area_privativa_m2: numeroOuNulo(t.area_privativa_m2),
    preco_a_partir: numeroOuNulo(t.preco_a_partir),
    // Mexeu no preço sem dizer quando? Carimba hoje. A LIA cita valor para
    // cliente, e "a partir de" sem data é valor de validade desconhecida.
    preco_atualizado_em: t.preco_atualizado_em
      || (numeroOuNulo(t.preco_a_partir) !== null ? new Date().toISOString().slice(0, 10) : null),
    disponivel: t.disponivel !== false,
    unidades_disponiveis: inteiroOuNulo(t.unidades_disponiveis),
    planta_url: String(t.planta_url ?? '').trim() || null,
    observacao: String(t.observacao ?? '').trim() || null,
    ordem: i,
    updated_at: new Date().toISOString(),
  }));

  // Apaga o que saiu da lista ANTES de gravar: uma tipologia renomeada para o
  // nome de outra que está sendo removida bateria no índice único.
  const idsQueFicam = validas.map((t) => t.id).filter(Boolean) as string[];
  const apagar = supabase.from('tipologias').delete().eq('lancamento_id', lancamentoId);
  const { error: erroApagar } = idsQueFicam.length > 0
    ? await apagar.not('id', 'in', `(${idsQueFicam.join(',')})`)
    : await apagar;
  if (erroApagar) throw erroApagar;

  if (linhas.length === 0) return;

  const { error } = await supabase.from('tipologias').upsert(linhas, { onConflict: 'id' });
  if (error) throw error;
}
