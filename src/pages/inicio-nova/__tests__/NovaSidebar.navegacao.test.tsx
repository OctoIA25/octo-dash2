/**
 * Clicar num item do menu tem que ABRIR A TELA DELE.
 *
 * O DEFEITO, relatado pelo chefe em 28/09/2026
 * "Quando clico em Configurações não abre as configurações, só aparece
 * Cargos." E era isso mesmo: `handleItemClick` tinha um `return` depois de
 * expandir, então item com filhos NUNCA navegava.
 *
 * POR QUE NINGUÉM TINHA VISTO
 * Dos itens com filhos, Imóveis e Marketing têm o primeiro filho apontando
 * para a MESMA tela do pai. Clicar no pai não navegava, mas o filho aparecia
 * logo abaixo e levava ao lugar certo — o menu funcionava por coincidência.
 *
 * Configurações é o único cujo filho vai para outro endereço (`/cargos`).
 * Resultado: `/configuracoes` ficou inalcançável pelo menu, e as quinze
 * seções dela — Perfil, Aparência, Score, Plantão da LIA, Usuários… —
 * sumiram para quem não digita URL na mão.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/inicio', search: '' }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    tenantName: 'Lotus Brokers',
    user: { id: 'u1', role: 'gestao', systemRole: 'admin', tenantId: 't1' },
    isOwner: true,
    tenantId: 't1',
  }),
}));

vi.mock('@/components/TenantSwitcher', () => ({ TenantSwitcher: () => null }));
vi.mock('@/assets/octodash-logo.png', () => ({ default: 'logo.png' }));

import { NovaSidebar } from '../NovaSidebar';

beforeEach(() => navigate.mockClear());

describe('clicar no item abre a própria tela', () => {
  it('Configurações leva a /configuracoes — o caso relatado', async () => {
    render(<NovaSidebar />);
    await userEvent.click(await screen.findByText('Configurações'));
    expect(navigate).toHaveBeenCalledWith('/configuracoes');
  });

  it('e não é mais um menu expansível: Cargos virou aba da tela', async () => {
    render(<NovaSidebar />);
    await userEvent.click(await screen.findByText('Configurações'));
    expect(screen.queryByText('Cargos')).not.toBeInTheDocument();
  });

  // A regra vale para todo pai com filhos, não só para Configurações.
  it('pai com filhos navega E expande', async () => {
    render(<NovaSidebar />);
    await userEvent.click(await screen.findByText('Agentes de IA'));
    expect(navigate).toHaveBeenCalledWith('/agentes-ia/agente-marketing');
    // Navegar e mostrar o que há dentro não são coisas concorrentes.
    expect(await screen.findByText('Comunicação')).toBeInTheDocument();
  });

  it('o filho continua levando ao endereço dele', async () => {
    render(<NovaSidebar />);
    await userEvent.click(await screen.findByText('Agentes de IA'));
    navigate.mockClear();
    await userEvent.click(await screen.findByText('Comunicação'));
    expect(navigate).toHaveBeenCalledWith('/comunicacao/disparador');
  });
});
