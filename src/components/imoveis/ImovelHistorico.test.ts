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
