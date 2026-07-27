import { describe, it, expect } from 'vitest';
import { costFromTokens, costForModelBreakdown, MODEL_PRICES_PER_MTOK } from './pricing.js';

describe('costFromTokens — tokens reais × preço do modelo', () => {
  it('calcula input/output/cache com a matemática exata do gpt-4.1-mini', () => {
    // 1M input sem cache = $0.40
    expect(costFromTokens({ model: 'gpt-4.1-mini', input_tokens: 1_000_000 }).usd).toBeCloseTo(0.4, 10);
    // 1M output = $1.60
    expect(costFromTokens({ model: 'gpt-4.1-mini', output_tokens: 1_000_000 }).usd).toBeCloseTo(1.6, 10);
    // 1M input com 500k cacheados = 500k×0.40 + 500k×0.10 = $0.25
    expect(
      costFromTokens({ model: 'gpt-4.1-mini', input_tokens: 1_000_000, cached_tokens: 500_000 }).usd,
    ).toBeCloseTo(0.25, 10);
  });

  it('modelo sem preço ou sem tokens registrados → null (nunca estima)', () => {
    expect(costFromTokens({ model: 'modelo-misterioso', input_tokens: 100 })).toBeNull();
    expect(costFromTokens({ model: null, input_tokens: 100 })).toBeNull();
    expect(costFromTokens({ model: 'gpt-4o', input_tokens: 0, output_tokens: 0 })).toBeNull();
    expect(costFromTokens({ model: 'gpt-4o' })).toBeNull();
  });

  it('dados corrompidos são clampados: cache > input não vira custo negativo', () => {
    const r = costFromTokens({ model: 'gpt-4o-mini', input_tokens: 100, cached_tokens: 9_999 });
    // 100 tokens todos ao preço de cache: 100×0.075/1M
    expect(r.usd).toBeCloseTo((100 * MODEL_PRICES_PER_MTOK['gpt-4o-mini'].cached) / 1_000_000, 12);
    expect(r.usd).toBeGreaterThan(0);
  });
});

describe('costForModelBreakdown — by_model do summary + custo', () => {
  it('soma só modelos precificáveis e lista os desconhecidos', () => {
    const { rows, totalUsd, unknownModels } = costForModelBreakdown([
      { model: 'gpt-4.1-mini', input_tokens: 1_000_000, output_tokens: 0, cached_tokens: 0 },
      { model: 'llama-do-n8n', input_tokens: 500, output_tokens: 500 },
    ]);
    expect(rows[0].cost_usd).toBeCloseTo(0.4, 10);
    expect(rows[1].cost_usd).toBeNull();
    expect(totalUsd).toBeCloseTo(0.4, 10);
    expect(unknownModels).toEqual(['llama-do-n8n']);
  });

  it('sem nenhum modelo precificável, total é null (não zero fingido)', () => {
    const { totalUsd } = costForModelBreakdown([{ model: 'x', input_tokens: 10 }]);
    expect(totalUsd).toBeNull();
    expect(costForModelBreakdown([]).totalUsd).toBeNull();
  });
});
