import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMemberDados = vi.fn();
const saveMemberDados = vi.fn();
vi.mock('@/features/corretores/services/memberDadosService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMemberDados: (...a: unknown[]) => fetchMemberDados(...a),
  saveMemberDados: (...a: unknown[]) => saveMemberDados(...a),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { DadosPessoaisPanel } from '../DadosPessoaisPanel';
import { EMPTY_MEMBER_DADOS } from '@/features/corretores/services/memberDadosService';

describe('DadosPessoaisPanel', () => {
  beforeEach(() => {
    fetchMemberDados.mockReset().mockResolvedValue({ ...EMPTY_MEMBER_DADOS, rg: '12.345.678-9' });
    saveMemberDados.mockReset().mockResolvedValue({ success: true });
  });

  it('carrega os dados do próprio usuário e grava na mesma linha que o gestor vê', async () => {
    render(<DadosPessoaisPanel tenantId="t1" userId="u1" />);

    const cpf = await screen.findByLabelText('CPF');
    expect(fetchMemberDados).toHaveBeenCalledWith('t1', 'u1');
    expect(screen.getByLabelText('RG')).toHaveValue('12.345.678-9');

    fireEvent.change(cpf, { target: { value: '12345678901' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar dados pessoais/i }));

    await waitFor(() => expect(saveMemberDados).toHaveBeenCalledWith('t1', 'u1', expect.objectContaining({
      rg: '12.345.678-9',
      cpf: '123.456.789-01',
    })));
  });

  // Sem edição não há o que gravar: Salvar não pode sobrescrever a linha com o que veio.
  it('Salvar fica desligado enquanto nada mudou', async () => {
    render(<DadosPessoaisPanel tenantId="t1" userId="u1" />);
    await screen.findByLabelText('CPF');
    expect(screen.getByRole('button', { name: /salvar dados pessoais/i })).toBeDisabled();
  });
});
