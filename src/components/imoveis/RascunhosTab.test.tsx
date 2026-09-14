/**
 * Aba "Rascunhos": quem vê cada rascunho (mesmo gate de edição do cadastro),
 * exclusão com confirmação e retomada do cadastro no formulário.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  role: 'admin' as string,
  tenantId: 't1' as string,
  listar: vi.fn(),
  excluir: vi.fn(),
  nomes: vi.fn(async () => ({})),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'u-mariana', email: 'mariana@x.com', systemRole: h.role, permissions: {} },
    tenantId: h.tenantId,
    isOwner: h.role === 'owner',
  }),
}));

vi.mock('@/features/imoveis/services/rascunhosService', () => ({
  listarRascunhos: h.listar,
  excluirRascunho: h.excluir,
  nomesDosAutores: h.nomes,
}));

vi.mock('@/features/imoveis/hooks/useCaptadores', () => ({
  useCaptadores: () => ({ data: [{ user_id: 'u-mariana', nome: 'Mariana' }] }),
  mapCaptadoresPorId: (lista: Array<{ user_id: string; nome: string }>) =>
    Object.fromEntries(lista.map((c) => [c.user_id, c.nome])),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Stub: mostra o que recebeu e expõe os dois desfechos do formulário.
vi.mock('./CriarImovelForm', () => ({
  CriarImovelForm: ({ isOpen, isEdit, initialData, onClose, onSuccess }: {
    isOpen: boolean; isEdit?: boolean; initialData?: { codigo_imovel?: string; titulo?: string };
    onClose: () => void; onSuccess: () => void;
  }) =>
    isOpen ? (
      <div data-testid="form">
        form:{initialData?.codigo_imovel}:{initialData?.titulo}:{String(isEdit)}
        <button onClick={onSuccess}>stub-sucesso</button>
        <button onClick={onClose}>stub-fechar</button>
      </div>
    ) : null,
}));

import { RascunhosTab } from './RascunhosTab';

const DA_MARIANA = {
  id: 'r1',
  codigo_imovel: 'CA0001',
  titulo: 'Casa da Mariana',
  tipo: 'Casa',
  cidade: 'Jundiaí',
  finalidade: null,
  criado_por: 'u-mariana',
  created_at: '2026-09-01T09:00:00',
  updated_at: '2026-09-10T14:30:00',
};

const DE_OUTRO = {
  id: 'r2',
  codigo_imovel: 'AP0002',
  titulo: '',
  tipo: 'Apartamento',
  cidade: null,
  finalidade: null,
  criado_por: 'u-outro',
  created_at: '2026-09-02T09:00:00',
  updated_at: '2026-09-11T08:05:00',
};

const tabela = async () => within(await screen.findByRole('table'));

beforeEach(() => {
  h.role = 'admin';
  h.tenantId = 't1';
  h.listar.mockReset().mockResolvedValue([DA_MARIANA, DE_OUTRO]);
  h.excluir.mockReset().mockResolvedValue(undefined);
  h.nomes.mockReset().mockResolvedValue({});
});

describe('RascunhosTab', () => {
  it('corretor vê só os rascunhos que pode editar', async () => {
    h.role = 'corretor';
    render(<RascunhosTab />);
    const t = await tabela();
    expect(t.getByText('CA0001')).toBeInTheDocument();
    expect(t.queryByText('AP0002')).not.toBeInTheDocument();
    expect(h.listar).toHaveBeenCalledWith('t1');
  });

  it('administrador vê todos, com responsável, "Sem título" e data da última alteração', async () => {
    render(<RascunhosTab />);
    const t = await tabela();
    expect(t.getByText('CA0001')).toBeInTheDocument();
    expect(t.getByText('AP0002')).toBeInTheDocument();
    expect(t.getByText('Mariana')).toBeInTheDocument();
    expect(t.getByText('Sem título')).toBeInTheDocument();
    expect(t.getByText('10/09/2026 às 14:30')).toBeInTheDocument();
  });

  it('responsável vem de tenant_brokers quando a lista de captadores não tem o autor (gestor/corretor)', async () => {
    h.nomes.mockResolvedValue({ 'u-outro': 'Rafael' });
    render(<RascunhosTab />);
    const t = await tabela();
    expect(await t.findByText('Rafael')).toBeInTheDocument();
    expect(h.nomes).toHaveBeenCalledWith('t1', ['u-mariana', 'u-outro']);
  });

  it('mostra o estado vazio quando não há rascunho visível', async () => {
    h.listar.mockResolvedValue([]);
    render(<RascunhosTab />);
    expect(await screen.findByText('Nenhum rascunho')).toBeInTheDocument();
  });

  it('"Excluir rascunho" pede confirmação, exclui e recarrega a lista', async () => {
    render(<RascunhosTab />);
    await tabela();

    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir rascunho AP0002' })[0]);
    expect(await screen.findByText(/As informações preenchidas/)).toBeInTheDocument();
    expect(h.excluir).not.toHaveBeenCalled();

    h.listar.mockResolvedValue([DA_MARIANA]);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir rascunho' }));

    await waitFor(() => expect(h.excluir).toHaveBeenCalledWith('t1', 'AP0002'));
    await waitFor(() => expect(h.listar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('AP0002')).not.toBeInTheDocument());
  });

  it('"Continuar cadastro" abre o formulário com os dados do rascunho; sucesso avisa a página e recarrega', async () => {
    const onPublicado = vi.fn();
    render(<RascunhosTab onPublicado={onPublicado} />);
    await tabela();

    fireEvent.click(screen.getAllByRole('button', { name: 'Continuar cadastro do rascunho CA0001' })[0]);
    expect(screen.getByTestId('form')).toHaveTextContent('form:CA0001:Casa da Mariana:true');

    fireEvent.click(screen.getByText('stub-sucesso'));
    expect(onPublicado).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.listar).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByText('stub-fechar'));
    expect(screen.queryByTestId('form')).not.toBeInTheDocument();
    await waitFor(() => expect(h.listar).toHaveBeenCalledTimes(3));
  });

  it('owner sem imobiliária selecionada vê aviso e não consulta', () => {
    h.role = 'owner';
    h.tenantId = 'owner';
    render(<RascunhosTab />);
    expect(screen.getByText(/Selecione uma imobiliária/)).toBeInTheDocument();
    expect(h.listar).not.toHaveBeenCalled();
  });
});
