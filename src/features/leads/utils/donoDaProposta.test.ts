import { describe, expect, it } from 'vitest';
import { donoDaProposta } from './donoDaProposta';

describe('de quem é a proposta', () => {
  it('quem salva não vira dono: o corretor do lead continua', () => {
    expect(donoDaProposta('andre', 'André Marcondes', 'yasmin')).toBe('andre');
  });

  it('nome digitado sem conta conhecida fica sem dono — a leitura casa pelo nome', () => {
    expect(donoDaProposta(null, 'André Marcondes', 'yasmin')).toBeNull();
  });

  it('sem nome nenhum, o dono é quem criou', () => {
    expect(donoDaProposta(undefined, '  ', 'corretor-1')).toBe('corretor-1');
    expect(donoDaProposta(undefined, '', null)).toBeNull();
  });
});
