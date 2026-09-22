import { describe, it, expect } from 'vitest';
import { relogioDoPrazo, emPalavras, corDoRelogio } from '../relogioDoPrazo';

/**
 * Calendário de referência: 17/09/2026 é quinta, 18/09 sexta, 19/09 sábado,
 * 20/09 domingo, 21/09 segunda. Expediente 9h–20h, de segunda a sexta.
 */
const br = (dia: number, hora: number, minuto = 0) =>
  new Date(Date.UTC(2026, 8, dia, hora + 3, minuto));

describe('emPalavras', () => {
  it('minutos, horas e dias', () => {
    expect(emPalavras(42)).toBe('42 min');
    expect(emPalavras(59)).toBe('59 min');
    expect(emPalavras(60)).toBe('1h 00');
    expect(emPalavras(125)).toBe('2h 05');
    // 11h é um dia de expediente inteiro: acima disso, contar em horas para de
    // ajudar ("atrasado 34h" não diz nada a ninguém).
    expect(emPalavras(11 * 60)).toBe('1 dia');
    expect(emPalavras(22 * 60)).toBe('2 dias');
  });

  it('não devolve minuto negativo', () => {
    expect(emPalavras(-10)).toBe('0 min');
  });
});

describe('relogioDoPrazo', () => {
  it('SEM prazo não inventa relógio', () => {
    // Lead que a Lia ainda não passou. Mostrar "atender em 60 min" aqui seria
    // cobrar do corretor um lead que ainda não é dele.
    expect(relogioDoPrazo({ prazoAte: null }).situacao).toBe('sem_prazo');
    expect(relogioDoPrazo({ prazoAte: undefined }).texto).toBe('');
    expect(relogioDoPrazo({ prazoAte: 'não é data' }).situacao).toBe('sem_prazo');
  });

  it('atendido para o relógio, mesmo fora do prazo', () => {
    const r = relogioDoPrazo({
      prazoAte: br(17, 10), atendidoEm: br(17, 18), agora: br(18, 15),
    });
    expect(r).toMatchObject({ situacao: 'atendido', texto: 'atendido' });
  });

  it('O CASO DO PLANO: "atender em 42 min"', () => {
    const r = relogioDoPrazo({ prazoAte: br(17, 15, 42), agora: br(17, 15) });
    expect(r.texto).toBe('atender em 42 min');
    expect(r.situacao).toBe('correndo');
  });

  it('CONTA MINUTOS DE EXPEDIENTE, NÃO DE PAREDE', () => {
    // Lead que chegou sexta 19h30, com prazo na SEGUNDA 09h30 (30 min na sexta
    // + 30 na segunda). Quinze minutos depois, às 19h45, faltam 45 minutos de
    // trabalho — e o relógio de parede diria "faltam 61 horas".
    //
    // Escrevi este caso errado na primeira versão (esperei 30 min às 19h30) e
    // o código estava certo: às 19h30 o lead ACABOU de chegar, então falta a
    // hora inteira. O que se divide entre sexta e segunda é ONDE os minutos
    // caem, não quantos restam.
    const r = relogioDoPrazo({ prazoAte: br(21, 9, 30), agora: br(18, 19, 45) });
    expect(r.texto).toBe('atender em 45 min');

    // E no instante da chegada, a hora inteira.
    expect(relogioDoPrazo({ prazoAte: br(21, 9, 30), agora: br(18, 19, 30) }).minutos).toBe(60);
  });

  it('no fim de semana o relógio não anda', () => {
    // Mesmo prazo (segunda 09h30), olhando no sábado e no domingo: o que falta
    // continua sendo 30 minutos, porque nada correu.
    const sabado = relogioDoPrazo({ prazoAte: br(21, 9, 30), agora: br(19, 12) });
    const domingo = relogioDoPrazo({ prazoAte: br(21, 9, 30), agora: br(20, 23) });
    expect(sabado.minutos).toBe(30);
    expect(domingo.minutos).toBe(30);
  });

  it('a noite também não anda', () => {
    // Prazo quinta 10h. Olhando quarta 23h: falta 1h (das 9h às 10h da quinta),
    // e não as 11 horas de relógio de parede.
    const r = relogioDoPrazo({ prazoAte: br(17, 10), agora: br(16, 23) });
    expect(r.minutos).toBe(60);
  });

  it('estourado conta o atraso em minutos ÚTEIS', () => {
    // Prazo sexta 19h; agora, segunda 10h. O atraso é 1h na sexta + 1h na
    // segunda = 2h — e não as 63 horas que o calendário mostra.
    const r = relogioDoPrazo({ prazoAte: br(18, 19), agora: br(21, 10) });
    expect(r.situacao).toBe('estourado');
    expect(r.minutos).toBe(120);
    expect(r.texto).toBe('atrasado 2h 00');
  });

  it('aceita a data como texto, que é como vem do banco', () => {
    const r = relogioDoPrazo({ prazoAte: br(17, 15, 42).toISOString(), agora: br(17, 15) });
    expect(r.texto).toBe('atender em 42 min');
  });
});

describe('corDoRelogio', () => {
  it('vermelho só quando estourou', () => {
    expect(corDoRelogio(relogioDoPrazo({ prazoAte: br(18, 19), agora: br(21, 10) }))).toMatch(/red/);
  });

  it('amarelo na última meia hora, neutro antes disso', () => {
    expect(corDoRelogio(relogioDoPrazo({ prazoAte: br(17, 15, 20), agora: br(17, 15) }))).toMatch(/amber/);
    expect(corDoRelogio(relogioDoPrazo({ prazoAte: br(17, 17), agora: br(17, 15) }))).toMatch(/slate/);
  });

  it('verde quando atendido', () => {
    expect(corDoRelogio(relogioDoPrazo({ prazoAte: br(17, 10), atendidoEm: br(17, 9) }))).toMatch(/emerald/);
  });
});
