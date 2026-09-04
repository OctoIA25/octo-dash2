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

// ---------------------------------------------------------------------------
// Listagem (planilha de Clientes Proprietários)
// ---------------------------------------------------------------------------

export interface ProprietarioImovelRow extends ProprietarioImovelLite {
  finalidade: string | null;
  valor_venda: number | null;
  valor_locacao: number | null;
  exclusivo: boolean | null;
  status_aprovacao: string | null;
  created_at: string | null;
}

export interface ProprietarioRow {
  /** Chave estável de agrupamento (telefone > email > nome). */
  chave: string;
  nome: string;
  telefone: string | null;
  tel_residencial: string | null;
  tel_comercial: string | null;
  email: string | null;
  total_imoveis: number;
  imoveis_venda: number;
  imoveis_locacao: number;
  exclusivos: number;
  valor_venda_total: number;
  valor_locacao_total: number;
  bairros: string[];
  cidades: string[];
  ultimo_cadastro: string | null;
  imoveis: ProprietarioImovelRow[];
}

const COLUNAS_BASE =
  'codigo_imovel, titulo, tipo, finalidade, bairro, cidade, logradouro, numero, cep, ' +
  'area_total, area_util, quartos, banheiros, vagas, valor_venda, valor_locacao, ' +
  'exclusivo, status_aprovacao, created_at, ' +
  'proprietario_nome, proprietario_telefone, proprietario_email';

/** Colunas adicionadas em 20260904; ausentes até a migration ser aplicada. */
const COLUNAS_OPCIONAIS = 'proprietario_tel_residencial, proprietario_tel_comercial';

const PAGINA = 1000;

/**
 * Uma pessoa costuma aparecer em vários imóveis; o telefone é o identificador
 * mais confiável (o nome é digitado à mão e varia). Sem telefone nem email,
 * cai no nome normalizado.
 */
const chaveAgrupamento = (nome: string, telefone: string | null, email: string | null): string => {
  const tel = somenteDigitos(telefone);
  if (tel.length >= 8) return `tel:${tel}`;
  const mail = normalizar(email);
  if (mail) return `email:${mail}`;
  return `nome:${normalizar(nome)}`;
};

/**
 * Lê todos os imóveis do tenant que têm proprietário preenchido e agrupa por
 * pessoa. Fonte única: o cadastro de imóveis (CriarImovelForm) — não há tabela
 * própria de proprietários.
 *
 * ponytail: PostgREST corta em 1000 linhas sem erro, por isso o loop de páginas.
 */
export async function listarProprietarios(tenantId: string): Promise<ProprietarioRow[]> {
  if (!tenantId) return [];

  const linhas: Record<string, unknown>[] = [];
  // Se a migration dos telefones extras ainda não rodou, o PostgREST devolve
  // 42703 e derruba a consulta inteira — nesse caso repetimos sem elas.
  let colunas = `${COLUNAS_BASE}, ${COLUNAS_OPCIONAIS}`;

  for (let pagina = 0; ; pagina += 1) {
    const { data, error } = await supabase
      .from('imoveis_locais')
      .select(colunas)
      .eq('tenant_id', tenantId)
      .not('proprietario_nome', 'is', null)
      .order('created_at', { ascending: false })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);

    if (error) {
      if (error.code === '42703' && colunas !== COLUNAS_BASE) {
        console.warn('[proprietarioService] telefones extras ainda não existem no banco; seguindo sem eles.');
        colunas = COLUNAS_BASE;
        pagina -= 1;
        continue;
      }
      console.error('[proprietarioService] erro ao listar:', error.code, error.message, error.details);
      return [];
    }

    const lote = (data ?? []) as unknown as Record<string, unknown>[];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }

  const grupos = new Map<string, ProprietarioRow>();

  for (const row of linhas) {
    const nome = String(row.proprietario_nome ?? '').trim();
    if (!nome) continue;

    const telefone = (row.proprietario_telefone as string | null) ?? null;
    const email = (row.proprietario_email as string | null) ?? null;
    const chave = chaveAgrupamento(nome, telefone, email);

    const imovel: ProprietarioImovelRow = {
      codigo_imovel: String(row.codigo_imovel ?? ''),
      titulo: (row.titulo as string | null) ?? null,
      tipo: (row.tipo as string | null) ?? null,
      finalidade: (row.finalidade as string | null) ?? null,
      bairro: (row.bairro as string | null) ?? null,
      cidade: (row.cidade as string | null) ?? null,
      logradouro: (row.logradouro as string | null) ?? null,
      numero: (row.numero as string | null) ?? null,
      cep: (row.cep as string | null) ?? null,
      area_total: (row.area_total as number | null) ?? null,
      area_util: (row.area_util as number | null) ?? null,
      quartos: (row.quartos as number | null) ?? null,
      banheiros: (row.banheiros as number | null) ?? null,
      vagas: (row.vagas as number | null) ?? null,
      valor_venda: (row.valor_venda as number | null) ?? null,
      valor_locacao: (row.valor_locacao as number | null) ?? null,
      exclusivo: (row.exclusivo as boolean | null) ?? null,
      status_aprovacao: (row.status_aprovacao as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? null,
    };

    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        nome,
        telefone,
        tel_residencial: (row.proprietario_tel_residencial as string | null) ?? null,
        tel_comercial: (row.proprietario_tel_comercial as string | null) ?? null,
        email,
        total_imoveis: 0,
        imoveis_venda: 0,
        imoveis_locacao: 0,
        exclusivos: 0,
        valor_venda_total: 0,
        valor_locacao_total: 0,
        bairros: [],
        cidades: [],
        ultimo_cadastro: null,
        imoveis: [],
      };
      grupos.set(chave, grupo);
    }

    // Linhas vêm da mais recente para a mais antiga: o contato mais novo ganha,
    // e campos vazios no registro novo são completados por registros antigos.
    grupo.telefone = grupo.telefone ?? telefone;
    grupo.email = grupo.email ?? email;
    grupo.tel_residencial =
      grupo.tel_residencial ?? ((row.proprietario_tel_residencial as string | null) ?? null);
    grupo.tel_comercial =
      grupo.tel_comercial ?? ((row.proprietario_tel_comercial as string | null) ?? null);

    grupo.total_imoveis += 1;
    if ((imovel.valor_venda ?? 0) > 0) {
      grupo.imoveis_venda += 1;
      grupo.valor_venda_total += imovel.valor_venda ?? 0;
    }
    if ((imovel.valor_locacao ?? 0) > 0) {
      grupo.imoveis_locacao += 1;
      grupo.valor_locacao_total += imovel.valor_locacao ?? 0;
    }
    if (imovel.exclusivo) grupo.exclusivos += 1;
    if (imovel.bairro && !grupo.bairros.includes(imovel.bairro)) grupo.bairros.push(imovel.bairro);
    if (imovel.cidade && !grupo.cidades.includes(imovel.cidade)) grupo.cidades.push(imovel.cidade);
    if (imovel.created_at && (!grupo.ultimo_cadastro || imovel.created_at > grupo.ultimo_cadastro)) {
      grupo.ultimo_cadastro = imovel.created_at;
    }
    grupo.imoveis.push(imovel);
  }

  return Array.from(grupos.values()).sort((a, b) => b.total_imoveis - a.total_imoveis);
}
