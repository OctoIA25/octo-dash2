/**
 * Campanhas e ROI (P3.5).
 *
 * Os números dos casos são os da conta real da Lotus em setembro/2026, lidos
 * no Gerenciador de Anúncios: R$ 3.333,64 em quatro campanhas, 203 leads, e
 * duas campanhas de clique-para-WhatsApp somando 38% do gasto.
 */

import { describe, it, expect } from 'vitest';
import {
  avisoDeAtribuicao, buracoDeAtribuicao, contarQualificados, desdeQuando,
  pctSemAtribuicao, porUnidade, reaisExatos, type Campanha,
} from './campanhas';

const camp = (over: Partial<Campanha> = {}): Campanha => ({
  campaign_id: 'c1',
  campaign_nome: '[RESERVA CASTANHEIRA] Reserva Castanheira',
  objetivo: 'OUTCOME_LEADS',
  resultado_indicador: 'actions:lead',
  atribuivel: true,
  anuncios: 3,
  gasto: 1959.79,
  impressoes: 88997,
  cliques: 2217,
  ctr: 2.49,
  cpc: 0.88,
  cpm: 22.02,
  leads_meta: 124,
  resultados: 124,
  custo_por_lead_meta: 15.8,
  leads_dash: 40,
  chegou_visita: 6,
  custo_por_lead_dash: 48.99,
  lead_ids: [],
  lead_ids_visita: [],
  ...over,
});

describe('contarQualificados', () => {
  /** O "ou" da regra: quem passou da visita conta mesmo sem score. */
  it('conta quem chegou na visita e quem o score qualificou, sem repetir', () => {
    const n = contarQualificados(
      ['a', 'b', 'c', 'd'],
      ['a', 'b'],
      { a: 20, b: 95, c: 80, d: 30 },
      70
    );
    // a e b pela visita; c pelo score; d não entra.
    expect(n).toBe(3);
  });

  /**
   * Lead sem sinal não tem score. Dar-lhe o ponto de partida e comparar com o
   * limiar trataria "não sei" como "morno" — e inflaria o qualificado de toda
   * campanha nova, onde ninguém conversou ainda.
   */
  it('lead sem score não conta', () => {
    expect(contarQualificados(['a', 'b'], [], { a: undefined }, 70)).toBe(0);
    expect(contarQualificados(['a'], [], {}, 70)).toBe(0);
  });

  it('o limiar é do tenant, não fixo em 70', () => {
    expect(contarQualificados(['a'], [], { a: 55 }, 70)).toBe(0);
    expect(contarQualificados(['a'], [], { a: 55 }, 50)).toBe(1);
  });

  it('exatamente no limiar conta', () => {
    expect(contarQualificados(['a'], [], { a: 70 }, 70)).toBe(1);
  });

  it('campanha sem lead não quebra', () => {
    expect(contarQualificados([], [], {}, 70)).toBe(0);
    expect(contarQualificados(undefined as never, undefined as never, {}, 70)).toBe(0);
  });
});

describe('porUnidade', () => {
  it('divide e arredonda em centavos', () => {
    expect(porUnidade(1959.79, 124)).toBe(15.8);
  });

  /** Zero no denominador daria Infinity na tela. */
  it('sem denominador é ausente, não infinito', () => {
    expect(porUnidade(1000, 0)).toBeNull();
    expect(porUnidade(1000, -1)).toBeNull();
  });
});

describe('avisoDeAtribuicao', () => {
  it('campanha de formulário não precisa de aviso', () => {
    expect(avisoDeAtribuicao(camp())).toBeNull();
  });

  /**
   * Sem esta frase, o gestor vê "0 leads na Dash" ao lado de "60 na Meta" e
   * conclui que o sistema perdeu leads pagos.
   */
  it('clique-para-WhatsApp explica por que não há atribuição', () => {
    const a = avisoDeAtribuicao(camp({
      atribuivel: false,
      resultado_indicador: 'actions:onsite_conversion.messaging_conversation_started_7d',
    }));
    expect(a).toContain('clique para WhatsApp');
    expect(a).toContain('sem formulário');
  });

  it('sem indicador conhecido, ainda diz que não há atribuição', () => {
    const a = avisoDeAtribuicao(camp({ atribuivel: false, resultado_indicador: '' }));
    expect(a).toContain('não há atribuição');
  });
});

describe('buracoDeAtribuicao', () => {
  /**
   * Só conta campanha atribuível. Nas de WhatsApp a diferença não é perda —
   * é ausência de vínculo por natureza, e somá-la faria o buraco parecer
   * muito maior do que é.
   */
  it('mede só o que deveria ter casado', () => {
    const r = buracoDeAtribuicao([
      camp({ leads_meta: 124, leads_dash: 40 }),
      camp({ campaign_id: 'c2', atribuivel: false, leads_meta: 60, leads_dash: 0 }),
    ]);
    expect(r).toMatchObject({ meta: 124, dash: 40, falta: 84, pct: 68 });
  });

  it('dash acima da meta não vira buraco negativo', () => {
    expect(buracoDeAtribuicao([camp({ leads_meta: 10, leads_dash: 12 })]).falta).toBe(0);
  });

  it('sem campanha atribuível, não há porcentagem a inventar', () => {
    expect(buracoDeAtribuicao([camp({ atribuivel: false })]).pct).toBeNull();
    expect(buracoDeAtribuicao([]).pct).toBeNull();
  });
});

describe('pctSemAtribuicao', () => {
  /** Os números reais: 967,98 de 2.927,77 é 33%. */
  it('diz quanto do gasto não dá para amarrar', () => {
    expect(pctSemAtribuicao({
      gasto: 2927.77, gasto_sem_atribuicao: 967.98,
      impressoes: 0, cliques: 0, leads_meta: 0, campanhas: 3,
    })).toBe(33);
  });

  it('sem gasto não há porcentagem', () => {
    expect(pctSemAtribuicao({
      gasto: 0, gasto_sem_atribuicao: 0, impressoes: 0, cliques: 0, leads_meta: 0, campanhas: 0,
    })).toBeNull();
  });
});

describe('desdeQuando', () => {
  const agora = new Date('2026-09-21T12:00:00Z');

  it('diz de quando é o número', () => {
    expect(desdeQuando('2026-09-21T11:48:00Z', agora)).toBe('há 12 min');
    expect(desdeQuando('2026-09-21T09:00:00Z', agora)).toBe('há 3 h');
    expect(desdeQuando('2026-09-19T12:00:00Z', agora)).toBe('há 2 dias');
    expect(desdeQuando('2026-09-21T11:59:45Z', agora)).toBe('agora mesmo');
  });

  /** Nunca sincronizado é estado próprio: não é "há 56 anos". */
  it('sem sincronização, diz isso', () => {
    expect(desdeQuando(null, agora)).toBe('nunca sincronizado');
    expect(desdeQuando('não é data', agora)).toBe('nunca sincronizado');
  });
});

describe('reaisExatos', () => {
  /**
   * O defeito visto no navegador: o formatador do painel comercial arredonda
   * para o real inteiro. CPC de R$ 0,88 virava "R$ 1", e o gasto do mês saía
   * "R$ 3.334" contra os R$ 3.333,64 do Gerenciador — quebrando justamente o
   * critério de pronto do item.
   */
  it('mostra centavos, que é a unidade de trabalho em anúncio', () => {
    expect(reaisExatos(0.88)).toBe('R$ 0,88');
    expect(reaisExatos(15.8)).toBe('R$ 15,80');
    expect(reaisExatos(3333.64)).toBe('R$ 3.333,64');
  });

  it('ausente é travessão, zero é zero', () => {
    expect(reaisExatos(null)).toBe('—');
    expect(reaisExatos(undefined)).toBe('—');
    expect(reaisExatos(0)).toBe('R$ 0,00');
  });
});
