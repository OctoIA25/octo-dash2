import { describe, it, expect } from 'vitest';
import { composeRecommendationEmail } from '../email/composeEmail';
import {
  formatPreco,
  formatLocalizacao,
  formatAtributos,
} from '../email/imovelToEmail';
import { makeImovel } from './fixtures';

describe('imovelToEmail helpers', () => {
  it('formatPreco por finalidade', () => {
    const i = makeImovel({ valor_venda: 500000, valor_locacao: 2500 });
    expect(formatPreco(i, 'venda')).toContain('500.000');
    expect(formatPreco(i, 'locacao')).toContain('/mês');
    expect(formatPreco(makeImovel({ valor_venda: 0, valor_locacao: 0 }))).toBe('Sob consulta');
  });

  it('formatLocalizacao omite partes ausentes', () => {
    expect(formatLocalizacao(makeImovel({ bairro: 'Centro', cidade: 'SP', estado: 'SP' }))).toBe(
      'Centro, SP - SP',
    );
    expect(formatLocalizacao(makeImovel({ bairro: '', cidade: 'SP', estado: '' }))).toBe('SP');
  });

  it('formatAtributos omite zeros e usa plural correto', () => {
    expect(formatAtributos(makeImovel({ quartos: 1, banheiro: 0, garagem: 2, area_util: 50 }))).toEqual([
      '1 quarto',
      '2 vagas',
      '50 m²',
    ]);
  });
});

describe('composeRecommendationEmail', () => {
  it('produz render + snapshot consistentes', () => {
    const imoveis = [
      makeImovel({ referencia: 'A', titulo: 'Casa A', valor_venda: 600000 }),
      makeImovel({ referencia: 'B', titulo: 'Casa B', valor_venda: 700000 }),
    ];
    const composed = composeRecommendationEmail({
      leadNome: 'Léo',
      mensagem: 'oi',
      imoveis,
      finalidade: 'venda',
      branding: { empresaNome: 'Imob' },
    });

    expect(composed.propertiesSnapshot).toHaveLength(2);
    expect(composed.propertiesSnapshot[0]).toMatchObject({ referencia: 'A', preco: 600000 });
    expect(composed.rendered.html).toContain('Casa A');
    expect(composed.subject).toContain('Léo');
  });

  it('usa assunto customizado quando informado', () => {
    const composed = composeRecommendationEmail({
      leadNome: 'Léo',
      mensagem: 'oi',
      imoveis: [makeImovel()],
      branding: { empresaNome: 'Imob' },
      assuntoCustom: '  Oferta especial  ',
    });
    expect(composed.subject).toBe('Oferta especial');
    expect(composed.rendered.subject).toBe('Oferta especial');
  });
});
