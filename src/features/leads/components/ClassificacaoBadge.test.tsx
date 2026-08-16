import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassificacaoBadge } from './ClassificacaoBadge';

describe('ClassificacaoBadge', () => {
  it.each([
    ['lancamento', 'Lançamento'],
    ['pronto', 'Pronto'],
    ['locacao', 'Locação'],
  ])('%s renderiza "%s"', (tipo, label) => {
    render(<ClassificacaoBadge tipo={tipo} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([null, undefined, 'indefinido', 'valor_que_nao_existe'])(
    '%p cai no estado mudo — nunca some nem quebra', (tipo) => {
      render(<ClassificacaoBadge tipo={tipo as string} />);
      expect(screen.getByText('Sem classificação')).toBeInTheDocument();
    });

  it('repassa className extra pro elemento renderizado (estilização, não lógica)', () => {
    render(<ClassificacaoBadge tipo="pronto" className="text-[9px] px-1 py-0 h-4" />);
    expect(screen.getByText('Pronto').className).toContain('text-[9px]');
  });
});
