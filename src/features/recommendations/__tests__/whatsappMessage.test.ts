import { describe, it, expect } from 'vitest';
import { renderRecommendationWhatsapp } from '../whatsapp/recommendationWhatsappMessage';
import { composeRecommendationWhatsapp } from '../whatsapp/composeWhatsapp';
import { makeImovel } from './fixtures';

describe('renderRecommendationWhatsapp', () => {
  it('inclui saudação, mensagem e dados dos imóveis (reusa formatadores)', () => {
    const body = renderRecommendationWhatsapp({
      leadNome: 'Ana',
      mensagem: 'olha isso',
      imoveis: [makeImovel({ referencia: 'AP01', titulo: 'Apê Centro', valor_venda: 500000, quartos: 3 })],
      finalidade: 'venda',
      empresaNome: 'Imob X',
    });
    expect(body).toContain('Olá Ana!');
    expect(body).toContain('olha isso');
    expect(body).toContain('*Apê Centro* (AP01)');
    expect(body).toContain('500.000');
    expect(body).toContain('3 quartos');
    expect(body).toContain('— Imob X');
  });

  it('sem nome usa saudação genérica', () => {
    const body = renderRecommendationWhatsapp({ leadNome: '', mensagem: 'oi', imoveis: [makeImovel()] });
    expect(body.startsWith('Olá!')).toBe(true);
  });
});

describe('composeRecommendationWhatsapp', () => {
  it('produz body + snapshot consistentes', () => {
    const c = composeRecommendationWhatsapp({
      leadNome: 'Léo',
      mensagem: 'oi',
      imoveis: [makeImovel({ referencia: 'A', valor_venda: 600000 })],
      finalidade: 'venda',
    });
    expect(c.body).toContain('Léo');
    expect(c.propertiesSnapshot).toHaveLength(1);
    expect(c.propertiesSnapshot[0]).toMatchObject({ referencia: 'A', preco: 600000 });
  });
});
