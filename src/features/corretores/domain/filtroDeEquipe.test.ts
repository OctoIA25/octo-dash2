import { describe, expect, it } from 'vitest';
import { atuacoesDe } from '@/types/permissions';
import { estaNaEquipe } from './filtroDeEquipe';

const membro = (equipe: string, atuacao?: unknown) => ({ equipe, atuacoes: atuacoesDe({ atuacao }) });

describe('estaNaEquipe', () => {
  it('Lançamentos e Prontos separam pela Atuação', () => {
    const lanc = membro('Vendas', ['lancamentos']);
    const pronto = membro('Vendas', ['prontos']);
    expect(estaNaEquipe(lanc, 'lancamentos')).toBe(true);
    expect(estaNaEquipe(lanc, 'prontos')).toBe(false);
    expect(estaNaEquipe(pronto, 'prontos')).toBe(true);
    expect(estaNaEquipe(pronto, 'lancamentos')).toBe(false);
  });

  it('sem atuação marcada atende tudo e aparece nos dois', () => {
    const tudo = membro('Gestão');
    expect(estaNaEquipe(tudo, 'lancamentos')).toBe(true);
    expect(estaNaEquipe(tudo, 'prontos')).toBe(true);
  });

  it('Vendas, Gestão e Todas seguem como antes', () => {
    const admin = membro('Gestão', ['prontos']);
    expect(estaNaEquipe(admin, 'Gestão')).toBe(true);
    expect(estaNaEquipe(admin, 'Vendas')).toBe(false);
    expect(estaNaEquipe(admin, 'todas')).toBe(true);
  });
});
