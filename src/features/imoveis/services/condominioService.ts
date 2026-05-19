/**
 * Serviço para busca e detecção de duplicidade de condomínios.
 */

import { supabase } from '@/lib/supabaseClient';

export interface CondominioMatch {
  id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  logradouro: string | null;
  numero: string | null;
  cep: string | null;
  tipo: string | null;
  status: string | null;
  construtora: string | null;
  ano_construcao: number | null;
  num_blocos_torres: number | null;
}

export interface CondominioDuplicadoMatch extends CondominioMatch {
  motivo: 'mesmo_nome' | 'mesmo_endereco';
}

const COLUNAS_LITE =
  'id, nome, cidade, bairro, logradouro, numero, cep, tipo, status, construtora, ano_construcao, num_blocos_torres';

const normalizar = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();
const somenteDigitos = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');
const termoIlike = (s: string): string => `%${s.trim().replace(/\s+/g, '%')}%`;

/** Busca condomínios cujo nome contenha o termo (ILIKE), ordenado por mais usados primeiro. */
export async function buscarCondominiosPorNome(
  tenantId: string,
  termo: string,
  limit = 8,
): Promise<CondominioMatch[]> {
  const termoLimpo = termo.trim();
  if (!tenantId || termoLimpo.length < 2) return [];

  const { data, error } = await supabase
    .from('condominios')
    .select(COLUNAS_LITE)
    .eq('tenant_id', tenantId)
    .ilike('nome', `%${termoLimpo}%`)
    .order('nome', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[condominioService] erro ao buscar:', error.message);
    return [];
  }

  return (data ?? []) as CondominioMatch[];
}

/** Carrega o registro completo de um condomínio (todas as colunas) para preencher o form. */
export async function buscarCondominioCompleto(
  tenantId: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  if (!tenantId || !id) return null;

  const { data, error } = await supabase
    .from('condominios')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[condominioService] erro ao carregar condomínio:', error.message);
    return null;
  }

  return data;
}

export interface VerificarCondominioDuplicidadeArgs {
  tenantId: string;
  nome: string;
  logradouro?: string | null;
  numero?: string | null;
  cep?: string | null;
  /** ID do condomínio em edição — não conta como duplicata de si mesmo */
  ignorarId?: string | null;
}

/**
 * Verifica se já existe condomínio com:
 *  - mesmo nome (case-insensitive, sem espaços extras), OU
 *  - mesmo endereço (logradouro + número + cep), mesmo com nome diferente
 */
export async function verificarCondominioDuplicado(
  args: VerificarCondominioDuplicidadeArgs,
): Promise<CondominioDuplicadoMatch[]> {
  const nome = args.nome.trim();
  if (!args.tenantId || nome.length < 2) return [];

  const nomeNorm = normalizar(nome);
  const logNorm = normalizar(args.logradouro);
  const numNorm = normalizar(args.numero);
  const cepNorm = somenteDigitos(args.cep);
  const ignorar = args.ignorarId ?? null;

  const { data: matchesPorNome, error: nomeError } = await supabase
    .from('condominios')
    .select(COLUNAS_LITE)
    .eq('tenant_id', args.tenantId)
    .ilike('nome', termoIlike(nome))
    .limit(30);

  if (nomeError) {
    console.error('[condominioService] erro ao verificar duplicidade por nome:', nomeError.message);
    return [];
  }

  let matchesPorEndereco: CondominioMatch[] = [];
  if (logNorm && numNorm) {
    const { data: enderecoData, error: enderecoError } = await supabase
      .from('condominios')
      .select(COLUNAS_LITE)
      .eq('tenant_id', args.tenantId)
      .ilike('logradouro', termoIlike(args.logradouro || ''))
      .eq('numero', args.numero?.trim() || '')
      .limit(30);

    if (enderecoError) {
      console.error('[condominioService] erro ao verificar duplicidade por endereço:', enderecoError.message);
    } else {
      matchesPorEndereco = (enderecoData ?? []) as CondominioMatch[];
    }
  }

  const matches: CondominioDuplicadoMatch[] = [];
  const visto = new Set<string>();
  const candidatos = [...((matchesPorNome ?? []) as CondominioMatch[]), ...matchesPorEndereco];

  for (const row of candidatos) {
    if (ignorar && row.id === ignorar) continue;
    if (visto.has(row.id)) continue;

    const mesmoNome = normalizar(row.nome) === nomeNorm;

    const enderecoComparavel = !!logNorm && !!numNorm;
    const mesmoEndereco =
      enderecoComparavel &&
      normalizar(row.logradouro) === logNorm &&
      normalizar(row.numero) === numNorm &&
      (cepNorm === '' || cepNorm === somenteDigitos(row.cep));

    if (mesmoNome) {
      matches.push({ ...(row as CondominioMatch), motivo: 'mesmo_nome' });
      visto.add(row.id);
    } else if (mesmoEndereco) {
      matches.push({ ...(row as CondominioMatch), motivo: 'mesmo_endereco' });
      visto.add(row.id);
    }
  }

  return matches;
}
