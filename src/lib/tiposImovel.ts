/**
 * Vocabulário de tipos de imóvel — fonte única.
 *
 * Morava dentro de `CriarImovelForm.tsx` como const local. Saiu de lá porque a
 * preferência do lead (badges em Meus Leads) precisa falar a MESMA língua do
 * cadastro de imóvel: se um lado diz "Sala Comercial" e o outro "Sala
 * comercial", qualquer casamento lead↔imóvel no futuro nasce quebrado.
 */

export const TIPOS_RESIDENCIAL = [
  'Apartamento', 'Apartamento Duplex', 'Apartamento Garden', 'Apartamento Triplex',
  'Casa', 'Sobrado', 'Cobertura', 'Flat', 'Kitnet', 'Loft', 'Penthouse',
  'Studio', 'Village', 'Terreno', 'Chácara', 'Sítio'
];

export const TIPOS_COMERCIAL = [
  'Sala Comercial', 'Loja', 'Galpão', 'Prédio Comercial', 'Ponto Comercial',
  'Box/Garagem', 'Terreno Comercial'
];

export const TIPOS_INDUSTRIAL = [
  'Galpão Industrial', 'Área Industrial', 'Terreno Industrial'
];

export const TIPOS_RURAL = [
  'Chácara', 'Sítio', 'Fazenda', 'Rancho', 'Área Rural'
];

export const TIPOS_TEMPORADA = [
  'Casa de Praia', 'Casa de Campo', 'Apartamento Temporada', 'Flat Temporada',
  'Chalé', 'Pousada'
];

export const TIPOS_CORPORATIVA = [
  'Escritório', 'Sala Corporativa', 'Andar Corporativo', 'Prédio Corporativo',
  'Coworking'
];

/**
 * Todos os tipos, sem repetição (Chácara e Sítio aparecem em residencial E
 * rural). Alimenta o `<datalist>` do editor de preferências.
 */
export const TODOS_TIPOS_IMOVEL: string[] = [...new Set([
  ...TIPOS_RESIDENCIAL,
  ...TIPOS_COMERCIAL,
  ...TIPOS_INDUSTRIAL,
  ...TIPOS_RURAL,
  ...TIPOS_TEMPORADA,
  ...TIPOS_CORPORATIVA,
])];

/**
 * Os que o corretor marca com um clique, sem digitar. Subconjunto curto de
 * propósito: a lista inteira (46 termos) em botões vira parede no modal, e o
 * campo de texto continua aceitando qualquer coisa fora daqui.
 *
 * ponytail: lista fixa. Se um tenant reclamar que os dele são outros, o
 * upgrade é ler os termos mais usados do próprio tenant.
 */
export const PREFERENCIAS_PADRAO = [
  'Apartamento', 'Casa', 'Sobrado', 'Cobertura', 'Terreno',
  'Sala Comercial', 'Loja', 'Galpão', 'Chácara',
];
