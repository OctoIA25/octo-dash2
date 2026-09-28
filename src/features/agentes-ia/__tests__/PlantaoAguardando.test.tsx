/**
 * A aba "Aguardando" do Plantão, nas duas escalas — 26/09.
 *
 * A tela foi desenhada sobre a LIA da Japi: 1.540 perguntas, 4 pendentes, 38
 * expiradas. A equipe da Lia apontou que os números não são da Lotus, e ao
 * medir apareceu uma consequência que ninguém tinha visto.
 *
 * Na Lotus são 11 perguntas, TODAS respondidas — zero pendente, zero expirada.
 * A LIA de lá grava a pergunta só quando o corretor responde, então nenhuma
 * linha nasce pendente e a aba fica vazia POR CONSTRUÇÃO.
 *
 * E a aba dizia "Ninguém esperando". Isso é uma afirmação, e é falsa: a tela
 * não vê a fila. O gestor que lê "ninguém esperando" não vai atrás de nada —
 * é a diferença entre "está tudo em dia" e "não temos como saber", que esta
 * base de código já corrigiu em outras telas com "Sem dados".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { tenantId: 't1' }, isGestao: true, isOwner: false }),
}));

const carregar = vi.fn();
vi.mock('../services/plantaoService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  carregarFila: (...a: unknown[]) => carregar(...a),
  salvarNaBase: vi.fn(),
}));

import { PlantaoPage } from '../pages/PlantaoPage';

const fila = (contadores: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  aba: 'aguardando',
  espera_maxima_minutos: 30,
  destino: 'corretor_do_lead',
  plantonista_id: null,
  configurado: false,
  dias: 90,
  recorte: 'imobiliaria',
  ve_tudo: true,
  contadores: {
    aguardando: 0, respondidas: 0, expiradas: 0,
    na_janela: 0, por_aprender: 0, sem_empreendimento: 0,
    sem_dono_oculto: 0,
    ...contadores,
  },
  linhas: [],
  ...extra,
});

const abrir = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PlantaoPage /></QueryClientProvider>);
};

describe('fila vazia tem dois motivos, e eles são opostos', () => {
  /*
   * O CASO QUE SUSTENTA O ARQUIVO. É a forma exata que a Lotus tem hoje:
   * 11 respondidas, nenhuma pendente, nenhuma expirada.
   */
  it('a LIA que só grava ao responder: a tela diz que NÃO SABE', async () => {
    carregar.mockResolvedValue(fila({ respondidas: 11, na_janela: 11, por_aprender: 11 }));
    abrir();

    expect(await screen.findByText(/não consegue mostrar quem está esperando/i)).toBeInTheDocument();
    // E diz por quê, senão o gestor acha que é defeito da tela.
    expect(screen.getByText(/só no momento em que o corretor responde/i)).toBeInTheDocument();
    // E não pode afirmar o contrário na mesma tela.
    expect(screen.queryByText(/Ninguém esperando/i)).not.toBeInTheDocument();
  });

  /*
   * A escala da Japi: houve expirada no período, então a fila É visível e
   * estar vazia agora significa mesmo que ninguém espera.
   */
  it('a casa cuja fila a tela VÊ continua dizendo "ninguém esperando"', async () => {
    carregar.mockResolvedValue(fila({ respondidas: 1498, expiradas: 38, na_janela: 1540 }));
    abrir();

    expect(await screen.findByText(/Ninguém esperando/i)).toBeInTheDocument();
    expect(screen.queryByText(/não consegue mostrar/i)).not.toBeInTheDocument();
  });

  /*
   * Imobiliária que nunca usou o plantão não tem nada a explicar: dizer
   * "a tela não vê a fila" ali inventaria um problema que não existe.
   */
  it('sem pergunta nenhuma, não inventa explicação', async () => {
    carregar.mockResolvedValue(fila({}));
    abrir();

    expect(await screen.findByText(/Ninguém esperando/i)).toBeInTheDocument();
    expect(screen.queryByText(/não consegue mostrar/i)).not.toBeInTheDocument();
  });

  it('o número que a mensagem cita é o da própria casa', async () => {
    carregar.mockResolvedValue(fila({ respondidas: 11, na_janela: 11 }));
    abrir();
    expect(await screen.findByText(/as 11 do período/i)).toBeInTheDocument();
  });
});

/*
 * O MESMO ERRO, DO OUTRO LADO DA TELA — 27/09.
 *
 * Com o recorte por equipe, o líder deixa de ver a pergunta de quem não é
 * dele. Na Lotus isso pesa: das 95 respondidas, 91 têm `corretor_id` nulo ou
 * com um nome no lugar do id, e somem para todo mundo que não administra.
 *
 * Dizer "Nenhuma pergunta respondida no período" para esse líder é a mesma
 * mentira do "Ninguém esperando": ele conclui que a casa não trabalhou.
 */
describe('a aba Respondidas vazia também tem dois motivos', () => {
  /** A aba é estado da tela, não do dado: o teste tem de clicar, como o gestor. */
  const irParaRespondidas = async () => {
    await screen.findByRole('button', { name: /Respondidas/ });
    await userEvent.click(screen.getByRole('button', { name: /Respondidas/ }));
  };

  it('com perguntas escondidas, a tela diz que são as que ELE pode ver', async () => {
    carregar.mockResolvedValue(
      fila({}, { recorte: 'equipe', ve_tudo: false,
             contadores: { aguardando: 0, respondidas: 0, expiradas: 0, na_janela: 0,
                           por_aprender: 0, sem_empreendimento: 0, sem_dono_oculto: 91 } })
    );
    abrir();
    await irParaRespondidas();
    expect(await screen.findByText(/não têm corretor identificado/i)).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma pergunta respondida no período.')).not.toBeInTheDocument();
  });

  it('sem nada escondido, a afirmação simples volta a ser verdadeira', async () => {
    carregar.mockResolvedValue(fila({}));
    abrir();
    await irParaRespondidas();
    expect(await screen.findByText('Nenhuma pergunta respondida no período.')).toBeInTheDocument();
  });
});

// 28/09 — pergunta de lançamento sem resposta no prazo sobe para o diretor.
describe('a fila diz quando a pergunta subiu ao diretor', () => {
  const linha = (extra: Record<string, unknown>) => ({
    id: 'p1', pergunta: 'Tem vaga coberta?', contexto: null, status: 'pendente',
    criado_em: new Date(Date.now() - 30 * 3600_000).toISOString(), respondida_em: null, resposta: null,
    nudges: 0, lead_id: null, lead_nome: 'Sandra', corretor_id: 'u1', corretor_nome: 'Fernanda',
    corretor_email: null, empreendimento_id: 'e1', empreendimento_nome: 'Reserva', kb_documento_id: null,
    aprovada_para_base: false, ...extra,
  });

  it('escalada: mostra "diretor avisado em …"', async () => {
    carregar.mockResolvedValue(fila({ aguardando: 1, na_janela: 1 }, {
      linhas: [linha({ escalada_em: '2026-09-28T13:00:00-03:00' })],
    }));
    abrir();
    expect(await screen.findByText(/diretor avisado em 28\/09/)).toBeInTheDocument();
  });

  it('não escalada: não inventa aviso', async () => {
    carregar.mockResolvedValue(fila({ aguardando: 1, na_janela: 1 }, { linhas: [linha({ escalada_em: null })] }));
    abrir();
    expect(await screen.findByText('Tem vaga coberta?')).toBeInTheDocument();
    expect(screen.queryByText(/diretor avisado/)).not.toBeInTheDocument();
  });
});
