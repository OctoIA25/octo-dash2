/**
 * Imóveis de amostra para o preview/teste em Configurações.
 *
 * O card de Configurações serve para o usuário ver "como o e-mail chega". Ele não
 * deve depender de a lista real de imóveis estar carregada (ela só é populada
 * após visitar a tela de Imóveis na sessão). Quando não houver imóveis reais,
 * usamos estes exemplos representativos como fallback.
 */

import type { Imovel } from '@/features/imoveis/services/kenloService';

const baseSample: Imovel = {
  referencia: 'EXEMPLO-1',
  titulo: 'Apartamento 3 quartos — exemplo',
  tipo: 'Apartamento',
  tipoSimplificado: 'apartamento',
  bairro: 'Jardim Europa',
  cidade: 'São Paulo',
  estado: 'SP',
  valor_venda: 750000,
  valor_locacao: 0,
  finalidade: 'venda',
  valor_iptu: 0,
  valor_condominio: 0,
  area_total: 110,
  area_util: 95,
  quartos: 3,
  suites: 1,
  garagem: 2,
  banheiro: 2,
  salas: 1,
  descricao: 'Imóvel de demonstração para visualização do e-mail.',
  fotos: ['https://placehold.co/320x240/2563eb/ffffff?text=Imovel+Exemplo'],
  videos: [],
  area_comum: [],
  area_privativa: [],
};

/** Retorna uma pequena lista de imóveis de amostra para o e-mail de demonstração. */
export const getSampleImoveis = (): Imovel[] => [
  baseSample,
  {
    ...baseSample,
    referencia: 'EXEMPLO-2',
    titulo: 'Casa térrea — exemplo',
    tipo: 'Casa',
    tipoSimplificado: 'casa',
    bairro: 'Alphaville',
    valor_venda: 1200000,
    area_util: 180,
    quartos: 4,
    suites: 2,
    fotos: ['https://placehold.co/320x240/7c3aed/ffffff?text=Casa+Exemplo'],
  },
];
