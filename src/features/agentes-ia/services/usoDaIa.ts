/**
 * O que uma chamada de IA consumiu (P2.8).
 *
 * MÓDULO PRÓPRIO, e não dentro de `openaiService.ts`, por um motivo concreto:
 * aquele arquivo tem um import quebrado (`../lib/supabaseClient`, que não
 * existe) e por isso NÃO CARREGA. Ninguém o chama — é código morto — mas
 * importar `lerUso` de lá arrastaria o defeito para quem importasse, e o
 * `agentWebhookService`, que serve os chats do Caio e da Elaine, pararia.
 *
 * Descoberto ao escrever o teste: ele não conseguiu nem importar o módulo.
 */

export interface UsoDaChamada {
  modelo: string;
  tokensEntrada: number;
  /** Subconjunto dos de entrada, como os provedores reportam. */
  tokensCache: number;
  tokensSaida: number;
}

/**
 * Lê o `usage` de uma resposta de IA no formato da OpenAI (que o n8n repassa).
 *
 * Devolve `undefined` quando não há o que contar. **"Não informado" nunca vira
 * zero**: zero diria "esta chamada não custou nada", e o gestor leria uma IA
 * barata onde há uma medição ausente. É a diferença que fez os 19 primeiros
 * eventos de telemetria parecerem gratuitos.
 */
export function lerUso(data: unknown, modeloPedido: string): UsoDaChamada | undefined {
  const d = data as { usage?: Record<string, unknown>; model?: string } | null;
  const u = d?.usage;
  if (!u || typeof u !== 'object') return undefined;

  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.round(x) : 0;
  };
  const entrada = n(u.prompt_tokens);
  const saida = n(u.completion_tokens);
  if (entrada === 0 && saida === 0) return undefined;

  return {
    // O modelo da RESPOSTA, não o pedido: o provedor resolve alias
    // ("gpt-4o" vira "gpt-4o-2024-11-20") e cobra pelo resolvido.
    modelo: typeof d?.model === 'string' && d.model ? d.model : modeloPedido,
    tokensEntrada: entrada,
    tokensSaida: saida,
    tokensCache: n((u.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens),
  };
}
