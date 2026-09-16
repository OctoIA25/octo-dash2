/**
 * O que vale testar na seção: os quadrados certos acendem, o registro manda o
 * que o corretor escolheu (e nada sem as três escolhas), e "Desfazer" só
 * aparece no último toque de quem o registrou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CadenciaToquesSection } from './CadenciaToquesSection';
import type { ToqueCorretor } from '../services/toquesService';
import type { CadenciaEvento } from '../services/cadenciaService';

const servico = vi.hoisted(() => ({
  fetchToques: vi.fn(),
  registrarToque: vi.fn(),
  desfazerToque: vi.fn(),
}));
vi.mock('../services/toquesService', () => servico);
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const EU = 'u-eu';

const toque = (over: Partial<ToqueCorretor>): ToqueCorretor => ({
  id: 't1', canal: 'ligacao', resultado: 'numero_errado', observacao: null, proximo_toque_em: null,
  executado_em: '2026-09-11T10:00:00Z', executado_por: EU, executado_por_nome: 'Ana Souza', ...over,
});

const envioLia = {
  id: 'l1', tag: null, attempt_number: 1, channel: 'whatsapp', status: 'sent', resultado: 'sem_resposta',
  respondeu: false, scheduled_at: null, sent_at: '2026-09-10T10:00:00Z', respondido_em: null,
  tempo_ate_resposta_min: null, motivo: null, cancelled_reason: null, template_name: null,
} satisfies CadenciaEvento;

const renderizar = (timelineLia: CadenciaEvento[] = [envioLia]) =>
  render(<CadenciaToquesSection leadId="lead-1" tenantId={TENANT} userId={EU} timelineLia={timelineLia} ativo />);

describe('CadenciaToquesSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('acende LIA e corretor em ordem e deixa o próximo quadrado para registrar', async () => {
    servico.fetchToques.mockResolvedValue([toque({})]);
    renderizar();

    expect(await screen.findByLabelText(/^2º toque · Ligação · Número errado/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^1º toque · WhatsApp · Não respondeu .* LIA$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar 3º toque' })).toBeInTheDocument();
    expect(screen.getByText('(2 de 10)')).toBeInTheDocument();
  });

  it('não registra sem canal, resultado e próximo toque', async () => {
    servico.fetchToques.mockResolvedValue([]);
    renderizar([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar 1º toque' }));
    fireEvent.click(screen.getByRole('radio', { name: /Ligação/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar 1º toque' }));

    expect(screen.getByText('Escolha canal, resultado e próximo toque.')).toBeInTheDocument();
    expect(servico.registrarToque).not.toHaveBeenCalled();
  });

  it('registra o que foi escolhido e o quadrado acende', async () => {
    servico.fetchToques.mockResolvedValue([]);
    servico.registrarToque.mockResolvedValue(toque({ canal: 'presencial', resultado: 'respondeu' }));
    renderizar([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar 1º toque' }));
    fireEvent.click(screen.getByRole('radio', { name: /Presencial/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^Respondeu$/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Sem próximo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar 1º toque' }));

    await waitFor(() =>
      expect(servico.registrarToque).toHaveBeenCalledWith('lead-1', TENANT, {
        canal: 'presencial',
        resultado: 'respondeu',
        observacao: undefined,
        proximo_toque_em: null,
      }),
    );
    expect(await screen.findByLabelText(/^1º toque · Presencial · Respondeu/)).toBeInTheDocument();
  });

  it('"Amanhã" usa o horário escolhido — é a hora do aviso', async () => {
    servico.fetchToques.mockResolvedValue([]);
    servico.registrarToque.mockResolvedValue(toque({}));
    renderizar([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar 1º toque' }));
    fireEvent.click(screen.getByRole('radio', { name: /WhatsApp/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^Não respondeu$/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Amanhã/ }));
    fireEvent.change(screen.getByLabelText('Horário do próximo toque'), { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar 1º toque' }));

    await waitFor(() => expect(servico.registrarToque).toHaveBeenCalled());
    const enviado = new Date(servico.registrarToque.mock.calls[0][2].proximo_toque_em);
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    expect([enviado.getDate(), enviado.getHours(), enviado.getMinutes()]).toEqual([amanha.getDate(), 14, 30]);
  });

  it('"Desfazer" só no último toque do corretor, e só para quem registrou', async () => {
    servico.fetchToques.mockResolvedValue([
      toque({ id: 't1', executado_em: '2026-09-11T10:00:00Z' }),
      toque({ id: 't2', executado_em: '2026-09-12T10:00:00Z', executado_por: 'u-outro', executado_por_nome: 'Bruno' }),
    ]);
    renderizar();

    fireEvent.click(await screen.findByLabelText(/^2º toque/));
    expect(screen.queryByRole('button', { name: /Desfazer/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/^3º toque/));
    expect(screen.queryByRole('button', { name: /Desfazer/ })).not.toBeInTheDocument();
  });

  it('mostra "Desfazer" no próprio último toque', async () => {
    servico.fetchToques.mockResolvedValue([toque({ id: 't1' })]);
    renderizar();

    fireEvent.click(await screen.findByLabelText(/^2º toque/));
    expect(screen.getByRole('button', { name: /Desfazer/ })).toBeInTheDocument();
  });
});
