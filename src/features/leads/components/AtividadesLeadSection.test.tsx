/**
 * A seção de atividades relê sozinha quando algo fora dela mexe na agenda.
 *
 * O caso que motivou: registrar uma cadência cria a atividade do próximo toque
 * no servidor (`sincronizarAgendaDoToque`), mas a lista continuava mostrando o
 * estado anterior — o corretor precisava fechar e reabrir o lead para ver.
 * Fechar e reabrir funcionava porque `ativo` virava false/true e a consulta
 * refazia; era o único jeito de forçar a releitura.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AtividadesLeadSection } from './AtividadesLeadSection';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const LEAD = 'lead-uuid-1';

/** O que a consulta devolve na próxima chamada — trocado entre as leituras. */
let resposta: { data: unknown[]; error: null } = { data: [], error: null };
const leituras = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const cadeia: Record<string, unknown> = {};
  cadeia.select = () => cadeia;
  cadeia.eq = () => cadeia;
  cadeia.order = () => Promise.resolve(resposta);
  return { supabase: { from: (tabela: string) => { leituras(tabela); return cadeia; } } };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/features/corretores/services/activityBlockingService', () => ({
  hasAnyPendingBlockingActivity: vi.fn().mockResolvedValue(false),
  unblockCorretor: vi.fn().mockResolvedValue(undefined),
}));

const atividade = {
  id: 'a1',
  titulo: 'Retornar para o cliente',
  descricao: 'Próximo toque da cadência do lead.',
  data: '2026-12-31',
  horario: '09:00',
  // O mesmo tipo que `sincronizarAgendaDoToque` grava no servidor.
  tipo: 'retornar_cliente',
  status: 'pendente',
  prioridade: 'media',
  corretor_email: 'ana@octo.dev',
  lead_uuid: LEAD,
  lead_id: null,
  lead_nome: 'Ana',
  lead_telefone: '11999990000',
};

const montar = (recarregarSinal = 0) =>
  render(
    <AtividadesLeadSection
      vinculo={{ coluna: 'lead_uuid', valor: LEAD }}
      leadNome="Ana"
      leadTelefone="11999990000"
      tenantId={TENANT}
      corretorEmail="ana@octo.dev"
      ativo
      recarregarSinal={recarregarSinal}
    />,
  );

describe('AtividadesLeadSection — releitura pedida de fora', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resposta = { data: [], error: null };
  });

  it('mostra a atividade nova sem fechar e reabrir o lead', async () => {
    const { rerender } = montar(0);
    expect(await screen.findByText('Nenhuma atividade marcada para este lead.')).toBeInTheDocument();

    // A cadência foi registrada: o servidor criou a atividade do próximo toque.
    resposta = { data: [atividade], error: null };
    rerender(
      <AtividadesLeadSection
        vinculo={{ coluna: 'lead_uuid', valor: LEAD }}
        leadNome="Ana"
        leadTelefone="11999990000"
        tenantId={TENANT}
        corretorEmail="ana@octo.dev"
        ativo
        recarregarSinal={1}
      />,
    );

    expect(await screen.findByText('Retornar para o cliente — Agendada')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma atividade marcada para este lead.')).not.toBeInTheDocument();
  });

  it('sem sinal novo não fica consultando à toa', async () => {
    const { rerender } = montar(0);
    await screen.findByText('Nenhuma atividade marcada para este lead.');
    const antes = leituras.mock.calls.length;

    montar(0); // mesmo sinal, outra renderização
    await waitFor(() => expect(screen.getAllByText('Nenhuma atividade marcada para este lead.').length).toBe(2));
    rerender(
      <AtividadesLeadSection
        vinculo={{ coluna: 'lead_uuid', valor: LEAD }}
        leadNome="Ana"
        leadTelefone="11999990000"
        tenantId={TENANT}
        corretorEmail="ana@octo.dev"
        ativo
        recarregarSinal={0}
      />,
    );

    // A segunda montagem consulta uma vez; o rerender com o mesmo sinal, nenhuma.
    expect(leituras.mock.calls.length).toBe(antes + 1);
  });
});
