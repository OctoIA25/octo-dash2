/**
 * O relógio do atendimento.
 *
 * A regra combinada em **22/09/2026**: 9h às 20h, de SEGUNDA A SEXTA. Sábado e
 * domingo o relógio fica parado. Tudo em horário de Brasília — o banco guarda
 * UTC, e errar o fuso desloca o prazo em três horas, o que num prazo de uma
 * hora é a diferença entre certo e absurdo.
 *
 * ISTO SUBSTITUI a regra de 19/09, que incluía o sábado. Seis casos deste
 * arquivo mudaram de resposta por causa disso, e cada um foi recalculado à
 * mão — não "ajustado até passar".
 *
 * O caso que o plano nomeia está aqui como teste, e agora em DUAS versões: na
 * quinta, em que "o dia seguinte" é mesmo o dia seguinte; e na sexta, em que
 * o resto do prazo só corre na segunda. Era essa a pergunta que o chefe
 * respondeu.

 * Calendário de referência: 17/09/2026 é quinta, 18/09 sexta, 19/09 sábado,
 * 20/09 domingo e 21/09 segunda.
 */
import { describe, it, expect } from 'vitest';
import {
  JANELA_PADRAO,
  janelaParaConfiguracao,
  janelaDaConfiguracao,
  prazoDeAtendimento,
  minutosUteisEntre,
  diaDaSemanaEmBrasilia,
  minutosDoDiaEmBrasilia,
  minutosDePrazo,
} from './janela.js';

/** Data em horário de Brasília (UTC-3). 19/09/2026 é um sábado. */
const br = (dia, hora, minuto = 0) => new Date(Date.UTC(2026, 8, dia, hora + 3, minuto));
const hhmm = (d) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', hour: '2-digit', minute: '2-digit' });

describe('leitura de data em Brasília', () => {
  it('19/09/2026 é sábado', () => {
    expect(diaDaSemanaEmBrasilia(br(19, 10))).toBe(6);
  });

  it('20/09/2026 é domingo', () => {
    expect(diaDaSemanaEmBrasilia(br(20, 10))).toBe(0);
  });

  it('a virada do dia é a de Brasília, não a do UTC', () => {
    // 21/09 às 02:00 UTC ainda é dia 20 (domingo) às 23:00 em Brasília.
    const d = new Date(Date.UTC(2026, 8, 21, 2, 0));
    expect(diaDaSemanaEmBrasilia(d)).toBe(0);
    expect(minutosDoDiaEmBrasilia(d)).toBe(23 * 60);
  });
});

describe('prazoDeAtendimento', () => {
  it('dentro do expediente, é só somar', () => {
    // Sexta (18/09) às 10h + 60 min = 11h.
    const r = prazoDeAtendimento(br(18, 10), 60);
    expect(hhmm(r)).toBe('18, 11:00');
  });

  it('O CASO DO PLANO: 19h30 na QUINTA vira 09h30 da sexta', () => {
    // Quinta 17/09 às 19h30: sobram 30 min até as 20h; os outros 30 correm na
    // sexta a partir das 9h. É o exemplo literal do plano.
    const r = prazoDeAtendimento(br(17, 19, 30), 60);
    expect(hhmm(r)).toBe('18, 09:30');
  });

  it('o mesmo caso na SEXTA pula o fim de semana inteiro', () => {
    // Sexta 18/09 às 19h30: 30 min na sexta; sábado e domingo não contam, e os
    // outros 30 correm na SEGUNDA a partir das 9h. Antes de 22/09 esta conta
    // dava sábado 09h30.
    const r = prazoDeAtendimento(br(18, 19, 30), 60);
    expect(hhmm(r)).toBe('21, 09:30');
  });

  it('lead que chega DEPOIS do expediente começa a contar no dia seguinte', () => {
    // Sexta 18/09 às 22h -> SEGUNDA 21/09 às 9h + 60 min.
    const r = prazoDeAtendimento(br(18, 22), 60);
    expect(hhmm(r)).toBe('21, 10:00');
  });

  it('lead que chega ANTES do expediente espera as 9h', () => {
    const r = prazoDeAtendimento(br(18, 6), 60);
    expect(hhmm(r)).toBe('18, 10:00');
  });

  it('DOMINGO o relógio fica parado: lead de domingo conta a partir de segunda', () => {
    // Domingo 20/09 às 10h -> segunda 21/09 às 9h + 60 min.
    const r = prazoDeAtendimento(br(20, 10), 60);
    expect(hhmm(r)).toBe('21, 10:00');
  });

  it('SÁBADO não conta nada: o relógio só começa na segunda', () => {
    // Sábado 19/09 às 19h30 -> a hora INTEIRA corre na segunda, das 9h às 10h.
    // Até 19/09 esta conta dava 30 min no sábado e 30 na segunda (09h30).
    const r = prazoDeAtendimento(br(19, 19, 30), 60);
    expect(hhmm(r)).toBe('21, 10:00');
  });

  it('prazo longo atravessa vários dias, contando só horas úteis', () => {
    // Sexta 10h + 20h de prazo: 10h correm na sexta (10h→20h) e as outras 10
    // na SEGUNDA, a partir das 9h -> 19h.
    const r = prazoDeAtendimento(br(18, 10), 20 * 60);
    expect(hhmm(r)).toBe('21, 19:00');
  });

  it('entrada inválida não inventa prazo', () => {
    expect(prazoDeAtendimento(new Date('nada'), 60)).toBeNull();
    expect(prazoDeAtendimento(br(18, 10), 0)).toBeNull();
    expect(prazoDeAtendimento(br(18, 10), -5)).toBeNull();
    expect(prazoDeAtendimento(null, 60)).toBeNull();
  });

  it('janela sem nenhum dia ativo devolve null, em vez de um prazo inventado', () => {
    expect(prazoDeAtendimento(br(18, 10), 60, [null, null, null, null, null, null, null])).toBeNull();
  });
});

describe('janelaDaConfiguracao', () => {
  it('configuração vazia cai no padrão combinado — é o caso da Lotus hoje', () => {
    expect(janelaDaConfiguracao({})).toBe(JANELA_PADRAO);
    expect(janelaDaConfiguracao(null)).toBe(JANELA_PADRAO);
    expect(janelaDaConfiguracao(undefined)).toBe(JANELA_PADRAO);
  });

  it('lê o formato que está gravado no banco', () => {
    const j = janelaDaConfiguracao({
      segunda: { ativo: true, inicio: '09:00', termino: '18:00' },
      sabado: { ativo: true, inicio: '09:00', termino: '13:00' },
      domingo: { ativo: false, inicio: '09:00', termino: '18:00' },
    });
    expect(j[1]).toEqual({ inicio: 540, fim: 1080 });
    expect(j[6]).toEqual({ inicio: 540, fim: 780 });
    expect(j[0]).toBeNull();
  });

  it('dia sem configuração fica desligado, não vira dia cheio', () => {
    const j = janelaDaConfiguracao({ segunda: { ativo: true, inicio: '09:00', termino: '18:00' } });
    expect(j[2]).toBeNull();
  });

  it('janela invertida é configuração quebrada: o dia não conta', () => {
    const j = janelaDaConfiguracao({ segunda: { ativo: true, inicio: '20:00', termino: '09:00' } });
    expect(j[1]).toBeNull();
  });

  it('a configuração do tenant é respeitada no cálculo do prazo', () => {
    // Com o horário ANTIGO da Lotus (até 18h), 17h30 + 1h vira 09h30 do dia
    // seguinte; com a janela nova (até 20h), seria 18h30 no mesmo dia.
    const antiga = janelaDaConfiguracao({
      sexta: { ativo: true, inicio: '09:00', termino: '18:00' },
      sabado: { ativo: true, inicio: '09:00', termino: '13:00' },
    });
    expect(hhmm(prazoDeAtendimento(br(18, 17, 30), 60, antiga))).toBe('19, 09:30');
    expect(hhmm(prazoDeAtendimento(br(18, 17, 30), 60))).toBe('18, 18:30');
  });
});

describe('minutosUteisEntre', () => {
  it('conta só o que está dentro do expediente', () => {
    expect(minutosUteisEntre(br(18, 10), br(18, 11, 30))).toBe(90);
  });

  it('a noite não conta', () => {
    // Quinta 19h -> sexta 10h: 1h na quinta + 1h na sexta.
    expect(minutosUteisEntre(br(17, 19), br(18, 10))).toBe(120);
  });

  it('sexta à noite para sábado de manhã conta só a hora da sexta', () => {
    // Sexta 19h -> sábado 10h: 1h na sexta, e o sábado inteiro vale zero.
    expect(minutosUteisEntre(br(18, 19), br(19, 10))).toBe(60);
  });

  it('o FIM DE SEMANA inteiro não conta', () => {
    // Sábado 19h -> segunda 10h: sábado zero, domingo zero, 1h na segunda.
    expect(minutosUteisEntre(br(19, 19), br(21, 10))).toBe(60);
  });

  it('intervalo inteiro fora do expediente dá zero', () => {
    expect(minutosUteisEntre(br(20, 10), br(20, 18))).toBe(0);
  });

  it('fim antes do início dá zero, não negativo', () => {
    expect(minutosUteisEntre(br(18, 11), br(18, 10))).toBe(0);
  });
});

describe('minutosDePrazo — o ajuste mora aqui, não na rota', () => {
  it('usa o valor da imobiliária quando ele é razoável', () => {
    expect(minutosDePrazo({ tempo_expiracao_exclusivo: 30 })).toBe(30);
    expect(minutosDePrazo({ tempo_expiracao_exclusivo: 120 })).toBe(120);
  });

  it('OS 525.600 MINUTOS DA LOTUS caem no padrão', () => {
    // 365 dias: o jeito que a equipe achou de dizer "nunca expira" numa tela
    // sem a opção "desligado". Como prazo real, daria uma data no ano seguinte.
    expect(minutosDePrazo({ tempo_expiracao_exclusivo: 525600 })).toBe(60);
  });

  it('valor ausente, zero, negativo ou lixo cai no padrão', () => {
    expect(minutosDePrazo(null)).toBe(60);
    expect(minutosDePrazo({})).toBe(60);
    expect(minutosDePrazo({ tempo_expiracao_exclusivo: 0 })).toBe(60);
    expect(minutosDePrazo({ tempo_expiracao_exclusivo: -5 })).toBe(60);
    expect(minutosDePrazo({ tempo_expiracao_exclusivo: 'muito' })).toBe(60);
  });

  it('exatamente 24h já é demais para um prazo de atendimento', () => {
    expect(minutosDePrazo({ tempo_expiracao_exclusivo: 1440 })).toBe(60);
    expect(minutosDePrazo({ tempo_expiracao_exclusivo: 1439 })).toBe(1439);
  });
});

describe('janelaParaConfiguracao — o caminho de volta, para não haver dois padrões', () => {
  it('o padrão da TELA é o mesmo da REGRA', () => {
    const c = janelaParaConfiguracao();
    expect(c.segunda).toEqual({ ativo: true, inicio: '09:00', termino: '20:00' });
    expect(c.sexta).toEqual({ ativo: true, inicio: '09:00', termino: '20:00' });
    // Os dois que a decisão de 22/09 desligou.
    expect(c.sabado.ativo).toBe(false);
    expect(c.domingo.ativo).toBe(false);
  });

  it('SALVAR A TELA SEM MUDAR NADA não pode mexer no prazo', () => {
    // Era o furo: a tela tinha um padrão próprio (9h-18h, sábado 9h-13h), e
    // abrir Configurações e salvar reescrevia a regra com o sábado ativo.
    const daTela = janelaParaConfiguracao(JANELA_PADRAO);
    expect(janelaDaConfiguracao(daTela)).toEqual(JANELA_PADRAO);
  });

  it('dia desligado guarda horário plausível, para o campo não abrir vazio', () => {
    expect(janelaParaConfiguracao().sabado.inicio).toBe('09:00');
  });

  it('ida e volta de uma janela personalizada devolve a mesma coisa', () => {
    const custom = [null, { inicio: 480, fim: 1080 }, null, null, null, null, { inicio: 540, fim: 780 }];
    expect(janelaDaConfiguracao(janelaParaConfiguracao(custom))).toEqual(custom);
  });
});
