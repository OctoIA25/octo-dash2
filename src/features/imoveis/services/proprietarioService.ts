/**
 * Serviço para busca e deduplicação de proprietários cadastrados em imoveis_locais.
 *
 * Como não há tabela própria de proprietários, agregamos por (nome, telefone, email)
 * a partir dos imóveis já cadastrados.
 *
 * O navegador não lê `proprietario_*` direto da tabela (sem SELECT para
 * authenticated desde 20260915): os dados vêm das RPCs, que devolvem só os
 * imóveis cujo proprietário o usuário pode ver — captador, gestor de terceiros
 * responsável, administração. As colunas do imóvel continuam vindo do select normal.
 */

import { supabase } from '@/lib/supabaseClient';
import { STATUS_RASCUNHO } from '@/features/imoveis/utils/rascunho';

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

/** Linha da RPC `imoveis_proprietarios`. */
export interface ProprietarioDoImovel {
  codigo_imovel: string;
  proprietario_nome: string | null;
  proprietario_telefone: string | null;
  proprietario_tel_residencial: string | null;
  proprietario_tel_comercial: string | null;
  proprietario_email: string | null;
}

/**
 * Proprietário de um imóvel, se o usuário logado pode vê-lo. `null` = sem
 * permissão (o banco não devolve a linha). Erro de rede propaga: quem chama
 * precisa distinguir "não pode" de "não carregou".
 */
export async function buscarProprietarioDoImovel(
  tenantId: string,
  codigoImovel: string,
): Promise<ProprietarioDoImovel | null> {
  const { data, error } = await supabase.rpc('imoveis_proprietarios', {
    p_tenant_id: tenantId,
    p_codigo: codigoImovel,
  });
  if (error) throw new Error(`Falha ao carregar o proprietário: ${error.message}`);
  return ((data as ProprietarioDoImovel[] | null) ?? [])[0] ?? null;
}

const COLUNAS_IMOVEL_LITE =
  'codigo_imovel, titulo, tipo, bairro, cidade, logradouro, numero, cep, area_total, area_util, quartos, banheiros, vagas';

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

  // Só proprietários de imóveis que o usuário pode ver: corretor acha os dele,
  // não a carteira do tenant inteiro.
  const { data: donos, error } = await supabase
    .rpc('imoveis_proprietarios', { p_tenant_id: tenantId, p_busca: termoLimpo })
    .limit(80);

  if (error) {
    console.error('[proprietarioService] erro ao buscar:', error.message);
    return [];
  }

  const linhasDonos = (donos as ProprietarioDoImovel[] | null) ?? [];
  if (linhasDonos.length === 0) return [];

  const { data: imoveis, error: imoveisError } = await supabase
    .from('imoveis_locais')
    .select(COLUNAS_IMOVEL_LITE)
    .eq('tenant_id', tenantId)
    .in('codigo_imovel', [...new Set(linhasDonos.map((d) => d.codigo_imovel))]);

  if (imoveisError) {
    console.error('[proprietarioService] erro ao buscar imóveis dos proprietários:', imoveisError.message);
    return [];
  }

  const imovelPorCodigo = new Map(
    ((imoveis as unknown as ProprietarioImovelLite[] | null) ?? []).map((i) => [i.codigo_imovel, i]),
  );
  const grupos = new Map<string, ProprietarioMatch>();

  for (const dono of linhasDonos) {
    const nome = (dono.proprietario_nome ?? '').trim();
    const row = imovelPorCodigo.get(dono.codigo_imovel);
    if (!nome || !row) continue;

    const chave = chaveProprietario(nome, dono.proprietario_telefone, dono.proprietario_email);
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
        telefone: dono.proprietario_telefone ?? null,
        email: dono.proprietario_email ?? null,
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

/**
 * Verifica se já existe um imóvel com mesmo proprietário e
 * (mesmo endereço) OU (mesmas características principais).
 *
 * A comparação roda no banco (RPC `imoveis_duplicados_proprietario`) porque
 * precisa olhar todos os imóveis do tenant, inclusive os que o usuário não pode
 * ver o proprietário — e a resposta não traz dado pessoal: só acusa o imóvel
 * quando nome E endereço/características batem.
 */
export async function verificarImovelDuplicado(
  args: VerificarDuplicidadeArgs,
): Promise<ImovelDuplicadoMatch[]> {
  const nome = (args.proprietarioNome ?? '').trim();
  if (!args.tenantId || nome.length < 2) return [];

  const { data, error } = await supabase.rpc('imoveis_duplicados_proprietario', {
    p_tenant_id: args.tenantId,
    p_proprietario_nome: nome,
    p_ignorar_codigo: args.ignorarCodigo || null,
    p_tipo: args.tipo || null,
    p_logradouro: args.logradouro || null,
    p_numero: args.numero || null,
    p_cep: args.cep || null,
    p_bairro: args.bairro || null,
    p_cidade: args.cidade || null,
    p_area_total: args.areaTotal || null,
    p_quartos: args.quartos || null,
    p_banheiros: args.banheiros || null,
  });

  if (error) {
    console.error('[proprietarioService] erro ao verificar duplicidade:', error.message);
    return [];
  }

  return (data as ImovelDuplicadoMatch[] | null) ?? [];
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

const COLUNAS_IMOVEL =
  'codigo_imovel, titulo, tipo, finalidade, bairro, cidade, logradouro, numero, cep, ' +
  'area_total, area_util, quartos, banheiros, vagas, valor_venda, valor_locacao, ' +
  'exclusivo, status_aprovacao, created_at';

const PAGINA = 1000;

type Pagina = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** ponytail: PostgREST corta em 1000 linhas sem erro (tabela e RPC), por isso o loop de páginas. */
const lerTodasAsPaginas = async <T,>(pagina: (de: number, ate: number) => Pagina): Promise<T[]> => {
  const linhas: T[] = [];
  for (let n = 0; ; n += 1) {
    const { data, error } = await pagina(n * PAGINA, n * PAGINA + PAGINA - 1);
    if (error) throw error;
    const lote = (data as T[] | null) ?? [];
    linhas.push(...lote);
    if (lote.length < PAGINA) return linhas;
  }
};

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
 * Lê os imóveis do tenant com proprietário e agrupa por pessoa. Fonte única: o
 * cadastro de imóveis (CriarImovelForm) — não há tabela própria de proprietários.
 * Rascunho fica de fora: a planilha é de imóveis cadastrados. Só entram os
 * proprietários que a RPC devolve para o usuário logado; a exportação
 * (proprietariosExport) sai desta mesma lista, então herda a autorização.
 */
export async function listarProprietarios(tenantId: string): Promise<ProprietarioRow[]> {
  if (!tenantId) return [];

  let imoveis: Record<string, unknown>[];
  let donos: ProprietarioDoImovel[];
  try {
    [imoveis, donos] = await Promise.all([
      lerTodasAsPaginas<Record<string, unknown>>((de, ate) =>
        supabase
          .from('imoveis_locais')
          .select(COLUNAS_IMOVEL)
          .eq('tenant_id', tenantId)
          .neq('status_aprovacao', STATUS_RASCUNHO)
          .order('created_at', { ascending: false })
          .range(de, ate),
      ),
      lerTodasAsPaginas<ProprietarioDoImovel>((de, ate) =>
        supabase.rpc('imoveis_proprietarios', { p_tenant_id: tenantId }).range(de, ate),
      ),
    ]);
  } catch (error) {
    console.error('[proprietarioService] erro ao listar:', (error as { message?: string })?.message);
    return [];
  }

  const imovelPorCodigo = new Map(imoveis.map((row) => [String(row.codigo_imovel ?? ''), row]));

  const grupos = new Map<string, ProprietarioRow>();

  // A RPC vem da mais recente para a mais antiga (created_at), como a tabela vinha.
  for (const dono of donos) {
    const nome = String(dono.proprietario_nome ?? '').trim();
    const row = imovelPorCodigo.get(dono.codigo_imovel);
    if (!nome || !row) continue;

    const telefone = dono.proprietario_telefone ?? null;
    const email = dono.proprietario_email ?? null;
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
        tel_residencial: dono.proprietario_tel_residencial ?? null,
        tel_comercial: dono.proprietario_tel_comercial ?? null,
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
    grupo.tel_residencial = grupo.tel_residencial ?? dono.proprietario_tel_residencial ?? null;
    grupo.tel_comercial = grupo.tel_comercial ?? dono.proprietario_tel_comercial ?? null;

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
