/**
 * O diálogo de exclusão: diz o nome, avisa que leva histórico e marcos junto,
 * e só apaga quando a pessoa confirma.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmarExclusaoCandidato } from './ConfirmarExclusaoCandidato';

const ana = { id: 'c1', nome: 'Ana Silva' };

describe('ConfirmarExclusaoCandidato', () => {
  it('mostra o nome e o aviso do que vai junto', () => {
    render(<ConfirmarExclusaoCandidato candidato={ana} onConfirmar={() => {}} onCancelar={() => {}} />);
    expect(screen.getByText('Excluir Ana Silva?')).toBeInTheDocument();
    expect(screen.getByText(/Apaga o candidato, o histórico e os marcos\. Não dá para desfazer\./)).toBeInTheDocument();
  });

  it('confirmar chama onConfirmar com o candidato', () => {
    const onConfirmar = vi.fn();
    render(<ConfirmarExclusaoCandidato candidato={ana} onConfirmar={onConfirmar} onCancelar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }));
    expect(onConfirmar).toHaveBeenCalledWith(ana);
  });

  it('cancelar chama onCancelar e não apaga', () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(<ConfirmarExclusaoCandidato candidato={ana} onConfirmar={onConfirmar} onCancelar={onCancelar} />);
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancelar).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('sem candidato, nada aparece', () => {
    render(<ConfirmarExclusaoCandidato candidato={null} onConfirmar={() => {}} onCancelar={() => {}} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
