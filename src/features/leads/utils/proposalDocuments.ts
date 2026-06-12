// Montagem dos documentos textuais da proposta (hoje, a minuta de CCV gerada
// pelo "CCV Conjurer" em PropostaPage). A regra central deste módulo: o MESMO
// `content` retornado por buildCcvDocument alimenta o download (.txt) e a
// pré-visualização — o preview é idêntico ao arquivo final por construção,
// e qualquer mudança de formato acontece em um lugar só.

export const GENERAL_CONDITIONS = [
  'A presente proposta está submetida às disposições dos artigos 722 a 729 do Código Civil, especialmente ao artigo 723, que estabelece o dever da imobiliária e dos corretores de imóveis de atuarem com diligência, prudência e transparência, prestando espontaneamente todas as informações relevantes sobre o andamento da negociação, inclusive quanto à segurança, riscos envolvidos, alterações de valores e demais fatores que possam influenciar a concretização do negócio.',
  'Esta proposta terá validade de 03 (três) dias corridos, contados da data de sua assinatura pelo(a)(s) Proponente(s) Comprador(a)(es), ficando condicionada à aceitação expressa do(a)(s) proprietário(a)(s)/vendedor(es). Após a aceitação da proposta, o(a)(s) Proponente(s) Comprador(a)(es) deverá(ão) encaminhar toda a documentação necessária para elaboração do contrato no prazo máximo de 48 (quarenta e oito) horas. O descumprimento deste prazo poderá resultar na liberação do imóvel para nova comercialização, sem qualquer ônus ao proprietário ou à imobiliária.',
  'A parte que der causa ao arrependimento ou desistência do negócio após a aceitação desta proposta ficará obrigada ao pagamento de multa equivalente a 10% (dez por cento) do valor total do imóvel, além dos honorários de corretagem e intermediação imobiliária no percentual de 6% (seis por cento) sobre o valor do negócio, nos termos do artigo 725 do Código Civil.',
  'A penalidade prevista no item anterior não será aplicada caso o(a)(s) Proponente(s) Comprador(a)(es) não obtenha(m) aprovação de financiamento imobiliário junto à instituição financeira competente e/ou não consiga(m) a liberação dos recursos provenientes do FGTS, desde que devidamente comprovada a negativa.',
  'Com a aceitação desta proposta pelo(a)(s) proprietário(a)(s)/vendedor(es), as partes declaram ciência e concordância expressa quanto à coleta, tratamento e armazenamento de dados pessoais e documentos necessários à análise da negociação, incluindo certidões negativas, pesquisas cadastrais e documentos do imóvel e das partes envolvidas, nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD). As partes autorizam, ainda, a imobiliária a providenciar a elaboração do instrumento particular de compra e venda, escritura pública e/ou contrato de financiamento, comprometendo-se a fornecer toda a documentação necessária e arcar com as despesas inerentes à formalização da transação.',
  'Fica eleito o foro da comarca da situação do imóvel para dirimir quaisquer dúvidas ou controvérsias oriundas desta proposta, com renúncia expressa a qualquer outro, por mais privilegiado que seja.',
];

export const formatCurrencyWithCents = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

export interface DocumentMissingField {
  id: string;
  label: string;
  hint?: string;
}

export interface GeneratedDocument {
  title: string;
  fileName: string;
  content: string;
  missingFields: DocumentMissingField[];
}

export interface CcvDocumentInput {
  proposalId: string;
  imovelRef: string;
  endereco: string;
  compradores: ReadonlyArray<{ nomeCompleto: string }>;
  vendedores: ReadonlyArray<{ nomeCompleto: string }>;
  valor: number;
  comissao: number;
  formaPagamento: string;
  condicoesEspecificas: string;
}

// Mesmo texto usado como fallback de endereço em PropostaPage (formatAddress/
// selectedDealAddress) — chegar aqui com ele significa endereço não preenchido.
const ENDERECO_NAO_INFORMADO = 'Endereço não informado';

const collectCcvMissingFields = (input: CcvDocumentInput): DocumentMissingField[] => {
  const missing: DocumentMissingField[] = [];

  if (!input.imovelRef.trim()) {
    missing.push({
      id: 'imovel-ref',
      label: 'Referência do imóvel',
      hint: 'Selecione um imóvel da carteira ou informe os dados do imóvel externo.',
    });
  }

  if (!input.endereco.trim() || input.endereco === ENDERECO_NAO_INFORMADO) {
    missing.push({
      id: 'endereco',
      label: 'Endereço do imóvel',
      hint: 'Preencha o endereço completo do imóvel na proposta.',
    });
  }

  if (input.compradores.length === 0) {
    missing.push({
      id: 'compradores',
      label: 'Proponentes compradores',
      hint: 'Adicione ao menos um comprador em Participantes.',
    });
  } else {
    input.compradores.forEach((party, index) => {
      if (!party.nomeCompleto.trim()) {
        missing.push({
          id: `comprador-${index}`,
          label: `Nome do comprador ${index + 1}`,
          hint: 'Complete o nome em Participantes.',
        });
      }
    });
  }

  if (input.vendedores.length === 0) {
    missing.push({
      id: 'vendedores',
      label: 'Proprietários vendedores',
      hint: 'Adicione ao menos um proprietário em Participantes.',
    });
  } else {
    input.vendedores.forEach((party, index) => {
      if (!party.nomeCompleto.trim()) {
        missing.push({
          id: `vendedor-${index}`,
          label: `Nome do vendedor ${index + 1}`,
          hint: 'Complete o nome em Participantes.',
        });
      }
    });
  }

  if (input.valor <= 0) {
    missing.push({
      id: 'valor',
      label: 'Valor do negócio',
      hint: 'Informe o valor da proposta.',
    });
  }

  if (!input.formaPagamento.trim()) {
    missing.push({
      id: 'forma-pagamento',
      label: 'Forma de pagamento',
      hint: 'Defina a forma de pagamento na aba Formulário.',
    });
  }

  return missing;
};

export function buildCcvDocument(input: CcvDocumentInput): GeneratedDocument {
  const buyers =
    input.compradores.map((party) => party.nomeCompleto || 'Comprador sem nome').join(', ') ||
    'Compradores pendentes';
  const fallbackSeller =
    input.vendedores.find((party) => party.nomeCompleto.trim())?.nomeCompleto.trim() || 'A definir';
  const sellers =
    input.vendedores.map((party) => party.nomeCompleto || 'Vendedor sem nome').join(', ') ||
    fallbackSeller;

  const content = [
    'CONTRATO DE COMPROMISSO DE COMPRA E VENDA',
    '',
    `Imóvel: ${input.imovelRef}`,
    `Endereço: ${input.endereco}`,
    `Compradores: ${buyers}`,
    `Vendedores: ${sellers}`,
    `Valor do negócio: ${formatCurrencyWithCents(input.valor)}`,
    `Comissão geral: ${formatCurrencyWithCents(input.comissao)}`,
    `Forma de pagamento: ${input.formaPagamento}`,
    '',
    'Condições específicas:',
    input.condicoesEspecificas || 'Sem condições específicas cadastradas.',
    '',
    'Condições gerais:',
    ...GENERAL_CONDITIONS.map((condition, index) => `${index + 1}. ${condition}`),
  ].join('\n');

  return {
    title: 'Contrato de Compromisso de Compra e Venda',
    fileName: `ccv-${input.imovelRef || input.proposalId}.txt`,
    content,
    missingFields: collectCcvMissingFields(input),
  };
}

export interface CcvBuildResult {
  document: GeneratedDocument | null;
  error: string | null;
}

// Versão que nunca lança: o preview precisa degradar para uma mensagem
// amigável mesmo se a montagem falhar com dados inesperados.
export function buildCcvDocumentSafe(input: CcvDocumentInput | null): CcvBuildResult {
  if (!input) return { document: null, error: null };
  try {
    return { document: buildCcvDocument(input), error: null };
  } catch (err) {
    return {
      document: null,
      error: err instanceof Error ? err.message : 'Erro inesperado ao montar o documento.',
    };
  }
}

// Paginação determinística para o preview: o .txt não tem páginas físicas,
// então simulamos a impressão clássica de texto puro (80 colunas em fonte
// mono). Por ser uma grade de caracteres, a quebra calculada aqui é exata em
// relação ao render (a folha do preview tem 80ch de largura na mesma fonte).
export const DOCUMENT_PAGE_CHARS_PER_LINE = 80;
export const DOCUMENT_PAGE_LINES_PER_PAGE = 48;

export interface DocumentPage {
  number: number;
  lines: string[];
}

const wrapLine = (line: string, width: number): string[] => {
  const wrapped: string[] = [];
  let rest = line;
  while (rest.length > width) {
    const breakAt = rest.lastIndexOf(' ', width);
    if (breakAt <= 0) {
      // Palavra maior que a largura: quebra dura para não estourar a folha.
      wrapped.push(rest.slice(0, width));
      rest = rest.slice(width);
    } else {
      wrapped.push(rest.slice(0, breakAt));
      rest = rest.slice(breakAt + 1);
    }
  }
  if (rest || wrapped.length === 0) wrapped.push(rest);
  return wrapped;
};

export function paginateDocumentContent(
  content: string,
  options?: { charsPerLine?: number; linesPerPage?: number },
): DocumentPage[] {
  const charsPerLine = options?.charsPerLine ?? DOCUMENT_PAGE_CHARS_PER_LINE;
  const linesPerPage = options?.linesPerPage ?? DOCUMENT_PAGE_LINES_PER_PAGE;

  const lines = content.split('\n').flatMap((line) => wrapLine(line, charsPerLine));
  const pages: DocumentPage[] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push({ number: pages.length + 1, lines: lines.slice(index, index + linesPerPage) });
  }

  return pages.length > 0 ? pages : [{ number: 1, lines: [''] }];
}
