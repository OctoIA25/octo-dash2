import { supabase } from '@/lib/supabaseClient';

// ============================================================
// Cadastro de construtoras (P0.3).
//
// Antes a construtora era TEXTO livre em `lancamentos.construtora` e
// `condominios.construtora`, e a aba Construtoras nem lia o banco: ela baixava
// uma planilha do Google. Medido em 18/09/2026, as duas listas divergiam em
// seis nomes.
//
// A COMISSÃO não entra na projeção abaixo — e isso não é escolha desta
// camada. O banco NÃO concede leitura dessa coluna a quem está logado: pedir
// `comissao_padrao_pct` num select devolve 42501. Quem pode ver lê pela RPC
// `construtoras_comissao`, que confere o cargo no próprio banco.
//
// Pelo mesmo motivo NÃO existe `select('*')` aqui: sem SELECT de tabela, o
// asterisco falha inteiro. A projeção explícita é obrigatória, não estilo.
// ============================================================

/** Todas as colunas MENOS a comissão — é o que `authenticated` pode ler. */
const COLUNAS =
  'id, codigo, nome, razao_social, responsavel_nome, responsavel_telefone, responsavel_email, ' +
  'prazo_pagamento_dias, dados_nota, e_avulso, ativa, observacao';

export interface Construtora {
  id: string;
  /** Identificador estável: o nome muda sem quebrar vínculo nem relatório. */
  codigo: string;
  nome: string;
  razaoSocial: string | null;
  responsavelNome: string | null;
  responsavelTelefone: string | null;
  responsavelEmail: string | null;
  prazoPagamentoDias: number | null;
  dadosNota: string | null;
  /** Parceria pontual, fora do portfólio fixo. */
  eAvulso: boolean;
  ativa: boolean;
  observacao: string | null;
}

/** A comissão, só para quem o banco autoriza. */
export interface ComissaoDaConstrutora {
  construtoraId: string;
  codigo: string;
  nome: string;
  comissaoPadraoPct: number | null;
  prazoPagamentoDias: number | null;
}

interface LinhaConstrutora {
  id: string;
  codigo: string;
  nome: string;
  razao_social: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  responsavel_email: string | null;
  prazo_pagamento_dias: number | null;
  dados_nota: string | null;
  e_avulso: boolean;
  ativa: boolean;
  observacao: string | null;
}

const paraConstrutora = (l: LinhaConstrutora): Construtora => ({
  id: l.id,
  codigo: l.codigo,
  nome: l.nome,
  razaoSocial: l.razao_social,
  responsavelNome: l.responsavel_nome,
  responsavelTelefone: l.responsavel_telefone,
  responsavelEmail: l.responsavel_email,
  prazoPagamentoDias: l.prazo_pagamento_dias,
  dadosNota: l.dados_nota,
  eAvulso: l.e_avulso,
  ativa: l.ativa,
  observacao: l.observacao,
});

/** "Santa Ângela" -> "santa_angela". Sugestão de código; o admin pode trocar. */
export function codigoDaConstrutora(nome: string): string {
  return (nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'construtora';
}

export async function fetchConstrutoras(tenantId: string): Promise<Construtora[]> {
  if (!tenantId || tenantId === 'owner') return [];
  const { data, error } = await supabase
    .from('construtoras')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .order('nome', { ascending: true });

  if (error) {
    console.error('[construtoras] erro ao listar:', error.code, error.message, error.details);
    // Lança: lista vazia por falha de leitura é indistinguível de "não há
    // construtora cadastrada", e foi assim que a aba de imóveis escondeu erro
    // durante meses.
    throw error;
  }
  return ((data ?? []) as unknown as LinhaConstrutora[]).map(paraConstrutora);
}

/**
 * A comissão de cada construtora. Devolve lista VAZIA para quem não tem cargo
 * — a decisão é do banco, dentro da função, não desta camada.
 */
export async function fetchComissoes(tenantId: string): Promise<ComissaoDaConstrutora[]> {
  if (!tenantId || tenantId === 'owner') return [];
  const { data, error } = await supabase.rpc('construtoras_comissao', { p_tenant_id: tenantId });

  if (error) {
    console.error('[construtoras] erro ao ler comissões:', error.code, error.message);
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((l) => ({
    construtoraId: String(l.construtora_id),
    codigo: String(l.codigo),
    nome: String(l.nome),
    comissaoPadraoPct: l.comissao_padrao_pct == null ? null : Number(l.comissao_padrao_pct),
    prazoPagamentoDias: l.prazo_pagamento_dias == null ? null : Number(l.prazo_pagamento_dias),
  }));
}

export type EntradaDeConstrutora = Omit<Construtora, 'id'> & {
  /** Só é enviada quando o usuário pode ver a comissão — senão fica de fora. */
  comissaoPadraoPct?: number | null;
};

/**
 * Mensagem em português para as travas do banco.
 *
 * As DUAS dizem a mesma coisa para quem está na tela. O identificador é
 * derivado do nome, então "SANTA ANGELA" tendo "Santa Ângela" cadastrada
 * esbarra primeiro no índice de código — e responder "já existe uma
 * construtora com esse identificador" seria jargão para quem digitou um NOME.
 */
function erroDeDuplicata(error: { code?: string; message?: string }): string | null {
  if (error.code !== '23505') return null;
  return 'já existe uma construtora com esse nome';
}

function validar(entrada: EntradaDeConstrutora): { codigo: string; nome: string } | { erro: string } {
  const codigo = (entrada.codigo || '').trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(codigo)) {
    return { erro: 'o código aceita só letras minúsculas, números e _' };
  }
  const nome = (entrada.nome || '').trim();
  if (!nome) return { erro: 'o nome é obrigatório' };
  return { codigo, nome };
}

function paraLinha(entrada: EntradaDeConstrutora, nome: string): Record<string, unknown> {
  const linha: Record<string, unknown> = {
    nome,
    razao_social: entrada.razaoSocial || null,
    responsavel_nome: entrada.responsavelNome || null,
    responsavel_telefone: entrada.responsavelTelefone || null,
    responsavel_email: entrada.responsavelEmail || null,
    prazo_pagamento_dias: entrada.prazoPagamentoDias ?? null,
    dados_nota: entrada.dadosNota || null,
    e_avulso: entrada.eAvulso,
    ativa: entrada.ativa,
    observacao: entrada.observacao || null,
    updated_at: new Date().toISOString(),
  };
  // Só manda a comissão quem a recebeu — enviar o campo sem ele apagaria o
  // valor de quem não pode vê-lo.
  if (entrada.comissaoPadraoPct !== undefined) {
    linha.comissao_padrao_pct = entrada.comissaoPadraoPct;
  }
  return linha;
}

/**
 * CRIAR é INSERT, nunca upsert.
 *
 * Com upsert, cadastrar "SANTA ANGELA" tendo "Santa Ângela" no cadastro
 * RENOMEAVA a existente em silêncio: as duas geram o mesmo código, o upsert
 * casava por ele e sobrescrevia o nome. Quem achava que estava cadastrando uma
 * construtora nova renomeava outra. Pego pelo teste de navegador em 18/09/2026.
 */
export async function criarConstrutora(
  tenantId: string,
  entrada: EntradaDeConstrutora
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId) return { success: false, error: 'imobiliária não selecionada' };
  const v = validar(entrada);
  if ('erro' in v) return { success: false, error: v.erro };

  const { error } = await supabase
    .from('construtoras')
    .insert({ tenant_id: tenantId, codigo: v.codigo, ...paraLinha(entrada, v.nome) });

  if (error) return { success: false, error: erroDeDuplicata(error) ?? error.message };
  return { success: true };
}

/** EDITAR é UPDATE pelo id: o código é a identidade e não muda. */
export async function atualizarConstrutora(
  tenantId: string,
  id: string,
  entrada: EntradaDeConstrutora
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId || !id) return { success: false, error: 'parâmetros inválidos' };
  const v = validar(entrada);
  if ('erro' in v) return { success: false, error: v.erro };

  const { error } = await supabase
    .from('construtoras')
    .update(paraLinha(entrada, v.nome))
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) return { success: false, error: erroDeDuplicata(error) ?? error.message };
  return { success: true };
}

export async function removerConstrutora(
  tenantId: string,
  codigo: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId || !codigo) return { success: false, error: 'parâmetros inválidos' };
  const { error } = await supabase
    .from('construtoras')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('codigo', codigo);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
