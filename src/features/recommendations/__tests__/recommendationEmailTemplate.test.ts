import { describe, it, expect } from 'vitest';
import {
  renderRecommendationEmail,
  escapeHtml,
  defaultSubject,
  type RecommendationEmailData,
} from '../email/recommendationEmailTemplate';

const baseData: RecommendationEmailData = {
  leadNome: 'Maria',
  mensagem: 'Olha esses imóveis.',
  imoveis: [
    {
      referencia: 'AP01',
      titulo: 'Apartamento Pinheiros',
      localizacao: 'Pinheiros, São Paulo - SP',
      precoFormatado: 'R$ 500.000',
      atributos: ['3 quartos', '90 m²'],
      fotoUrl: 'https://example.com/a.jpg',
    },
  ],
  branding: { empresaNome: 'Imob X', corretorNome: 'João' },
};

describe('escapeHtml', () => {
  it('escapa caracteres perigosos', () => {
    expect(escapeHtml('<script>"&\'</script>')).toBe(
      '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;',
    );
  });
});

describe('defaultSubject', () => {
  it('singular e plural', () => {
    expect(defaultSubject('Ana', 1)).toBe('Ana, encontramos um imóvel pra você');
    expect(defaultSubject('Ana', 3)).toBe('Ana, encontramos 3 imóveis pra você');
  });
  it('sem nome', () => {
    expect(defaultSubject('', 2)).toBe('encontramos 2 imóveis pra você');
  });
});

describe('renderRecommendationEmail', () => {
  it('inclui dados do lead, imóvel e branding', () => {
    const { html, text, subject } = renderRecommendationEmail(baseData);
    expect(subject).toContain('Maria');
    expect(html).toContain('Maria');
    expect(html).toContain('Apartamento Pinheiros');
    expect(html).toContain('R$ 500.000');
    expect(html).toContain('Imob X');
    expect(html).toContain('https://example.com/a.jpg');
    // versão texto
    expect(text).toContain('Apartamento Pinheiros');
    expect(text).toContain('AP01');
  });

  it('escapa conteúdo do usuário (sem injeção de HTML)', () => {
    const data: RecommendationEmailData = {
      ...baseData,
      leadNome: '<b>x</b>',
      mensagem: '<img src=x onerror=alert(1)>',
    };
    const { html } = renderRecommendationEmail(data);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('renderiza CTA principal quando fornecido', () => {
    const { html } = renderRecommendationEmail({
      ...baseData,
      branding: { ...baseData.branding, ctaLabel: 'Ver todos', ctaUrl: 'https://x.com' },
    });
    expect(html).toContain('Ver todos');
    expect(html).toContain('https://x.com');
  });

  it('quebra parágrafos da mensagem em <p>', () => {
    const { html } = renderRecommendationEmail({ ...baseData, mensagem: 'linha 1\n\nlinha 2' });
    expect(html).toContain('linha 1');
    expect(html).toContain('linha 2');
  });
});
