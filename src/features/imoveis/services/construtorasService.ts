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
  'id, codigo, nome, aliases, razao_social, responsavel_nome, responsavel_telefone, responsavel_email, ' +
  'prazo_pagamento_dias, dados_nota, e_avulso, ativa, observacao';

export interface Construtora {
  id: string;
  /** Identificador estável: o nome muda sem quebrar vínculo nem relatório. */
  codigo: string;
  nome: string;
  /**
   * Como esta construtora aparece escrita nas OUTRAS fontes — "APLAUSI" para
   * Applausi, "GRUPO ZARIN" para Zarin. É o que permite à aba Construtoras
   * casar as linhas da planilha com o cadastro; sem isto, 12 das 82 linhas
   * ficam em "fora do cadastro" com o cadastro inteiro certo.
   */
  aliases: string[];
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
  aliases: string[] | null;
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
  aliases: l.aliases ?? [],
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

// `aliases` fica de fora: nenhuma tela edita a lista de grafias — ela vem do
// de-para do banco. Incluí-la aqui obrigaria todo formulário a carregá-la só
// para devolvê-la igual.
/**
 * O CNPJ principal de cada construtora.
 *
 * Mora em `construtora_cnpjs`, tabela à parte porque uma construtora pode ter
 * vários — o cadastro aceita isso desde 18/09. A TELA trabalha com um só: é o
 * que a nota fiscal precisa, e é o que o chefe vai preencher uma a uma. Quem
 * precisar dos outros usa a tabela direto.
 *
 * Falha de leitura NÃO vira "sem CNPJ": o marcador vermelho da aba acusaria
 * uma pendência que não existe, e alguém iria atrás de um dado já preenchido.
 */
export async function fetchCnpjPrincipal(tenantId: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!tenantId || tenantId === 'owner') return mapa;

  const { data, error } = await supabase
    .from('construtora_cnpjs')
    .select('construtora_id, cnpj, principal')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[construtoras] erro ao ler CNPJs:', error.code, error.message);
    throw error;
  }
  for (const l of (data ?? []) as Array<{ construtora_id: string; cnpj: string; principal: boolean }>) {
    // O primeiro marcado como principal ganha; sem nenhum principal, vale o
    // primeiro que veio — melhor mostrar um CNPJ do que nenhum.
    if (l.principal || !mapa.has(l.construtora_id)) mapa.set(l.construtora_id, l.cnpj);
  }
  return mapa;
}

/** Só dígitos. "12.345.678/0001-90" e "12345678000190" são o mesmo CNPJ. */
export const digitosDoCnpj = (v: string | null | undefined): string => (v || '').replace(/\D/g, '');

/**
 * "12345678000190" -> "12.345.678/0001-90". Só para LER; o banco guarda
 * dígitos. Aceita entrada parcial, porque o formulário mascara enquanto se
 * digita.
 *
 * Mora aqui, ao lado de `digitosDoCnpj`, porque duas telas a usam — o
 * formulário e o perfil. Eu a tinha escrito nas duas em 24/09, e duas máscaras
 * do mesmo documento divergem na primeira correção.
 */
export const mascaraDeCnpj = (v: string | null | undefined): string =>
  digitosDoCnpj(v).replace(
    /^(\d{2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2}).*$/,
    (_, a, b, c, d, e) => [a, b && '.' + b, c && '.' + c, d && '/' + d, e && '-' + e].join(''),
  );

/**
 * O que falta preencher nesta construtora — o marcador vermelho pedido pelo
 * chefe em 24/09, para ir completando uma a uma.
 *
 * Os três são os que o sistema de fato usa: CNPJ e razão social são o tomador
 * da nota fiscal da comissão (a aba "Notas a emitir" do P4.6 já lista "falta o
 * CNPJ da X"), e o responsável é com quem se fala.
 *
 * A COMISSÃO fica fora de propósito: o banco não concede aquela coluna a todo
 * mundo, então incluí-la faria o marcador acender para uns e não para outros —
 * e um marcador que muda conforme quem olha não serve para ir preenchendo.
 *
 * Contato é UM dos três (nome, telefone ou e-mail), não os três: exigir os
 * três deixaria quase todo cartão vermelho para sempre, e marcador que nunca
 * apaga vira paisagem.
 */
export function oQueFaltaNaConstrutora(
  c: Pick<Construtora, 'razaoSocial' | 'responsavelNome' | 'responsavelTelefone' | 'responsavelEmail'>,
  cnpj: string | null | undefined,
): string[] {
  const falta: string[] = [];
  if (!digitosDoCnpj(cnpj)) falta.push('CNPJ');
  if (!c.razaoSocial?.trim()) falta.push('razão social');
  if (!c.responsavelNome?.trim() && !c.responsavelTelefone?.trim() && !c.responsavelEmail?.trim()) {
    falta.push('contato do responsável');
  }
  return falta;
}

/**
 * Grava (ou apaga) o CNPJ principal da construtora.
 *
 * Apagar e inserir, em vez de `upsert`: a tabela tem índice único por
 * `(tenant_id, cnpj)` E um único principal por construtora. Um upsert pela
 * chave errada renomearia o CNPJ de OUTRA construtora que já use aquele
 * número — o mesmo acidente que a gravação de construtora teve em 18/09.
 */
export async function salvarCnpjPrincipal(
  tenantId: string,
  construtoraId: string,
  cnpj: string | null,
): Promise<{ success: boolean; error?: string }> {
  const digitos = digitosDoCnpj(cnpj);
  if (digitos && digitos.length !== 14) {
    return { success: false, error: 'o CNPJ precisa ter 14 dígitos' };
  }

  const { error: erroApagar } = await supabase
    .from('construtora_cnpjs')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('construtora_id', construtoraId)
    .eq('principal', true);
  if (erroApagar) return { success: false, error: erroApagar.message };

  if (!digitos) return { success: true };

  const { error } = await supabase
    .from('construtora_cnpjs')
    .insert({ tenant_id: tenantId, construtora_id: construtoraId, cnpj: digitos, principal: true });
  if (error) {
    if (error.code === '23505') return { success: false, error: 'este CNPJ já está em outra construtora' };
    if (error.code === '23514') return { success: false, error: 'CNPJ inválido' };
    return { success: false, error: error.message };
  }
  return { success: true };
}

export type EntradaDeConstrutora = Omit<Construtora, 'id' | 'aliases'> & {
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
