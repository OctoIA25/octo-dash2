/**
 * Leitura do `usage` da resposta de IA (P2.8).
 *
 * É a peça que faz o custo deixar de ser "—". Medido em 21/09: dos 19 eventos
 * de telemetria gravados, NENHUM tinha token ou modelo — o dado vinha na
 * resposta e era jogado fora.
 *
 * A regra que atravessa todos os casos: **"não informado" nunca vira zero.**
 * Zero diria "esta chamada não custou nada", e o gestor leria uma IA barata
 * onde há uma medição ausente.
 */

import { describe, it, expect } from 'vitest';
import { lerUso } from './usoDaIa';

describe('lerUso', () => {
  it('lê entrada, saída e cache', () => {
    expect(
      lerUso(
        {
          model: 'gpt-4o-2024-11-20',
          usage: { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 } },
        },
        'gpt-4o'
      )
    ).toEqual({ modelo: 'gpt-4o-2024-11-20', tokensEntrada: 1000, tokensSaida: 500, tokensCache: 200 });
  });

  /**
   * A OpenAI resolve o alias ("gpt-4o" vira "gpt-4o-2024-11-20") e cobra pelo
   * resolvido. Gravar o pedido faria o custo sair pelo preço do modelo errado
   * no dia em que o alias mudasse de versão.
   */
  it('prefere o modelo da RESPOSTA ao pedido', () => {
    const r = lerUso({ model: 'gpt-4o-2024-11-20', usage: { prompt_tokens: 10, completion_tokens: 1 } }, 'gpt-4o');
    expect(r?.modelo).toBe('gpt-4o-2024-11-20');
  });

  it('sem modelo na resposta, fica o que foi pedido', () => {
    expect(lerUso({ usage: { prompt_tokens: 10, completion_tokens: 1 } }, 'gpt-4o')?.modelo).toBe('gpt-4o');
  });

  it('sem cache reportado, cache é zero — e isso é verdade', () => {
    expect(lerUso({ usage: { prompt_tokens: 10, completion_tokens: 1 } }, 'm')?.tokensCache).toBe(0);
  });

  /** O caso de hoje: o webhook responde e não conta nada. */
  it('resposta sem `usage` é "não informado", não zero', () => {
    expect(lerUso({ choices: [] }, 'gpt-4o')).toBeUndefined();
    expect(lerUso(null, 'gpt-4o')).toBeUndefined();
    expect(lerUso('texto puro', 'gpt-4o')).toBeUndefined();
  });

  it('usage zerado também é "não informado"', () => {
    expect(lerUso({ usage: { prompt_tokens: 0, completion_tokens: 0 } }, 'm')).toBeUndefined();
  });

  it('número ilegível não vira NaN no custo', () => {
    const r = lerUso({ usage: { prompt_tokens: 'muitos', completion_tokens: 5 } }, 'm');
    expect(r).toEqual({ modelo: 'm', tokensEntrada: 0, tokensSaida: 5, tokensCache: 0 });
  });

  it('número negativo é dado corrompido, e vira zero em vez de crédito', () => {
    const r = lerUso({ usage: { prompt_tokens: -100, completion_tokens: 5 } }, 'm');
    expect(r?.tokensEntrada).toBe(0);
  });
});
