import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyTips } from './PropertyTips';
import {
  calculatePropertyCompleteness,
  FOTOS_RECOMENDADO,
  type PropertyCompletenessInput,
} from '@/features/imoveis/utils/propertyCompleteness';
import { TIPS_VISIVEIS } from '@/features/imoveis/utils/propertyTips';

const fotos = (quantidade: number) =>
  Array.from({ length: quantidade }, (_, i) => ({ url: `https://cdn.exemplo.com/foto-${i}.webp` }));

const IMOVEL_COMPLETO: PropertyCompletenessInput = {
  finalidade: 'residencial',
  tipo: 'Apartamento',
  titulo: 'Apartamento no Centro',
  proprietario_nome: 'Maria Souza',
  proprietario_email: 'maria@exemplo.com',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  estado: 'SP',
  valor_venda: '1.200.000,00',
  valor_iptu: '320,00',
  descricao: 'a'.repeat(300),
  fotos: fotos(FOTOS_RECOMENDADO),
  area_util: '92',
  quartos: '3',
  banheiros: '2',
  vagas: '2',
  caracteristicas: ['Piscina', 'Academia', 'Salão de festas'],
  link_video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  tour_virtual: 'https://tour.exemplo.com/imovel/1',
};

const renderTips = (property: PropertyCompletenessInput, onFocusSection = vi.fn()) => {
  render(
    <PropertyTips result={calculatePropertyCompleteness(property)} onFocusSection={onFocusSection} />,
  );
  return onFocusSection;
};

describe('PropertyTips', () => {
  it('mostra poucas dicas de cada vez, não a lista inteira', () => {
    renderTips({});

    expect(screen.getAllByRole('listitem')).toHaveLength(TIPS_VISIVEIS);
    expect(screen.getByRole('heading', { name: 'Como melhorar seu imóvel' })).toBeInTheDocument();
  });

  it('cada dica diz o que fazer e por que importa', () => {
    renderTips({});

    expect(screen.getByText('Selecione a finalidade do imóvel')).toBeInTheDocument();
    expect(screen.getByText('É por venda ou locação que o interessado filtra a busca.')).toBeInTheDocument();
  });

  it('mostra os pontos reais que a categoria ainda vale', () => {
    renderTips({ fotos: [], finalidade: 'residencial', tipo: 'Casa' });

    expect(screen.getByText(/\+15 pontos em Preço/)).toBeInTheDocument();
  });

  it('leva à seção do formulário ao clicar em "Adicionar agora"', async () => {
    const onFocusSection = renderTips({});

    await userEvent.click(screen.getAllByRole('button', { name: 'Adicionar agora' })[0]);

    expect(onFocusSection).toHaveBeenCalledWith('estrutura');
  });

  it('aponta para a seção do proprietário, não para a estrutura', async () => {
    const onFocusSection = renderTips({
      finalidade: 'residencial',
      tipo: 'Casa',
      titulo: 'Casa térrea',
    });

    await userEvent.click(screen.getByRole('button', { name: /ver todas as dicas/i }));
    const dicaDoProprietario = screen.getByText('Informe o nome do proprietário').closest('li');
    await userEvent.click(dicaDoProprietario!.querySelector('button')!);

    expect(onFocusSection).toHaveBeenCalledWith('proprietario');
  });

  it('expande e recolhe a lista completa', async () => {
    renderTips({});

    await userEvent.click(screen.getByRole('button', { name: /ver todas as dicas/i }));
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(TIPS_VISIVEIS);

    await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(TIPS_VISIVEIS);
  });

  it('apresenta o item opcional como recomendação, não como erro', async () => {
    renderTips({ ...IMOVEL_COMPLETO, link_video: '' });

    expect(screen.getByText('Adicione um vídeo do imóvel')).toBeInTheDocument();
    expect(screen.getByText('Recomendado')).toBeInTheDocument();
    expect(screen.queryByText(/erro|obrigat/i)).not.toBeInTheDocument();
  });

  it('comemora quando falta pouco', () => {
    renderTips({ ...IMOVEL_COMPLETO, link_video: '' });

    expect(screen.getByRole('heading', { name: 'Quase lá — últimas melhorias' })).toBeInTheDocument();
  });

  it('para de sugerir quando o cadastro está completo', () => {
    renderTips(IMOVEL_COMPLETO);

    expect(screen.getByRole('heading', { name: 'Cadastro completo' })).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Adicionar agora' })).not.toBeInTheDocument();
  });

  it('a dica some assim que o campo é preenchido', () => {
    const { rerender } = render(<PropertyTips result={calculatePropertyCompleteness({})} />);
    expect(screen.getByText('Selecione a finalidade do imóvel')).toBeInTheDocument();

    rerender(
      <PropertyTips
        result={calculatePropertyCompleteness({ finalidade: 'residencial', tipo: 'Casa', titulo: 'Casa' })}
      />,
    );

    expect(screen.queryByText('Selecione a finalidade do imóvel')).not.toBeInTheDocument();
  });

  it('sem handler de navegação, não oferece ação quebrada', () => {
    render(<PropertyTips result={calculatePropertyCompleteness({})} />);

    expect(screen.queryByRole('button', { name: 'Adicionar agora' })).not.toBeInTheDocument();
  });
});
