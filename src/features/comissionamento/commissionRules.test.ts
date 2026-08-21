import { describe, it, expect } from 'vitest';
import { calcularComissao, totaisPorParte, type Operacao } from './commissionRules';

/** Atalho: valor pago a uma parte no resultado consolidado. */
const recebe = (resultado: ReturnType<typeof calcularComissao>, parte: string) =>
  totaisPorParte(resultado).find((t) => t.parte === parte)?.valor ?? 0;

const andre = { nome: 'Andre', nivel: 'coordenador' as const };
const pedro = { nome: 'Pedro', nivel: 'coordenador' as const };

describe('calcularComissao — cenários da spec v1.4', () => {
  it('3.2 — Junior com Líder Direto Coordenador (lançamento sem parceria)', () => {
    const r = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: 5000,
      intermediacao: { nome: 'Ana', nivel: 'junior', liderDireto: pedro },
    });
    expect(r.bloqueio).toBeNull();
    expect(recebe(r, 'Ana')).toBe(2000);
    expect(recebe(r, 'Pedro')).toBe(1000);
    expect(recebe(r, 'Lotus')).toBe(2000);
  });

  it('Exemplo 1 — revenda, um corretor por ponta', () => {
    const r = calcularComissao({
      tipo: 'revenda',
      comissaoTotal: 10000,
      captacao: andre,
      intermediacao: { nome: 'Erick', nivel: 'pleno', liderDireto: andre },
    });
    expect(recebe(r, 'Andre')).toBe(3750);
    expect(recebe(r, 'Erick')).toBe(2250);
    expect(recebe(r, 'Lotus')).toBe(4000);
  });

  it('Exemplo 2 — lançamento, Sênior liderada por Coordenador', () => {
    const r = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: 8000,
      intermediacao: { nome: 'Maria', nivel: 'senior', liderDireto: pedro },
    });
    expect(recebe(r, 'Maria')).toBe(4000);
    expect(recebe(r, 'Pedro')).toBe(800);
    expect(recebe(r, 'Lotus')).toBe(3200);
  });

  it('Exemplo 3.a — lançamento com parceiro imobiliária (50/50)', () => {
    const r = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: 100000,
      intermediacao: andre,
      parceiro: { tipo: 'imobiliaria', nome: 'Imob X', contratoFormal: true },
    });
    expect(recebe(r, 'Imob X')).toBe(50000);
    expect(recebe(r, 'Andre')).toBe(30000);
    expect(recebe(r, 'Lotus')).toBe(20000);
  });

  it('Exemplo 3.b — lançamento com corretor autônomo (40/60)', () => {
    const r = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: 100000,
      intermediacao: { nome: 'Maria', nivel: 'junior', liderDireto: pedro },
      parceiro: { tipo: 'corretor_autonomo', nome: 'Autônomo', contratoFormal: true },
    });
    expect(recebe(r, 'Autônomo')).toBe(40000);
    expect(recebe(r, 'Maria')).toBe(24000);
    expect(recebe(r, 'Pedro')).toBe(12000);
    expect(recebe(r, 'Lotus')).toBe(24000);
  });

  it('Exemplo 4 — mesmo corretor nas duas pontas', () => {
    const r = calcularComissao({ tipo: 'revenda', comissaoTotal: 10000, captacao: andre, intermediacao: andre });
    expect(r.cenario).toContain('D');
    expect(recebe(r, 'Andre')).toBe(6000);
    expect(recebe(r, 'Lotus')).toBe(4000);
  });

  it('3.5.a — revenda com parceria: cada lado leva uma ponta inteira', () => {
    const r = calcularComissao({
      tipo: 'revenda',
      comissaoTotal: 48000,
      captacao: andre,
      parceiro: { tipo: 'imobiliaria', nome: 'Imob X', contratoFormal: true },
    });
    expect(recebe(r, 'Imob X')).toBe(24000);
    expect(recebe(r, 'Andre')).toBe(14400);
    expect(recebe(r, 'Lotus')).toBe(9600);
  });

  it('3.6 — permuta é duas operações independentes', () => {
    const imovel = (comissao: number): Operacao => ({
      tipo: 'revenda',
      comissaoTotal: comissao,
      captacao: andre,
      intermediacao: { nome: 'Erick', nivel: 'pleno', liderDireto: andre },
    });
    const r = calcularComissao({
      tipo: 'permuta',
      temDiferencaMonetaria: false,
      imovelA: imovel(48000),
      imovelB: imovel(30000),
    });
    expect(r.total).toBe(78000);
    expect(recebe(r, 'Andre')).toBe(29250);
    expect(recebe(r, 'Erick')).toBe(17550);
    expect(recebe(r, 'Lotus')).toBe(31200);
  });

  it('a soma sempre fecha a comissão total', () => {
    const r = calcularComissao({
      tipo: 'revenda',
      comissaoTotal: 13333.33,
      captacao: { nome: 'Ana', nivel: 'estagiario', liderDireto: pedro },
      intermediacao: { nome: 'Erick', nivel: 'senior' },
    });
    const soma = r.linhas.reduce((acc, l) => acc + l.valor, 0);
    expect(soma).toBeCloseTo(13333.33, 2);
  });
});

describe('calcularComissao — bloqueios e escalação', () => {
  it('L003 quando corretor abaixo de Sênior está sem Coordenador (D062)', () => {
    const r = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: 10000,
      intermediacao: { nome: 'Ana', nivel: 'junior' },
    });
    expect(r.bloqueio?.codigo).toBe('L003');
    expect(r.linhas).toHaveLength(0);
  });

  it('Sênior e Coordenador são líderes de si mesmos (3.1)', () => {
    const r = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: 10000,
      intermediacao: { nome: 'Erick', nivel: 'senior' },
    });
    expect(r.bloqueio).toBeNull();
    expect(recebe(r, 'Erick')).toBe(5000);
    expect(recebe(r, 'Lotus')).toBe(5000);
  });

  it('L003 quando a parceria não tem contrato formal', () => {
    const r = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: 10000,
      intermediacao: andre,
      parceiro: { tipo: 'imobiliaria', contratoFormal: false },
    });
    expect(r.bloqueio?.codigo).toBe('L003');
  });

  it('L003 na permuta com diferença monetária', () => {
    const op: Operacao = { tipo: 'revenda', comissaoTotal: 1000, captacao: andre };
    const r = calcularComissao({ tipo: 'permuta', temDiferencaMonetaria: true, imovelA: op, imovelB: op });
    expect(r.bloqueio?.codigo).toBe('L003');
  });

  it('L007 quando o Líder Direto tem % menor que o liderado', () => {
    const r = calcularComissao({
      tipo: 'lancamento',
      comissaoTotal: 10000,
      intermediacao: { nome: 'Maria', nivel: 'senior', liderDireto: { nome: 'Joao', nivel: 'pleno' } },
    });
    expect(r.bloqueio?.codigo).toBe('L007');
  });

  it('ponta sem corretor fica inteira com a Lotus', () => {
    const r = calcularComissao({ tipo: 'revenda', comissaoTotal: 10000, intermediacao: andre });
    expect(recebe(r, 'Andre')).toBe(3000);
    expect(recebe(r, 'Lotus')).toBe(7000);
  });
});
