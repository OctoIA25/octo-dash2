import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WhatsAppPreview } from '../WhatsAppPreview';

describe('WhatsAppPreview', () => {
  it('renderiza o body dentro da bolha', () => {
    render(<WhatsAppPreview body="Olá {{nome}}, temos novidades!" />);
    expect(screen.getByText('Olá {{nome}}, temos novidades!')).toBeInTheDocument();
  });
  it('tem o papel de preview de mensagem (testid)', () => {
    render(<WhatsAppPreview body="oi" />);
    expect(screen.getByTestId('whatsapp-preview-bubble')).toBeInTheDocument();
  });
  it('body vazio mostra placeholder', () => {
    render(<WhatsAppPreview body="" />);
    expect(screen.getByText(/sua mensagem aparecerá aqui/i)).toBeInTheDocument();
  });
});
