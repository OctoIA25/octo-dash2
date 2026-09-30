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
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const quem = { isGestao: true, isOwner: false };
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { tenantId: 't1', sidebarPermissions: ['chat'] }, ...quem }),
}));
// O modal do lead tem vida própria (e testes próprios); aqui só importa que a fila o abra.
vi.mock('@/features/leads/components/CriarLeadQuickModal', () => ({ CriarLeadQuickModal: () => null }));

const carregar = vi.fn();
vi.mock('../services/plantaoService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  carregarFila: (...a: unknown[]) => carregar(...a),
  salvarNaBase: vi.fn(),
}));

import { PlantaoPage } from '../pages/PlantaoPage';
import { datasDoPeriodo } from '../utils/plantao';

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
    sem_dono_oculto: 0, atrasadas: 0, mediana_resposta_min: null,
    ...contadores,
  },
  equipes: [],
  linhas: [],
  ...extra,
});

const abrir = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}><PlantaoPage /></QueryClientProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  carregar.mockReset();
  quem.isGestao = true;
  quem.isOwner = false;
});

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

/*
 * 30/09 — pedido do chefe: resumo em cima, período (o mês por padrão), área
 * (Lançamentos × Prontos), cada chamado com corretor, equipe e conversa — e o
 * corretor entrando na tela para ver e responder os dele.
 */
describe('resumo, período e área', () => {
  const chamado = (extra: Record<string, unknown>) => ({
    id: 'c1', pergunta: 'Qual o valor do condomínio?', contexto: null, status: 'pendente',
    criado_em: new Date(Date.now() - 5 * 60_000).toISOString(), respondida_em: null, resposta: null,
    nudges: 0, lead_id: 'L1', lead_nome: 'Mariana', lead_telefone: '5511999990001',
    corretor_id: 'u1', corretor_nome: 'Fábio Gonçalves', corretor_email: null,
    equipe_id: 'tL', equipe_nome: 'Lançamentos',
    empreendimento_id: null, empreendimento_nome: null, kb_documento_id: null,
    aprovada_para_base: false, fora_do_canal: false, ...extra,
  });
  const ultimoFiltro = () => carregar.mock.calls.at(-1)?.[2];

  it('os cartões mostram o que o banco contou — pendentes somam as expiradas', async () => {
    carregar.mockResolvedValue(fila({
      na_janela: 119, aguardando: 6, expiradas: 18, respondidas: 95,
      atrasadas: 20, mediana_resposta_min: 163,
    }));
    abrir();
    const resumo = await screen.findByLabelText('Resumo do período');
    expect(within(resumo).getByText('119')).toBeInTheDocument();
    expect(within(resumo).getByText('24')).toBeInTheDocument();
    expect(within(resumo).getByText('20 além de 30 min')).toBeInTheDocument();
    expect(within(resumo).getByText('2h43')).toBeInTheDocument();
  });

  it('sem nada respondido, o tempo é "—", não zero minutos', async () => {
    carregar.mockResolvedValue(fila({ na_janela: 3, aguardando: 3 }));
    abrir();
    expect(await screen.findByText('nada respondido no período')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('cada chamado diz o corretor e a área, e abre o lead e a conversa', async () => {
    carregar.mockResolvedValue(fila({ aguardando: 2, na_janela: 2 }, {
      linhas: [chamado({}), chamado({ id: 'c2', pergunta: 'Aceita pet?', equipe_id: null, equipe_nome: null,
                                      lead_telefone: null,
                                      corretor_id: 'Fernanda Emilia', corretor_nome: 'Fernanda Emilia' })],
    }));
    abrir();
    expect(await screen.findByText('Fábio Gonçalves')).toBeInTheDocument();
    expect(screen.getByText('Lançamentos')).toBeInTheDocument();
    // Pergunta sem corretor identificado não some da área: fica em "Sem equipe".
    expect(screen.getByText('Sem equipe')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Abrir lead/ })).toHaveLength(2);
    // Só quem tem telefone ganha o link: sem número não há conversa para abrir.
    expect(screen.getByRole('link', { name: /Abrir conversa/ })).toHaveAttribute(
      'href', expect.stringContaining('5511999990001'));
  });

  it('abre no mês corrente, e trocar o período manda as datas novas', async () => {
    carregar.mockResolvedValue(fila({}));
    abrir();
    await screen.findByRole('group', { name: 'Período' });
    expect(carregar.mock.calls[0][2]).toEqual({ ...datasDoPeriodo('mes'), equipe: null });

    await userEvent.click(screen.getByRole('button', { name: 'Mês passado' }));
    expect(ultimoFiltro()).toEqual({ ...datasDoPeriodo('mes_passado'), equipe: null });
  });

  it('datas trocadas não vão ao banco, e a tela diz por quê em vez de carregar para sempre', async () => {
    carregar.mockResolvedValue(fila({ na_janela: 7 }));
    abrir();
    await screen.findByLabelText('Resumo do período');
    await userEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    const chamadas = carregar.mock.calls.length;
    const de = screen.getByLabelText('De');
    await userEvent.clear(de);
    await userEvent.type(de, '2026-09-20');
    const ate = screen.getByLabelText('Até');
    await userEvent.clear(ate);
    await userEvent.type(ate, '2026-09-10');
    expect(await screen.findByText('A data inicial está depois da final.')).toBeInTheDocument();
    expect(screen.queryByText('Carregando o plantão…')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Resumo do período')).not.toBeInTheDocument();
    expect(carregar.mock.calls.slice(chamadas).some((c) => c[2].de > c[2].ate)).toBe(false);
  });

  it('o gestor escolhe a área, e a escolha vai ao banco', async () => {
    carregar.mockResolvedValue(fila({}, {
      equipes: [
        { id: 'tL', nome: 'Lançamentos', total: 13, pendentes: 9 },
        { id: 'tP', nome: 'Prontos', total: 15, pendentes: 15 },
        { id: 'sem_equipe', nome: null, total: 91, pendentes: 0 },
      ],
    }));
    abrir();
    const area = await screen.findByRole('group', { name: 'Área' });
    expect(within(area).getByRole('button', { name: /Sem equipe/ })).toBeInTheDocument();
    await userEvent.click(within(area).getByRole('button', { name: /Prontos/ }));
    expect(ultimoFiltro()).toMatchObject({ equipe: 'tP' });
  });

  /*
   * O corretor entra (antes era redirecionado) e vê só as suas — isso quem
   * garante é o banco. A tela só não lhe oferece o que ensina a LIA para a casa
   * inteira: "Mais perguntadas" e "Salvar na base".
   */
  it('o corretor entra, responde, e não vê área, "Mais perguntadas" nem "Salvar na base"', async () => {
    quem.isGestao = false;
    carregar.mockResolvedValue(fila({ aguardando: 1, respondidas: 1, na_janela: 2 }, {
      recorte: 'proprias', ve_tudo: false,
      equipes: [{ id: 'tL', nome: 'Lançamentos', total: 2, pendentes: 1 },
                { id: 'sem_equipe', nome: null, total: 0, pendentes: 0 }],
      linhas: [chamado({})],
    }));
    abrir();
    expect(await screen.findByRole('button', { name: 'Responder' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Área' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mais perguntadas/ })).not.toBeInTheDocument();

    carregar.mockResolvedValue(fila({ respondidas: 1, na_janela: 1 }, {
      recorte: 'proprias', ve_tudo: false,
      linhas: [chamado({ status: 'respondida', resposta: 'R$ 650', respondida_em: new Date().toISOString() })],
    }));
    await userEvent.click(screen.getByRole('button', { name: /Respondidas/ }));
    expect(await screen.findByText('R$ 650')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar na base/ })).not.toBeInTheDocument();
  });
});
