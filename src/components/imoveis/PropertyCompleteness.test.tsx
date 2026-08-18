import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyCompleteness } from './PropertyCompleteness';
import type { PropertyCompletenessInput } from '@/features/imoveis/utils/propertyCompleteness';

const ENDERECO_COMPLETO: PropertyCompletenessInput = {
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  estado: 'SP',
};

describe('PropertyCompleteness', () => {
  it('mostra o percentual como texto, não só na barra', () => {
    render(<PropertyCompleteness property={{}} />);

    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar', { name: /0 por cento/i })).toBeInTheDocument();
  });

  it('descreve cada categoria com estado e próximo passo no aria-label', () => {
    render(<PropertyCompleteness property={{}} />);

    expect(
      screen.getByRole('button', { name: 'Endereço: 0% completo. Adicione o CEP (8 dígitos)' }),
    ).toBeInTheDocument();
  });

  it('leva para a seção do formulário ao clicar numa categoria incompleta', async () => {
    const onFocusSection = vi.fn();
    render(<PropertyCompleteness property={{}} onFocusSection={onFocusSection} />);

    await userEvent.click(screen.getByRole('button', { name: /^Endereço:/ }));

    expect(onFocusSection).toHaveBeenCalledWith('localizacao');
  });

  it('mantém a categoria completa navegável (para revisão) e sem estado disabled', () => {
    // `disabled` deixaria o CSS global (clickup-icons.css) apagar o ícone de concluído.
    const onFocusSection = vi.fn();
    render(<PropertyCompleteness property={ENDERECO_COMPLETO} onFocusSection={onFocusSection} />);

    const card = screen.getByRole('button', { name: 'Endereço: 100% completo. Endereço completo' });
    expect(card).toBeEnabled();
  });

  it('recalcula quando o formulário muda', () => {
    const { rerender } = render(<PropertyCompleteness property={{}} />);
    expect(screen.getByRole('progressbar', { name: /0 por cento/i })).toBeInTheDocument();

    rerender(<PropertyCompleteness property={ENDERECO_COMPLETO} />);

    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Endereço: 100% completo\./ })).toBeInTheDocument();
  });

  it('anuncia a conclusão quando tudo está preenchido', () => {
    const completo: PropertyCompletenessInput = {
      ...ENDERECO_COMPLETO,
      finalidade: 'residencial',
      tipo: 'Apartamento',
      titulo: 'Apartamento no Centro',
      proprietario_nome: 'Maria Souza',
      proprietario_celular: '11988887777',
      valor_venda: '1.200.000,00',
      valor_iptu: '320,00',
      descricao: 'a'.repeat(300),
      fotos: Array.from({ length: 8 }, (_, i) => ({ url: `https://cdn.exemplo.com/${i}.webp` })),
      area_util: '92',
      quartos: '3',
      banheiros: '2',
      vagas: '2',
      caracteristicas: ['Piscina', 'Academia', 'Sauna'],
      link_video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      tour_virtual: 'https://tour.exemplo.com/1',
    };

    render(<PropertyCompleteness property={completo} />);

    expect(screen.getByRole('progressbar', { name: /100 por cento/i })).toBeInTheDocument();
    expect(screen.getByText('Imóvel completo — pronto para anunciar.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Adicione|Informe|Escreva|Selecione/ })).toEqual([]);
  });
});
