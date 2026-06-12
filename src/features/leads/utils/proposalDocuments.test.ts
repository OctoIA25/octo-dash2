import { describe, expect, it } from 'vitest';
import {
  buildCcvDocument,
  buildCcvDocumentSafe,
  DOCUMENT_PAGE_CHARS_PER_LINE,
  DOCUMENT_PAGE_LINES_PER_PAGE,
  formatCurrencyWithCents,
  GENERAL_CONDITIONS,
  paginateDocumentContent,
  type CcvDocumentInput,
} from './proposalDocuments';

const baseInput: CcvDocumentInput = {
  proposalId: 'prop-1',
  imovelRef: 'CB0123',
  endereco: 'Rua das Flores, 100, Centro, São Paulo - SP, CEP 01001000',
  compradores: [{ nomeCompleto: 'Ana Souza' }, { nomeCompleto: 'Bruno Lima' }],
  vendedores: [{ nomeCompleto: 'Carla Dias' }],
  valor: 850000,
  comissao: 850000 * 0.055,
  formaPagamento: 'Com financiamento',
  condicoesEspecificas: 'Entrega das chaves em 30 dias.',
};

describe('formatCurrencyWithCents', () => {
  it('formata em pt-BR com centavos', () => {
    expect(formatCurrencyWithCents(850000)).toBe('R$\u00A0850.000,00');
    expect(formatCurrencyWithCents(0)).toBe('R$\u00A00,00');
  });
});

describe('buildCcvDocument', () => {
  it('gera o conteúdo exatamente no formato do CCV Conjurer', () => {
    const document = buildCcvDocument(baseInput);

    expect(document.content).toBe(
      [
        'CONTRATO DE COMPROMISSO DE COMPRA E VENDA',
        '',
        'Imóvel: CB0123',
        'Endereço: Rua das Flores, 100, Centro, São Paulo - SP, CEP 01001000',
        'Compradores: Ana Souza, Bruno Lima',
        'Vendedores: Carla Dias',
        'Valor do negócio: R$\u00A0850.000,00',
        'Comissão geral: R$\u00A046.750,00',
        'Forma de pagamento: Com financiamento',
        '',
        'Condições específicas:',
        'Entrega das chaves em 30 dias.',
        '',
        'Condições gerais:',
        ...GENERAL_CONDITIONS.map((condition, index) => `${index + 1}. ${condition}`),
      ].join('\n'),
    );
    expect(document.fileName).toBe('ccv-CB0123.txt');
    expect(document.title).toBe('Contrato de Compromisso de Compra e Venda');
    expect(document.missingFields).toEqual([]);
  });

  it('usa os mesmos fallbacks textuais da geração original', () => {
    const document = buildCcvDocument({
      ...baseInput,
      compradores: [],
      vendedores: [],
      condicoesEspecificas: '',
    });

    expect(document.content).toContain('Compradores: Compradores pendentes');
    expect(document.content).toContain('Vendedores: A definir');
    expect(document.content).toContain('Sem condições específicas cadastradas.');
  });

  it('marca participante sem nome com o placeholder original', () => {
    const document = buildCcvDocument({
      ...baseInput,
      compradores: [{ nomeCompleto: '' }, { nomeCompleto: 'Bruno Lima' }],
      vendedores: [{ nomeCompleto: '' }],
    });

    expect(document.content).toContain('Compradores: Comprador sem nome, Bruno Lima');
    expect(document.content).toContain('Vendedores: Vendedor sem nome');
  });

  it('usa o id da proposta no nome do arquivo quando não há referência do imóvel', () => {
    const document = buildCcvDocument({ ...baseInput, imovelRef: '' });
    expect(document.fileName).toBe('ccv-prop-1.txt');
  });

  it('aponta os dados ausentes que impedem um documento completo', () => {
    const document = buildCcvDocument({
      ...baseInput,
      imovelRef: '',
      endereco: 'Endereço não informado',
      compradores: [{ nomeCompleto: '  ' }],
      vendedores: [],
      valor: 0,
      comissao: 0,
      formaPagamento: '',
    });

    expect(document.missingFields.map((field) => field.id)).toEqual([
      'imovel-ref',
      'endereco',
      'comprador-0',
      'vendedores',
      'valor',
      'forma-pagamento',
    ]);
    expect(document.missingFields.every((field) => field.label.length > 0)).toBe(true);
  });
});

describe('buildCcvDocumentSafe', () => {
  it('retorna nulo sem erro quando não há entrada', () => {
    expect(buildCcvDocumentSafe(null)).toEqual({ document: null, error: null });
  });

  it('captura exceções e devolve mensagem amigável', () => {
    const brokenInput = { ...baseInput, compradores: null as unknown as CcvDocumentInput['compradores'] };
    const result = buildCcvDocumentSafe(brokenInput);
    expect(result.document).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('monta documento normalmente para entrada válida', () => {
    const result = buildCcvDocumentSafe(baseInput);
    expect(result.error).toBeNull();
    expect(result.document?.content).toBe(buildCcvDocument(baseInput).content);
  });
});

describe('paginateDocumentContent', () => {
  it('retorna uma página com linha vazia para conteúdo vazio', () => {
    expect(paginateDocumentContent('')).toEqual([{ number: 1, lines: [''] }]);
  });

  it('preserva linhas vazias e quebra por palavras sem perder conteúdo', () => {
    const longLine = 'palavra '.repeat(30).trim();
    const pages = paginateDocumentContent(`titulo\n\n${longLine}`);
    const lines = pages.flatMap((page) => page.lines);

    expect(lines[0]).toBe('titulo');
    expect(lines[1]).toBe('');
    const rejoined = lines.slice(2).join(' ');
    expect(rejoined).toBe(longLine);
    expect(lines.every((line) => line.length <= DOCUMENT_PAGE_CHARS_PER_LINE)).toBe(true);
  });

  it('quebra palavras maiores que a largura sem perder caracteres', () => {
    const word = 'x'.repeat(205);
    const pages = paginateDocumentContent(word);
    const lines = pages.flatMap((page) => page.lines);

    expect(lines.join('')).toBe(word);
    expect(lines.every((line) => line.length <= DOCUMENT_PAGE_CHARS_PER_LINE)).toBe(true);
  });

  it('distribui as linhas em páginas com o limite configurado', () => {
    const content = Array.from({ length: 100 }, (_, index) => `linha ${index + 1}`).join('\n');
    const pages = paginateDocumentContent(content);

    expect(pages).toHaveLength(Math.ceil(100 / DOCUMENT_PAGE_LINES_PER_PAGE));
    expect(pages[0].lines).toHaveLength(DOCUMENT_PAGE_LINES_PER_PAGE);
    expect(pages[0].number).toBe(1);
    expect(pages.at(-1)?.number).toBe(pages.length);
    expect(pages.flatMap((page) => page.lines).join('\n')).toBe(content);
  });

  it('pagina o CCV real em folhas válidas', () => {
    const document = buildCcvDocument(baseInput);
    const pages = paginateDocumentContent(document.content);

    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(
      pages.every(
        (page) =>
          page.lines.length <= DOCUMENT_PAGE_LINES_PER_PAGE &&
          page.lines.every((line) => line.length <= DOCUMENT_PAGE_CHARS_PER_LINE),
      ),
    ).toBe(true);
  });

  it('aceita largura e altura customizadas', () => {
    const pages = paginateDocumentContent('abcdef', { charsPerLine: 2, linesPerPage: 2 });
    expect(pages).toEqual([
      { number: 1, lines: ['ab', 'cd'] },
      { number: 2, lines: ['ef'] },
    ]);
  });
});
