/**
 * Mapa interligado (P2.6) — pinos e contador.
 *
 * Os números dos casos são os da Lotus, medidos em 21/09/2026: 59 lançamentos,
 * dos quais 18 não têm endereço de plantão nenhum.
 */

import { describe, it, expect } from 'vitest';
import {
  contar, filtrarPontos, linhasDoCard, temCoordenada, textoDoContador,
  type PontoDoMapa, type TipoDePonto, type TotaisDoMapa,
} from './mapaPontos';

const ponto = (over: Partial<PontoDoMapa> = {}): PontoDoMapa => ({
  tipo: 'lancamento',
  id: 'x',
  ref: null,
  nome: 'Residencial Teste',
  codigo: 'L001',
  latitude: -23.5,
  longitude: -46.6,
  geo_origem: 'automatica',
  geo_precisao: 'exata',
  geo_erro: null,
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  foto: null,
  preco: 'a partir de R$ 500.000',
  link: '/imoveis/lancamentos/x',
  endereco: 'Avenida Paulista, 1578, São Paulo, Brasil',
  ...over,
});

const tipos = (...t: TipoDePonto[]) => new Set(t);

describe('temCoordenada', () => {
  it('coordenada válida desenha', () => {
    expect(temCoordenada(ponto())).toBe(true);
  });

  it('sem coordenada não desenha', () => {
    expect(temCoordenada(ponto({ latitude: null, longitude: null }))).toBe(false);
  });

  /** 0,0 é o golfo da Guiné — é "não sei", gravado como se fosse lugar. */
  it('zero-zero não é coordenada', () => {
    expect(temCoordenada(ponto({ latitude: 0, longitude: 0 }))).toBe(false);
  });
});

describe('filtrarPontos', () => {
  const todos = [
    ponto({ id: 'l1', tipo: 'lancamento', nome: 'Jardim das Flores' }),
    ponto({ id: 'c1', tipo: 'condominio', nome: 'Vila Nova', codigo: 'C001' }),
    ponto({ id: 'i1', tipo: 'imovel', nome: 'Apto 2 dorms', codigo: 'AP1191' }),
    ponto({ id: 'l2', tipo: 'lancamento', nome: 'Sem coordenada', latitude: null, longitude: null }),
  ];

  it('mostra só os tipos ligados', () => {
    expect(filtrarPontos(todos, { tipos: tipos('lancamento') }).map((p) => p.id)).toEqual(['l1']);
    expect(filtrarPontos(todos, { tipos: tipos('condominio', 'imovel') }).map((p) => p.id)).toEqual(['c1', 'i1']);
  });

  it('nenhum tipo ligado é mapa vazio, não mapa cheio', () => {
    expect(filtrarPontos(todos, { tipos: new Set() })).toHaveLength(0);
  });

  it('busca por nome, código, bairro ou cidade', () => {
    expect(filtrarPontos(todos, { tipos: tipos('imovel'), busca: 'AP1191' })).toHaveLength(1);
    expect(filtrarPontos(todos, { tipos: tipos('lancamento'), busca: 'flores' })).toHaveLength(1);
    expect(filtrarPontos(todos, { tipos: tipos('lancamento'), busca: 'bela vista' })).toHaveLength(1);
    expect(filtrarPontos(todos, { tipos: tipos('lancamento'), busca: 'inexistente' })).toHaveLength(0);
  });
});

describe('contar e textoDoContador', () => {
  const totais: TotaisDoMapa = {
    lancamentos: { total: 59, no_mapa: 39, sem_endereco: 18 },
    condominios: { total: 87, no_mapa: 85, sem_endereco: 2 },
    imoveis: { total: 29, no_mapa: 29, sem_endereco: 0 },
    aproximados: 16,
    com_erro: 0,
  };

  it('soma só os tipos ligados', () => {
    const c = contar(totais, tipos('lancamento'), [ponto(), ponto({ id: 'b' })]);
    expect(c).toEqual({ noMapa: 2, total: 59, semEndereco: 18, aproximados: 0 });
  });

  /**
   * O ponto do item: "39 de 59" sozinho faz o gestor esperar 20 pinos que nunca
   * virão, porque 18 não têm endereço nenhum para achar.
   */
  it('separa quem nunca vai aparecer de quem ainda não foi geocodificado', () => {
    const visiveis = Array.from({ length: 39 }, (_, i) => ponto({ id: String(i) }));
    const texto = textoDoContador(contar(totais, tipos('lancamento'), visiveis));
    expect(texto).toContain('39 de 59 no mapa');
    expect(texto).toContain('18 sem endereço cadastrado');
    expect(texto).toContain('2 ainda sem coordenada');
  });

  it('avisa quando há pino aproximado', () => {
    const visiveis = [ponto({ geo_precisao: 'aproximada' }), ponto({ id: 'b' })];
    expect(textoDoContador(contar(totais, tipos('lancamento'), visiveis))).toContain(
      '1 com pino aproximado'
    );
  });

  it('não promete nada quando não há cadastro', () => {
    const vazio: TotaisDoMapa = {
      lancamentos: { total: 0, no_mapa: 0, sem_endereco: 0 },
      condominios: { total: 0, no_mapa: 0, sem_endereco: 0 },
      imoveis: { total: 0, no_mapa: 0, sem_endereco: 0 },
      aproximados: 0,
      com_erro: 0,
    };
    expect(textoDoContador(contar(vazio, tipos('lancamento', 'condominio', 'imovel'), []))).toBe(
      'Nada cadastrado para mostrar no mapa.'
    );
  });

  it('sem totais ainda carregados, não inventa número', () => {
    expect(contar(null, tipos('lancamento'), [ponto()])).toEqual({
      noMapa: 0, total: 0, semEndereco: 0, aproximados: 0,
    });
  });
});

describe('linhasDoCard', () => {
  it('mostra código, preço e lugar', () => {
    expect(linhasDoCard(ponto())).toEqual(['L001', 'a partir de R$ 500.000', 'Bela Vista · São Paulo']);
  });

  /** Pino aproximado sem aviso leva o corretor ao lugar errado. */
  it('o pino aproximado se denuncia no card', () => {
    expect(linhasDoCard(ponto({ geo_precisao: 'aproximada' }))).toContain(
      'Pino aproximado: sai do bairro, não do endereço'
    );
  });

  it('não inventa linha vazia quando o cadastro está incompleto', () => {
    expect(linhasDoCard(ponto({ codigo: null, preco: null, bairro: null, cidade: null }))).toEqual([]);
  });
});
