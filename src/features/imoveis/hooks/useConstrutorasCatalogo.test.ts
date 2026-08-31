import { describe, expect, it } from 'vitest';
import { isLink, parseCatalogoCsv } from './useConstrutorasCatalogo';

const HEADER =
  'construtora,empreendimento,tipo,endereco,bairro,cidade,previsao_entrega,cadastrado_octodash,descricao,unidades,garden,valor,vagas,dormitorios,suites,comissao,condominio,iptu,book,decorado,fotos,landing_page,youtube,folhetos,atualizado_em';

describe('parseCatalogoCsv', () => {
  it('parseia linha com célula multiline entre aspas e acentos', async () => {
    const csv = [
      HEADER,
      'AUTEN,Terrace Serra do Japi,APARTAMENTO,"Av. Adilson Rodrigues, 121",Samambaias,Jundiaí,-,sim,"Vista da serra;\npiscina 25m",104,,,3-4,3-4,até 4,,,,Book.pdf,,https://drive.google.com/x,,,,26/08/2026 18:30:00',
    ].join('\n');

    const rows = await parseCatalogoCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].construtora).toBe('AUTEN');
    expect(rows[0].cidade).toBe('Jundiaí');
    expect(rows[0].endereco).toBe('Av. Adilson Rodrigues, 121');
    expect(rows[0].descricao).toContain('piscina 25m');
    expect(rows[0].fotos).toBe('https://drive.google.com/x');
    expect(rows[0].atualizado_em).toBe('26/08/2026 18:30:00');
  });

  it('atualizado_em vira string vazia enquanto o espelho ainda não tem a coluna', async () => {
    const headerSemData = HEADER.replace(',atualizado_em', '');
    const csv = [headerSemData, 'AUTEN,Terrace,,,,,,,,,,,,,,,,,,,,,,'].join('\n');
    const rows = await parseCatalogoCsv(csv);
    expect(rows[0].atualizado_em).toBe('');
  });

  it('descarta linhas sem empreendimento e faz trim nos campos', async () => {
    const csv = [
      HEADER,
      'SANTA ANGELA ,Allegratto ,APARTAMENTO,,Medeiros,Jundiaí,,,,,,,,,,,,,,,,,,',
      ',,,,,,,,,,,,,,,,,,,,,,,',
    ].join('\n');

    const rows = await parseCatalogoCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].construtora).toBe('SANTA ANGELA');
    expect(rows[0].empreendimento).toBe('Allegratto');
  });

  it('acusa cabeçalho inesperado quando a planilha-espelho foi mexida', async () => {
    const csv = 'nome,valor\nX,10';
    await expect(parseCatalogoCsv(csv)).rejects.toThrow(/colunas ausentes/);
  });
});

describe('isLink', () => {
  it('aceita apenas URLs http(s) — não textos como "Book.pdf", "Não" ou "Antigo"', () => {
    expect(isLink('https://drive.google.com/file/x')).toBe(true);
    expect(isLink(' http://youtu.be/x ')).toBe(true);
    expect(isLink('Book.pdf')).toBe(false);
    expect(isLink('Não')).toBe(false);
    expect(isLink('')).toBe(false);
  });
});
