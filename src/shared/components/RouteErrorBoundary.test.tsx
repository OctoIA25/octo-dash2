import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RouteErrorBoundary } from './RouteErrorBoundary';

const Boom = () => {
  throw new Error('falha de teste');
};

describe('RouteErrorBoundary', () => {
  it('mostra fallback visível com a mensagem do erro (sem tela branca)', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Boom />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('Algo deu errado nesta página')).toBeInTheDocument();
    expect(screen.getByText('falha de teste')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('renderiza os filhos normalmente sem erro', () => {
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <p>conteúdo ok</p>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('conteúdo ok')).toBeInTheDocument();
  });
});
