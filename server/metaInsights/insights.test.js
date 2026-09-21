/**
 * Gasto de anúncios da Meta (P3.5).
 *
 * As respostas dos casos têm a forma real da Marketing API: número como
 * string, `actions` como lista de {action_type, value}. Os valores são os da
 * conta da Lotus em setembro/2026.
 */

import { describe, it, expect } from 'vitest';
import {
  CAMPOS_INSIGHTS, caminhoDeInsights, indicadorDoResultado, janelaDeSincronizacao, linhasDeInsights,
} from './insights.js';

const TENANT = '0ccc1111-0000-4000-a000-000000000001';

describe('caminhoDeInsights', () => {
  /**
   * `time_increment=1` é o que faz a Meta devolver uma linha POR DIA. Sem ele
   * vem um total do período, e não dá para regravar só os últimos dias nem
   * montar o gráfico diário.
   */
  it('pede o grão de anúncio e de dia', () => {
    const c = caminhoDeInsights('1213977450907753', '2026-09-01', '2026-09-30');
    expect(c).toContain('act_1213977450907753/insights');
    expect(c).toContain('level=ad');
    expect(c).toContain('time_increment=1');
    expect(c).toContain(encodeURIComponent('{"since":"2026-09-01","until":"2026-09-30"}'));
  });

  it('aceita a conta com ou sem o prefixo act_', () => {
    expect(caminhoDeInsights('act_123', '2026-09-01', '2026-09-02')).toContain('act_123/insights');
    expect(caminhoDeInsights('123', '2026-09-01', '2026-09-02')).toContain('act_123/insights');
  });

  /** Conta inválida vira chamada malformada e 400 sem explicação lá na frente. */
  it('recusa conta que não é número', () => {
    expect(() => caminhoDeInsights('minha-conta', '2026-09-01', '2026-09-02')).toThrow(/inválida/);
    expect(() => caminhoDeInsights('', '2026-09-01', '2026-09-02')).toThrow(/inválida/);
  });
});

describe('indicadorDoResultado', () => {
  /**
   * O campo que decide se dá para atribuir lead a lead. Duas das quatro
   * campanhas da Lotus são de conversa, somando 38% do gasto.
   */
  it('campanha de formulário é lead', () => {
    expect(indicadorDoResultado([{ action_type: 'lead', value: '124' }])).toBe('actions:lead');
    expect(indicadorDoResultado([{ action_type: 'leadgen_grouped', value: '124' }])).toBe('actions:lead');
  });

  it('clique-para-WhatsApp é conversa, não lead', () => {
    const r = indicadorDoResultado([
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '67' },
    ]);
    expect(r).toBe('actions:onsite_conversion.messaging_conversation_started_7d');
  });

  /** Tendo os dois, lead ganha: é o que dá atribuição, e é o mais específico. */
  it('com os dois, o formulário manda', () => {
    expect(indicadorDoResultado([
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '10' },
      { action_type: 'lead', value: '3' },
    ])).toBe('actions:lead');
  });

  it('sem ação conhecida não inventa indicador', () => {
    expect(indicadorDoResultado([{ action_type: 'post_engagement', value: '99' }])).toBe('');
    expect(indicadorDoResultado(undefined)).toBe('');
  });
});

describe('linhasDeInsights', () => {
  const resposta = {
    data: [
      {
        campaign_id: '52571127506556',
        campaign_name: '[RESERVA CASTANHEIRA] Reserva Castanheira',
        adset_id: '111', adset_name: 'Conjunto A',
        ad_id: '222', ad_name: 'Anúncio 1',
        objective: 'OUTCOME_LEADS',
        spend: '1959.79', impressions: '88997', clicks: '2217',
        ctr: '2.49', cpc: '0.88', cpm: '22.02',
        actions: [{ action_type: 'lead', value: '124' }],
        date_start: '2026-09-01',
      },
      {
        campaign_id: '52571127498156',
        campaign_name: '[LEAD] Entrada e Médio',
        adset_id: '333', adset_name: 'Conjunto B',
        ad_id: '444', ad_name: 'Anúncio 2',
        objective: 'OUTCOME_LEADS',
        spend: '847.40', impressions: '35356', clicks: '541',
        actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '67' }],
        date_start: '2026-09-01',
      },
    ],
  };

  it('traduz os números que vêm como texto', () => {
    const { linhas } = linhasDeInsights(resposta, TENANT);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      tenant_id: TENANT,
      data: '2026-09-01',
      campaign_nome: '[RESERVA CASTANHEIRA] Reserva Castanheira',
      ad_id: '222',
      gasto: 1959.79,
      impressoes: 88997,
      cliques: 2217,
      leads_meta: 124,
      resultado_indicador: 'actions:lead',
    });
  });

  /** Conversa NÃO é lead: contar como lead inflaria o custo por lead da casa. */
  it('conversa iniciada não vira lead', () => {
    const { linhas } = linhasDeInsights(resposta, TENANT);
    const whats = linhas.find((l) => l.ad_id === '444');
    expect(whats.leads_meta).toBe(0);
    expect(whats.resultados).toBe(67);
  });

  /**
   * A chave da tabela é (tenant, data, anúncio). Linha sem chave gravada com
   * campo vazio viraria duplicata a cada sincronização.
   */
  it('descarta linha sem anúncio ou sem data, e diz quantas', () => {
    const { linhas, descartadas } = linhasDeInsights({
      data: [
        { ad_id: '1', date_start: '2026-09-01', spend: '1' },
        { ad_id: '', date_start: '2026-09-01', spend: '2' },
        { ad_id: '3', spend: '3' },
      ],
    }, TENANT);
    expect(linhas).toHaveLength(1);
    expect(descartadas).toHaveLength(2);
  });

  it('resposta vazia ou torta não quebra', () => {
    expect(linhasDeInsights({}, TENANT).linhas).toEqual([]);
    expect(linhasDeInsights({ data: null }, TENANT).linhas).toEqual([]);
    expect(linhasDeInsights(null, TENANT).linhas).toEqual([]);
  });

  /** Campo ausente é ausente, e não zero — zero mentiria sobre o CTR do dia. */
  it('campo que a Meta não mandou vem nulo, não zero', () => {
    const { linhas } = linhasDeInsights({
      data: [{ ad_id: '1', date_start: '2026-09-01', spend: '10', impressions: '100' }],
    }, TENANT);
    expect(linhas[0].ctr).toBeNull();
    expect(linhas[0].cpc).toBeNull();
    expect(linhas[0].gasto).toBe(10);
    // Cliques ausente conta zero: é contagem, e não taxa.
    expect(linhas[0].cliques).toBe(0);
  });
});

describe('janelaDeSincronizacao', () => {
  /**
   * A Meta ajusta números depois do fato, então a sincronização repete os
   * últimos dias de propósito. Quem impede isso de dobrar o mês é a chave
   * única da tabela, não esta função.
   */
  it('sete dias terminando hoje', () => {
    expect(janelaDeSincronizacao('2026-09-21')).toEqual({ de: '2026-09-15', ate: '2026-09-21' });
  });

  it('atravessa a virada do mês', () => {
    expect(janelaDeSincronizacao('2026-10-03')).toEqual({ de: '2026-09-27', ate: '2026-10-03' });
  });

  it('um dia é o próprio dia', () => {
    expect(janelaDeSincronizacao('2026-09-21', 1)).toEqual({ de: '2026-09-21', ate: '2026-09-21' });
  });

  it('data inválida estoura em vez de sincronizar período errado', () => {
    expect(() => janelaDeSincronizacao('ontem')).toThrow(/inválida/);
  });
});

describe('CAMPOS_INSIGHTS', () => {
  it('pede o que a tabela guarda', () => {
    for (const campo of ['campaign_id', 'ad_id', 'spend', 'actions', 'date_start', 'objective']) {
      expect(CAMPOS_INSIGHTS).toContain(campo);
    }
  });
});
