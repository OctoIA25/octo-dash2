/**
 * A chave de API não aparece para quem não administra.
 *
 * Achado em 22/09: a política do banco deixava QUALQUER membro do tenant ler
 * `tenant_api_keys` em texto puro — inclusive a chave `provider='crm'`, que
 * autentica a API interna e vale pela imobiliária inteira. A trava é no banco
 * (supabase/tests/chave_de_api_so_para_admin.test.sql); este teste cobre o
 * outro lado: sem ele, quem não é admin veria "nenhuma chave" e um botão de
 * gerar que o banco recusa — a tela convidando para algo impossível.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { tenantId: 'tenant-1', isAdmin: false };

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  },
}));
vi.mock('@/features/settings/services/apiKeyService', () => ({
  fetchApiKey: async () => ({ apiKey: null, error: null }),
  generateApiKey: async () => ({ apiKey: null, error: null }),
  revokeApiKey: async () => ({ success: false, error: null }),
}));

import { ApiIntegrationTab } from './ApiIntegrationTab';

describe('quem vê a chave de API', () => {
  beforeEach(() => { auth.isAdmin = false; });

  it('o corretor lê o motivo, e não um botão que o banco recusa', async () => {
    render(<ApiIntegrationTab />);
    expect(await screen.findByText(/chave de API é do administrador/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /gerar/i })).not.toBeInTheDocument();
  });

  it('o administrador continua com a tela de sempre', async () => {
    auth.isAdmin = true;
    render(<ApiIntegrationTab />);
    expect(await screen.findByText(/API OctoDash/i)).toBeInTheDocument();
    expect(screen.queryByText(/chave de API é do administrador/i)).not.toBeInTheDocument();
  });
});
