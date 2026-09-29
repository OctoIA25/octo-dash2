/**
 * A célula de Empreendimento sugere os lançamentos cadastrados — 29/09.
 *
 * Por que este teste existe: o nome digitado aqui é o que amarra a venda à
 * construtora lá na Conferência, por IGUALDADE de nome. Onze pessoas
 * escreveram "Castanheira" e dezesseis escreveram "Reserva Castanheira" — as
 * onze ficaram sem construtora, sem comissão e sem nota fiscal.
 *
 * O caso chato é o da lista vazia: um `list` apontando para um datalist sem
 * opção nenhuma deixa o navegador prometendo autocompletar que não existe.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForecastTable } from '../components/ForecastTable';
import { calcularComissaoForecast } from '../utils/comissao';
import type { ForecastRow } from '../utils/forecastRow';

// A comissão vem da função de verdade: montá-la à mão aqui seria uma segunda
// implementação da regra, que passa a valer só dentro do teste.
const linha = (over: Partial<ForecastRow> = {}): ForecastRow => ({
  proposalId: 'p1', leadId: 'l1', stageId: 'etapa-1',
  corretor: 'Ana', lead: 'Cliente',
  empreendimento: 'Castanheira', unidade: 'Q22',
  valor: 600000, comissao: calcularComissaoForecast(600000, 'lancamento'),
  dataAtendimento: null, ultimoAtendimento: null,
  previsaoFechamento: null, estadoAtual: '',
  ...over,
});

const montar = (nomes?: string[]) =>
  render(
    <ForecastTable
      rows={[linha()]}
      onSave={vi.fn()}
      onRemove={vi.fn()}
      nomesDeLancamento={nomes}
    />,
  );

describe('ForecastTable — sugestões de empreendimento', () => {
  it('oferece os nomes do cadastro na célula de empreendimento', () => {
    montar(['Reserva Castanheira', 'Gioviale']);
    const campo = screen.getByLabelText('Empreendimento de Cliente');

    const listaId = campo.getAttribute('list');
    expect(listaId).toBeTruthy();

    const datalist = document.getElementById(listaId as string);
    const opcoes = [...(datalist?.querySelectorAll('option') ?? [])].map((o) => o.getAttribute('value'));
    expect(opcoes).toEqual(['Reserva Castanheira', 'Gioviale']);
  });

  it('não promete autocompletar quando não há cadastro nenhum', () => {
    montar([]);
    expect(screen.getByLabelText('Empreendimento de Cliente')).not.toHaveAttribute('list');
    expect(document.querySelector('datalist')).toBeNull();
  });

  it('não sugere na célula de unidade — ali o texto é livre de verdade', () => {
    montar(['Reserva Castanheira']);
    expect(screen.getByLabelText('Unidade de Cliente')).not.toHaveAttribute('list');
  });
});
