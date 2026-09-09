import { describe, it, expect } from 'vitest';
import {
  buildEditDataFromLocal,
  parseCurrency,
  formatCurrencyFromNumber,
  categoriaDoTipo,
  CAMPOS_PERSISTIDOS,
  type ImovelLocalRow,
} from './buildEditDataFromLocal';

const linha: ImovelLocalRow = { codigo_imovel: 'AP0686' };

describe('buildEditDataFromLocal', () => {
  it('carrega todo campo que o save persiste — o que faltar aqui a edição apaga', () => {
    const data = buildEditDataFromLocal(linha) as Record<string, unknown>;
    const faltando = CAMPOS_PERSISTIDOS.filter((campo) => !(campo in data));
    expect(faltando).toEqual([]);
  });

  // Os quatro que a edição apagava até 09/2026 (imoveis_locais_log: AP0686,
  // CA0057, CA0058 perderam complemento/condomínio/metragem no save).
  it('preserva complemento, condomínio, metragem e exclusividade', () => {
    const data = buildEditDataFromLocal({
      ...linha,
      complemento: 'Torre 3, 100',
      condominio_id: '3a1b733c-9e34-4699-9960-5e047acffd07',
      metragem_m2: 73,
      exclusivo: true,
    });
    expect(data.complemento).toBe('Torre 3, 100');
    expect(data.condominio_id).toBe('3a1b733c-9e34-4699-9960-5e047acffd07');
    expect(data.metragem_m2).toBe('73');
    expect(data.exclusivo).toBe('sim');
  });

  // Antes a whitelist mandava String(768.68) = "768.68" e parseCurrency lia o
  // "." como separador de milhar: 768,68 virava 76868 a cada salvamento.
  it('devolve valor em máscara pt-BR, e o parser do formulário volta ao mesmo número', () => {
    const data = buildEditDataFromLocal({
      ...linha,
      valor_iptu: 768.68,
      valor_condominio: 741.18,
      valor_venda: 450000,
    });
    expect(data.valor_iptu).toBe('768,68');
    expect(parseCurrency(data.valor_iptu)).toBe(768.68);
    expect(parseCurrency(data.valor_condominio)).toBe(741.18);
    expect(parseCurrency(data.valor_venda)).toBe(450000);
  });

  it('valor zerado ou ausente vira campo vazio, e o parser devolve 0', () => {
    expect(formatCurrencyFromNumber(0)).toBe('');
    expect(formatCurrencyFromNumber(null)).toBe('');
    expect(parseCurrency('')).toBe(0);
  });

  it('deriva a categoria do tipo (a coluna finalidade do banco é venda/locacao)', () => {
    expect(buildEditDataFromLocal({ ...linha, tipo: 'Apartamento', finalidade: 'venda' }).finalidade)
      .toBe('residencial');
    expect(categoriaDoTipo('Sala Comercial')).toBe('comercial');
    expect(categoriaDoTipo('Coworking')).toBe('corporativa');
    expect(categoriaDoTipo('Tipo Que Não Existe')).toBe('');
    expect(categoriaDoTipo(null)).toBe('');
  });

  // Estes 16 a tela coletava e o save jogava fora até 09/2026 (não existiam nem
  // como coluna). Ver 20260909_imovel_campos_do_formulario.sql.
  it('carrega os campos que antes eram só fachada na tela', () => {
    const data = buildEditDataFromLocal({
      ...linha,
      midia_origem: 'Portal',
      numero_matricula: '12345',
      area_terreno: 300,
      placa_local: true,
      aprovado_ambiental: 'sim',
    });
    expect(data.midia_origem).toBe('Portal');
    expect(data.numero_matricula).toBe('12345');
    expect(data.area_terreno).toBe('300');
    expect(data.placa_local).toBe('sim');
    expect(data.aprovado_ambiental).toBe('sim');
  });

  it('sem valor no banco, cai no default de exibição do formulário', () => {
    const data = buildEditDataFromLocal(linha);
    expect(data.envio_atividades).toBe('nao_enviar');
    expect(data.pais).toBe('Brasil');
    expect(data.placa_local).toBe('nao');
    expect(data.midia_origem).toBe('');
  });

  it('linha vazia não inventa valor', () => {
    const data = buildEditDataFromLocal(linha);
    expect(data.complemento).toBe('');
    expect(data.condominio_id).toBe('');
    expect(data.exclusivo).toBe('nao');
    expect(data.valor_iptu).toBe('');
  });
});
