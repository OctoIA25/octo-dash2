import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  normalizarPreferencias,
  togglePreferencia,
  preferenciasDe,
  PreferenciasBadges,
  PreferenciasEditor,
  MAX_PREFERENCIAS,
} from './PreferenciasLead';

describe('normalizarPreferencias', () => {
  it('tira espaço sobrando e colapsa espaço interno', () => {
    expect(normalizarPreferencias(['  Sala   Comercial '])).toEqual(['Sala Comercial']);
  });

  it('descarta vazio e só-espaço', () => {
    expect(normalizarPreferencias(['Casa', '', '   '])).toEqual(['Casa']);
  });

  it('remove repetido ignorando caixa, mantendo a primeira forma', () => {
    expect(normalizarPreferencias(['Apartamento', 'APARTAMENTO', 'apartamento']))
      .toEqual(['Apartamento']);
  });

  it('corta termo em 40 chars', () => {
    expect(normalizarPreferencias(['x'.repeat(60)])[0]).toHaveLength(40);
  });

  it('para no teto de 10 — o mesmo do CHECK da migration', () => {
    const onze = Array.from({ length: 11 }, (_, i) => `Tipo ${i}`);
    expect(normalizarPreferencias(onze)).toHaveLength(MAX_PREFERENCIAS);
  });
});

describe('togglePreferencia', () => {
  it('adiciona o que não está lá', () => {
    expect(togglePreferencia(['Casa'], 'Loja')).toEqual(['Casa', 'Loja']);
  });

  it('remove ignorando caixa — clicar em "casa" tira "Casa"', () => {
    expect(togglePreferencia(['Casa', 'Loja'], 'casa')).toEqual(['Loja']);
  });
});

describe('preferenciasDe', () => {
  it('aceita null, string solta e array', () => {
    expect(preferenciasDe(null)).toEqual([]);
    expect(preferenciasDe('Casa')).toEqual(['Casa']);
    expect(preferenciasDe(['Casa', 'Loja'])).toEqual(['Casa', 'Loja']);
  });
});

describe('PreferenciasBadges', () => {
  it('mostra até `max` e resume o resto em +N', () => {
    render(<PreferenciasBadges preferencias={['Casa', 'Loja', 'Terreno', 'Galpão']} />);
    expect(screen.getByText('Casa')).toBeInTheDocument();
    expect(screen.getByText('Loja')).toBeInTheDocument();
    expect(screen.queryByText('Terreno')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('sem preferência não renderiza nada', () => {
    const { container } = render(<PreferenciasBadges preferencias={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PreferenciasEditor', () => {
  it('chip padrão adiciona em um clique e some da lista de sugestões', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PreferenciasEditor valor={[]} onChange={onChange} />);

    screen.getByRole('button', { name: /Apartamento/ }).click();
    expect(onChange).toHaveBeenCalledWith(['Apartamento']);

    rerender(<PreferenciasEditor valor={['Apartamento']} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /^Apartamento$/ })).toBeNull();
  });

  it('digitar e Enter adiciona normalizado; repetido não dispara onChange', async () => {
    const onChange = vi.fn();
    render(<PreferenciasEditor valor={['Casa']} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/Outra preferência/);

    await userEvent.type(input, '  vista   mar {Enter}');
    expect(onChange).toHaveBeenCalledWith(['Casa', 'vista mar']);

    onChange.mockClear();
    await userEvent.type(input, 'CASA{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('vírgula fecha o termo — colar "Loja, Ter" vira chip Loja + rascunho Ter', async () => {
    const onChange = vi.fn();
    render(<PreferenciasEditor valor={[]} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/Outra preferência/);

    await userEvent.type(input, 'Loja,Ter');
    expect(onChange).toHaveBeenCalledWith(['Loja']);
    expect(input).toHaveValue('Ter');
  });

  it('X remove o termo', () => {
    const onChange = vi.fn();
    render(<PreferenciasEditor valor={['Casa', 'Loja']} onChange={onChange} />);
    screen.getByRole('button', { name: 'Remover Casa' }).click();
    expect(onChange).toHaveBeenCalledWith(['Loja']);
  });

  it('no teto de 10 o input desabilita com aviso', () => {
    const dez = Array.from({ length: MAX_PREFERENCIAS }, (_, i) => `Tipo ${i}`);
    render(<PreferenciasEditor valor={dez} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(`Máximo de ${MAX_PREFERENCIAS} preferências`)).toBeDisabled();
  });

  // Especialidades do corretor (Gestão de Equipe): mesmo editor, teto 5 — o do
  // CHECK da 20261003. Sem o `max` repassado, a vírgula deixaria passar o 6º.
  it('com max=5 (especialidades), o 6º termo não entra e o aviso diz o nome', async () => {
    const onChange = vi.fn();
    const cinco = ['A', 'B', 'C', 'D'];
    const { rerender } = render(
      <PreferenciasEditor valor={cinco} onChange={onChange} max={5} nome="especialidade" nomePlural="especialidades" />,
    );
    // Colar de uma vez: um único change com dois termos, o 5º e o 6º.
    await userEvent.click(screen.getByPlaceholderText('Outra especialidade — Enter para adicionar'));
    await userEvent.paste('E,F,');
    expect(onChange).toHaveBeenLastCalledWith(['A', 'B', 'C', 'D', 'E']);

    rerender(
      <PreferenciasEditor valor={[...cinco, 'E']} onChange={onChange} max={5} nome="especialidade" nomePlural="especialidades" />,
    );
    expect(screen.getByPlaceholderText('Máximo de 5 especialidades')).toBeDisabled();
  });
});
