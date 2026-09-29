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

/** Mutável para trocar de perfil entre os casos. */
const quem = { isOwner: true, isGestao: true };

vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    tenantName: 'Lotus Brokers',
    user: { id: 'u1', role: 'gestao', systemRole: 'admin', tenantId: 't1' },
    isOwner: quem.isOwner,
    isGestao: quem.isGestao,
    tenantId: 't1',
  }),
}));

vi.mock('@/components/TenantSwitcher', () => ({ TenantSwitcher: () => null }));
vi.mock('@/assets/octodash-logo.png', () => ({ default: 'logo.png' }));

import { NovaSidebar } from '../NovaSidebar';

beforeEach(() => {
  navigate.mockClear();
  quem.isOwner = true;
  quem.isGestao = true;
});

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

/*
 * A CATEGORIA DA LIA — pedido do chefe em 28/09: "muito difícil encontrar
 * elas assim".
 *
 * Plantão e Agenda moravam como abas dentro de Agentes de IA, ao lado do
 * Caio e da Elaine. Quem procurava a fila de dúvidas precisava saber que ela
 * estava escondida numa aba de outra tela.
 */
describe('a Lia tem categoria própria no menu', () => {
  it('Plantão aparece e leva à rota de sempre', async () => {
    render(<NovaSidebar />);
    await userEvent.click(await screen.findByText('Plantão'));
    // A rota NÃO mudou: mover o item é mudança de lugar, não de endereço.
    expect(navigate).toHaveBeenCalledWith('/agentes-ia/plantao');
  });

  it('Agenda da LIA também', async () => {
    render(<NovaSidebar />);
    await userEvent.click(await screen.findByText('Agenda da LIA'));
    expect(navigate).toHaveBeenCalledWith('/agentes-ia/agenda');
  });

  /*
   * O CASO QUE SUSTENTA O ARQUIVO. Ao sair das abas, as duas perderiam a
   * trava de `SO_GESTAO` — e a fila mostra o nome de cada lead e a resposta
   * de cada colega da casa. Mover a tela não pode abri-la.
   */
  it('corretor NÃO vê a fila nem a agenda', async () => {
    quem.isOwner = false;
    quem.isGestao = false;
    render(<NovaSidebar />);
    // O menu carregou: outra coisa qualquer continua lá.
    expect(await screen.findByText('Configurações')).toBeInTheDocument();
    expect(screen.queryByText('Plantão')).not.toBeInTheDocument();
    expect(screen.queryByText('Agenda da LIA')).not.toBeInTheDocument();
  });
});

/*
 * RECRUTAMENTO VIROU PAI COM DOIS FILHOS (29/09): "Visão geral" e "Kanban",
 * no mesmo formato de Estudo de Mercado — cada filho com o seu segmento de
 * rota, porque a regra de "ativo" da barra usa startsWith(base + '/'): um
 * filho na rota nua `/recrutamento` acenderia junto com o Kanban.
 */
describe('Recrutamento tem Visão geral e Kanban como filhos', () => {
  it('clicar em Recrutamento abre a visão geral E mostra os filhos', async () => {
    render(<NovaSidebar />);
    await userEvent.click(await screen.findByText('Recrutamento'));
    expect(navigate).toHaveBeenCalledWith('/recrutamento/geral');
    expect(await screen.findByText('Visão geral')).toBeInTheDocument();
    expect(screen.getByText('Kanban')).toBeInTheDocument();
  });

  it('o filho Kanban leva à sub-área dele', async () => {
    render(<NovaSidebar />);
    await userEvent.click(await screen.findByText('Recrutamento'));
    navigate.mockClear();
    await userEvent.click(screen.getByText('Kanban'));
    expect(navigate).toHaveBeenCalledWith('/recrutamento/kanban');
  });
});
