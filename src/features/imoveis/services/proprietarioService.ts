/**
 * Serviço para busca e deduplicação de proprietários cadastrados em imoveis_locais.
 *
 * Como não há tabela própria de proprietários, agregamos por (nome, telefone, email)
 * a partir dos imóveis já cadastrados.
 */

import { supabase } from '@/lib/supabaseClient';

export interface ProprietarioImovelLite {
  codigo_imovel: string;
  titulo: string | null;
  tipo: string | null;
  bairro: string | null;
  cidade: string | null;
  logradouro: string | null;
  numero: string | null;
  cep: string | null;
  area_total: number | null;
  area_util: number | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
}

export interface ProprietarioMatch {
  nome: string;
  telefone: string | null;
  email: string | null;
  total_imoveis: number;
  imoveis: ProprietarioImovelLite[];
}

export interface ImovelDuplicadoMatch {
  codigo_imovel: string;
  titulo: string | null;
  tipo: string | null;
  bairro: string | null;
  cidade: string | null;
  logradouro: string | null;
  numero: string | null;
  motivo: 'mesmo_endereco' | 'caracteristicas_iguais';
}

const normalizar = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();
const somenteDigitos = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');

const chaveProprietario = (nome: string, telefone: string | null, email: string | null): string => {
  return [normalizar(nome), somenteDigitos(telefone), normalizar(email)].join('|');
};

/**
 * Busca proprietários cujo nome contenha o termo (ILIKE).
 * Agrupa por (nome+telefone+email) e anexa todos os imóveis encontrados.
 */
export async function buscarProprietariosPorNome(
  tenantId: string,
  termo: string,
  limit = 8,
): Promise<ProprietarioMatch[]> {
  const termoLimpo = termo.trim();
  if (!tenantId || termoLimpo.length < 2) return [];

  const { data, error } = await supabase
    .from('imoveis_locais')
    .select(
      'codigo_imovel, titulo, tipo, bairro, cidade, logradouro, numero, cep, area_total, area_util, quartos, banheiros, vagas, proprietario_nome, proprietario_telefone, proprietario_email',
    )
    .eq('tenant_id', tenantId)
    .not('proprietario_nome', 'is', null)
    .ilike('proprietario_nome', `%${termoLimpo}%`)
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) {
    console.error('[proprietarioService] erro ao buscar:', error.message);
    return [];
  }

  const grupos = new Map<string, ProprietarioMatch>();

  for (const row of data ?? []) {
    const nome = (row.proprietario_nome ?? '').trim();
    if (!nome) continue;

    const chave = chaveProprietario(nome, row.proprietario_telefone, row.proprietario_email);
    const imovel: ProprietarioImovelLite = {
      codigo_imovel: row.codigo_imovel,
      titulo: row.titulo,
      tipo: row.tipo,
      bairro: row.bairro,
      cidade: row.cidade,
      logradouro: row.logradouro,
      numero: row.numero,
      cep: row.cep,
      area_total: row.area_total,
      area_util: row.area_util,
      quartos: row.quartos,
      banheiros: row.banheiros,
      vagas: row.vagas,
    };

    const existente = grupos.get(chave);
    if (existente) {
      existente.total_imoveis += 1;
      existente.imoveis.push(imovel);
    } else {
      grupos.set(chave, {
        nome,
        telefone: row.proprietario_telefone ?? null,
        email: row.proprietario_email ?? null,
        total_imoveis: 1,
        imoveis: [imovel],
      });
    }
  }

  return Array.from(grupos.values())
    .sort((a, b) => b.total_imoveis - a.total_imoveis)
    .slice(0, limit);
}

export interface VerificarDuplicidadeArgs {
  tenantId: string;
  proprietarioNome: string;
  proprietarioTelefone?: string | null;
  proprietarioEmail?: string | null;
  tipo?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  cep?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  areaTotal?: number | null;
  quartos?: number | null;
  banheiros?: number | null;
  /** Código do imóvel atual (em edição) — não conta como duplicata de si mesmo */
  ignorarCodigo?: string | null;
}

const TOLERANCIA_AREA = 0.05;

/**
 * Verifica se já existe um imóvel com mesmo proprietário e
 * (mesmo endereço) OU (mesmas características principais).
 */
export async function verificarImovelDuplicado(
  args: VerificarDuplicidadeArgs,
): Promise<ImovelDuplicadoMatch[]> {
  const nome = (args.proprietarioNome ?? '').trim();
  if (!args.tenantId || nome.length < 2) return [];

  const { data, error } = await supabase
    .from('imoveis_locais')
    .select(
      'codigo_imovel, titulo, tipo, bairro, cidade, logradouro, numero, cep, area_total, quartos, banheiros, proprietario_nome, proprietario_telefone, proprietario_email',
    )
    .eq('tenant_id', args.tenantId)
    .ilike('proprietario_nome', nome);

  if (error) {
    console.error('[proprietarioService] erro ao verificar duplicidade:', error.message);
    return [];
  }

  const telefoneAtual = somenteDigitos(args.proprietarioTelefone);
  const emailAtual = normalizar(args.proprietarioEmail);
  const ignorar = normalizar(args.ignorarCodigo);

  const matches: ImovelDuplicadoMatch[] = [];

  for (const row of data ?? []) {
    if (ignorar && normalizar(row.codigo_imovel) === ignorar) continue;

    const mesmoNome = normalizar(row.proprietario_nome) === normalizar(nome);
    if (!mesmoNome) continue;

    // Reforço fraco: se ambos tiverem telefone/email e forem diferentes, ainda
    // tratamos como mesmo proprietário (nome bate). Não filtramos aqui.

    // Critério 1: mesmo endereço (logradouro + número + cep)
    const enderecoIgual =
      !!args.logradouro &&
      !!args.numero &&
      normalizar(row.logradouro) === normalizar(args.logradouro) &&
      normalizar(row.numero) === normalizar(args.numero) &&
      (somenteDigitos(args.cep) === '' || somenteDigitos(args.cep) === somenteDigitos(row.cep));

    if (enderecoIgual) {
      matches.push({
        codigo_imovel: row.codigo_imovel,
        titulo: row.titulo,
        tipo: row.tipo,
        bairro: row.bairro,
        cidade: row.cidade,
        logradouro: row.logradouro,
        numero: row.numero,
        motivo: 'mesmo_endereco',
      });
      continue;
    }

    // Critério 2: características essenciais quase idênticas
    const tipoIgual = !!args.tipo && normalizar(row.tipo) === normalizar(args.tipo);
    const bairroIgual = !!args.bairro && normalizar(row.bairro) === normalizar(args.bairro);
    const cidadeIgual = !!args.cidade && normalizar(row.cidade) === normalizar(args.cidade);

    const areaArgs = args.areaTotal ?? 0;
    const areaRow = Number(row.area_total ?? 0);
    const areaProxima =
      areaArgs > 0 &&
      areaRow > 0 &&
      Math.abs(areaArgs - areaRow) / Math.max(areaArgs, areaRow) <= TOLERANCIA_AREA;

    const quartosIgual = (args.quartos ?? 0) > 0 && Number(row.quartos ?? 0) === args.quartos;
    const banheirosIgual =
      (args.banheiros ?? 0) > 0 && Number(row.banheiros ?? 0) === args.banheiros;

    if (tipoIgual && bairroIgual && cidadeIgual && areaProxima && quartosIgual && banheirosIgual) {
      matches.push({
        codigo_imovel: row.codigo_imovel,
        titulo: row.titulo,
        tipo: row.tipo,
        bairro: row.bairro,
        cidade: row.cidade,
        logradouro: row.logradouro,
        numero: row.numero,
        motivo: 'caracteristicas_iguais',
      });
    }

    // telefoneAtual/emailAtual reservados para futura ponderação por contato
    void telefoneAtual;
    void emailAtual;
  }

  return matches;
}
