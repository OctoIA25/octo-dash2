/**
 * linkify — URLs no texto das Observações (ex.: o link de conversa anexado
 * pelo trigger) viram âncoras clicáveis; o restante permanece texto puro.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { linkify } from './linkify';

describe('linkify', () => {
  it('torna a URL clicável e preserva o texto ao redor', () => {
    render(<p>{linkify('Interesse no AP0001\n\n📱 Conversa WhatsApp: https://dash.exemplo.com/chat?phone=5511988887777')}</p>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://dash.exemplo.com/chat?phone=5511988887777');
    expect(screen.getByText(/interesse no AP0001/i)).toBeInTheDocument();
  });

  it('texto sem URL fica intacto, sem âncoras', () => {
    render(<p>{linkify('Cliente quer 3 quartos na Vila Mariana')}</p>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/vila mariana/i)).toBeInTheDocument();
  });
});
