/**
 * O score do lead.
 *
 * Dois casos valem mais que os outros:
 *
 * 1. A TEMPERATURA SAI DO SCORE. No Aether os dois são campos separados e se
 *    contradizem — 94 aparece como Morno e 62 como Quente. Um teste que
 *    permitisse isso aqui deixaria voltar o defeito que o plano mandou tirar.
 *
 * 2. A SOMA DOS MOTIVOS É O SCORE. O plano diz do Aether: "não há tela
 *    explicando por que um lead tem 32 e outro 94". Se a explicação não
 *    fechar com o número, ela é decoração — e pior que nenhuma, porque
 *    parece conferência.
 */
import { describe, it, expect } from 'vitest';
import {
  avaliarLead, calcularScore, explicacaoCurta, faixasDaRegua, PESOS_PADRAO,
  temperaturaDoScore, type SinaisDoLead,
} from '../score';

const soma = (r: ReturnType<typeof calcularScore>) => r.motivos.reduce((s, m) => s + m.pontos, 0);

describe('a tabela é a do plano', () => {
  it('lead sem sinal nenhum fica no ponto de partida, 50', () => {
    const r = calcularScore({});
    expect(r.score).toBe(50);
    expect(r.temperatura).toBe('Morno');
    expect(r.sinaisObservados).toBe(0);
  });

  it.each([
    ['respondeu', { respondeu: true }, 5],
    ['disse o que procura', { disse_o_que_procura: true }, 10],
    ['renda compatível', { renda_compativel: true }, 15],
    ['renda incompatível', { renda_incompativel: true }, -10],
    ['pediu visita', { pediu_visita: true }, 25],
    ['pediu simulação', { pediu_simulacao: true }, 10],
    ['conversou em 3 dias', { conversou_recente: true }, 5],
    ['só pesquisando', { so_pesquisando: true }, -10],
  ] as Array<[string, SinaisDoLead, number]>)('%s vale %i', (_n, sinais, pontos) => {
    expect(calcularScore(sinais).score).toBe(50 + pontos);
  });

  it('sem resposta há 7 dias tira 15; há 6 não tira nada', () => {
    expect(calcularScore({ sem_resposta_ha_dias: 7 }).score).toBe(35);
    expect(calcularScore({ sem_resposta_ha_dias: 6 }).score).toBe(50);
  });
});

describe('tempo de resposta: só a faixa mais rápida', () => {
  it('até 10 minutos vale 10', () => {
    expect(calcularScore({ minutos_para_responder: 5 }).score).toBe(60);
  });

  it('entre 10 e 60 minutos vale 5', () => {
    expect(calcularScore({ minutos_para_responder: 45 }).score).toBe(55);
  });

  it('NÃO soma as duas faixas — seria pagar duas vezes pelo mesmo fato', () => {
    const r = calcularScore({ minutos_para_responder: 5 });
    expect(r.motivos.filter((m) => m.id.startsWith('resposta')).length).toBe(1);
    expect(r.score).toBe(60);
  });

  it('acima de uma hora não pontua', () => {
    expect(calcularScore({ minutos_para_responder: 61 }).score).toBe(50);
  });

  it('tempo desconhecido não vira zero minutos', () => {
    // `null` é "não sei", e tratá-lo como resposta instantânea daria +10 a
    // todo lead que nunca respondeu.
    expect(calcularScore({ minutos_para_responder: null }).score).toBe(50);
    expect(calcularScore({ minutos_para_responder: undefined }).score).toBe(50);
  });
});

describe('o bônus da origem respeita o teto', () => {
  it('soma o peso da origem', () => {
    expect(calcularScore({ peso_da_origem: 7 }).score).toBe(57);
  });

  it('peso acima do teto é cortado no teto, não somado inteiro', () => {
    // Um peso gravado errado não pode furar a conta.
    expect(calcularScore({ peso_da_origem: 99 }).score).toBe(60);
  });

  it('peso negativo não vira penalidade por outro caminho', () => {
    expect(calcularScore({ peso_da_origem: -50 }).score).toBe(50);
  });
});

describe('A TEMPERATURA SAI DO SCORE — nunca se contradizem', () => {
  it.each([
    [0, 'Frio'], [39, 'Frio'], [40, 'Morno'], [69, 'Morno'], [70, 'Quente'], [100, 'Quente'],
  ] as Array<[number, string]>)('score %i é %s', (alvo, esperada) => {
    const r = calcularScore({ peso_da_origem: 0 }, { ...PESOS_PADRAO, ponto_de_partida: alvo });
    expect(r.score).toBe(alvo);
    expect(r.temperatura).toBe(esperada);
  });

  it('não existe score alto com temperatura fria, em peso nenhum', () => {
    const casos: SinaisDoLead[] = [
      { pediu_visita: true, renda_compativel: true, respondeu: true },
      { so_pesquisando: true, renda_incompativel: true, sem_resposta_ha_dias: 30 },
      {},
    ];
    for (const c of casos) {
      const r = calcularScore(c);
      const esperada = r.score >= 70 ? 'Quente' : r.score >= 40 ? 'Morno' : 'Frio';
      expect(r.temperatura).toBe(esperada);
    }
  });

  it('as faixas são editáveis e a temperatura acompanha', () => {
    const rigoroso = { ...PESOS_PADRAO, limite_morno: 60, limite_quente: 90 };
    expect(calcularScore({}, rigoroso).temperatura).toBe('Frio');
    expect(calcularScore({ pediu_visita: true }, rigoroso).temperatura).toBe('Morno');
  });
});

describe('o score nunca sai de 0..100', () => {
  it('não fica negativo, e avisa que cortou', () => {
    const r = calcularScore(
      { renda_incompativel: true, so_pesquisando: true, sem_resposta_ha_dias: 90 },
      { ...PESOS_PADRAO, ponto_de_partida: 10 }
    );
    expect(r.score).toBe(0);
    expect(r.cortado).toBe(true);
  });

  it('não passa de 100, e avisa que cortou', () => {
    const r = calcularScore({
      respondeu: true, minutos_para_responder: 1, disse_o_que_procura: true,
      renda_compativel: true, pediu_visita: true, pediu_simulacao: true,
      conversou_recente: true, peso_da_origem: 10,
    });
    expect(r.score).toBe(100);
    expect(r.cortado).toBe(true);
  });

  it('quando não corta, a SOMA DOS MOTIVOS é exatamente o score', () => {
    for (const c of [
      {}, { respondeu: true }, { pediu_visita: true, so_pesquisando: true },
      { minutos_para_responder: 30, peso_da_origem: 4, sem_resposta_ha_dias: 10 },
    ] as SinaisDoLead[]) {
      const r = calcularScore(c);
      if (!r.cortado) expect(soma(r), JSON.stringify(c)).toBe(r.score);
    }
  });
});

describe('o "por quê" que o Aether não tem', () => {
  it('toda parcela traz texto em português, e nenhuma vale zero', () => {
    const r = calcularScore({ pediu_visita: true, so_pesquisando: true, respondeu: true });
    for (const m of r.motivos) {
      expect(m.texto.length).toBeGreaterThan(3);
      expect(m.pontos).not.toBe(0);
    }
  });

  it('a linha curta mostra os maiores primeiro, com sinal', () => {
    const r = calcularScore({ pediu_visita: true, respondeu: true, sem_resposta_ha_dias: 8 });
    const linha = explicacaoCurta(r);
    expect(linha).toMatch(/^\+25 pediu visita/);
    expect(linha).toMatch(/−15 sem conversa há 8 dias/);
    expect(linha).not.toMatch(/ponto de partida/);
  });

  it('peso zerado pelo gestor não entra como motivo fantasma', () => {
    const r = calcularScore({ respondeu: true }, { ...PESOS_PADRAO, peso_respondeu: 0 });
    expect(r.motivos.some((m) => m.id === 'respondeu')).toBe(false);
    expect(r.score).toBe(50);
  });

  it('lead sem sinal observado é distinguível de lead avaliado', () => {
    // 50 por não ter sido observado e 50 por sinais que se anulam são coisas
    // diferentes, e a tela precisa poder dizer qual é qual.
    expect(calcularScore({}).sinaisObservados).toBe(0);
    expect(calcularScore({ respondeu: true, renda_incompativel: true }).sinaisObservados).toBe(2);
  });
});

/*
 * A RÉGUA DA FICHA (25/09).
 *
 * O chefe achou a contradição olhando a tela: o mesmo lead com "50 · Morno" no
 * selo e "Quente" marcado nos botões logo abaixo. A causa eram duas fontes — o
 * score e a coluna `temperature`, editável à mão. A régua substituiu os botões,
 * e o que estes casos protegem é que ela **nunca** discorde do selo.
 */
describe('a régua e o selo não podem discordar', () => {
  /*
   * O CASO QUE SUSTENTA O ARQUIVO. A régua desenha faixas; o selo chama
   * `temperaturaDoScore`. Se a régua ganhasse uma aritmética própria, ela
   * discordaria justo quando alguém mexesse nos limites em Configurações — que
   * é quando ninguém está olhando.
   */
  it.each([
    ['padrão', PESOS_PADRAO],
    ['rigoroso', { ...PESOS_PADRAO, limite_morno: 60, limite_quente: 90 }],
    ['frouxo', { ...PESOS_PADRAO, limite_morno: 10, limite_quente: 20 }],
    ['sobrepostos', { ...PESOS_PADRAO, limite_morno: 80, limite_quente: 70 }],
  ])('em %s, todo score de 0 a 100 cai na faixa que a régua desenha', (_nome, pesos) => {
    const faixas = faixasDaRegua(pesos);
    for (let n = 0; n <= 100; n++) {
      const faixa = faixas.find((f) => n >= f.de && n <= f.ate);
      expect(faixa, `score ${n} não caiu em faixa nenhuma`).toBeDefined();
      expect(faixa!.temperatura).toBe(temperaturaDoScore(n, pesos));
    }
  });

  it('a régua cobre 0..100 sem buraco e sem sobreposição', () => {
    const faixas = faixasDaRegua();
    expect(faixas[0].de).toBe(0);
    expect(faixas[faixas.length - 1].ate).toBe(100);
    for (let i = 1; i < faixas.length; i++) {
      expect(faixas[i].de).toBe(faixas[i - 1].ate + 1);
    }
  });

  it('com os limites padrão são as três faixas, na ordem', () => {
    expect(faixasDaRegua()).toEqual([
      { temperatura: 'Frio', de: 0, ate: 39 },
      { temperatura: 'Morno', de: 40, ate: 69 },
      { temperatura: 'Quente', de: 70, ate: 100 },
    ]);
  });

  /*
   * Limites sobrepostos (morno 80, quente 70) fazem Morno não existir: todo
   * score de 70 para cima é Quente. A régua não pode desenhar uma faixa vazia
   * — um bloco "Morno" na tela em que nenhum lead pode cair é pior que não
   * ter, porque alguém ajusta os limites tentando alcançá-lo.
   */
  it('faixa em que nenhum score cai não é desenhada', () => {
    const faixas = faixasDaRegua({ ...PESOS_PADRAO, limite_morno: 80, limite_quente: 70 });
    expect(faixas.map((f) => f.temperatura)).toEqual(['Frio', 'Quente']);
    expect(faixas.every((f) => f.ate >= f.de)).toBe(true);
  });

  it('a temperatura do selo é a mesma função que a régua usa', () => {
    for (const alvo of [0, 39, 40, 69, 70, 100]) {
      const r = calcularScore({}, { ...PESOS_PADRAO, ponto_de_partida: alvo });
      expect(r.temperatura).toBe(temperaturaDoScore(r.score));
    }
  });
});

/*
 * `avaliarLead` é a regra do "não inventa número", e ela existe uma vez só
 * porque três telas precisavam dela: o selo do card, a ficha e o filtro do
 * Kanban. Cada uma tinha a sua cópia.
 */
describe('sem sinal, não há avaliação', () => {
  it('lead sem sinais carregados devolve null, e não 50 · Morno', () => {
    expect(avaliarLead(null)).toBeNull();
    expect(avaliarLead(undefined)).toBeNull();
  });

  it('lead com sinais devolve a mesma conta de calcularScore', () => {
    const sinais: SinaisDoLead = { pediu_visita: true, respondeu: true };
    expect(avaliarLead(sinais, 7)).toEqual(calcularScore({ ...sinais, peso_da_origem: 7 }));
  });

  it('objeto de sinais vazio é avaliação, e não ausência de avaliação', () => {
    // `{}` chega quando o banco respondeu "não há sinal nenhum para este
    // lead" — diferente de `null`, que é "ainda não perguntei". A ficha diz
    // coisas distintas nos dois casos.
    const r = avaliarLead({});
    expect(r).not.toBeNull();
    expect(r!.sinaisObservados).toBe(0);
  });
});
