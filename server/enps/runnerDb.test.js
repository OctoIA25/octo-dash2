/**
 * O que este teste protege: o link do e-mail do eNPS precisa SEMPRE ter host.
 * Sem host o Gmail monta "http:///enps/responder?cycle=..." e o corretor cai
 * numa tela de "Redirect Notice" — a pesquisa inteira não é respondida.
 */
import { describe, it, expect } from 'vitest';
import { publicBaseUrl, buildContent } from './runnerDb.js';

describe('publicBaseUrl', () => {
  it('sem env configurada cai no domínio de produção (nunca vazio)', () => {
    expect(publicBaseUrl({})).toBe('https://octodash.octoia.org');
  });

  it('usa a primeira origem de CORS_ORIGINS e tira a barra final', () => {
    expect(publicBaseUrl({ CORS_ORIGINS: 'https://app.exemplo.com/,https://outro.exemplo.com' }))
      .toBe('https://app.exemplo.com');
  });

  it('completa o esquema quando a origem vem só com o domínio', () => {
    expect(publicBaseUrl({ CORS_ORIGINS: 'app.exemplo.com' })).toBe('https://app.exemplo.com');
  });
});

describe('buildContent', () => {
  it('monta um link absoluto para o ciclo', () => {
    const { html, text } = buildContent({ survey: { title: 'eNPS' }, cycle: { id: 'cyc-1' } });
    const link = 'https://octodash.octoia.org/enps/responder?cycle=cyc-1';
    expect(html).toContain(link);
    expect(text).toContain(link);
  });
});
