import { describe, it, expect } from 'vitest';
import { portalDoLink } from './portais';

describe('portalDoLink', () => {
  it('reconhece os portais suportados (com e sem subdomínio)', () => {
    expect(portalDoLink('https://www.imovelweb.com.br/propriedades/apto-123.html')?.nome).toBe('ImovelWeb');
    expect(portalDoLink('https://imovelweb.com.br/x')?.nome).toBe('ImovelWeb');
    expect(portalDoLink('https://www.chavesnamao.com.br/imovel/abc/')?.nome).toBe('Chaves na Mão');
  });

  it('rejeita portal não suportado, link inválido e domínio disfarçado', () => {
    expect(portalDoLink('https://www.zapimoveis.com.br/imovel/1')).toBeNull();
    expect(portalDoLink('não é um link')).toBeNull();
    expect(portalDoLink('https://malicioso.com/?u=imovelweb.com.br')).toBeNull();
    expect(portalDoLink('https://imovelweb.com.br.fake.com/x')).toBeNull();
  });
});
