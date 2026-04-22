/**
 * 🔍 DIAGNÓSTICO COMPLETO DO SUPABASE
 * Script para analisar estrutura e dados reais das tabelas
 */

interface DiagnosticResult {
  success: boolean;
  timestamp: Date;
  tables: TableInfo[];
  leads: LeadAnalysis;
  rawData: any[];
  errors: string[];
}

interface TableInfo {
  name: string;
  rowCount: number;
  columns: string[];
  sampleData: any[];
}

interface LeadAnalysis {
  total: number;
  withConversations: number;
  withPropertyCodes: number;
  withoutPropertyCodes: number;
  conversationSamples: ConversationSample[];
  propertyCodeSamples: PropertyCodeSample[];
  missingFields: MissingFieldsAnalysis;
}

interface ConversationSample {
  id_lead: any;
  nome_lead: string;
  hasConversation: boolean;
  conversationLength: number;
  conversationPreview: string;
}

interface PropertyCodeSample {
  id_lead: any;
  nome_lead: string;
  codigo_imovel: any;
  isValid: boolean;
  issue: string;
}

interface MissingFieldsAnalysis {
  noName: number;
  noPhone: number;
  noOrigin: number;
  noCorretor: number;
  noPropertyCode: number;
  noConversation: number;
}

/**
 * Executar diagnóstico completo do Supabase
 */
export async function runSupabaseDiagnostic(): Promise<DiagnosticResult> {
  console.warn('⚠️ runSupabaseDiagnostic: Supabase removido. Diagnóstico desativado.');
  return {
    success: false,
    timestamp: new Date(),
    tables: [],
    leads: {
      total: 0,
      withConversations: 0,
      withPropertyCodes: 0,
      withoutPropertyCodes: 0,
      conversationSamples: [],
      propertyCodeSamples: [],
      missingFields: {
        noName: 0,
        noPhone: 0,
        noOrigin: 0,
        noCorretor: 0,
        noPropertyCode: 0,
        noConversation: 0
      }
    },
    rawData: [],
    errors: ['Supabase removido: diagnóstico desativado.']
  };
}

/**
 * Analisar dados de leads em detalhe
 */
function analyzeLeadsData(data: any[], result: DiagnosticResult) {

  result.leads.total = data.length;

  data.forEach((lead, index) => {
    // Análise de campos vazios
    if (!lead.nome_lead || lead.nome_lead.trim() === '') {
      result.leads.missingFields.noName++;
    }
    if (!lead.telefone || lead.telefone.trim() === '') {
      result.leads.missingFields.noPhone++;
    }
    if (!lead.origem_lead || lead.origem_lead.trim() === '') {
      result.leads.missingFields.noOrigin++;
    }
    if (!lead.corretor_responsavel || lead.corretor_responsavel.trim() === '') {
      result.leads.missingFields.noCorretor++;
    }
    if (!lead.codigo_imovel || lead.codigo_imovel.trim() === '') {
      result.leads.missingFields.noPropertyCode++;
    } else {
      result.leads.withPropertyCodes++;
    }
    if (!lead.Conversa || lead.Conversa.trim() === '') {
      result.leads.missingFields.noConversation++;
    } else {
      result.leads.withConversations++;
    }

    // Coletar amostras de conversas (primeiros 5 com conversa)
    if (lead.Conversa && lead.Conversa.trim() !== '' && result.leads.conversationSamples.length < 5) {
      result.leads.conversationSamples.push({
        id_lead: lead.id_lead,
        nome_lead: lead.nome_lead || 'Sem nome',
        hasConversation: true,
        conversationLength: lead.Conversa.length,
        conversationPreview: lead.Conversa.substring(0, 100) + (lead.Conversa.length > 100 ? '...' : '')
      });
    }

    // Coletar amostras de códigos de imóveis (primeiros 10)
    if (result.leads.propertyCodeSamples.length < 10) {
      const hasCode = lead.codigo_imovel && lead.codigo_imovel.trim() !== '';
      const isValidCode = hasCode && /[A-Za-z0-9]/.test(lead.codigo_imovel);
      
      result.leads.propertyCodeSamples.push({
        id_lead: lead.id_lead,
        nome_lead: lead.nome_lead || 'Sem nome',
        codigo_imovel: lead.codigo_imovel || null,
        isValid: isValidCode,
        issue: !hasCode ? 'Sem código' : !isValidCode ? 'Código inválido' : 'OK'
      });
    }
  });

  result.leads.withoutPropertyCodes = result.leads.total - result.leads.withPropertyCodes;
}

/**
 * Imprimir resumo do diagnóstico
 */
function printDiagnosticSummary(result: DiagnosticResult) {
  
  result.tables.forEach(table => {
  });


  if (result.leads.conversationSamples.length > 0) {
    result.leads.conversationSamples.forEach((sample, i) => {
    });
  }

  if (result.leads.propertyCodeSamples.length > 0) {
    result.leads.propertyCodeSamples.forEach((sample, i) => {
      const status = sample.isValid ? '✅' : '❌';
      const code = sample.codigo_imovel ? String(sample.codigo_imovel).substring(0, 15) : 'NULL';
    });
  }

  if (result.errors.length > 0) {
    result.errors.forEach((error, i) => {
    });
  }

}

/**
 * Exportar dados do diagnóstico em formato JSON
 */
export function exportDiagnosticReport(result: DiagnosticResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Hook para executar diagnóstico na inicialização
 */
export async function autoRunDiagnostic() {
  const result = await runSupabaseDiagnostic();
  
  // Salvar resultado no sessionStorage para análise posterior
  try {
    sessionStorage.setItem('supabase_diagnostic', exportDiagnosticReport(result));
  } catch (error) {
    console.warn('⚠️ Não foi possível salvar diagnóstico no sessionStorage');
  }
  
  return result;
}

