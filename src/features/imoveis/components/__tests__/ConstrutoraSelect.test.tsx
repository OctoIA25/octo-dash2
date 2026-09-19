/**
 * `ConstrutoraSelect` — o campo que substituiu o texto livre.
 *
 * Era o texto livre que produzia "Tebas" e "tebas", "Sebel" e "SEBEL
 * EMPREENDIMENTOS" como construtoras diferentes. O campo novo escolhe do
 * cadastro e guarda o VÍNCULO; quando o texto gravado não casa com nada, ele
 * avisa em vez de aceitar calado — é esse aviso que impede a duplicata voltar
 * por outro caminho.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConstrutoraSelect } from '../ConstrutoraSelect';
import type { Construtora } from '../../services/construtorasService';

const c = (id: string, nome: string, extra: Partial<Construtora> = {}): Construtora => ({
  id, codigo: nome.toLowerCase().replace(/\W+/g, '_'), nome,
  razaoSocial: null, responsavelNome: null, responsavelTelefone: null, responsavelEmail: null,
  prazoPagamentoDias: null, dadosNota: null, eAvulso: false, ativa: true, observacao: null,
  ...extra,
});

const CADASTRO = [c('1', 'Santa Ângela'), c('2', 'Tebas'), c('3', 'Inativa', { ativa: false })];

describe('ConstrutoraSelect', () => {
  it('mostra o nome gravado, e o convite quando está vazio', () => {
    const { rerender } = render(
      <ConstrutoraSelect construtoras={CADASTRO} nome="Tebas" construtoraId="2" onChange={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /Tebas/ })).toBeInTheDocument();

    rerender(<ConstrutoraSelect construtoras={CADASTRO} nome="" construtoraId={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Selecione a construtora/ })).toBeInTheDocument();
  });

  it('escolher no cadastro devolve o nome E o vínculo', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ConstrutoraSelect construtoras={CADASTRO} nome="" construtoraId={null} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Selecione a construtora/ }));
    await user.click(screen.getByRole('button', { name: /Santa Ângela/ }));

    expect(onChange).toHaveBeenCalledWith({ nome: 'Santa Ângela', construtoraId: '1' });
  });

  it('construtora INATIVA não aparece para escolher', async () => {
    const user = userEvent.setup();
    render(<ConstrutoraSelect construtoras={CADASTRO} nome="" construtoraId={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Selecione a construtora/ }));
    expect(screen.queryByRole('button', { name: /Inativa/ })).not.toBeInTheDocument();
  });

  describe('o aviso que impede a duplicata voltar', () => {
    it('texto gravado que NÃO está no cadastro é sinalizado', () => {
      render(
        <ConstrutoraSelect construtoras={CADASTRO} nome="SEBEL EMPREENDIMENTOS" construtoraId={null} onChange={vi.fn()} />
      );
      expect(screen.getByText(/ainda não está no cadastro/)).toBeInTheDocument();
    });

    it('texto que casa por GRAFIA não é sinalizado — é a mesma construtora', () => {
      // "SANTA ANGELA" é "Santa Ângela" escrita diferente: avisar aqui seria
      // ensinar o usuário a cadastrar a duplicata.
      render(
        <ConstrutoraSelect construtoras={CADASTRO} nome="SANTA ANGELA" construtoraId={null} onChange={vi.fn()} />
      );
      expect(screen.queryByText(/ainda não está no cadastro/)).not.toBeInTheDocument();
    });

    it('com vínculo não há aviso, mesmo que o texto difira', () => {
      render(
        <ConstrutoraSelect construtoras={CADASTRO} nome="Nome antigo" construtoraId="1" onChange={vi.fn()} />
      );
      expect(screen.queryByText(/ainda não está no cadastro/)).not.toBeInTheDocument();
    });

    it('campo vazio não avisa nada', () => {
      render(<ConstrutoraSelect construtoras={CADASTRO} nome="" construtoraId={null} onChange={vi.fn()} />);
      expect(screen.queryByText(/ainda não está no cadastro/)).not.toBeInTheDocument();
    });
  });

  it('a busca acha por nome, sem depender de acento nem de caixa', async () => {
    const user = userEvent.setup();
    render(<ConstrutoraSelect construtoras={CADASTRO} nome="" construtoraId={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Selecione a construtora/ }));
    await user.type(screen.getByPlaceholderText(/Buscar construtora/), 'angela');

    expect(screen.getByRole('button', { name: /Santa Ângela/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Tebas/ })).not.toBeInTheDocument();
  });

  it('cadastro vazio diz que está vazio, em vez de parecer erro de busca', async () => {
    const user = userEvent.setup();
    render(<ConstrutoraSelect construtoras={[]} nome="" construtoraId={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Selecione a construtora/ }));
    expect(screen.getByText(/Nenhuma construtora cadastrada ainda/)).toBeInTheDocument();
  });

  it('limpar zera o texto E o vínculo — não deixa vínculo órfão', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ConstrutoraSelect construtoras={CADASTRO} nome="Tebas" construtoraId="2" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Tebas/ }));
    await user.click(screen.getByRole('button', { name: /Limpar/ }));

    expect(onChange).toHaveBeenCalledWith({ nome: '', construtoraId: null });
  });
});
