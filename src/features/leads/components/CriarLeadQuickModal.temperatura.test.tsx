/**
 * A temperatura e o bolsão no modal do lead (25/09).
 *
 * Dois pedidos do chefe, na mesma tela, e os dois são sobre a mesma doença:
 * um controle que parece mudar alguma coisa e não muda.
 *
 * 1. **A TEMPERATURA NÃO SE ESCOLHE.** Eram três botões gravando a coluna
 *    `temperature`, enquanto o selo do card lia o score. O mesmo lead aparecia
 *    "50 · Morno" no selo e "Quente" nos botões, na mesma ficha. O que este
 *    arquivo trava é o lado invisível da correção: **o que vai para o banco**.
 *    Sem avaliação carregada, o save NÃO pode escrever temperatura — a coluna
 *    é lida pelo Kenlo, pela proposta e pelo filtro do Kanban, e gravar
 *    "Morno" porque o ponto de partida é 50 espalharia uma avaliação que
 *    ninguém fez.
 *
 * 2. **O BOLSÃO NÃO É POR LEAD.** "Tirar aquela regra de bolsão (vale sempre
 *    pra todos)". O campo `participa_bolsao` continua no banco — a importação
 *    da Santa Ângela grava `false` de propósito — e por isso o save tem de
 *    parar de mandá-lo: um save comum não pode devolver 20 mil leads
 *    históricos ao bolsão sem ninguém pedir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updates: Array<{ tabela: string; payload: Record<string, unknown> }> = [];
const inserts: Array<{ tabela: string; payload: Record<string, unknown> }> = [];

vi.mock('@/lib/supabaseClient', () => {
  const chain = (tabela: string) => {
    const self: Record<string, unknown> = {
      update(payload: Record<string, unknown>) {
        updates.push({ tabela, payload });
        return self;
      },
      insert(payload: Record<string, unknown>) {
        inserts.push({ tabela, payload });
        return { error: null };
      },
      eq: () => self,
      select: async () => ({ data: [{ id: 'lead-1' }], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return self;
  };
  return {
    supabase: {
      from: (tabela: string) => chain(tabela),
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

vi.mock('@/features/leads/services/roletaService', () => ({
  fetchCorretoresDisponiveis: async () => [],
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/leadsEventEmitter', () => ({ leadsEventEmitter: { emit: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ isGestao: true, user: { role: 'admin', name: 'Victor' }, tenantId: 't1' }),
}));

import { CriarLeadQuickModal } from './CriarLeadQuickModal';
import { calcularScore } from '../utils/score';
import type { KanbanLead } from '../services/leadsService';

/** Um lead cuja coluna gravada diz "Quente" — o valor que causou a queixa. */
const LEAD = {
  id: 'lead-1',
  nomedolead: 'Fulano',
  lead: '11999999999',
  status: 'novos-leads',
  temperature: 'Quente',
  participa_bolsao: false,
  corretor_responsavel: 'João',
  source_lead_id: 'lead-1',
  source_kenlo_id: null,
} as unknown as KanbanLead;

const props = { isOpen: true, onClose: vi.fn(), tenantId: 't1' };
const salvar = () => fireEvent.click(screen.getByRole('button', { name: /Salvar|Criar / }));
const payloadDe = (tabela: string) => updates.find((u) => u.tabela === tabela)?.payload;

beforeEach(() => {
  updates.length = 0;
  inserts.length = 0;
});

describe('a temperatura sai do score, e não de três botões', () => {
  it('os botões de escolher temperatura não existem mais', () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);
    for (const t of ['Quente', 'Morno', 'Frio']) {
      expect(screen.queryByRole('button', { name: t })).not.toBeInTheDocument();
    }
  });

  it('a régua desenha as três faixas com os limites da imobiliária', () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} avaliacao={calcularScore({ pediu_visita: true })} />);
    expect(screen.getByTitle('Frio: 0 a 39')).toBeInTheDocument();
    expect(screen.getByTitle('Morno: 40 a 69')).toBeInTheDocument();
    expect(screen.getByTitle('Quente: 70 a 100')).toBeInTheDocument();
  });

  /*
   * O CASO QUE SUSTENTA O ARQUIVO. É o que impede a volta da contradição por
   * outro caminho: a ficha pode mostrar o certo e o banco continuar guardando
   * o errado, e aí o filtro do Kanban e a proposta seguem discordando do selo.
   */
  it('salvar grava a temperatura DERIVADA, e não a que estava na coluna', async () => {
    const avaliacao = calcularScore({ pediu_visita: true, respondeu: true }); // 80 · Quente
    render(<CriarLeadQuickModal {...props} editingLead={{ ...LEAD, temperature: 'Frio' } as KanbanLead} avaliacao={avaliacao} />);
    salvar();

    await waitFor(() => expect(payloadDe('leads')).toBeDefined());
    expect(avaliacao.temperatura).toBe('Quente');
    expect(payloadDe('leads')!.temperature).toBe('Quente');
  });

  /*
   * Sem sinais, `calcularScore({})` devolveria 50 · Morno. Gravar isso seria
   * inventar uma avaliação — e ela iria parar no Kenlo e na proposta.
   */
  it('sem avaliação carregada, o save não escreve temperatura nenhuma', async () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} avaliacao={null} />);
    salvar();

    await waitFor(() => expect(payloadDe('leads')).toBeDefined());
    expect(Object.keys(payloadDe('leads')!)).not.toContain('temperature');
  });

  it('a ficha diz que não houve avaliação, em vez de mostrar uma faixa', () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} avaliacao={calcularScore({})} />);
    // Duas vezes: o cartão do score explica, e a régua repete embaixo das
    // faixas. As duas são o mesmo fato, e nenhuma pode afirmar "Morno".
    expect(screen.getAllByText(/Nenhum sinal observado ainda/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/50\/100 · Morno/)).not.toBeInTheDocument();
  });
});

describe('o bolsão deixa de ser decidido lead a lead', () => {
  it('o interruptor "Ativar bolsão" não existe mais', () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Ativar bolsão')).not.toBeInTheDocument();
  });

  /*
   * O lead do teste tem `participa_bolsao: false` — é o caso da importação da
   * Santa Ângela. Se o save voltasse a mandar o campo, uma edição de nome
   * devolveria o lead histórico ao bolsão, calada.
   */
  it('salvar não manda participa_bolsao, nem para reativar nem para desativar', async () => {
    render(<CriarLeadQuickModal {...props} editingLead={LEAD} />);
    salvar();

    await waitFor(() => expect(payloadDe('leads')).toBeDefined());
    expect(Object.keys(payloadDe('leads')!)).not.toContain('participa_bolsao');
  });

  it('criar lead novo também não manda o campo — o padrão do banco é participar', async () => {
    render(<CriarLeadQuickModal {...props} />);
    fireEvent.change(screen.getByPlaceholderText('Nome do cliente'), { target: { value: 'Novo Fulano' } });
    fireEvent.change(screen.getByPlaceholderText('(11) 99999-9999'), { target: { value: '11999999999' } });
    salvar();

    await waitFor(() => expect(inserts.find((i) => i.tabela === 'leads')).toBeDefined());
    expect(Object.keys(inserts.find((i) => i.tabela === 'leads')!.payload)).not.toContain('participa_bolsao');
  });
});
