import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassificacaoBadge, ClassificacaoDots, CLASSIFICACAO_ESTILOS } from './ClassificacaoBadge';

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

  it('array vira uma badge por valor — o lead pode ser Lançamento E Locação', () => {
    render(<ClassificacaoBadge tipo={['lancamento', 'locacao']} />);
    expect(screen.getByText('Lançamento')).toBeInTheDocument();
    expect(screen.getByText('Locação')).toBeInTheDocument();
    expect(screen.queryByText('Sem classificação')).not.toBeInTheDocument();
  });

  it('array vazio cai no estado mudo, igual a null', () => {
    render(<ClassificacaoBadge tipo={[]} />);
    expect(screen.getByText('Sem classificação')).toBeInTheDocument();
  });

  it('repassa className extra pro elemento renderizado (estilização, não lógica)', () => {
    render(<ClassificacaoBadge tipo="pronto" className="text-[9px] px-1 py-0 h-4" />);
    expect(screen.getByText('Pronto').className).toContain('text-[9px]');
  });
});

/**
 * Nos cards (Kanban e Bolsão) a classificação vira ponto colorido: dois rótulos
 * por extenso estouravam a largura da coluna. Cor sozinha não é informação
 * acessível — daí o aria-label em cada ponto, que é o que este teste trava.
 */
describe('ClassificacaoDots', () => {
  it('um ponto por classificação, cada um nomeado', () => {
    render(<ClassificacaoDots tipo={['lancamento', 'locacao']} />);
    expect(screen.getByRole('img', { name: 'Lançamento' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Locação' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('vazio continua visível como "Sem classificação" — nunca some', () => {
    render(<ClassificacaoDots tipo={null} />);
    expect(screen.getByRole('img', { name: 'Sem classificação' })).toBeInTheDocument();
  });

  it('a cor do ponto vem do mesmo vocabulário da badge', () => {
    render(<ClassificacaoDots tipo="pronto" />);
    expect(screen.getByRole('img', { name: 'Pronto' }).className)
      .toContain(CLASSIFICACAO_ESTILOS.pronto.dot);
  });
});
