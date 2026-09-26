/**
 * O campo "Vendas na planilha" no cartão de métricas individuais.
 *
 * Ele vem de OUTRA fonte que o resto do cartão (a planilha de comissionamento,
 * lida de hora em hora), então precisa dizer isso na tela. E, quando a planilha
 * não tem o corretor, some — zero ali seria afirmar que ninguém vendeu.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CorretorMetricCard } from './CorretorMetricCard';
import type { CorretorMetricasCompletas } from '@/types/metricsTypes';

const corretor = {
  nome: 'Fernanda Souza',
  avatar: null,
  ranking: { posicao: 0, badge: '' },
  kpis: { vendasFeitas: 3, comissaoTotal: 10000, leadsAtendidos: 10, taxaConversao: 30 },
  funil: { leadsRecebidos: 10, visitasAgendadas: 4, visitasRealizadas: 3, propostas: 2, vendasRealizadas: 3, taxaConversaoVendas: 30 },
  atividade: { ligacoes: 0, mensagens: 0, emails: 0, tempoMedioResposta: '—' },
  desempenho: { metaMensal: 0, atingido: 0, percentual: 0 },
} as unknown as CorretorMetricasCompletas;

describe('CorretorMetricCard — vendas da planilha', () => {
  it('mostra o número da planilha, o total do ano e quando foi lido', () => {
    render(
      <CorretorMetricCard
        corretor={corretor}
        vendasPlanilha={{ noPeriodo: 2, noAno: 14, atualizadoEm: '2026-09-23T17:32:00Z' }}
      />,
    );

    const linha = screen.getByText('Vendas na planilha:').closest('p');
    expect(linha).toHaveTextContent('2');
    expect(linha).toHaveTextContent('14 no ano');
    expect(linha).toHaveTextContent(/lido em/i);
  });

  it('sem dado da planilha, o campo não aparece', () => {
    render(<CorretorMetricCard corretor={corretor} />);

    expect(screen.queryByText('Vendas na planilha:')).not.toBeInTheDocument();
  });

  it('o número da Dash continua na grade, separado do da planilha', () => {
    render(
      <CorretorMetricCard
        corretor={corretor}
        vendasPlanilha={{ noPeriodo: 2, noAno: 14, atualizadoEm: null }}
      />,
    );

    // 3 é o da Dash (kpis.vendasFeitas); 2 é o da planilha. Os dois na tela.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Vendas na planilha:').closest('p')).toHaveTextContent('2');
  });
});
