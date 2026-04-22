/**
 * Serviço para integração com a API da OpenAI
 * Gerencia chaves de API por tenant e envia mensagens ao chat
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// TIPOS
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ApiKeyConfig {
  id?: string;
  tenantId: string;
  provider: string;
  apiKey: string;
  model: string;
}

export interface OpenAIResponse {
  success: boolean;
  message?: string;
  error?: string;
  toolCalls?: ToolCall[];
}

// ============================================================================
// SYSTEM PROMPT - Especialista em Avaliação Imobiliária
// ============================================================================

export const SYSTEM_PROMPT_AVALIACAO = `Você é um robô editor de estudos de mercado imobiliário.

## REGRA CRÍTICA — OBRIGATÓRIA

Você DEVE usar as function calls (tools) disponíveis para executar ações. NUNCA escreva nomes de funções em texto. NUNCA simule a execução de ferramentas. NUNCA escreva código ou pseudocódigo mostrando chamadas de função. Você TEM as ferramentas reais — USE-AS via function calling.

ERRADO (NUNCA faça isso):
"Vou executar atualizar_configuracao(correcao_mercado=8)"

CERTO:
Chame a tool atualizar_configuracao com os parâmetros corretos via function calling.

## COMPORTAMENTO

1. Quando o corretor pedir QUALQUER alteração, EXECUTE IMEDIATAMENTE usando as tools. NÃO peça confirmação.
2. Após TODA alteração, chame recalcular_e_gerar_relatorio para gerar o relatório.
3. Sua resposta em texto deve ser CURTA: apenas confirme o que foi feito e mostre os valores finais.

## EXEMPLOS DE FLUXO

Corretor: "muda a correção para 8%"
→ Chame tool atualizar_configuracao com correcao_mercado=8
→ Chame tool recalcular_e_gerar_relatorio
→ Responda: "Correção atualizada para 8%. Valor final: R$ X. Relatório disponível para download."

Corretor: "troca o link da amostra 2 por https://..."
→ Chame tool buscar_imovel_por_link com a URL
→ Chame tool substituir_amostra com índice 2 e os dados obtidos
→ Chame tool recalcular_e_gerar_relatorio
→ Responda resumidamente com os novos valores.

## REGRAS
- Responda em português do Brasil.
- Seja breve. Máximo 3 frases na resposta final.
- Se o estudo não estiver carregado, peça para carregar um.
- Nunca invente dados.`;

// ============================================================================
// TOOL DEFINITIONS - OpenAI Function Calling
// ============================================================================

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'listar_amostras',
      description: 'Lista todas as amostras do estudo de mercado carregado, mostrando link, valor, metragem, bairro e cidade de cada uma.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'buscar_imovel_por_link',
      description: 'Busca dados de um imóvel a partir de uma URL de portal imobiliário (ZAP, Viva Real, OLX, etc). Retorna valor, metragem, localização e outros dados.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL do anúncio do imóvel no portal imobiliário',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'substituir_amostra',
      description: 'Substitui uma amostra existente no estudo por novos dados. Use após buscar_imovel_por_link para atualizar uma amostra com os dados do novo imóvel.',
      parameters: {
        type: 'object',
        properties: {
          indice: {
            type: 'number',
            description: 'Índice da amostra a ser substituída (1-based, ex: 1 para a primeira amostra)',
          },
          novo_link: {
            type: 'string',
            description: 'URL do novo imóvel',
          },
          valor_total: {
            type: 'number',
            description: 'Valor total do imóvel em R$',
          },
          metragem: {
            type: 'number',
            description: 'Metragem do imóvel em m²',
          },
          bairro: { type: 'string', description: 'Bairro do imóvel' },
          cidade: { type: 'string', description: 'Cidade do imóvel' },
          estado: { type: 'string', description: 'Estado (UF) do imóvel' },
          rua: { type: 'string', description: 'Rua/endereço do imóvel' },
          condominio: { type: 'string', description: 'Nome do condomínio' },
          tipo: { type: 'string', description: 'Tipo do imóvel (apartamento, casa, etc)' },
          diferenciais: { type: 'string', description: 'Diferenciais do imóvel' },
          imagem: { type: 'string', description: 'URL da imagem principal' },
        },
        required: ['indice', 'valor_total', 'metragem'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'atualizar_configuracao',
      description: 'Atualiza a configuração do estudo: percentual de correção de mercado, percentual de margem de exclusividade, e/ou metragem do imóvel avaliado. Use quando o corretor pedir para mudar qualquer porcentagem ou metragem.',
      parameters: {
        type: 'object',
        properties: {
          correcao_mercado: {
            type: 'number',
            description: 'Novo percentual de correção de mercado (ex: -5 para -5%, 10 para +10%)',
          },
          margem_exclusividade: {
            type: 'number',
            description: 'Novo percentual de margem de exclusividade (ex: 5 para 5%)',
          },
          metragem_imovel: {
            type: 'number',
            description: 'Nova metragem do imóvel em m²',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'recalcular_e_gerar_relatorio',
      description: 'Recalcula todos os valores do estudo (média/m², valor base, valor de mercado, valor final) e gera um novo relatório HTML para download. SEMPRE chame após qualquer alteração.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

// ============================================================================
// FUNÇÕES DE GERENCIAMENTO DE CHAVE API
// ============================================================================

/**
 * Busca a chave de API do tenant
 */
export async function fetchApiKey(tenantId: string): Promise<ApiKeyConfig | null> {
  try {
    const { data, error } = await supabase
      .from('tenant_api_keys')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'openai')
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      tenantId: data.tenant_id,
      provider: data.provider,
      apiKey: data.api_key,
      model: data.model,
    };
  } catch {
    return null;
  }
}

/**
 * Salva ou atualiza a chave de API do tenant
 */
export async function saveApiKey(
  tenantId: string,
  apiKey: string,
  model: string = 'gpt-4o'
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await fetchApiKey(tenantId);

    if (existing?.id) {
      const { error } = await supabase
        .from('tenant_api_keys')
        .update({
          api_key: apiKey,
          model,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase
        .from('tenant_api_keys')
        .insert({
          tenant_id: tenantId,
          provider: 'openai',
          api_key: apiKey,
          model,
        });

      if (error) return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao salvar chave API' };
  }
}

// ============================================================================
// FUNÇÃO DE ENVIO DE MENSAGEM
// ============================================================================

/**
 * Envia mensagens para a API da OpenAI e retorna a resposta
 */
export async function sendChatMessage(
  apiKey: string,
  messages: ChatMessage[],
  model: string = 'gpt-4o'
): Promise<OpenAIResponse> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || `Erro HTTP ${response.status}`;
      
      if (response.status === 401) {
        return { success: false, error: 'Chave de API inválida. Verifique sua configuração.' };
      }
      if (response.status === 429) {
        return { success: false, error: 'Limite de requisições atingido. Tente novamente em alguns segundos.' };
      }
      if (response.status === 402) {
        return { success: false, error: 'Saldo insuficiente na conta OpenAI.' };
      }
      
      return { success: false, error: errorMessage };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return { success: false, error: 'Resposta vazia da IA.' };
    }

    return { success: true, message: content };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro de conexão com a OpenAI' };
  }
}

/**
 * Envia mensagens para a API da OpenAI COM suporte a Function Calling (tools)
 */
export async function sendChatMessageWithTools(
  apiKey: string,
  messages: ChatMessage[],
  tools: typeof TOOL_DEFINITIONS,
  model: string = 'gpt-4o'
): Promise<OpenAIResponse> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        temperature: 0.4,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || `Erro HTTP ${response.status}`;

      if (response.status === 401) return { success: false, error: 'Chave de API inválida.' };
      if (response.status === 429) return { success: false, error: 'Limite de requisições atingido.' };
      if (response.status === 402) return { success: false, error: 'Saldo insuficiente na OpenAI.' };

      return { success: false, error: errorMessage };
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      return { success: false, error: 'Resposta vazia da IA.' };
    }

    // Se a IA quer chamar uma tool
    if (choice.finish_reason === 'tool_calls' || choice.message?.tool_calls) {
      return {
        success: true,
        message: choice.message?.content || null,
        toolCalls: choice.message.tool_calls,
      };
    }

    // Resposta normal de texto
    return {
      success: true,
      message: choice.message?.content || '',
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro de conexão com a OpenAI' };
  }
}

// ============================================================================
// HELPER - Formatar dados do estudo para contexto
// ============================================================================

export interface EstudoContextData {
  nomeCliente?: string;
  enderecoImovel?: string;
  metragemImovel: number;
  correcaoMercado: number;
  margemExclusividade: number;
  mediaPorM2: number;
  valorBase: number;
  valorMercado: number;
  valorFinal: number;
  amostras: {
    link?: string;
    valorTotal: number;
    metragem: number;
    estado?: string;
    cidade?: string;
    bairro?: string;
    tipo?: string;
    condominio?: string;
  }[];
}

/**
 * Converte dados do estudo em texto formatado para enviar como contexto ao agente
 */
export function formatStudyContext(data: EstudoContextData): string {
  const lines: string[] = [];
  
  lines.push('=== DADOS DO ESTUDO DE MERCADO ===\n');
  
  if (data.nomeCliente) lines.push(`Cliente: ${data.nomeCliente}`);
  if (data.enderecoImovel) lines.push(`Endereço do Imóvel: ${data.enderecoImovel}`);
  lines.push(`Metragem do Imóvel: ${data.metragemImovel} m²`);
  lines.push(`Correção de Mercado: ${data.correcaoMercado}%`);
  lines.push(`Margem de Exclusividade: ${data.margemExclusividade}%`);
  lines.push('');
  lines.push('--- Resultados dos Cálculos ---');
  lines.push(`Média por m²: R$ ${data.mediaPorM2.toFixed(2)}`);
  lines.push(`Valor Base (metragem x média): R$ ${data.valorBase.toFixed(2)}`);
  lines.push(`Valor com Correção de Mercado: R$ ${data.valorMercado.toFixed(2)}`);
  lines.push(`Valor Final (com exclusividade): R$ ${data.valorFinal.toFixed(2)}`);
  lines.push('');
  lines.push(`--- Amostras Comparativas (${data.amostras.length}) ---`);
  
  data.amostras.forEach((a, i) => {
    lines.push(`\nAmostra ${i + 1}:`);
    if (a.link) lines.push(`  Link: ${a.link}`);
    lines.push(`  Valor: R$ ${a.valorTotal.toLocaleString('pt-BR')}`);
    lines.push(`  Metragem: ${a.metragem} m²`);
    if (a.metragem > 0) lines.push(`  Preço/m²: R$ ${(a.valorTotal / a.metragem).toFixed(2)}`);
    if (a.bairro) lines.push(`  Bairro: ${a.bairro}`);
    if (a.cidade) lines.push(`  Cidade: ${a.cidade}${a.estado ? ` - ${a.estado}` : ''}`);
    if (a.tipo) lines.push(`  Tipo: ${a.tipo}`);
    if (a.condominio) lines.push(`  Condomínio: ${a.condominio}`);
  });

  return lines.join('\n');
}
