/**
 * Serviço para enviar mensagens para o webhook de Agentes de IA
 * 
 * 🎯 FUNCIONALIDADES PRINCIPAIS:
 * 
 * 1. WEBHOOK DUAL: 
 *    - Admin: ELAINE_ADMIN_WEBHOOK_URL
 *    - Corretor: ELAINE_CORRETOR_WEBHOOK_URL
 * 
 * 2. DADOS ENVIADOS NO PAYLOAD:
 *    - corretor_nome: Nome do corretor (sempre presente quando disponível)
 *    - tipo_mbti: Tipo MBTI em UPPERCASE (ex: "INTJ-A", "ENFP-T")
 *    - disc: Análise completa do DISC em texto formatado
 *    - eneagrama: Análise completa do Eneagrama em texto formatado
 *    - mbti: Análise completa do MBTI em texto formatado
 * 
 * 3. GARANTIAS:
 *    ✅ Corretor logado: TODOS os dados (DISC, Eneagrama, MBTI) são buscados automaticamente do Supabase
 *    ✅ Admin: Usa dados dos corretores selecionados nos seletores
 *    ✅ Tipo MBTI SEMPRE em UPPERCASE (toUpperCase())
 *    ✅ Análises textuais enriquecidas automaticamente
 */

import { getDailySessionId } from '@/utils/snowflakeId';

export interface AgentMessage {
  empresa: string;
  usuario: string;
  id_usuario: string;
  agente: string;
  mensagem: string;
  corretor_nome?: string;   // Nome do corretor selecionado para análise
  tipo_mbti?: string;       // Tipo MBTI do corretor em UPPERCASE (ex: ENFP-T, INTJ-A)
  disc?: string;            // Análise completa do teste DISC (Dominância, Influência, Estabilidade, Conformidade) em texto
  eneagrama?: string;       // Análise completa do teste Eneagrama (9 tipos de personalidade) em texto
  mbti?: string;            // Análise completa do teste MBTI (16 tipos de personalidade) em texto
  Resultado_Usuario?: string; // Resultados próprios anexados pelo admin/owner
}

/**
 * URLs DOS WEBHOOKS - IMUTÁVEIS E PADRÃO
 */
const DEFAULT_WEBHOOK_URL = 'https://webhook.octoia.org/webhook/650caf33-df01-426f-ab35-728fe16d3b57';
const ELAINE_ADMIN_WEBHOOK_URL = 'https://webhook.octoia.org/webhook/Elaine650caf33-df01-426f-ab35-728f78ds6fd8sf6sd';
const ELAINE_CORRETOR_WEBHOOK_URL = 'https://webhook.octoia.org/webhook/Elaine-Corretores8b8f28b5-1a09-4252-acfb-96d175ea351a';

/**
 * Obtém a URL do webhook - SEMPRE retorna a URL padrão
 * Mantido por compatibilidade, mas agora SEMPRE retorna a URL fixa
 */
export const getWebhookUrl = (): string => {
  // SEMPRE retornar a URL padrão - IMUTÁVEL
  return DEFAULT_WEBHOOK_URL;
};

/**
 * Salva a URL do webhook nas configurações
 * Mantido por compatibilidade com código existente, mas não altera o comportamento
 * A URL usada será SEMPRE a DEFAULT_WEBHOOK_URL
 */
export const saveWebhookUrl = (url: string): void => {
  // Mantém compatibilidade mas não afeta a URL real usada
  localStorage.setItem('agent_webhook_url', url);
};

/**
 * Envia uma mensagem para o webhook configurado
 * SEMPRE usa a URL padrão DEFAULT_WEBHOOK_URL (imutável)
 */
export const sendMessageToAgent = async (
  agentName: string,
  message: string,
  userName: string
): Promise<{ success: boolean; error?: string; response?: string }> => {
  // SEMPRE usar a URL padrão - imutável
  const webhookUrl = DEFAULT_WEBHOOK_URL;
  

  const payload: AgentMessage = {
    empresa: 'Imobiliária Japi',
    usuario: userName,
    id_usuario: getDailySessionId(),
    agente: agentName,
    mensagem: message
  };

  try {

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Tentar ler a resposta como texto primeiro
    const contentType = response.headers.get('content-type');
    let data: any;
    let agentResponse = '';

    try {
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Se não for JSON, tentar como texto
        const textData = await response.text();
        
        // Tentar parsear como JSON
        try {
          data = JSON.parse(textData);
        } catch {
          // Se não for JSON válido, usar como texto direto
          agentResponse = textData;
          return {
            success: true,
            response: agentResponse
          };
        }
      }
    } catch (error) {
      console.error('Erro ao processar resposta:', error);
      throw error;
    }

    // Extrair a resposta do agente de diferentes formatos possíveis
    if (typeof data === 'string') {
      agentResponse = data;
    } else if (data.response) {
      agentResponse = data.response;
    } else if (data.message) {
      agentResponse = data.message;
    } else if (data.text) {
      agentResponse = data.text;
    } else if (data.resposta) {
      agentResponse = data.resposta;
    } else if (data.content) {
      agentResponse = data.content;
    } else if (data.reply) {
      agentResponse = data.reply;
    } else if (data.output) {
      agentResponse = data.output;
    } else if (data.resultado) {
      agentResponse = data.resultado;
    } else if (data.data) {
      // Verificar se data.data tem alguma propriedade útil
      if (typeof data.data === 'string') {
        agentResponse = data.data;
      } else if (data.data.message || data.data.response) {
        agentResponse = data.data.message || data.data.response;
      } else {
        agentResponse = JSON.stringify(data.data);
      }
    } else {
      // Se não encontrar nenhum campo conhecido, usar o JSON completo formatado
      agentResponse = JSON.stringify(data, null, 2);
    }


    return {
      success: true,
      response: agentResponse
    };
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem para webhook:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido ao enviar mensagem'
    };
  }
};

/**
 * Interface para dados comportamentais do corretor (dados brutos)
 */
export interface DadosComportamentais {
  disc?: {
    tipoPrincipal: string;
    percentuais: { D: number; I: number; S: number; C: number };
    perfisDominantes?: string[];
  };
  eneagrama?: {
    tipoPrincipal: number;
    scores: { [key: number]: number };
  };
  mbti?: {
    tipo: string;
    percentuais: { [key: string]: number };
  };
}

/**
 * Interface para análises completas (enviadas para Elaine)
 */
export interface AnaliseComportamentalCompleta {
  disc?: string;      // Análise textual completa do DISC
  eneagrama?: string; // Análise textual completa do Eneagrama
  mbti?: string;      // Análise textual completa do MBTI
}

/**
 * Envia mensagem para a Agente Elaine com dados comportamentais do corretor
 * Usa webhook diferente baseado no tipo de usuário:
 * - Administrador: ELAINE_ADMIN_WEBHOOK_URL
 * - Corretor: ELAINE_CORRETOR_WEBHOOK_URL
 * Gera análises textuais completas baseadas nos dados dos testes
 */
export const sendMessageToElaine = async (
  message: string,
  userName: string,
  dadosComportamentais?: DadosComportamentais,
  corretorNome?: string,
  userRole?: 'gestao' | 'corretor',
  tipoMBTI?: string,
  resultadoUsuario?: string
): Promise<{ success: boolean; error?: string; response?: string }> => {
  // Escolher webhook baseado no tipo de usuário
  const webhookUrl = userRole === 'corretor' 
    ? ELAINE_CORRETOR_WEBHOOK_URL 
    : ELAINE_ADMIN_WEBHOOK_URL;
  
  
  if (corretorNome) {
  }
  if (tipoMBTI) {
  }
  if (resultadoUsuario) {
  }

  // Construir payload com dados separados
  const payload: AgentMessage = {
    empresa: 'Imobiliária Japi',
    usuario: userName,
    id_usuario: getDailySessionId(),
    agente: 'Elaine',
    mensagem: message || '', // Garantir que sempre tenha uma string (mesmo que vazia)
    corretor_nome: corretorNome, // SEMPRE incluir o nome do corretor quando disponível
    tipo_mbti: tipoMBTI ? tipoMBTI.toUpperCase() : undefined, // Incluir tipo MBTI SEMPRE em UPPERCASE
    Resultado_Usuario: resultadoUsuario || undefined
  };
  

  // Gerar análises completas dos dados comportamentais
  if (dadosComportamentais) {
    // Importar dinâmicamente as funções de análise
    const {
      gerarAnaliseDISC,
      gerarAnaliseEneagrama,
      gerarAnaliseMBTI
    } = await import('@/features/corretores/services/personalityAnalysisService');

    const analises: {
      disc?: any;
      eneagrama?: any;
      mbti?: any;
    } = {};

    // Gerar análise DISC
    if (dadosComportamentais.disc) {
      analises.disc = gerarAnaliseDISC(
        dadosComportamentais.disc.tipoPrincipal,
        dadosComportamentais.disc.percentuais,
        dadosComportamentais.disc.perfisDominantes
      );
      
      // Formatar análise DISC como texto estruturado
      payload.disc = `
DISC:

PERFIL PRINCIPAL: ${analises.disc.nomePerfil} (${analises.disc.perfilPrincipal})

DESCRIÇÃO:
${analises.disc.descricao}

CARACTERÍSTICAS:
${analises.disc.caracteristicas}

PONTOS FORTES:
${analises.disc.pontosFortes}

DISTRIBUIÇÃO PERCENTUAL:
- D (Dominância): ${analises.disc.percentuais.D.percentual}
- I (Influência): ${analises.disc.percentuais.I.percentual}
- S (Estabilidade): ${analises.disc.percentuais.S.percentual}
- C (Conformidade): ${analises.disc.percentuais.C.percentual}

PERFIS DOMINANTES:
${analises.disc.perfisDominantes.map((p: any) => `- ${p.nome} (${p.percentual})`).join('\n')}

INTERPRETAÇÃO E IMPLICAÇÕES:
${analises.disc.interpretacao}
`.trim();
      
    }
    
    // Gerar análise Eneagrama
    if (dadosComportamentais.eneagrama) {
      analises.eneagrama = gerarAnaliseEneagrama(
        dadosComportamentais.eneagrama.tipoPrincipal,
        dadosComportamentais.eneagrama.scores
      );
      
      // Formatar análise Eneagrama como texto estruturado
      payload.eneagrama = `
ENEAGRAMA:

TIPO: ${analises.eneagrama.emoji} Tipo ${analises.eneagrama.tipoPrincipal} - ${analises.eneagrama.nome}

DESCRIÇÃO BREVE:
${analises.eneagrama.descricaoBreve}

CARACTERÍSTICAS:
${analises.eneagrama.caracteristicas}

MOTIVAÇÃO CENTRAL:
${analises.eneagrama.motivacaoCentral}

MEDO BÁSICO:
${analises.eneagrama.medoBasico}

PONTOS FORTES:
${analises.eneagrama.pontosFortes}

PONTOS DE ATENÇÃO:
${analises.eneagrama.pontosDeAtencao}

DIREÇÃO DE CRESCIMENTO:
${analises.eneagrama.direcaoDeCrescimento}

DIREÇÃO DE ESTRESSE:
${analises.eneagrama.direcaoDeEstresse}

INTERPRETAÇÃO E IMPLICAÇÕES:
${analises.eneagrama.interpretacao}
`.trim();
      
    }
    
    // Gerar análise MBTI
    if (dadosComportamentais.mbti) {
      analises.mbti = gerarAnaliseMBTI(
        dadosComportamentais.mbti.tipo,
        dadosComportamentais.mbti.percentuais
      );
      
      // Formatar análise MBTI como texto estruturado
      payload.mbti = `
MBTI:

TIPO: ${analises.mbti.tipo} - ${analises.mbti.categoria}

DESCRIÇÃO:
${analises.mbti.descricao}

FUNÇÕES COGNITIVAS:
${analises.mbti.funcoesCognitivas}

ESTILO DE COMUNICAÇÃO:
${analises.mbti.estiloComunicacao}

TOMADA DE DECISÃO:
${analises.mbti.tomadaDecisao}

GESTÃO DE ENERGIA:
${analises.mbti.gestaoEnergia}

PONTOS FORTES:
${analises.mbti.pontosFortes}

DESAFIOS:
${analises.mbti.desafios}

DIMENSÕES:
- Mind (Mente): ${analises.mbti.percentuais.Mind.valor}% - ${analises.mbti.percentuais.Mind.categoria}
- Energy (Energia): ${analises.mbti.percentuais.Energy.valor}% - ${analises.mbti.percentuais.Energy.categoria}
- Nature (Natureza): ${analises.mbti.percentuais.Nature.valor}% - ${analises.mbti.percentuais.Nature.categoria}
- Tactics (Táticas): ${analises.mbti.percentuais.Tactics.valor}% - ${analises.mbti.percentuais.Tactics.categoria}
- Identity (Identidade): ${analises.mbti.percentuais.Identity.valor}% - ${analises.mbti.percentuais.Identity.categoria}

INTERPRETAÇÃO E IMPLICAÇÕES:
${analises.mbti.interpretacao}
`.trim();
      
    }
  }

  try {

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Tentar ler a resposta
    const contentType = response.headers.get('content-type');
    let data: any;
    let agentResponse = '';

    try {
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textData = await response.text();
        
        try {
          data = JSON.parse(textData);
        } catch {
          agentResponse = textData;
          return {
            success: true,
            response: agentResponse
          };
        }
      }
    } catch (error) {
      console.error('Erro ao processar resposta:', error);
      throw error;
    }

    // Extrair a resposta do agente
    if (typeof data === 'string') {
      agentResponse = data;
    } else if (data.response) {
      agentResponse = data.response;
    } else if (data.message) {
      agentResponse = data.message;
    } else if (data.text) {
      agentResponse = data.text;
    } else if (data.resposta) {
      agentResponse = data.resposta;
    } else if (data.content) {
      agentResponse = data.content;
    } else if (data.reply) {
      agentResponse = data.reply;
    } else if (data.output) {
      agentResponse = data.output;
    } else if (data.resultado) {
      agentResponse = data.resultado;
    } else if (data.data) {
      if (typeof data.data === 'string') {
        agentResponse = data.data;
      } else if (data.data.message || data.data.response) {
        agentResponse = data.data.message || data.data.response;
      } else {
        agentResponse = JSON.stringify(data.data);
      }
    } else {
      agentResponse = JSON.stringify(data, null, 2);
    }


    return {
      success: true,
      response: agentResponse
    };
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem para Elaine:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido ao enviar mensagem'
    };
  }
};

/**
 * Retorna a URL do webhook da Elaine baseado no tipo de usuário
 */
export const getElaineWebhookUrl = (userRole?: 'gestao' | 'corretor'): string => {
  return userRole === 'corretor' 
    ? ELAINE_CORRETOR_WEBHOOK_URL 
    : ELAINE_ADMIN_WEBHOOK_URL;
};

/**
 * Testa a conexão com o webhook
 */
export const testWebhookConnection = async (url: string): Promise<{ success: boolean; error?: string }> => {
  const testPayload: AgentMessage = {
    empresa: 'Imobiliária Japi',
    usuario: 'Teste de Conexão',
    id_usuario: getDailySessionId(),
    agente: 'Sistema',
    mensagem: '🔗 Teste de conexão do webhook'
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao testar conexão'
    };
  }
};

