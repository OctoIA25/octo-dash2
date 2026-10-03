import { describe, it, expect } from 'vitest';
import { podeAbrirConferencia, podeMexerNoDinheiro } from './acessoDaConferencia';

describe('quem entra na Conferência de vendas (03/10)', () => {
  it('Diretoria/admin (permissão financeiro) entra e mexe no dinheiro', () => {
    const q = { podeFinanceiro: true, systemRole: 'admin' };
    expect(podeAbrirConferencia(q)).toBe(true);
    expect(podeMexerNoDinheiro(q)).toBe(true);
  });
  it('o Gerente entra, mas não mexe em repasse, nota anexada nem releitura', () => {
    const q = { podeFinanceiro: false, systemRole: 'team_leader' };
    expect(podeAbrirConferencia(q)).toBe(true);
    expect(podeMexerNoDinheiro(q)).toBe(false);
  });
  it('corretor não entra', () => {
    expect(podeAbrirConferencia({ podeFinanceiro: false, systemRole: 'corretor' })).toBe(false);
  });
  it('o dono da plataforma entra e mexe', () => {
    expect(podeAbrirConferencia({ isOwner: true, podeFinanceiro: false })).toBe(true);
    expect(podeMexerNoDinheiro({ isOwner: true, podeFinanceiro: false })).toBe(true);
  });
});
