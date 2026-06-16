/** Fábrica de imóveis para testes — defaults sensatos sobrescritos por `overrides`. */

import type { Imovel } from '@/features/imoveis/services/kenloService';

export const makeImovel = (overrides: Partial<Imovel> = {}): Imovel => ({
  referencia: 'REF000',
  titulo: 'Imóvel de teste',
  tipo: 'Apartamento',
  tipoSimplificado: 'apartamento',
  bairro: 'Centro',
  cidade: 'São Paulo',
  estado: 'SP',
  valor_venda: 500000,
  valor_locacao: 0,
  finalidade: 'venda',
  valor_iptu: 0,
  valor_condominio: 0,
  area_total: 100,
  area_util: 90,
  quartos: 3,
  suites: 1,
  garagem: 1,
  banheiro: 2,
  salas: 1,
  descricao: '',
  fotos: ['https://example.com/foto.jpg'],
  videos: [],
  area_comum: [],
  area_privativa: [],
  ...overrides,
});
