import { describe, it, expect } from 'vitest';
import { imovelCasaBusca } from './buscaImovel';

const imovel = {
  referencia: 'AP-1234',
  titulo: 'Apartamento com varanda gourmet',
  bairro: 'Jardim São José',
  descricao: 'Próximo ao metrô, condomínio com piscina.',
};

describe('imovelCasaBusca', () => {
  // O bug: o card mostra o código, o placeholder promete "Código", e só o
  // Ctrl+F do navegador achava o imóvel.
  it.each(['AP-1234', 'ap-1234', 'Ap-1234', 'AP-12', '1234'])('acha pelo código exibido no card: %s', (termo) => {
    expect(imovelCasaBusca(imovel, termo)).toBe(true);
  });

  it.each(['varanda', 'jardim', 'metrô'])('continua achando por título, bairro e descrição: %s', (termo) => {
    expect(imovelCasaBusca(imovel, termo)).toBe(true);
  });

  // O Ctrl+F do navegador ignora acento; a busca da tela também precisa.
  it.each(['sao jose', 'SÃO JOSÉ', 'metro', 'condominio'])('ignora acento dos dois lados: %s', (termo) => {
    expect(imovelCasaBusca(imovel, termo)).toBe(true);
  });

  it('ignora espaços nas pontas do termo (código colado)', () => {
    expect(imovelCasaBusca(imovel, '  AP-1234 ')).toBe(true);
  });

  it('não casa um termo que não está em nenhum campo pesquisável', () => {
    expect(imovelCasaBusca(imovel, 'CA-9999')).toBe(false);
  });

  // Mesma semântica de antes: o termo inteiro dentro de UM campo, não
  // espalhado entre código e título.
  it('não junta campos para casar o termo', () => {
    expect(imovelCasaBusca(imovel, '1234 apartamento')).toBe(false);
  });

  it('termo vazio ou só espaços não filtra nada', () => {
    expect(imovelCasaBusca(imovel, '')).toBe(true);
    expect(imovelCasaBusca(imovel, '   ')).toBe(true);
  });
});
