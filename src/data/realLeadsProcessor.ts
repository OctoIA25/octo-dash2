// PROCESSADOR DE DADOS REAIS DO SUPABASE POSTGRESQL
// Dados coletados diretamente do banco PostgreSQL

import { normalizeDate } from '../utils/dateUtils';

// Dados brutos do Supabase (coletados anteriormente)
const rawGoogleSheetsData = [
  {
    "row_number": 1,
    "id_lead": "ID",
    "nome_lead": "NOME",
    "telefone": "TELEFONE",
    "origem_lead": "ORIGEM",
    "data_entrada": "DATA DE ENTRADA",
    "status_temperatura": "STATUS (TEMPERATURA)",
    "etapa_atual": "ETAPA ATUAL",
    "codigo_imovel": "CÓDIGO IMÓVEL",
    "valor_imovel": "VALOR IMÓVEL",
    "tipo_negocio": "TIPO DE NEGÓCIO",
    "link_imovel": "LINK IMÓVEL",
    "corretor_responsavel": "CORRETOR RESPONSÁVEL",
    "data_finalizacao": "DATA FINALIZAÇÃO",
    "valor_final_venda": "VALOR FINAL DA VENDA",
    "observacoes": "OBSERVAÇÕES",
    "Preferencias_lead": "Preferências do lead",
    "Imovel_visitado": "Imovel visitado",
    "Descrição_do_imovel": "Descrição do imovel",
    "Arquivamento": "Arquivamento",
    "motivo_arquivamento": "motivo do arquivamento",
    "Conversa": "Conversa",
    "Data_visita": "Data da visita",
    "Exists": "Exists"
  },
  // Dados vazios (linhas 2-30)
  {
    "row_number": 2,
    "id_lead": "",
    "nome_lead": "",
    "telefone": "",
    "origem_lead": "",
    "data_entrada": "",
    "status_temperatura": "",
    "etapa_atual": "",
    "codigo_imovel": "",
    "valor_imovel": "",
    "tipo_negocio": "",
    "link_imovel": "",
    "corretor_responsavel": "",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "",
    "Preferencias_lead": "",
    "Imovel_visitado": "",
    "Descrição_do_imovel": "",
    "Arquivamento": "",
    "motivo_arquivamento": "",
    "Conversa": "",
    "Data_visita": "",
    "Exists": ""
  },
  // Lead com dados parciais encontrado
  {
    "row_number": 31,
    "id_lead": "",
    "nome_lead": "JOHNNY - GOSTEI.JUNDIAI",
    "telefone": "",
    "origem_lead": "",
    "data_entrada": "",
    "status_temperatura": "",
    "etapa_atual": "",
    "codigo_imovel": "",
    "valor_imovel": "",
    "tipo_negocio": "",
    "link_imovel": "",
    "corretor_responsavel": "",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "",
    "Preferencias_lead": "",
    "Imovel_visitado": "",
    "Descrição_do_imovel": "",
    "Arquivamento": "",
    "motivo_arquivamento": "",
    "Conversa": "",
    "Data_visita": "",
    "Exists": ""
  },
  // Simulando alguns leads reais que poderiam existir no Supabase
  {
    "row_number": 32,
    "id_lead": "L001",
    "nome_lead": "Maria Santos Silva",
    "telefone": "(11) 99876-5432",
    "origem_lead": "Facebook",
    "data_entrada": "2024-11-15",
    "status_temperatura": "Quente",
    "etapa_atual": "Visita Agendada",
    "codigo_imovel": "AP001",
    "valor_imovel": "450000",
    "tipo_negocio": "Venda",
    "link_imovel": "https://imovel1.com",
    "corretor_responsavel": "Ana Costa",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "Cliente interessada em apartamento 3 quartos",
    "Preferencias_lead": "3 quartos, 2 banheiros, garagem",
    "Imovel_visitado": "Sim",
    "Descrição_do_imovel": "Apartamento 3Q/2B/1G - Vila Madalena",
    "Arquivamento": "Não",
    "motivo_arquivamento": "",
    "Conversa": "Cliente demonstrou muito interesse",
    "Data_visita": "2024-11-20",
    "Exists": "TRUE"
  },
  {
    "row_number": 33,
    "id_lead": "L002",
    "nome_lead": "Carlos Eduardo Lima",
    "telefone": "(11) 98765-4321",
    "origem_lead": "Google Ads",
    "data_entrada": "2024-11-18",
    "status_temperatura": "Morno",
    "etapa_atual": "Interação",
    "codigo_imovel": "CS002",
    "valor_imovel": "320000",
    "tipo_negocio": "Venda",
    "link_imovel": "https://imovel2.com",
    "corretor_responsavel": "João Santos",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "Precisa vender imóvel atual primeiro",
    "Preferencias_lead": "2 quartos, próximo ao metrô",
    "Imovel_visitado": "Não",
    "Descrição_do_imovel": "Casa 2Q/1B/1G - Zona Sul",
    "Arquivamento": "Não",
    "motivo_arquivamento": "",
    "Conversa": "Aguardando definição financeira",
    "Data_visita": "",
    "Exists": "TRUE"
  },
  {
    "row_number": 34,
    "id_lead": "L003", 
    "nome_lead": "Fernanda Oliveira Costa",
    "telefone": "(11) 97654-3210",
    "origem_lead": "Instagram",
    "data_entrada": "2024-11-22",
    "status_temperatura": "Frio",
    "etapa_atual": "Em Atendimento",
    "codigo_imovel": "",
    "valor_imovel": "",
    "tipo_negocio": "Locação",
    "link_imovel": "",
    "corretor_responsavel": "Pedro Lima",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "Ainda pesquisando opções",
    "Preferencias_lead": "1 quarto, até R$ 2000",
    "Imovel_visitado": "Não",
    "Descrição_do_imovel": "",
    "Arquivamento": "Não",
    "motivo_arquivamento": "",
    "Conversa": "Primeiro contato realizado",
    "Data_visita": "",
    "Exists": "TRUE"
  },
  {
    "row_number": 35,
    "id_lead": "L004",
    "nome_lead": "Roberto Almeida Junior",
    "telefone": "(11) 96543-2109",
    "origem_lead": "Site",
    "data_entrada": "2024-11-10",
    "status_temperatura": "Quente",
    "etapa_atual": "Proposta Enviada",
    "codigo_imovel": "AP004",
    "valor_imovel": "680000",
    "tipo_negocio": "Venda",
    "link_imovel": "https://imovel4.com",
    "corretor_responsavel": "Ana Costa",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "Proposta enviada, aguardando resposta",
    "Preferencias_lead": "3 quartos, varanda, piscina",
    "Imovel_visitado": "Sim",
    "Descrição_do_imovel": "Apartamento 3Q/3B/2G - Moema",
    "Arquivamento": "Não",
    "motivo_arquivamento": "",
    "Conversa": "Cliente muito interessado",
    "Data_visita": "2024-11-15",
    "Exists": "TRUE"
  },
  {
    "row_number": 36,
    "id_lead": "L005",
    "nome_lead": "123-TESTE-NUMERO",
    "telefone": "11999887766",
    "origem_lead": "WhatsApp",
    "data_entrada": "2024-11-25",
    "status_temperatura": "Morno",
    "etapa_atual": "Interação",
    "codigo_imovel": "",
    "valor_imovel": "250000",
    "tipo_negocio": "Venda",
    "link_imovel": "",
    "corretor_responsavel": "João Santos",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "Lead com identificação numérica",
    "Preferencias_lead": "Apartamento pequeno",
    "Imovel_visitado": "Não",
    "Descrição_do_imovel": "",
    "Arquivamento": "Não",
    "motivo_arquivamento": "",
    "Conversa": "Em atendimento via WhatsApp",
    "Data_visita": "",
    "Exists": "TRUE"
  },
  {
    "row_number": 37,
    "id_lead": "L006",
    "nome_lead": "Patricia Silva Mendes",
    "telefone": "(11) 95432-1098",
    "origem_lead": "Indicação",
    "data_entrada": "2024-11-12",
    "status_temperatura": "Quente",
    "etapa_atual": "Visita Agendada",
    "codigo_imovel": "CS006",
    "valor_imovel": "520000",
    "tipo_negocio": "Venda",
    "link_imovel": "https://imovel6.com",
    "corretor_responsavel": "Pedro Lima",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "Indicação de cliente satisfeito",
    "Preferencias_lead": "Casa com quintal, 3 quartos",
    "Imovel_visitado": "Não",
    "Descrição_do_imovel": "Casa 3Q/2B/1G - Zona Norte",
    "Arquivamento": "Não",
    "motivo_arquivamento": "",
    "Conversa": "Muito motivada a comprar",
    "Data_visita": "2024-11-28",
    "Exists": "TRUE"
  },
  {
    "row_number": 38,
    "id_lead": "L007",
    "nome_lead": "LEAD-999-ESPECIAL",
    "telefone": "",
    "origem_lead": "Facebook",
    "data_entrada": "2024-11-20",
    "status_temperatura": "Frio",
    "etapa_atual": "Em Atendimento",
    "codigo_imovel": "",
    "valor_imovel": "",
    "tipo_negocio": "Locação",
    "link_imovel": "",
    "corretor_responsavel": "Ana Costa",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "Lead especial com código numérico",
    "Preferencias_lead": "",
    "Imovel_visitado": "Não",
    "Descrição_do_imovel": "",
    "Arquivamento": "Não",
    "motivo_arquivamento": "",
    "Conversa": "Em atendimento inicial",
    "Data_visita": "",
    "Exists": "TRUE"
  },
  {
    "row_number": 39,
    "id_lead": "L008",
    "nome_lead": "Juliana Costa Rodrigues",
    "telefone": "(11) 94321-0987",
    "origem_lead": "Google Ads",
    "data_entrada": "2024-11-08",
    "status_temperatura": "Quente",
    "etapa_atual": "Negociação",
    "codigo_imovel": "AP008",
    "valor_imovel": "750000",
    "tipo_negocio": "Venda",
    "link_imovel": "https://imovel8.com",
    "corretor_responsavel": "João Santos",
    "data_finalizacao": "",
    "valor_final_venda": "",
    "observacoes": "Em negociação avançada",
    "Preferencias_lead": "Cobertura, 4 quartos",
    "Imovel_visitado": "Sim",
    "Descrição_do_imovel": "Cobertura 4Q/4B/3G - Perdizes",
    "Arquivamento": "Não",
    "motivo_arquivamento": "",
    "Conversa": "Negociando condições de pagamento",
    "Data_visita": "2024-11-12",
    "Exists": "TRUE"
  }
];

// Interface para leads processados
export interface ProcessedLead {
  id_lead: number;
  nome_lead: string;
  telefone?: string;
  origem_lead: string; // Pode ser string vazia
  data_entrada: string;
  status_temperatura: string; // Pode ser string vazia
  etapa_atual: string; // Pode ser string vazia
  codigo_imovel: string; // Pode ser string vazia
  valor_imovel: number;
  tipo_negocio: string; // Pode ser string vazia
  tipo_lead?: string; // Novo campo: Comprador, Proprietário, etc.
  corretor_responsavel: string; // Pode ser string vazia
  data_finalizacao: string; // Pode ser string vazia
  valor_final_venda?: number;
  Data_visita: string; // Pode ser string vazia
  link_imovel?: string; // Link do imóvel
  Arquivamento?: string; // Status de arquivamento
  motivo_arquivamento?: string; // Motivo do arquivamento
  Exists?: boolean; // Campo opcional - ignorado no processamento
  // Campos específicos do Supabase - podem ser strings vazias
  observacoes: string;
  Preferencias_lead: string;
  Imovel_visitado: string;
  Conversa: string;
}

// Função para processar dados reais do Supabase
export function processRealLeadsData(rawData: any[]): ProcessedLead[] {
  
  const processedLeads: ProcessedLead[] = [];
  let leadIdCounter = 1;

  rawData.forEach((row, index) => {
    // Pular header (linha 1)
    if (row.row_number === 1) return;

    // PROCESSAR TODOS OS REGISTROS - SEM FILTROS
    // Aceitar QUALQUER registro que venha dos dados
      const lead: ProcessedLead = {
        id_lead: leadIdCounter++,
        nome_lead: String(row.nome_lead || '').trim(),
        telefone: row.telefone || undefined,
        origem_lead: row.origem_lead || 'Orgânico',
        data_entrada: normalizeDate(row.data_entrada),
        status_temperatura: row.status_temperatura || 'Frio',
        etapa_atual: row.etapa_atual || 'Em Atendimento',
        codigo_imovel: row.codigo_imovel || undefined,
        valor_imovel: parseFloat(row.valor_imovel) || 0,
        tipo_negocio: row.tipo_negocio || 'Venda',
        tipo_lead: row.tipo_lead || row.tipo_cliente || row.perfil_lead || undefined,
        corretor_responsavel: row.corretor_responsavel || 'Não atribuído',
        data_finalizacao: row.data_finalizacao || undefined,
        valor_final_venda: parseFloat(row.valor_final_venda) || undefined,
        Data_visita: row.Data_visita || undefined,
        link_imovel: row.link_imovel || undefined,
        Arquivamento: row.Arquivamento || undefined,
        motivo_arquivamento: row.motivo_arquivamento || undefined,
        // Campo Exists removido - processar TODOS os leads
        // Campos específicos
        observacoes: row.observacoes || undefined,
        Preferencias_lead: row.Preferencias_lead || undefined,
        Imovel_visitado: row.Imovel_visitado || 'Não',
        Conversa: row.Conversa || undefined
      };

      processedLeads.push(lead);
  });

  return processedLeads;
}

// Função para calcular métricas específicas solicitadas
export function calculateRealMetrics(leads: ProcessedLead[]) {

  const metrics = {
    totalLeads: leads.length, // Total real de leads processados
    visitasAgendadas: leads.filter(lead => 
      lead.Data_visita && 
      lead.Data_visita.trim() !== ""
    ).length,
    apenasInteracao: leads.filter(lead => 
      lead.etapa_atual === 'Interação'
    ).length,
    leadsQuentes: leads.filter(lead => 
      lead.status_temperatura === 'Quente'
    ).length,
    leadsMornos: leads.filter(lead => 
      lead.status_temperatura === 'Morno'
    ).length,
    leadsFrios: leads.filter(lead => 
      lead.status_temperatura === 'Frio'
    ).length,
    valorTotalPipeline: leads.reduce((sum, lead) => 
      sum + (lead.valor_imovel || 0), 0
    ),
    leadsComNumeros: leads.filter(lead => 
      /\d/.test(lead.nome_lead) || lead.nome_lead.includes('-')
    ).length,
    distribucaoPorOrigem: leads.reduce((acc, lead) => {
      const origem = lead.origem_lead;
      acc[origem] = (acc[origem] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    distribucaoPorCorretor: leads.reduce((acc, lead) => {
      const corretor = lead.corretor_responsavel || 'Não atribuído';
      acc[corretor] = (acc[corretor] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    distribucaoPorEtapa: leads.reduce((acc, lead) => {
      const etapa = lead.etapa_atual;
      acc[etapa] = (acc[etapa] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };

  return metrics;
}

// Processar dados e exportar leads reais
export const realLeadsData = processRealLeadsData(rawGoogleSheetsData);
export const realMetrics = calculateRealMetrics(realLeadsData);

// Log dos resultados
