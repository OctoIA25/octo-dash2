import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ permissions: {} as Record<string, unknown> }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', permissions: auth.permissions }, isCorretor: true, tenantId: 't1' }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { BolsaoSection } from './BolsaoSection';

describe('Bolsão do corretor bloqueado para receber leads', () => {
  it('fecha a tela e manda falar com o gestor', () => {
    auth.permissions = { lead_limit: { receives_auto_leads: false, motivo: 'pausa' } };
    render(<BolsaoSection />);
    expect(screen.getByText(/bloqueado para receber leads/i)).toBeInTheDocument();
  });

  it('o bloqueio por atividade segue com a mensagem dele', () => {
    auth.permissions = { bolsao_blocked_enabled: true, lead_limit: { receives_auto_leads: false } };
    render(<BolsaoSection />);
    expect(screen.getByText(/bloqueado da área bolsão/i)).toBeInTheDocument();
  });
});
