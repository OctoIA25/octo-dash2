/**
 * Traduz a linha de `imoveis_locais` no `initialData` que o CriarImovelForm
 * espera em modo edição — e as funções de moeda que fazem a volta.
 *
 * Por que isto existe numa casa só: o save do formulário manda o payload
 * INTEIRO (`.upsert()` em CriarImovelForm), então TODO campo que a edição não
 * recarregar volta com o default e APAGA o valor salvo. Enquanto isto era uma
 * whitelist copiada em ImoveisPage e MeusImoveisTab, cada campo novo nascia com
 * esse bug: aconteceu com CEP, com proprietário e, em 09/2026, com
 * complemento, condomínio, metragem e exclusividade (auditoria em
 * `imoveis_locais_log`).
 *
 * Regra: o que esta função escreve tem que ser exatamente o que o campo do
 * formulário sabe LER. Valor monetário é máscara pt-BR ("768,68"), nunca o
 * número cru ("768.68") — `parseCurrency` trata o "." como separador de milhar
 * e multiplicaria o valor por 100 a cada salvamento.
 */

import { normalizeFotos, type FotoInput } from '@/components/imoveis/fotos-helpers';
import {
  TIPOS_RESIDENCIAL,
  TIPOS_COMERCIAL,
  TIPOS_INDUSTRIAL,
  TIPOS_RURAL,
  TIPOS_TEMPORADA,
  TIPOS_CORPORATIVA,
} from '@/lib/tiposImovel';

/** Máscara do input: recebe o que foi digitado e devolve "1.234,56". */
export const formatCurrency = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  if (!numbers) return '';
  const amount = parseInt(numbers) / 100;
  return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
};

/** Volta da máscara pt-BR para número. "1.234,56" → 1234.56 */
export const parseCurrency = (value: string): number => {
  if (!value) return 0;
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
};

/** Número do banco para a máscara pt-BR. 768.68 → "768,68" */
export const formatCurrencyFromNumber = (value?: number | null): string =>
  value ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

/**
 * Categoria do tipo — o que o campo `finalidade` do formulário significa (ele
 * monta a lista de tipos). Não confundir com a coluna `finalidade` do banco,
 * que guarda venda/locacao/venda_locacao (derivada dos valores no save): jogar
 * "venda" no campo deixava a lista de tipos vazia na edição.
 */
export type CategoriaTipo = 'residencial' | 'comercial' | 'industrial' | 'rural' | 'temporada' | 'corporativa' | '';

const CATEGORIAS: Array<[Exclude<CategoriaTipo, ''>, string[]]> = [
  ['residencial', TIPOS_RESIDENCIAL],
  ['comercial', TIPOS_COMERCIAL],
  ['industrial', TIPOS_INDUSTRIAL],
  ['rural', TIPOS_RURAL],
  ['temporada', TIPOS_TEMPORADA],
  ['corporativa', TIPOS_CORPORATIVA],
];

export function categoriaDoTipo(tipo?: string | null): CategoriaTipo {
  const alvo = String(tipo || '').trim().toLowerCase();
  if (!alvo) return '';
  // Chácara e Sítio estão em residencial E rural; a ordem acima decide.
  const achado = CATEGORIAS.find(([, tipos]) => tipos.some((t) => t.toLowerCase() === alvo));
  return achado ? achado[0] : '';
}

/**
 * Campos do formulário que o `.upsert()` de CriarImovelForm persiste. Todo
 * campo daqui PRECISA sair de `buildEditDataFromLocal`, senão a edição o apaga
 * — é o que o teste desta pasta garante. Ao acrescentar coluna ao payload,
 * acrescente aqui e carregue no builder.
 */
export const CAMPOS_PERSISTIDOS = [
  'codigo_imovel', 'exclusivo', 'titulo', 'tipo', 'logradouro', 'numero', 'complemento',
  'bairro', 'cidade', 'estado', 'cep', 'condominio_id', 'area_total', 'area_util',
  'metragem_m2', 'quartos', 'suites', 'banheiros', 'vagas', 'salas', 'valor_venda',
  'valor_locacao', 'valor_condominio', 'valor_iptu', 'descricao', 'anunciar', 'destaque',
  'super_destaque', 'fotos', 'sem_marca_dagua', 'caracteristicas', 'aceita_troca',
  'link_video', 'tour_virtual', 'proprietario_nome', 'proprietario_celular',
  'proprietario_tel_residencial', 'proprietario_tel_comercial', 'proprietario_email',
  'obs_interna', 'chave_status', 'chave_local', 'chave_com', 'captador_id',
  'captador_2_id', 'status_aprovacao',
  // Coletados pelo formulário desde sempre, persistidos só a partir de
  // 20260909_imovel_campos_do_formulario.sql.
  'midia_origem', 'envio_atividades', 'pais', 'area_terreno', 'placa_local',
  'tipo_comissao', 'captou_pretensao', 'condicao_comercial', 'codigo_iptu',
  'numero_matricula', 'codigo_eletricidade', 'codigo_agua', 'titulos_direitos',
  'aprovado_ambiental', 'projeto_aprovado', 'obs_documentacao',
] as const;

/** A linha de `imoveis_locais` (select *). Tudo opcional: o builder lê o que existir. */
export interface ImovelLocalRow {
  codigo_imovel: string;
  tipo?: string | null;
  finalidade?: string | null;
  exclusivo?: boolean | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  condominio_id?: string | null;
  area_total?: number | null;
  area_util?: number | null;
  metragem_m2?: number | null;
  quartos?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  salas?: number | null;
  valor_venda?: number | null;
  valor_locacao?: number | null;
  valor_condominio?: number | null;
  valor_iptu?: number | null;
  titulo?: string | null;
  descricao?: string | null;
  publicar_site?: boolean | null;
  destaque?: boolean | null;
  super_destaque?: boolean | null;
  fotos?: FotoInput[] | null;
  sem_marca_dagua?: boolean | null;
  area_privativa?: string[] | null;
  area_comum?: string[] | null;
  aceita_troca?: boolean | null;
  link_video?: string | null;
  tour_virtual?: string | null;
  status_aprovacao?: 'aprovado' | 'nao_aprovado' | 'aguardando';
  captador_id?: string | null;
  captador_2_id?: string | null;
  obs_interna?: string | null;
  proprietario_nome?: string | null;
  proprietario_telefone?: string | null;
  proprietario_tel_residencial?: string | null;
  proprietario_tel_comercial?: string | null;
  proprietario_email?: string | null;
  chave_status?: string | null;
  chave_local?: string | null;
  chave_com?: string | null;
  chave_retirada_em?: string | null;
  midia_origem?: string | null;
  envio_atividades?: string | null;
  pais?: string | null;
  area_terreno?: number | null;
  placa_local?: boolean | null;
  tipo_comissao?: string | null;
  captou_pretensao?: string | null;
  condicao_comercial?: string | null;
  codigo_iptu?: string | null;
  numero_matricula?: string | null;
  codigo_eletricidade?: string | null;
  codigo_agua?: string | null;
  titulos_direitos?: string | null;
  aprovado_ambiental?: string | null;
  projeto_aprovado?: string | null;
  obs_documentacao?: string | null;
}

export const buildEditDataFromLocal = (local: ImovelLocalRow) => {
  return {
    codigo_imovel: local.codigo_imovel,
    tipo: local.tipo || '',
    // Categoria do tipo, não a coluna `finalidade` do banco. Ver categoriaDoTipo.
    finalidade: categoriaDoTipo(local.tipo),
    exclusivo: (local.exclusivo ? 'sim' : 'nao') as 'sim' | 'nao',
    bairro: local.bairro || '',
    cidade: local.cidade || '',
    estado: local.estado || 'SP',
    // Sem isto o upsert de edição gravaria cep: null e apagaria o CEP existente
    cep: local.cep || '',
    logradouro: local.logradouro || '',
    numero: local.numero || '',
    complemento: local.complemento || '',
    // O select de condomínio é por nome; o id é a fonte de verdade e o
    // formulário resolve o nome quando a lista de condomínios chega.
    condominio_id: local.condominio_id || '',
    area_total: local.area_total ? String(local.area_total) : '',
    area_util: local.area_util ? String(local.area_util) : '',
    metragem_m2: local.metragem_m2 ? String(local.metragem_m2) : '',
    quartos: local.quartos ? String(local.quartos) : '',
    suites: local.suites ? String(local.suites) : '',
    banheiros: local.banheiros ? String(local.banheiros) : '',
    vagas: local.vagas ? String(local.vagas) : '',
    salas: local.salas ? String(local.salas) : '',
    valor_venda: formatCurrencyFromNumber(local.valor_venda),
    valor_locacao: formatCurrencyFromNumber(local.valor_locacao),
    valor_condominio: formatCurrencyFromNumber(local.valor_condominio),
    valor_iptu: formatCurrencyFromNumber(local.valor_iptu),
    titulo: local.titulo || '',
    descricao: local.descricao || '',
    // Linhas antigas (anteriores à coluna) vêm com publicar_site true por default.
    anunciar: (local.publicar_site ? 'sim' : 'nao') as 'sim' | 'nao',
    destaque: (local.destaque ? 'sim' : 'nao') as 'sim' | 'nao',
    super_destaque: (local.super_destaque ? 'sim' : 'nao') as 'sim' | 'nao',
    fotos: normalizeFotos(local.fotos),
    sem_marca_dagua: local.sem_marca_dagua === true,
    caracteristicas: [
      ...(Array.isArray(local.area_privativa) ? local.area_privativa : []),
      ...(Array.isArray(local.area_comum) ? local.area_comum : []),
    ],
    aceita_troca: local.aceita_troca ? 'sim' : 'nao',
    link_video: local.link_video || '',
    tour_virtual: local.tour_virtual || '',
    status_aprovacao: local.status_aprovacao,
    captador_id: local.captador_id || '',
    captador_2_id: local.captador_2_id || '',
    obs_interna: local.obs_interna || '',
    // Sem isto o upsert de edição gravaria proprietario_* = null e apagaria o
    // dono do imóvel a cada salvamento (mesmo caso do CEP acima).
    proprietario_nome: local.proprietario_nome || '',
    proprietario_celular: local.proprietario_telefone || '',
    proprietario_tel_residencial: local.proprietario_tel_residencial || '',
    proprietario_tel_comercial: local.proprietario_tel_comercial || '',
    proprietario_email: local.proprietario_email || '',
    chave_status: local.chave_status || '',
    chave_local: local.chave_local || '',
    chave_com: local.chave_com || '',
    chave_retirada_em: local.chave_retirada_em || '',
    midia_origem: local.midia_origem || '',
    // Os dois defaults abaixo são de exibição do formulário; no banco a coluna
    // fica NULL enquanto ninguém escolher.
    envio_atividades: local.envio_atividades || 'nao_enviar',
    pais: local.pais || 'Brasil',
    area_terreno: local.area_terreno ? String(local.area_terreno) : '',
    placa_local: (local.placa_local ? 'sim' : 'nao') as 'sim' | 'nao',
    tipo_comissao: local.tipo_comissao || '',
    captou_pretensao: (local.captou_pretensao || '') as 'venda_locacao' | 'somente_venda' | 'somente_locacao' | '',
    condicao_comercial: local.condicao_comercial || '',
    codigo_iptu: local.codigo_iptu || '',
    numero_matricula: local.numero_matricula || '',
    codigo_eletricidade: local.codigo_eletricidade || '',
    codigo_agua: local.codigo_agua || '',
    titulos_direitos: local.titulos_direitos || '',
    aprovado_ambiental: local.aprovado_ambiental || '',
    projeto_aprovado: local.projeto_aprovado || '',
    obs_documentacao: local.obs_documentacao || '',
  };
};
