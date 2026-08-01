import { describe, it, expect } from 'vitest';
import { normalizeSiteUrl } from './normalizeSiteUrl';

describe('normalizeSiteUrl', () => {
  it('trata vazio como "não preenchido"', () => {
    expect(normalizeSiteUrl('')).toBeNull();
    expect(normalizeSiteUrl('   ')).toBeNull();
  });

  it('assume https quando o protocolo é omitido', () => {
    expect(normalizeSiteUrl('lancamentovistamar.com.br')).toBe('https://lancamentovistamar.com.br/');
  });

  it('preserva http/https e o caminho', () => {
    expect(normalizeSiteUrl(' https://site.com/vista-mar ')).toBe('https://site.com/vista-mar');
    expect(normalizeSiteUrl('http://site.com')).toBe('http://site.com/');
  });

  it('rejeita protocolos que não são http(s)', () => {
    expect(normalizeSiteUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeSiteUrl('data:text/html,oi')).toBeUndefined();
  });

  it('rejeita texto que não é link', () => {
    expect(normalizeSiteUrl('vista mar')).toBeUndefined();
    expect(normalizeSiteUrl('sem-ponto')).toBeUndefined();
  });
});
