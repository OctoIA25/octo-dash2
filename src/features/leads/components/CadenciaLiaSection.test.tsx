/**
 * A seção é só leitura, então o que vale testar é o que ela DIZ — em especial
 * não dizer 0% quando nada foi enviado, e não esconder cadência atrasada nem
 * tag que a LIA inventou depois.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CadenciaLiaSection } from './CadenciaLiaSection';
import type { Cadencia, CadenciaEvento } from '../services/cadenciaService';

const evento = (over: Partial<CadenciaEvento> = {}): CadenciaEvento => ({
  id: 'e1',
  tag: 'pos_apresentacao',
  attempt_number: 1,
  channel: 'whatsapp',
  status: 'sent',
  resultado: 'respondido',
  respondeu: true,
  scheduled_at: '2026-09-01T09:00:00Z',
  sent_at: '2026-09-01T10:00:00Z',
  respondido_em: '2026-09-01T10:30:00Z',
  tempo_ate_resposta_min: 30,
  motivo: 'ASSUNTO: o apartamento de 2 dormitórios no Medeiros',
  cancelled_reason: null,
  template_name: null,
  ...over,
});

const cadencia = (over: Partial<Cadencia['resumo']> = {}, timeline: CadenciaEvento[] = [evento()]): Cadencia => ({
  resumo: {
    total: timeline.length,
    enviadas: 1,
    pendentes: 0,
    canceladas: 0,
    expiradas: 0,
    respondidas: 1,
    retornos_espontaneos: 0,
    taxa_resposta: 100,
    tempo_resposta_min: { mediana: 30, amostra: 1 },
    por_tentativa: [{ attempt_number: 1, enviadas: 1, respondidas: 1 }],
    por_tag: [{ tag: 'pos_apresentacao', enviadas: 1, respondidas: 1 }],
    proxima: null,
    ultima_interacao_lead: '2026-09-01T10:30:00Z',
    dias_em_silencio: 3,
    interaction_count: 5,
    truncated: false,
    ...over,
  },
  timeline,
});

describe('CadenciaLiaSection — estados', () => {
  it('mostra esqueleto enquanto carrega, não a palavra "Carregando"', () => {
    render(<CadenciaLiaSection carregando erro={null} />);
    expect(screen.getByTestId('cadencia-carregando')).toBeInTheDocument();
    expect(screen.queryByText(/carregando/i)).not.toBeInTheDocument();
  });

  it('mostra a mensagem de erro que veio do serviço', () => {
    render(<CadenciaLiaSection carregando={false} erro="Você não tem acesso à cadência deste lead." />);
    expect(screen.getByText(/não tem acesso/i)).toBeInTheDocument();
  });

  it('lead sem cadência recebe estado vazio explícito', () => {
    render(<CadenciaLiaSection carregando={false} erro={null} cadencia={cadencia({ total: 0 }, [])} />);
    expect(screen.getByText(/ainda não iniciou cadência/i)).toBeInTheDocument();
  });
});

describe('CadenciaLiaSection — números', () => {
  it('taxa sem envio nenhum aparece como — e não como 0%', () => {
    render(
      <CadenciaLiaSection
        carregando={false}
        erro={null}
        cadencia={cadencia({ enviadas: 0, respondidas: 0, taxa_resposta: null })}
      />,
    );
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText('Taxa').previousSibling).toHaveTextContent('—');
  });

  it('separa retorno espontâneo da taxa de resposta', () => {
    render(
      <CadenciaLiaSection
        carregando={false}
        erro={null}
        cadencia={cadencia({ retornos_espontaneos: 3 })}
      />,
    );
    expect(screen.getByText(/vezes o lead voltou/i)).toBeInTheDocument();
  });

  it('silêncio desconhecido não vira zero dias', () => {
    render(
      <CadenciaLiaSection carregando={false} erro={null} cadencia={cadencia({ dias_em_silencio: null })} />,
    );
    expect(screen.getByText('Silêncio').previousSibling).toHaveTextContent('—');
  });
});

describe('CadenciaLiaSection — próxima cadência', () => {
  it('cadência futura aparece como próxima', () => {
    render(
      <CadenciaLiaSection
        carregando={false}
        erro={null}
        cadencia={cadencia({
          proxima: { scheduled_at: '2026-12-01T14:00:00Z', tag: 'silencio_quente', attempt_number: 2, atrasada: false },
        })}
      />,
    );
    expect(screen.getByText(/Próxima cadência/)).toBeInTheDocument();
    expect(screen.getByText(/2ª tentativa/)).toBeInTheDocument();
  });

  it('cadência vencida aparece como atrasada em vez de sumir', () => {
    render(
      <CadenciaLiaSection
        carregando={false}
        erro={null}
        cadencia={cadencia({
          proxima: { scheduled_at: '2026-08-01T14:00:00Z', tag: null, attempt_number: null, atrasada: true },
        })}
      />,
    );
    expect(screen.getByText(/atrasada desde/i)).toBeInTheDocument();
  });
});

describe('CadenciaLiaSection — histórico', () => {
  it('histórico começa fechado e abre no clique', () => {
    render(<CadenciaLiaSection carregando={false} erro={null} cadencia={cadencia()} />);
    expect(screen.queryByText(/Após apresentar imóvel/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ver histórico/ }));
    expect(screen.getByText(/Após apresentar imóvel/)).toBeInTheDocument();
    // "Respondeu" também é rótulo de KPI: procurar só dentro da timeline.
    expect(within(screen.getByRole('list')).getByText(/Respondeu/)).toBeInTheDocument();
  });

  it('traduz cada resultado e explica o retorno espontâneo', () => {
    const timeline = [
      evento({ id: 'a', resultado: 'sem_resposta', respondeu: false, tempo_ate_resposta_min: null }),
      evento({ id: 'b', resultado: 'aguardando', sent_at: null }),
      evento({ id: 'c', resultado: 'expirado' }),
      evento({ id: 'd', resultado: 'cancelado', cancelled_reason: 'lead_returned' }),
    ];
    render(
      <CadenciaLiaSection carregando={false} erro={null} cadencia={cadencia({ total: 4 }, timeline)} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ver histórico/ }));
    for (const t of ['Sem resposta', 'Agendada', 'Expirou', 'Cancelada']) {
      expect(screen.getByText(new RegExp(t))).toBeInTheDocument();
    }
    expect(screen.getByText(/o lead voltou sozinho/)).toBeInTheDocument();
  });

  it('tag desconhecida aparece legível em vez de sumir', () => {
    render(
      <CadenciaLiaSection
        carregando={false}
        erro={null}
        cadencia={cadencia({}, [evento({ tag: 'assunto_novo_da_lia' })])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ver histórico/ }));
    expect(screen.getByText(/Assunto novo da lia/)).toBeInTheDocument();
  });

  it('avisa quando a lista está truncada', () => {
    render(
      <CadenciaLiaSection carregando={false} erro={null} cadencia={cadencia({ truncated: true })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ver histórico/ }));
    expect(screen.getByText(/histórico completo é maior/i)).toBeInTheDocument();
  });
});
