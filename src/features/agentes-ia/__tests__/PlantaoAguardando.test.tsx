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

const fila = (contadores: Record<string, number>) => ({
  aba: 'aguardando',
  espera_maxima_minutos: 30,
  destino: 'corretor_do_lead',
  plantonista_id: null,
  configurado: false,
  dias: 90,
  contadores: {
    aguardando: 0, respondidas: 0, expiradas: 0,
    na_janela: 0, por_aprender: 0, sem_empreendimento: 0,
    ...contadores,
  },
  linhas: [],
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
