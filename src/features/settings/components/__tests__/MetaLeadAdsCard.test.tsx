import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
}));

import { MetaLeadAdsCard } from '../MetaLeadAdsCard';

// Config como o backend devolve na primeira visita de um tenant novo: a linha
// foi provisionada sob demanda (Achado 1 da rodada de correção), então
// webhookUrl/verifyToken já existem, mas nada foi preenchido ainda.
const CONFIG_PROVISIONADA = {
  pageId: null,
  status: 'inactive' as const,
  verifyToken: 'vt-123',
  webhookUrl: 'https://octodash.octoia.org/api/v1/integrations/meta/webhook/wt-abc',
  hasAppSecret: false,
  hasAccessToken: false,
};

describe('MetaLeadAdsCard', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  // Este é o teste que impede o bug Critical de voltar: a tela não podia
  // mostrar só a seção 2 sem nunca ter mostrado a URL/verify token da seção 1.
  it('primeira visita mostra a URL do webhook e o verify token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, config: CONFIG_PROVISIONADA }) })));
    render(<MetaLeadAdsCard tenantId="t1" />);

    await waitFor(() => expect(screen.getByText(CONFIG_PROVISIONADA.webhookUrl)).toBeInTheDocument());
    expect(screen.getByText(CONFIG_PROVISIONADA.verifyToken)).toBeInTheDocument();
  });

  it('a mensagem do gate de API key chega ao usuário ao tentar ativar', async () => {
    const configCompleta = { ...CONFIG_PROVISIONADA, pageId: 'p1', hasAppSecret: true, hasAccessToken: true };
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, config: configCompleta }) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: 'api_key_ausente', message: 'Este tenant não tem API key ativa. Gere uma em Integrações antes de ativar o Meta Lead Ads.' }),
      });
    vi.stubGlobal('fetch', f);
    render(<MetaLeadAdsCard tenantId="t1" />);

    const botaoAtivar = await screen.findByRole('button', { name: /^ativar$/i });
    fireEvent.click(botaoAtivar);

    await waitFor(() => expect(screen.getByText(/Este tenant não tem API key ativa/)).toBeInTheDocument());
  });

  it('Ativar nasce desabilitado sem Page ID nem segredos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, config: CONFIG_PROVISIONADA }) })));
    render(<MetaLeadAdsCard tenantId="t1" />);

    const botaoAtivar = await screen.findByRole('button', { name: /^ativar$/i });
    expect(botaoAtivar).toBeDisabled();
  });
});
