/**
 * Configuração por formulário da Meta (P2.7).
 *
 * O caso que importa é a FALHA ABERTA. Em produção, um único formulário
 * responde por 119 dos 125 leads; uma consulta com erro que fizesse a captação
 * parar em silêncio custaria exatamente o que este item existe para proteger.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  PADRAO, carimbarConfig, configDoFormulario, garantirFormulario, lerConfigDoFormulario,
} from './formConfig.js';

describe('configDoFormulario', () => {
  it('formulário nunca configurado capta e a LIA atende', () => {
    expect(configDoFormulario(null)).toEqual(PADRAO);
    expect(configDoFormulario(undefined)).toEqual(PADRAO);
    expect(configDoFormulario({})).toEqual(PADRAO);
  });

  it('respeita o que está gravado', () => {
    expect(configDoFormulario({ captacao_ativa: false, lia_atende: true })).toEqual({
      captacao_ativa: false,
      lia_atende: true,
    });
  });

  /**
   * Só `false` desliga. Nulo, ausente ou lixo mantêm ligado — desligar por
   * engano é perder lead pago, e ninguém percebe até o fim do mês.
   */
  it('só um "false" explícito desliga', () => {
    expect(configDoFormulario({ captacao_ativa: null }).captacao_ativa).toBe(true);
    expect(configDoFormulario({ captacao_ativa: 'não' }).captacao_ativa).toBe(true);
    expect(configDoFormulario({ captacao_ativa: false }).captacao_ativa).toBe(false);
  });
});

describe('carimbarConfig', () => {
  const payload = { name: 'Fulano', raw_data: { meta: { form_id: '123' }, fields: { a: 1 } } };

  it('carimba dentro de raw_data.meta, que é de onde o banco promove', () => {
    const r = carimbarConfig(payload, { captacao_ativa: false, lia_atende: false });
    expect(r.raw_data.meta).toEqual({ form_id: '123', captacao_ativa: false, lia_atende: false });
  });

  it('não perde o que já estava no payload', () => {
    const r = carimbarConfig(payload, null);
    expect(r.name).toBe('Fulano');
    expect(r.raw_data.fields).toEqual({ a: 1 });
    expect(r.raw_data.meta.form_id).toBe('123');
  });

  it('payload sem raw_data não explode', () => {
    expect(carimbarConfig({ name: 'x' }, null).raw_data.meta).toEqual(PADRAO);
  });
});

/** Um supabase falso que pode ser mandado a falhar de três jeitos. */
function supabaseFalso({ linha = null, erro = null, explode = false } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: function () { return this; },
        maybeSingle: async () => {
          if (explode) throw new Error('conexão caiu');
          return { data: linha, error: erro };
        },
      }),
      upsert: async () => {
        if (explode) throw new Error('conexão caiu');
        return { error: erro };
      },
    }),
  };
}

describe('lerConfigDoFormulario — falha aberta', () => {
  it('devolve a linha quando existe', async () => {
    const r = await lerConfigDoFormulario(supabaseFalso({ linha: { captacao_ativa: false, lia_atende: true } }), 't', 'f');
    expect(r).toEqual({ captacao_ativa: false, lia_atende: true });
  });

  it('erro de banco devolve null — e o chamador cai no padrão, captando', async () => {
    const logger = { warn: vi.fn() };
    expect(await lerConfigDoFormulario(supabaseFalso({ erro: { message: 'boom' } }), 't', 'f', logger)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('exceção também devolve null, em vez de derrubar o processamento', async () => {
    expect(await lerConfigDoFormulario(supabaseFalso({ explode: true }), 't', 'f', { warn: vi.fn() })).toBeNull();
  });

  it('sem tenant ou sem formulário nem consulta', async () => {
    expect(await lerConfigDoFormulario(supabaseFalso(), null, 'f')).toBeNull();
    expect(await lerConfigDoFormulario(supabaseFalso(), 't', '')).toBeNull();
  });
});

describe('garantirFormulario', () => {
  /**
   * Registrar o formulário é conveniência de tela. Falhar aqui não pode custar
   * um lead que já foi pago — por isso nunca lança.
   */
  it('nunca lança, aconteça o que acontecer', async () => {
    const logger = { warn: vi.fn() };
    await expect(garantirFormulario(supabaseFalso({ explode: true }), 't', 'f', 'p', logger)).resolves.toBeUndefined();
    await expect(garantirFormulario(supabaseFalso({ erro: { message: 'x' } }), 't', 'f', 'p', logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('sem formulário não escreve nada', async () => {
    const sb = { from: vi.fn() };
    await garantirFormulario(sb, 't', null, 'p');
    expect(sb.from).not.toHaveBeenCalled();
  });
});
