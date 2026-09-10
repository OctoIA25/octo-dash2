import { describe, expect, it } from 'vitest';
import { mergeCatalogoImoveis } from './mergeCatalogoImoveis';
import type { Imovel } from '@/features/imoveis/services/kenloService';
import type { ImovelLocalConvertivel } from './convertLocalToImovel';

const doXml = (over: Partial<Imovel> = {}): Imovel =>
  ({
    referencia: 'AP0001',
    titulo: 'Apto do XML',
    tipo: 'Apartamento',
    tipoSimplificado: 'apartamento',
    bairro: 'Centro',
    cidade: 'Sorocaba',
    estado: 'SP',
    valor_venda: 500000,
    valor_locacao: 0,
    finalidade: 'venda',
    valor_iptu: 0,
    valor_condominio: 0,
    area_total: 0,
    area_util: 0,
    quartos: 2,
    suites: 0,
    garagem: 1,
    banheiro: 1,
    salas: 1,
    descricao: '',
    fotos: ['xml-1.jpg'],
    videos: [],
    area_comum: [],
    area_privativa: [],
    ...over,
  }) as Imovel;

const local = (over: Partial<ImovelLocalConvertivel> = {}): ImovelLocalConvertivel =>
  ({
    codigo_imovel: 'CA054',
    titulo: 'Casa cadastrada na mão',
    tipo: 'Casa',
    tipo_simplificado: 'casa',
    finalidade: 'venda',
    bairro: 'Jardim Europa',
    cidade: 'Sorocaba',
    estado: 'SP',
    valor_venda: 900000,
    valor_locacao: 0,
    valor_iptu: 0,
    valor_condominio: 0,
    area_total: 200,
    area_util: 150,
    quartos: 3,
    suites: 1,
    vagas: 2,
    banheiros: 2,
    descricao: '',
    fotos: [],
    captador_id: null,
    updated_at: null,
    ...over,
  }) as ImovelLocalConvertivel;

describe('mergeCatalogoImoveis', () => {
  it('inclui o imóvel que só existe no cadastro local — o caso do CA054', () => {
    const catalogo = mergeCatalogoImoveis([doXml()], [local()]);

    expect(catalogo.map((i) => i.referencia)).toEqual(['AP0001', 'CA054']);
    expect(catalogo[1].titulo).toBe('Casa cadastrada na mão');
    expect(catalogo[1].valor_venda).toBe(900000);
  });

  it('não duplica o imóvel presente nas duas fontes, mesmo com caixa e espaço diferentes', () => {
    const catalogo = mergeCatalogoImoveis(
      [doXml({ referencia: 'AP0001 ' })],
      [local({ codigo_imovel: 'ap0001' })],
    );

    expect(catalogo).toHaveLength(1);
    expect(catalogo[0].titulo).toBe('Apto do XML');
  });

  it('sobrepõe fotos, captador e updated_at do cadastro local ao registro do XML', () => {
    const [imovel] = mergeCatalogoImoveis(
      [doXml()],
      [
        local({
          codigo_imovel: 'AP0001',
          fotos: ['local-1.jpg'],
          captador_id: 'user-9',
          updated_at: '2026-09-01T00:00:00Z',
        }),
      ],
    );

    expect(imovel.fotos).toEqual(['local-1.jpg']);
    expect(imovel.captador_id).toBe('user-9');
    expect(imovel.updated_at).toBe('2026-09-01T00:00:00Z');
  });

  it('mantém as fotos do XML quando o cadastro local não tem nenhuma', () => {
    const [imovel] = mergeCatalogoImoveis([doXml()], [local({ codigo_imovel: 'AP0001', fotos: [] })]);

    expect(imovel.fotos).toEqual(['xml-1.jpg']);
  });

  it('devolve só o cadastro local quando o XML do tenant não carregou', () => {
    const catalogo = mergeCatalogoImoveis([], [local()]);

    expect(catalogo.map((i) => i.referencia)).toEqual(['CA054']);
  });
});
