import { describe, it, expect } from 'vitest';
import { rotuloCampo, formatarValor } from './ImovelHistorico';

describe('formatarValor', () => {
  it('mostra "vazio" para nulo, indefinido e string vazia', () => {
    expect(formatarValor('titulo', null)).toBe('vazio');
    expect(formatarValor('titulo', undefined)).toBe('vazio');
    expect(formatarValor('titulo', '')).toBe('vazio');
  });

  it('traduz booleano', () => {
    expect(formatarValor('destaque', true)).toBe('Sim');
    expect(formatarValor('destaque', false)).toBe('Não');
  });

  it('formata moeda só nos campos de valor', () => {
    expect(formatarValor('valor_venda', 480000)).toMatch(/R\$\s?480\.000/);
    expect(formatarValor('quartos', 3)).toBe('3');
  });

  it('não confunde zero com vazio', () => {
    expect(formatarValor('vagas', 0)).toBe('0');
    expect(formatarValor('fotos', 0)).toBe('0');
  });

  it('junta arrays e trunca texto longo', () => {
    expect(formatarValor('area_comum', ['Piscina', 'Churrasqueira'])).toBe('Piscina, Churrasqueira');
    expect(formatarValor('area_comum', [])).toBe('vazio');
    expect(formatarValor('descricao', 'a'.repeat(200))).toHaveLength(81);
  });
});

describe('rotuloCampo', () => {
  it('usa o rótulo conhecido', () => {
    expect(rotuloCampo('valor_venda')).toBe('Valor de venda');
  });

  it('cai no nome da coluna quando não mapeada', () => {
    expect(rotuloCampo('campo_novo_qualquer')).toBe('Campo novo qualquer');
  });
});

describe('campos de chave', () => {
  const UID = '11111111-1111-1111-1111-111111111111';

  it('traduz o status da chave', () => {
    expect(formatarValor('chave_status', 'imobiliaria')).toBe('Na imobiliária');
    expect(formatarValor('chave_status', 'nao_temos')).toBe('Não temos a chave');
  });

  it('resolve o user_id em nome nos campos de pessoa', () => {
    expect(formatarValor('chave_com', UID, { [UID]: 'Ana' })).toBe('Ana');
    expect(formatarValor('captador_id', UID, { [UID]: 'Ana' })).toBe('Ana');
  });

  it('cai em "Usuário" quando o nome não está no mapa', () => {
    expect(formatarValor('chave_com', UID)).toBe('Usuário');
    expect(formatarValor('chave_com', UID, {})).toBe('Usuário');
  });

  it('mantém "vazio" quando a chave voltou (campo nulo)', () => {
    expect(formatarValor('chave_com', null, { [UID]: 'Ana' })).toBe('vazio');
  });

  it('formata a data da retirada em pt-BR', () => {
    expect(formatarValor('chave_retirada_em', '2026-08-19T15:30:00-03:00')).toMatch(/19\/08\/2026/);
  });

  it('rotula os campos de chave', () => {
    expect(rotuloCampo('chave_com')).toBe('Chave com');
    expect(rotuloCampo('chave_status')).toBe('Chave');
  });
});
