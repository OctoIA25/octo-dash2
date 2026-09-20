/**
 * O painel ao vivo da distribuição.
 *
 * O que estes testes travam não é o desenho: é a diferença entre um painel
 * vazio que está CERTO e um painel vazio que está ESCONDENDO alguma coisa.
 * Zero é um número plausível, e foi assim que meia dúzia de contadores desta
 * base mentiram por meses.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExtratoDistribuicao, contar, situacaoDoPrazo, type EventoDistribuicao } from '../ExtratoDistribuicao';

const AGORA = new Date('2026-09-20T15:00:00-03:00');

const ev = (extra: Partial<EventoDistribuicao> = {}): EventoDistribuicao => ({
  id: Math.random().toString(36).slice(2),
  lead_id: null,
  lead_ref: null,
  evento: 'consultado',
  corretor_id: null,
  motivo: 'roleta_em_ordem',
  tipo: 'terceiros',
  prazo_ate: null,
  origem: 'lia',
  created_at: '2026-09-20T14:30:00-03:00',
  ...extra,
});

const montar = (props: Partial<React.ComponentProps<typeof ExtratoDistribuicao>> = {}) =>
  render(
    <ExtratoDistribuicao eventos={[]} nomes={{}} jaHouveAlgum={false} agora={AGORA} {...props} />
  );

describe('painel vazio diz POR QUE está vazio', () => {
  it('sem nenhum acontecimento na história, avisa que a Lia ainda não consultou', () => {
    montar({ eventos: [], jaHouveAlgum: false });
    expect(screen.getByText(/A Lia ainda não consultou a regra nenhuma vez/)).toBeInTheDocument();
    // E diz que não é falha da tela: senão o gestor abre um chamado.
    expect(screen.getByText(/não é falha da tela/)).toBeInTheDocument();
  });

  it('com histórico mas sem movimento hoje, diz que hoje não veio lead', () => {
    montar({ eventos: [], jaHouveAlgum: true });
    expect(screen.getByText(/Nenhum lead passou pela distribuição nas últimas 24 horas/)).toBeInTheDocument();
    expect(screen.queryByText(/ainda não consultou/)).not.toBeInTheDocument();
  });
});

describe('os contadores saem das mesmas linhas que a lista mostra', () => {
  it('conta cada tipo de acontecimento', () => {
    const c = contar([
      ev({ evento: 'consultado' }),
      ev({ evento: 'consultado' }),
      ev({ evento: 'enviado' }),
      ev({ evento: 'atendido' }),
      ev({ evento: 'expirou' }),
      ev({ evento: 'roleta' }),
    ]);
    expect(c).toEqual({ consultados: 2, enviados: 1, atendidos: 1, expirados: 1 });
  });

  it('a tela mostra os mesmos números', () => {
    montar({ eventos: [ev({ evento: 'enviado' }), ev({ evento: 'enviado' }), ev({ evento: 'expirou' })] });
    const cartao = (rotulo: string) =>
      screen.getByText(rotulo).closest('div')?.textContent ?? '';
    expect(cartao('Enviados')).toContain('2');
    expect(cartao('Venceram')).toContain('1');
    expect(cartao('Atendidos')).toContain('0');
  });
});

describe('o prazo', () => {
  it('sem prazo NÃO vira "0 min" — quem foi para a Lia não tem relógio correndo', () => {
    expect(situacaoDoPrazo(null, AGORA)).toBeNull();
    montar({ eventos: [ev({ evento: 'consultado', motivo: 'lancamento_atendido_pela_lia' })] });
    expect(screen.queryByText(/vence|venceu/)).not.toBeInTheDocument();
  });

  it('prazo no futuro diz quanto falta', () => {
    expect(situacaoDoPrazo('2026-09-20T15:45:00-03:00', AGORA)?.texto).toBe('vence em 45 min');
  });

  it('prazo vencido diz há quanto venceu, e em vermelho', () => {
    const s = situacaoDoPrazo('2026-09-20T14:30:00-03:00', AGORA);
    expect(s?.texto).toBe('venceu há 30 min');
    expect(s?.cor).toMatch(/rose/);
  });

  it('perto de vencer avisa em âmbar, não em vermelho', () => {
    expect(situacaoDoPrazo('2026-09-20T15:10:00-03:00', AGORA)?.cor).toMatch(/amber/);
  });

  it('data inválida não vira NaN na tela', () => {
    expect(situacaoDoPrazo('nao-e-data', AGORA)).toBeNull();
  });

  it('LEAD JÁ ATENDIDO não fica vermelho quando o prazo daquele momento passa', () => {
    // O alarme falso mais fácil de produzir num painel destes: a linha do
    // "a Lia atribuiu" continuaria mostrando "venceu há 40 min" para um lead
    // que o corretor atendeu no prazo. O gestor leria um lead perdido.
    montar({
      eventos: [
        ev({ evento: 'atendido', lead_ref: 'L-9', created_at: '2026-09-20T14:20:00-03:00' }),
        ev({ evento: 'enviado', lead_ref: 'L-9', prazo_ate: '2026-09-20T14:30:00-03:00' }),
      ],
    });
    expect(screen.queryByText(/venceu há/)).not.toBeInTheDocument();
  });

  it('mas o lead ainda em aberto continua avisando', () => {
    montar({ eventos: [ev({ evento: 'enviado', lead_ref: 'L-8', prazo_ate: '2026-09-20T14:30:00-03:00' })] });
    expect(screen.getByText(/venceu há 30 min/)).toBeInTheDocument();
  });
});

describe('a linha do tempo explica, não só registra', () => {
  it('traduz o motivo em vez de mostrar a chave do banco', () => {
    montar({ eventos: [ev({ evento: 'enviado', motivo: 'captador_do_imovel' })] });
    expect(screen.getByText(/captador do imóvel/)).toBeInTheDocument();
    expect(screen.queryByText(/captador_do_imovel/)).not.toBeInTheDocument();
  });

  it('mostra o nome do corretor, não o identificador', () => {
    montar({
      eventos: [ev({ evento: 'enviado', corretor_id: 'u1' })],
      nomes: { u1: 'ana@octo.dev' },
    });
    expect(screen.getByText(/ana@octo\.dev/)).toBeInTheDocument();
  });

  it('motivo desconhecido aparece cru em vez de sumir', () => {
    // Se a regra ganhar um motivo novo e a tela não souber, o pior seria a
    // linha ficar sem explicação nenhuma.
    montar({ eventos: [ev({ motivo: 'motivo_que_ainda_nao_existe' })] });
    expect(screen.getByText(/motivo_que_ainda_nao_existe/)).toBeInTheDocument();
  });

  it('origem "dashboard" é marcada — quem mexeu na mão precisa aparecer', () => {
    montar({ eventos: [ev({ evento: 'manual', origem: 'dashboard' })] });
    expect(screen.getByText(/por dashboard/)).toBeInTheDocument();
  });
});
