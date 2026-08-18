/**
 * Completômetro de imóveis — cálculo puro (sem React, sem I/O, sem rede).
 *
 * Todas as regras de completude vivem AQUI. O formulário só renderiza o
 * resultado, então não existe `score += ...` espalhado por componente.
 *
 * Modelo: cada categoria declara uma lista de *checks* com peso. O avaliador
 * genérico transforma peso cumprido / peso aplicável em percentual e pontos.
 * Um check com `applies: false` sai do denominador — é assim que um campo
 * que não faz sentido para aquele imóvel (condomínio de uma casa, quartos de
 * um terreno) deixa de impedir os 100%.
 */

import { validarCep } from '@/services/viaCepService';
import { getFotoUrl, type FotoInput } from '@/components/imoveis/fotos-helpers';
import { isHttpUrl, normalizeYouTubeUrl } from './mediaUrls';

/** Campos numéricos chegam do formulário como string ("1.200.000,00") e do banco como number. */
type NumericField = string | number | null | undefined;

/** Seções colapsáveis do CriarImovelForm para onde o clique no card leva. */
export type CompletenessSection =
  | 'proprietario'
  | 'estrutura'
  | 'localizacao'
  | 'valores'
  | 'publicacao'
  | 'midia'
  | 'caracteristicas';

/**
 * Peso da recomendação. `baixa` é melhoria opcional — a UI não a apresenta
 * como erro (ver PropertyTips).
 */
export type CompletenessPriority = 'alta' | 'media' | 'baixa';

/**
 * Subconjunto do estado do formulário usado no cálculo. `ImovelFormData`
 * (criação e edição) é estruturalmente compatível.
 */
export interface PropertyCompletenessInput {
  finalidade?: string;
  tipo?: string;
  titulo?: string;
  proprietario_nome?: string;
  proprietario_celular?: string;
  proprietario_tel_residencial?: string;
  proprietario_email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  condominio?: string;
  valor_venda?: NumericField;
  valor_locacao?: NumericField;
  valor_condominio?: NumericField;
  valor_iptu?: NumericField;
  descricao?: string;
  fotos?: FotoInput[] | null;
  area_total?: NumericField;
  area_util?: NumericField;
  quartos?: NumericField;
  banheiros?: NumericField;
  vagas?: NumericField;
  caracteristicas?: string[] | null;
  link_video?: string;
  tour_virtual?: string;
}

export interface CompletenessCheck {
  /** Identificador estável do critério — vira o id da dica. */
  id: string;
  /** Frase acionável exibida quando o item está faltando. */
  label: string;
  /** Por que preencher isso ajuda o anúncio. Vira o corpo da dica. */
  why: string;
  weight: number;
  done: boolean;
  /** `false` = não se aplica a este imóvel (não entra no denominador). */
  applies?: boolean;
  /** Sobrescreve a prioridade da categoria. */
  priority?: CompletenessPriority;
  /** Sobrescreve a seção da categoria (ex.: dados do proprietário). */
  section?: CompletenessSection;
}

/** Critério aplicável ainda não cumprido — insumo direto das dicas. */
export interface CompletenessMissingItem {
  id: string;
  label: string;
  why: string;
  priority: CompletenessPriority;
  section: CompletenessSection;
  /** Pontos da completude geral que este item ainda vale. */
  points: number;
}

export interface CompletenessCategoryResult {
  key: string;
  label: string;
  section: CompletenessSection;
  priority: CompletenessPriority;
  percentage: number;
  earnedPoints: number;
  maxPoints: number;
  isComplete: boolean;
  /** Em ordem de prioridade de preenchimento (o primeiro é o próximo passo). */
  missing: CompletenessMissingItem[];
  /** Próximo passo (primeiro item faltante) ou confirmação quando completo. */
  message: string;
}

export interface PropertyCompletenessResult {
  /** 0–100 sem arredondar. Arredonde só na apresentação. */
  percentage: number;
  earnedPoints: number;
  maxPoints: number;
  isComplete: boolean;
  categories: CompletenessCategoryResult[];
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Fotos: mínimo para o anúncio existir e escada até o recomendado pelos portais. */
export const FOTOS_THRESHOLDS = [1, 3, 5, 8] as const;
export const FOTOS_RECOMENDADO = FOTOS_THRESHOLDS[FOTOS_THRESHOLDS.length - 1];

/** Descrição: caracteres para "existe", "boa" e "detalhada". */
const DESCRICAO_MINIMA = 40;
const DESCRICAO_BOA = 120;
const DESCRICAO_DETALHADA = 300;

/** Comodidades marcadas a partir das quais a categoria conta como preenchida. */
const AMENIDADES_MINIMAS = 3;

/**
 * Tipos sem cômodos: quartos/banheiros/vagas não se aplicam. Strings iguais às
 * das listas TIPOS_* do CriarImovelForm.
 */
const TIPOS_SEM_COMODOS = new Set([
  'Terreno',
  'Terreno Comercial',
  'Terreno Industrial',
  'Área Industrial',
  'Área Rural',
  'Box/Garagem',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hasText = (value: string | null | undefined, min = 1): boolean =>
  (value ?? '').trim().length >= min;

/** "1.200.000,00" (máscara pt-BR) → "1200000.00". Input type=number já chega no formato do JS. */
const normalizarNumeroPtBr = (raw: string): string =>
  raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;

/** Aceita number, "150" (input number) e "1.200.000,00" (máscara pt-BR). Inválido/negativo → 0. */
const toNumber = (value: NumericField): number => {
  const raw = typeof value === 'number' ? String(value) : (value ?? '').trim();
  const parsed = Number.parseFloat(normalizarNumeroPtBr(raw));
  return parsed > 0 ? parsed : 0;
};

const isPositive = (value: NumericField): boolean => toNumber(value) > 0;

/** Conta apenas fotos com URL utilizável (descarta entradas quebradas/legadas). */
export const contarFotosValidas = (fotos: FotoInput[] | null | undefined): number =>
  (fotos ?? []).filter((foto) => !!getFotoUrl(foto)).length;

const temComodos = (property: PropertyCompletenessInput): boolean =>
  !TIPOS_SEM_COMODOS.has((property.tipo ?? '').trim());

// ---------------------------------------------------------------------------
// Checks por categoria — uma função pequena por categoria
// ---------------------------------------------------------------------------

const checkInformacoesBasicas = (p: PropertyCompletenessInput): CompletenessCheck[] => [
  {
    id: 'finalidade',
    label: 'Selecione a finalidade do imóvel',
    why: 'É por venda ou locação que o interessado filtra a busca.',
    weight: 2,
    done: hasText(p.finalidade),
  },
  {
    id: 'tipo',
    label: 'Selecione o tipo do imóvel',
    why: 'O tipo define o código do imóvel e como ele aparece nas buscas.',
    weight: 2,
    done: hasText(p.tipo),
  },
  {
    id: 'titulo',
    label: 'Escreva um título para o anúncio',
    why: 'O título é a primeira coisa que o interessado lê na lista de imóveis.',
    weight: 1,
    done: hasText(p.titulo),
    priority: 'media',
  },
  {
    id: 'proprietario-nome',
    label: 'Informe o nome do proprietário',
    why: 'Sem o nome fica difícil retomar a negociação depois.',
    weight: 1,
    done: hasText(p.proprietario_nome),
    section: 'proprietario',
  },
  {
    id: 'proprietario-contato',
    label: 'Adicione um contato do proprietário (telefone ou e-mail)',
    why: 'Com telefone ou e-mail você fala com o proprietário sem depender de terceiros.',
    weight: 1,
    done:
      hasText(p.proprietario_celular) ||
      hasText(p.proprietario_tel_residencial) ||
      hasText(p.proprietario_email),
    section: 'proprietario',
  },
];

const checkPreco = (p: PropertyCompletenessInput): CompletenessCheck[] => [
  {
    id: 'valor-principal',
    label: 'Informe o valor de venda ou de locação',
    why: 'Anúncio sem preço recebe muito menos contatos.',
    weight: 3,
    done: isPositive(p.valor_venda) || isPositive(p.valor_locacao),
  },
  {
    id: 'iptu',
    label: 'Informe o valor do IPTU',
    why: 'O interessado quer saber o custo total antes de visitar.',
    weight: 1,
    done: isPositive(p.valor_iptu),
    priority: 'media',
  },
  {
    id: 'condominio',
    label: 'Informe o valor do condomínio',
    why: 'O valor do condomínio pesa na decisão de quem procura apartamento.',
    weight: 1,
    done: isPositive(p.valor_condominio),
    priority: 'media',
    // Só cobra condomínio de imóvel vinculado a um condomínio cadastrado.
    applies: hasText(p.condominio),
  },
];

const checkEndereco = (p: PropertyCompletenessInput): CompletenessCheck[] => [
  {
    id: 'cep',
    label: 'Adicione o CEP (8 dígitos)',
    why: 'O CEP preenche o endereço sozinho e posiciona o imóvel no mapa.',
    weight: 2,
    done: validarCep(p.cep ?? ''),
  },
  {
    id: 'logradouro',
    label: 'Informe o logradouro',
    why: 'A rua ajuda o interessado a reconhecer a localização.',
    weight: 1,
    done: hasText(p.logradouro),
  },
  {
    id: 'numero',
    label: 'Informe o número do imóvel',
    why: 'Sem o número a visita fica difícil de agendar.',
    weight: 1,
    done: hasText(p.numero),
  },
  {
    id: 'bairro',
    label: 'Informe o bairro',
    why: 'A maioria das buscas começa pelo bairro.',
    weight: 1,
    done: hasText(p.bairro),
  },
  {
    id: 'cidade',
    label: 'Informe a cidade',
    why: 'A cidade é obrigatória para o imóvel aparecer nos portais.',
    weight: 1,
    done: hasText(p.cidade),
  },
  {
    id: 'estado',
    label: 'Informe o estado',
    why: 'O estado completa o endereço enviado aos portais.',
    weight: 1,
    done: hasText(p.estado),
  },
];

const checkDescricao = (p: PropertyCompletenessInput): CompletenessCheck[] => [
  {
    id: 'descricao-minima',
    label: `Escreva uma descrição com ao menos ${DESCRICAO_MINIMA} caracteres`,
    why: 'A descrição responde as dúvidas antes do primeiro contato.',
    weight: 2,
    done: hasText(p.descricao, DESCRICAO_MINIMA),
  },
  {
    id: 'descricao-boa',
    label: 'Complete a descrição com cômodos, acabamentos e região',
    why: 'Quanto mais detalhes, menos perguntas repetidas no WhatsApp.',
    weight: 1,
    done: hasText(p.descricao, DESCRICAO_BOA),
    priority: 'media',
  },
  {
    id: 'descricao-detalhada',
    label: 'Detalhe melhor o imóvel: diferenciais e entorno',
    why: 'Diferenciais e vizinhança ajudam o anúncio a se destacar.',
    weight: 1,
    done: hasText(p.descricao, DESCRICAO_DETALHADA),
    priority: 'baixa',
  },
];

const checkImagens = (p: PropertyCompletenessInput): CompletenessCheck[] => {
  const total = contarFotosValidas(p.fotos);
  return FOTOS_THRESHOLDS.map((minimo) => ({
    id: `fotos-${minimo}`,
    label:
      minimo - total === 1
        ? 'Adicione mais 1 foto'
        : `Adicione mais ${minimo - total} fotos (recomendamos ${FOTOS_RECOMENDADO})`,
    why:
      total === 0
        ? 'Anúncio sem foto praticamente não é aberto por quem procura imóvel.'
        : 'Mais fotos mostram todos os ambientes e reduzem visitas desnecessárias.',
    weight: 1,
    done: total >= minimo,
    // Nenhuma foto é falha grave; a partir daí vira melhoria do anúncio.
    priority: total === 0 ? 'alta' : 'media',
  }));
};

const checkCaracteristicas = (p: PropertyCompletenessInput): CompletenessCheck[] => {
  const comodos = temComodos(p);
  return [
    {
      id: 'area',
      label: 'Informe a área do imóvel (m²)',
      why: 'A área é um dos filtros mais usados na busca.',
      weight: 2,
      done: isPositive(p.area_total) || isPositive(p.area_util),
    },
    {
      id: 'quartos',
      label: 'Informe a quantidade de dormitórios',
      why: 'Quase toda busca por moradia filtra pelo número de dormitórios.',
      weight: 1,
      done: isPositive(p.quartos),
      applies: comodos,
    },
    {
      id: 'banheiros',
      label: 'Informe a quantidade de banheiros',
      why: 'Completa a ficha técnica do imóvel.',
      weight: 1,
      done: isPositive(p.banheiros),
      applies: comodos,
    },
    {
      id: 'vagas',
      label: 'Adicione a quantidade de vagas',
      why: 'Vaga de garagem é um dos primeiros itens perguntados.',
      weight: 1,
      done: isPositive(p.vagas),
      applies: comodos,
    },
    {
      id: 'amenidades',
      label: `Marque ao menos ${AMENIDADES_MINIMAS} comodidades do imóvel`,
      why: 'As comodidades mostram o que o imóvel tem além dos cômodos.',
      weight: 1,
      done: (p.caracteristicas ?? []).length >= AMENIDADES_MINIMAS,
      priority: 'baixa',
    },
  ];
};

const checkVideo = (p: PropertyCompletenessInput): CompletenessCheck[] => [
  {
    id: 'video',
    label: 'Adicione um vídeo do imóvel',
    why: 'O vídeo ajuda o interessado a conhecer o imóvel antes da visita.',
    weight: 1,
    done: !!normalizeYouTubeUrl(p.link_video ?? ''),
  },
];

const checkTourVirtual = (p: PropertyCompletenessInput): CompletenessCheck[] => [
  {
    id: 'tour',
    label: 'Adicione um tour virtual 360°',
    why: 'O tour 360° deixa o anúncio mais completo que o da concorrência.',
    weight: 1,
    done: isHttpUrl(p.tour_virtual ?? ''),
  },
];

// ---------------------------------------------------------------------------
// Definição das categorias — fonte única dos pesos (soma 100)
// ---------------------------------------------------------------------------

interface CompletenessCategoryDefinition {
  key: string;
  label: string;
  section: CompletenessSection;
  points: number;
  /** Prioridade padrão dos checks da categoria (cada check pode sobrescrever). */
  priority: CompletenessPriority;
  /** Mensagem exibida quando a categoria está 100%. */
  completeMessage: string;
  checks: (property: PropertyCompletenessInput) => CompletenessCheck[];
}

export const COMPLETENESS_CATEGORIES: readonly CompletenessCategoryDefinition[] = [
  {
    key: 'basicas',
    label: 'Informações básicas',
    section: 'estrutura',
    points: 20,
    priority: 'alta',
    completeMessage: 'Dados essenciais preenchidos',
    checks: checkInformacoesBasicas,
  },
  {
    key: 'preco',
    label: 'Preço',
    section: 'valores',
    points: 15,
    priority: 'alta',
    completeMessage: 'Todos os valores informados',
    checks: checkPreco,
  },
  {
    key: 'endereco',
    label: 'Endereço',
    section: 'localizacao',
    points: 15,
    priority: 'alta',
    completeMessage: 'Endereço completo',
    checks: checkEndereco,
  },
  {
    key: 'descricao',
    label: 'Descrição',
    section: 'publicacao',
    points: 15,
    priority: 'alta',
    completeMessage: 'Descrição detalhada',
    checks: checkDescricao,
  },
  {
    key: 'imagens',
    label: 'Imagens',
    section: 'midia',
    points: 15,
    priority: 'media',
    completeMessage: `${FOTOS_RECOMENDADO} fotos ou mais`,
    checks: checkImagens,
  },
  {
    key: 'caracteristicas',
    label: 'Características',
    section: 'caracteristicas',
    points: 10,
    priority: 'media',
    completeMessage: 'Características informadas',
    checks: checkCaracteristicas,
  },
  {
    key: 'video',
    label: 'Vídeo',
    section: 'midia',
    points: 5,
    priority: 'baixa',
    completeMessage: 'Vídeo publicado',
    checks: checkVideo,
  },
  {
    key: 'tour',
    label: 'Tour virtual',
    section: 'midia',
    points: 5,
    priority: 'baixa',
    completeMessage: 'Tour virtual publicado',
    checks: checkTourVirtual,
  },
];

// ---------------------------------------------------------------------------
// Avaliador genérico
// ---------------------------------------------------------------------------

const evaluateChecks = (
  checks: CompletenessCheck[],
  definition: CompletenessCategoryDefinition,
) => {
  const applicable = checks.filter((check) => check.applies !== false);
  const totalWeight = applicable.reduce((sum, check) => sum + check.weight, 0);
  const doneWeight = applicable.reduce((sum, check) => sum + (check.done ? check.weight : 0), 0);
  return {
    // Categoria sem nenhum item aplicável está satisfeita por definição.
    ratio: totalWeight === 0 ? 1 : doneWeight / totalWeight,
    // `totalWeight` só é 0 quando nada é aplicável — e aí não há item faltante.
    missing: applicable
      .filter((check) => !check.done)
      .map((check) => ({
        id: check.id,
        label: check.label,
        why: check.why,
        priority: check.priority ?? definition.priority,
        section: check.section ?? definition.section,
        points: (check.weight / totalWeight) * definition.points,
      })),
  };
};

const buildCategoryResult = (
  definition: CompletenessCategoryDefinition,
  property: PropertyCompletenessInput,
): CompletenessCategoryResult => {
  const { ratio, missing } = evaluateChecks(definition.checks(property), definition);
  return {
    key: definition.key,
    label: definition.label,
    section: definition.section,
    priority: definition.priority,
    percentage: ratio * 100,
    earnedPoints: ratio * definition.points,
    maxPoints: definition.points,
    isComplete: missing.length === 0,
    missing,
    message: missing[0]?.label ?? definition.completeMessage,
  };
};

/**
 * Percentual de completude do imóvel a partir dos dados já disponíveis no
 * formulário. Cálculo local: não faz request nem consulta o banco.
 */
export const calculatePropertyCompleteness = (
  property: PropertyCompletenessInput,
): PropertyCompletenessResult => {
  const categories = COMPLETENESS_CATEGORIES.map((definition) =>
    buildCategoryResult(definition, property),
  );
  const earnedPoints = categories.reduce((sum, category) => sum + category.earnedPoints, 0);
  const maxPoints = categories.reduce((sum, category) => sum + category.maxPoints, 0);
  return {
    percentage: maxPoints === 0 ? 0 : (earnedPoints / maxPoints) * 100,
    earnedPoints,
    maxPoints,
    isComplete: categories.every((category) => category.isComplete),
    categories,
  };
};
