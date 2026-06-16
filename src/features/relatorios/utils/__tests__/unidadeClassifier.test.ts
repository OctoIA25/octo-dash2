import { describe, it, expect } from 'vitest';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import {
  buildImovelTipoMap,
  categoriaFromTipo,
  classifyUnidade,
  normalizeCodigoKey,
  ImovelLocalRow,
} from '@/features/relatorios/utils/unidadeClassifier';

function makeLead(codigo_imovel: string): ProcessedLead {
  return {
    id_lead: 0,
    nome_lead: '',
    origem_lead: '',
    data_entrada: '',
    status_temperatura: '',
    etapa_atual: '',
    codigo_imovel,
    valor_imovel: 0,
    tipo_negocio: '',
    corretor_responsavel: '',
    data_finalizacao: '',
    Data_visita: '',
    observacoes: '',
    Preferencias_lead: '',
    Imovel_visitado: '',
    Conversa: '',
  };
}

const rows: ImovelLocalRow[] = [
  { codigo_imovel: 'AP001', tipo: 'Apartamento', tipo_simplificado: 'apartamento' },
  { codigo_imovel: 'CS002', tipo: 'Casa', tipo_simplificado: 'casa' },
  { codigo_imovel: 'TR003', tipo: 'Terreno', tipo_simplificado: 'terreno' },
  { codigo_imovel: 'GL004', tipo: 'Galpão Industrial', tipo_simplificado: 'comercial' },
  { codigo_imovel: 'LJ005', tipo: 'Loja', tipo_simplificado: 'comercial' },
  { codigo_imovel: 'CH006', tipo: 'Chácara', tipo_simplificado: 'rural' },
];

describe('normalizeCodigoKey', () => {
  it('tolera caixa, espaços e hífens', () => {
    expect(normalizeCodigoKey(' ap-001 ')).toBe('AP001');
    expect(normalizeCodigoKey('AP 001')).toBe('AP001');
    expect(normalizeCodigoKey(null)).toBe('');
    expect(normalizeCodigoKey('')).toBe('');
  });
});

describe('categoriaFromTipo', () => {
  it('mapeia tipo_simplificado básico', () => {
    expect(categoriaFromTipo({ tipoSimplificado: 'apartamento' })).toBe('Apartamento');
    expect(categoriaFromTipo({ tipoSimplificado: 'casa' })).toBe('Casa');
    expect(categoriaFromTipo({ tipoSimplificado: 'terreno' })).toBe('Terreno');
  });

  it('detecta Galpão pelo texto livre, mesmo com tipo_simplificado=comercial', () => {
    expect(categoriaFromTipo({ tipo: 'Galpão', tipoSimplificado: 'comercial' })).toBe('Galpão');
    expect(categoriaFromTipo({ tipo: 'Galpao', tipoSimplificado: 'comercial' })).toBe('Galpão');
    expect(categoriaFromTipo({ tipo: 'Galpão Industrial', tipoSimplificado: 'comercial' })).toBe(
      'Galpão'
    );
  });

  it('comercial (não galpão), rural e outro caem em Outros', () => {
    expect(categoriaFromTipo({ tipo: 'Loja', tipoSimplificado: 'comercial' })).toBe('Outros');
    expect(categoriaFromTipo({ tipo: 'Chácara', tipoSimplificado: 'rural' })).toBe('Outros');
    expect(categoriaFromTipo({ tipoSimplificado: 'outro' })).toBe('Outros');
    expect(categoriaFromTipo({ tipoSimplificado: 'valor_inesperado' })).toBe('Outros');
  });

  it('info indefinida cai em Não informado', () => {
    expect(categoriaFromTipo(undefined)).toBe('Não informado');
  });
});

describe('classifyUnidade (JOIN com imoveis_locais)', () => {
  const map = buildImovelTipoMap(rows);

  it('classifica corretamente cada tipo via código casado', () => {
    expect(classifyUnidade(makeLead('AP001'), map)).toBe('Apartamento');
    expect(classifyUnidade(makeLead('CS002'), map)).toBe('Casa');
    expect(classifyUnidade(makeLead('TR003'), map)).toBe('Terreno');
    expect(classifyUnidade(makeLead('GL004'), map)).toBe('Galpão');
    expect(classifyUnidade(makeLead('LJ005'), map)).toBe('Outros');
    expect(classifyUnidade(makeLead('CH006'), map)).toBe('Outros');
  });

  it('casamento de chave é robusto a caixa/espaço/hífen', () => {
    expect(classifyUnidade(makeLead('ap-001'), map)).toBe('Apartamento');
    expect(classifyUnidade(makeLead(' Ap 001 '), map)).toBe('Apartamento');
  });

  it('lead sem código → Não informado', () => {
    expect(classifyUnidade(makeLead(''), map)).toBe('Não informado');
  });

  it('código sem correspondência no mapa → Não informado', () => {
    expect(classifyUnidade(makeLead('XX999'), map)).toBe('Não informado');
  });
});

describe('buildImovelTipoMap', () => {
  it('ignora linhas sem código e mantém o primeiro em caso de duplicidade', () => {
    const map = buildImovelTipoMap([
      { codigo_imovel: null, tipo: 'X', tipo_simplificado: 'casa' },
      { codigo_imovel: 'AP001', tipo: 'Apartamento', tipo_simplificado: 'apartamento' },
      { codigo_imovel: 'ap001', tipo: 'Casa', tipo_simplificado: 'casa' }, // duplicado normalizado
    ]);
    expect(map.size).toBe(1);
    expect(map.get('AP001')?.tipoSimplificado).toBe('apartamento');
  });
});
