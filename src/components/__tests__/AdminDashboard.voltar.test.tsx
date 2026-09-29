/**
 * "Quando clico em Equipes não dá pra retornar pra sessão anterior em gestão
 * de equipe" (29/09). A Gestão de Equipe não tem barra de abas: Equipes e
 * Tarefas precisam do próprio caminho de volta para a tela dos membros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../AdminTaskManager', () => ({ AdminTaskManager: () => <div>tela:tarefas</div> }));
vi.mock('@/features/corretores/components/EquipeSection', () => ({ EquipeSection: () => <div>tela:membros</div> }));
vi.mock('@/features/corretores/components/EquipesManagerSection', () => ({ EquipesManagerSection: () => <div>tela:equipes</div> }));
vi.mock('@/features/leads/hooks/useLeadsData', () => ({ useLeadsData: () => ({ leads: [] }) }));

const quem = { subPermissoes: undefined as Record<string, boolean> | undefined };
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ isOwner: false, user: { permissions: { sub_permissions: quem.subPermissoes } } }),
}));

import { AdminDashboard } from '../AdminDashboard';

const abrir = (endereco: string) =>
  render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route path="/gestao-equipe" element={<AdminDashboard />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => { quem.subPermissoes = undefined; });

describe('Gestão de Equipe: o caminho de volta', () => {
  it('em Equipes há um botão que volta para os membros', () => {
    abrir('/gestao-equipe?tab=equipes');
    expect(screen.getByText('tela:equipes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Membros da Equipe/ }));
    expect(screen.getByText('tela:membros')).toBeInTheDocument();
  });

  it('em Tarefas também', () => {
    abrir('/gestao-equipe?tab=tarefas');
    fireEvent.click(screen.getByRole('button', { name: /Membros da Equipe/ }));
    expect(screen.getByText('tela:membros')).toBeInTheDocument();
  });

  it('na própria tela dos membros não há botão de voltar', () => {
    abrir('/gestao-equipe');
    expect(screen.getByText('tela:membros')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Membros da Equipe/ })).not.toBeInTheDocument();
  });

  it('quem não pode ver os membros não ganha um botão para uma tela bloqueada', () => {
    quem.subPermissoes = { 'gestao-acessos': false };
    abrir('/gestao-equipe?tab=equipes');
    expect(screen.getByText('tela:equipes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Membros da Equipe/ })).not.toBeInTheDocument();
  });
});
