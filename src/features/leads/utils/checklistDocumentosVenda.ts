// Checklist de documentos para venda de imóvel, passado pelo jurídico.
//
// Cada item é marcado à mão na aba Certidões e a marcação fica no próprio negócio
// (proposals.transaction_form, chave de chaveDocumento). O `tipo` de cada item é a chave
// que o sistema de arquivos vai usar (documentos_cliente.tipo, item P4.7 do Plano Final):
// o anexo, a leitura da IA e a conferência do jurídico se penduram nele. Quando esse
// sistema vier, as marcações migram para lá e saem do transaction_form — um lugar só por
// dado. NÃO renomear `id` de bloco nem `tipo` depois que houver marcação ou arquivo salvo:
// o que já foi marcado ficaria órfão. O mesmo documento pedido a pessoa física e a empresa
// usa o mesmo tipo; o bloco diz de quem ele é.

export interface ItemChecklistDocumento {
  tipo: string;
  label: string;
}

export interface BlocoChecklistDocumentos {
  id: string;
  // Nome curto do bloco, usado no histórico e no nome acessível da caixinha.
  parte: string;
  titulo: string;
  descricao?: string;
  grupos: { subtitulo?: string; itens: ItemChecklistDocumento[] }[];
}

export interface SiteCertidao {
  certidao: string;
  // Fonte sem url (IPTU) aparece como texto: o site depende da prefeitura do imóvel.
  fontes: { orgao: string; url?: string }[];
  observacao?: string;
}

export const CHECKLIST_DOCUMENTOS_VENDA: BlocoChecklistDocumentos[] = [
  {
    id: 'imovel',
    parte: 'Imóvel',
    titulo: 'Documentos do Imóvel',
    descricao: 'Verifique se todos os documentos abaixo estão atualizados:',
    grupos: [
      {
        itens: [
          { tipo: 'matricula_atualizada', label: 'Matrícula atualizada do imóvel' },
          { tipo: 'certidao_onus_reais', label: 'Certidão de Ônus Reais' },
          { tipo: 'certidao_negativa_iptu', label: 'Certidão Negativa de Débitos de IPTU' },
          { tipo: 'carne_iptu', label: 'Carnê do IPTU do ano vigente' },
          {
            tipo: 'certidao_negativa_condominio',
            label: 'Certidão Negativa de Débitos Condominiais (quando houver condomínio)',
          },
          { tipo: 'escritura_publica', label: 'Escritura Pública do imóvel (quando houver)' },
          { tipo: 'habite_se', label: 'Habite-se (quando exigido ou em imóveis mais novos)' },
        ],
      },
    ],
  },
  {
    id: 'vendedor_pf',
    parte: 'Vendedor PF',
    titulo: 'Documentos do Vendedor (Pessoa Física)',
    grupos: [
      {
        subtitulo: 'Documentos pessoais',
        itens: [
          { tipo: 'rg_ou_cnh', label: 'RG ou CNH' },
          { tipo: 'cpf', label: 'CPF' },
          { tipo: 'certidao_nascimento_casamento', label: 'Certidão de nascimento ou casamento atualizada' },
          { tipo: 'pacto_antenupcial', label: 'Pacto antenupcial (se houver)' },
          { tipo: 'comprovante_residencia', label: 'Comprovante de residência' },
        ],
      },
      {
        subtitulo: 'Certidões obrigatórias',
        itens: [
          { tipo: 'certidao_justica_federal', label: 'Certidão da Justiça Federal' },
          { tipo: 'certidao_acoes_civeis', label: 'Certidão de Ações Cíveis' },
          { tipo: 'certidao_executivos_fiscais', label: 'Certidão de Executivos Fiscais' },
          {
            tipo: 'certidao_negativa_debitos_federais',
            label: 'Certidão Negativa de Débitos Federais (Receita Federal)',
          },
          { tipo: 'certidao_acoes_trabalhistas', label: 'Certidão de Ações Trabalhistas' },
          { tipo: 'certidao_protesto', label: 'Certidão dos Cartórios de Protesto' },
        ],
      },
    ],
  },
  {
    id: 'vendedor_pj',
    parte: 'Vendedor PJ',
    titulo: 'Se o Vendedor for Pessoa Jurídica (Empresa)',
    grupos: [
      {
        itens: [
          { tipo: 'cartao_cnpj', label: 'Cartão do CNPJ' },
          { tipo: 'contrato_social', label: 'Contrato Social e alterações contratuais' },
          { tipo: 'certidao_negativa_debitos_federais', label: 'Certidão Negativa de Débitos Federais' },
          { tipo: 'certidao_negativa_debitos_estaduais', label: 'Certidão Negativa de Débitos Estaduais' },
          { tipo: 'certidao_negativa_debitos_municipais', label: 'Certidão Negativa de Débitos Municipais' },
          { tipo: 'certidao_justica_federal', label: 'Certidão da Justiça Federal' },
          { tipo: 'certidao_justica_estadual', label: 'Certidão da Justiça Estadual' },
          { tipo: 'certidao_justica_trabalho', label: 'Certidão da Justiça do Trabalho' },
        ],
      },
    ],
  },
  {
    id: 'financiamento',
    parte: 'Financiamento',
    titulo: 'Quando a Compra for Financiada',
    grupos: [
      {
        itens: [
          { tipo: 'avaliacao_imovel', label: 'Avaliação do imóvel' },
          // Regra de validade, não um documento: no sistema de arquivos vira checagem de data.
          { tipo: 'certidoes_menos_30_dias', label: 'Certidões emitidas há menos de 30 dias' },
          {
            tipo: 'declaracoes_instituicao_financeira',
            label: 'Declarações e formulários específicos da instituição financeira',
          },
        ],
      },
    ],
  },
];

export const chaveDocumento = (blocoId: string, tipo: string) => `doc:${blocoId}:${tipo}`;

export const SITES_CERTIDOES: SiteCertidao[] = [
  {
    certidao: 'Matrícula Atualizada e Certidão de Ônus Reais',
    fontes: [{ orgao: 'Cartório de Registro de Imóveis de Jundiaí', url: 'https://www.registrodeimoveis.org.br/2rijundiai' }],
  },
  {
    certidao:
      'Certidão Negativa de Débitos Relativos aos Créditos Tributários Federais e à Dívida Ativa da União (Receita Federal / PGFN)',
    fontes: [
      {
        orgao: 'Regularidade Fiscal da Fazenda Nacional',
        url: 'https://www.gov.br/pt-br/servicos/emitir-certidao-de-regularidade-fiscal-perante-a-fazenda-nacional',
      },
    ],
  },
  {
    certidao: 'Consulta de Situação Cadastral do CPF',
    fontes: [
      {
        orgao: 'Receita Federal',
        url: 'https://servicos.receita.fazenda.gov.br/Servicos/CPF/ConsultaSituacao/ConsultaPublica.asp',
      },
    ],
    observacao:
      'Esta consulta verifica apenas a situação cadastral do CPF e não substitui a Certidão Negativa de Débitos Federais.',
  },
  {
    certidao: 'Certidão da Justiça Federal',
    fontes: [
      { orgao: 'Conselho da Justiça Federal (CJF)', url: 'https://certidao-unificada.cjf.jus.br/#/solicitacao-certidao' },
      { orgao: 'Alternativa para processos em São Paulo (TRF3)', url: 'https://web.trf3.jus.br/certidao-regional/' },
    ],
  },
  {
    certidao: 'Certidão Negativa de Débitos Trabalhistas (CNDT)',
    fontes: [{ orgao: 'Tribunal Superior do Trabalho (TST)', url: 'https://cndt-certidao.tst.jus.br/inicio.faces' }],
  },
  {
    certidao: 'Certidão de Ações Cíveis e Executivos Fiscais (Estado de São Paulo)',
    fontes: [
      {
        orgao: 'Tribunal de Justiça do Estado de São Paulo (TJSP)',
        url: 'https://esaj.tjsp.jus.br/sco/abrirCadastro.do?servico=810101',
      },
    ],
  },
  {
    certidao: 'Certidão de Protesto',
    fontes: [
      {
        orgao: 'Central Nacional de Protesto (CENPROT)',
        url: 'https://www.pesquisaprotesto.com.br/servico/consulta-documento',
      },
    ],
  },
  {
    certidao: 'Certidão Negativa de Débitos de IPTU',
    fontes: [{ orgao: 'Prefeitura Municipal onde o imóvel está localizado' }],
  },
  {
    certidao: 'Certidão Estadual de Débitos Tributários',
    fontes: [
      {
        orgao: 'Secretaria da Fazenda e Planejamento do Estado de São Paulo (SEFAZ-SP)',
        url: 'https://www10.fazenda.sp.gov.br/CertidaoNegativaDeb/Pages/EmissaoCertidaoNegativa.aspx',
      },
    ],
  },
];
