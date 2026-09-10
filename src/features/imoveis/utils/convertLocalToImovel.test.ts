import { describe, it, expect } from 'vitest';
import { convertLocalToImovel, type ImovelLocalConvertivel } from './convertLocalToImovel';

const base: ImovelLocalConvertivel = {
  codigo_imovel: 'AP001',
  titulo: null,
  tipo: 'Apartamento',
  tipo_simplificado: 'apartamento',
  finalidade: 'venda',
  bairro: 'Centro',
  cidade: 'Santos',
  estado: 'SP',
  valor_venda: 500000,
  valor_locacao: 0,
  valor_iptu: 0,
  valor_condominio: 0,
  area_total: 80,
  area_util: 70,
  quartos: 2,
  suites: 1,
  vagas: 1,
  banheiros: 2,
  descricao: null,
  fotos: [],
};

describe('convertLocalToImovel', () => {
  // A divergência entre as duas cópias antigas era exatamente esta linha.
  it('propaga o captador_id', () => {
    expect(convertLocalToImovel({ ...base, captador_id: 'user-1' }).captador_id).toBe('user-1');
  });

  it('sem captador_id, devolve null (não undefined) para o merge do catálogo', () => {
    expect(convertLocalToImovel(base).captador_id).toBeNull();
  });

  it('achata as fotos (formato novo e legado) em URLs, preservando a ordem', () => {
    const fotos = convertLocalToImovel({
      ...base,
      fotos: ['https://cdn/a.jpg', { url: 'https://cdn/b.jpg', isCapa: true }],
    }).fotos;
    // normalizeFotos não reordena — quem põe a capa em primeiro é o feed ZAP.
    expect(fotos).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
  });

  it('monta o título a partir de tipo + bairro quando não há título', () => {
    expect(convertLocalToImovel(base).titulo).toBe('Apartamento - Centro');
  });

  // Colunas numeric do Postgres chegam como string pelo PostgREST — foi assim
  // que o CA054 (cadastro local) veio do banco.
  it('converte para número os valores que o PostgREST devolve como string', () => {
    const imovel = convertLocalToImovel({
      ...base,
      valor_venda: '790000',
      valor_iptu: '1500',
      area_total: '250',
      area_util: '250',
    });

    expect(imovel.valor_venda).toBe(790000);
    expect(imovel.valor_iptu).toBe(1500);
    expect(imovel.area_total).toBe(250);
    expect(imovel.valor_venda.toLocaleString('pt-BR')).toBe('790.000');
  });

  it('aproveita as salas do cadastro local em vez de fixar zero', () => {
    expect(convertLocalToImovel({ ...base, salas: 2 }).salas).toBe(2);
    expect(convertLocalToImovel(base).salas).toBe(0);
  });

  it('valor ausente ou ilegível vira 0, não NaN', () => {
    const imovel = convertLocalToImovel({ ...base, valor_locacao: null, valor_condominio: 'abc' });

    expect(imovel.valor_locacao).toBe(0);
    expect(imovel.valor_condominio).toBe(0);
  });
});
