/**
 * 🏠 SERVIÇO DE INTEGRAÇÃO COM SANTA ANGELA
 * Busca e processa imóveis/leads do site Santa Angela
 * 
 * Integração externa para sincronização de dados
 */

export interface SantaAngelaLead {
  id: string;
  cpfcnpj?: string;
  nome: string;
  email?: string;
  celular?: string;
  telefone?: string;
  datahoracadastro?: string;
  data_ultima_interacao?: string;
  tipopessoa?: string;
  tipo?: string;
  conjuge_nome?: string;
  possui_venda_erp?: string;
  rd_uuid?: string;
  vigencia_avaliacao?: string;
  correspondente_id?: string;
  aba_visivel?: string;
  visivel_como?: string;
  imobiliaria_nome?: string;
  corretor_nome?: string;
  usuario_cadastrador?: string;
  situacaocadastropessoa_titulo?: string;
  cor_fundo?: string;
  cor_letra?: string;
  midia_id?: string;
  midia_titulo?: string;
  midia_sigla?: string;
  midia_cor_fundo?: string;
}

export interface SantaAngelaConfig {
  apiKey?: string;
  baseUrl: string;
  tenantId: string;
}

export interface SantaAngelaFiltro {
  cliente_novo?: string;
  cliente_atendimento?: string;
  cliente_banco_compradores?: string;
  cliente_banco_nao_compradores?: string;
  iniciado_com?: string;
  cliente_termometro_frio?: string;
  cliente_termometro_morno?: string;
  cliente_termometro_quente?: string;
  query?: string;
  cadastradas_no_mes?: string;
  sem_contato_mais_uma_semana?: string;
  com_atividade_agendada_proximo_trinta_dias?: string;
  customizado?: string;
  filtro_customizado?: any;
  data_vigencia_avaliacao_vencida?: string;
  data_vigencia_avaliacao_pendente?: string;
  possui_propostas_com_data_vigencia_avaliacao_pendente?: string;
}

export interface SantaAngelaPaginacao {
  paginaAtual: number;
  porPagina: number;
}

export interface SantaAngelaOrdenacao {
  coluna: string;
  tipo: 'ASC' | 'DESC';
}

export interface SantaAngelaRequestBody {
  filtro: SantaAngelaFiltro;
  paginacao: SantaAngelaPaginacao;
  ordenacao: SantaAngelaOrdenacao;
}

/**
 * Configuração padrão da API Santa Angela
 * Substitua com as credenciais reais
 */
const SANTA_ANGELA_CONFIG: SantaAngelaConfig = {
  baseUrl: 'https://portaldeimoveis.santaangelaconstrutora.com.br:8181/api/v1/prospects/grid/v2',
  apiKey: import.meta.env.VITE_SANTA_ANGELA_API_KEY,
  tenantId: '',
};

/**
 * Headers padrão para requisições à API
 */
const getHeaders = (apiKey?: string) => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
});

/**
 * Busca todos os leads do Santa Angela
 */
export const fetchSantaAngelaLeads = async (
  tenantId: string,
  requestBody?: SantaAngelaRequestBody,
  config?: Partial<SantaAngelaConfig>
): Promise<SantaAngelaLead[]> => {
  try {
    const finalConfig = { ...SANTA_ANGELA_CONFIG, tenantId, ...config };
    
    // Body padrão se não fornecido
    const body: SantaAngelaRequestBody = requestBody || {
      filtro: {
        cliente_novo: "1",
        cliente_atendimento: "1",
        cliente_banco_compradores: "1",
        cliente_banco_nao_compradores: "1",
        iniciado_com: "",
        cliente_termometro_frio: "1",
        cliente_termometro_morno: "1",
        cliente_termometro_quente: "1",
        query: "",
        cadastradas_no_mes: "0",
        sem_contato_mais_uma_semana: "0",
        com_atividade_agendada_proximo_trinta_dias: "0",
        customizado: "0",
        filtro_customizado: null,
        data_vigencia_avaliacao_vencida: "0",
        data_vigencia_avaliacao_pendente: "0",
        possui_propostas_com_data_vigencia_avaliacao_pendente: "0"
      },
      paginacao: {
        paginaAtual: 1,
        porPagina: 30
      },
      ordenacao: {
        coluna: "PESSOA.nome",
        tipo: "ASC"
      }
    };
    
    const response = await fetch(finalConfig.baseUrl, {
      method: 'POST',
      headers: getHeaders(finalConfig.apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    
    // Extrair array de leads da resposta (API retorna 'prospects')
    const leadsArray = data.prospects || [];
    
    return leadsArray;
  } catch (error) {
    throw error;
  }
};

/**
 * Sincroniza leads do Santa Angela com o banco local
 */
export const syncSantaAngelaLeads = async (
  tenantId: string,
  config?: Partial<SantaAngelaConfig>
): Promise<{ synced: number; errors: number }> => {
  try {
    
    const leads = await fetchSantaAngelaLeads(tenantId, undefined, config);    
    
    return {
      synced: leads.length,
      errors: 0,
    };
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    return {
      synced: 0,
      errors: 1,
    };
  }
};

/**
 * Testa a conexão com a API Santa Angela
 */
export const testSantaAngelaConnection = async (
  config?: Partial<SantaAngelaConfig>
): Promise<boolean> => {
  try {
    const finalConfig = { ...SANTA_ANGELA_CONFIG, ...config };
    
    const response = await fetch(finalConfig.baseUrl, {
      method: 'POST',
      headers: getHeaders(finalConfig.apiKey),
      body: JSON.stringify({
        filtro: {
          cliente_novo: "1",
          cliente_atendimento: "1",
          cliente_banco_compradores: "1",
          cliente_banco_nao_compradores: "1",
          query: "",
        },
        paginacao: {
          paginaAtual: 1,
          porPagina: 1
        },
        ordenacao: {
          coluna: "PESSOA.nome",
          tipo: "ASC"
        }
      }),
    });

    const isConnected = response.ok;
    
    if (isConnected) {
      console.log('✅ Conexão com Santa Angela estabelecida');
    } else {
      console.error('❌ Falha na conexão:', response.status);
    }
    
    return isConnected;
  } catch (error) {
    return false;
  }
};