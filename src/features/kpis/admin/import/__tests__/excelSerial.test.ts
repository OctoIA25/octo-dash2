import { describe, expect, it } from 'vitest';
import { excelSerialToDate, parsePeriodHeader } from '../excelSerial';

describe('excelSerialToDate', () => {
  // Valores ancorados na fórmula CANÔNICA (offset 25569). Dois pontos travam a
  // conversão: se alguém deslocar o offset, ambos quebram (evita o "ajuste"
  // que encaixa um valor e estraga os demais).
  it('converte seriais conhecidos com a fórmula canônica', () => {
    expect(excelSerialToDate(45978)).toBe('2025-11-17'); // serial real da planilha SANTA ANGELA
    expect(excelSerialToDate(46081)).toBe('2026-02-28'); // serial real da planilha MKT-JAPI
    expect(excelSerialToDate(45292)).toBe('2024-01-01'); // âncora redonda (1º de janeiro)
  });
  it('rejeita valores implausíveis', () => {
    expect(excelSerialToDate(5)).toBeNull();
    expect(excelSerialToDate(999999)).toBeNull();
  });
});

describe('parsePeriodHeader', () => {
  it('mês por extenso e abreviado', () => {
    expect(parsePeriodHeader('Janeiro 2026')).toEqual({ type: 'month', periodStart: '2026-01-01' });
    expect(parsePeriodHeader('Jan/2026')).toEqual({ type: 'month', periodStart: '2026-01-01' });
    expect(parsePeriodHeader('fev 2026')).toEqual({ type: 'month', periodStart: '2026-02-01' });
  });
  it('mês numérico MM/AAAA e AAAA-MM', () => {
    expect(parsePeriodHeader('03/2026')).toEqual({ type: 'month', periodStart: '2026-03-01' });
    expect(parsePeriodHeader('2026-04')).toEqual({ type: 'month', periodStart: '2026-04-01' });
  });
  it('trimestre (exige marcador q/t) e ano', () => {
    expect(parsePeriodHeader('Q2 2026')).toEqual({ type: 'quarter', periodStart: '2026-04-01' });
    expect(parsePeriodHeader('q1/2026')).toEqual({ type: 'quarter', periodStart: '2026-01-01' });
    expect(parsePeriodHeader('1T2026')).toEqual({ type: 'quarter', periodStart: '2026-01-01' });
    expect(parsePeriodHeader('2026')).toEqual({ type: 'year', periodStart: '2026-01-01' });
  });
  it('dígito solto + ano NÃO é trimestre — é mês (MM AAAA), sem marcador q/t', () => {
    // Antes do fix, "3 2026" virava trimestre Q3 (errado). Agora o trimestre
    // exige 'q'/'t'; "3 2026" cai na regra MM AAAA → mês 3 (interpretação correta).
    expect(parsePeriodHeader('3 2026')).toEqual({ type: 'month', periodStart: '2026-03-01' });
    expect(parsePeriodHeader('1 2026')).toEqual({ type: 'month', periodStart: '2026-01-01' });
  });
  it('serial Excel como cabeçalho → mês (dia é irrelevante p/ período)', () => {
    // 45978 = 2025-11-17 na conversão; como período, vira o mês 2025-11.
    expect(parsePeriodHeader('45978')).toEqual({ type: 'month', periodStart: '2025-11-01' });
  });
  it('não-período → null', () => {
    expect(parsePeriodHeader('Corretor')).toBeNull();
    expect(parsePeriodHeader('E-MAIL')).toBeNull();
  });

  it('mês SEM ano: null sem defaultYear; vira mês com defaultYear', () => {
    // Sem defaultYear, permanece null (puro/determinístico).
    expect(parsePeriodHeader('Janeiro')).toBeNull();
    expect(parsePeriodHeader('Jan')).toBeNull();
    // Com defaultYear, reconhece o mês no ano dado (caso real: planilha com Jan..Dez).
    expect(parsePeriodHeader('Janeiro', 2026)).toEqual({ type: 'month', periodStart: '2026-01-01' });
    expect(parsePeriodHeader('Jan', 2026)).toEqual({ type: 'month', periodStart: '2026-01-01' });
    expect(parsePeriodHeader('março', 2025)).toEqual({ type: 'month', periodStart: '2025-03-01' });
    expect(parsePeriodHeader('Dez', 2026)).toEqual({ type: 'month', periodStart: '2026-12-01' });
    // Mês COM ano explícito ignora o defaultYear (o ano do cabeçalho vence).
    expect(parsePeriodHeader('Janeiro 2024', 2026)).toEqual({ type: 'month', periodStart: '2024-01-01' });
    // Texto que não é mês continua null mesmo com defaultYear.
    expect(parsePeriodHeader('Corretor', 2026)).toBeNull();
  });
});
