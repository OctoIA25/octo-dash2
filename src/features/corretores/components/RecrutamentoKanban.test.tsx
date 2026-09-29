/**
 * O quadro: sete colunas (seis etapas + Perdido), agrupadas pelo id do estágio,
 * com a contagem certa — e a decisão do que fazer ao soltar, que é pura.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RecrutamentoKanban } from './RecrutamentoKanban';
import { resolverSolta } from '../domain/recruitmentStages';
import type { CandidatoKanban } from './RecrutamentoKanbanCard';

let n = 0;
const c = (estagio: CandidatoKanban['estagio'], nome = `Pessoa ${++n}`): CandidatoKanban => ({
  id: `id-${n}`, nome, estagio, status: estagio, telefone: null, ts_candidatura: '2026-09-01T00:00:00Z',
});

const lista: CandidatoKanban[] = [
  c('lead'), c('lead'), c('lead'),
  c('interacao'),
  c('reuniao_realizada'), c('reuniao_realizada'),
  c('onboard'),
  c('perdido'), c('perdido'),
];

describe('RecrutamentoKanban', () => {
  it('desenha as sete colunas na ordem do funil, Perdido por último, com as contagens', () => {
    render(<RecrutamentoKanban candidatos={lista} onAbrir={() => {}} onMover={() => {}} onEncerrar={() => {}} />);
    const colunas = screen.getAllByRole('region');
    expect(colunas.map((el) => el.getAttribute('aria-label'))).toEqual([
      'Lead', 'Interação', 'Qualificado', 'Reunião realizada', 'Matrícula', 'Onboard', 'Perdido',
    ]);
    const contagens = colunas.map((el) => within(el).getByTestId('kanban-contagem').textContent);
    expect(contagens).toEqual(['3', '1', '0', '2', '0', '1', '2']);
  });

  it('cada card fica na coluna do seu estágio', () => {
    render(<RecrutamentoKanban candidatos={lista} onAbrir={() => {}} onMover={() => {}} onEncerrar={() => {}} />);
    const onboard = screen.getByRole('region', { name: 'Onboard' });
    expect(within(onboard).getByText(lista[6].nome)).toBeInTheDocument();
    const vazia = screen.getByRole('region', { name: 'Matrícula' });
    expect(within(vazia).getByText('Nenhum candidato')).toBeInTheDocument();
  });
});

describe('resolverSolta — o que acontece quando o card é solto', () => {
  const ana = c('interacao', 'Ana');

  it('sem coluna embaixo, ou na mesma coluna: nada', () => {
    expect(resolverSolta(ana, null)).toEqual({ acao: 'nada' });
    expect(resolverSolta(ana, 'interacao')).toEqual({ acao: 'nada' });
    expect(resolverSolta(ana, 'coluna-que-nao-existe')).toEqual({ acao: 'nada' });
  });

  it('para trás move — inclusive para Lead', () => {
    expect(resolverSolta(ana, 'lead')).toEqual({ acao: 'mover', para: 'lead' });
  });

  it('em Perdido: abre o encerramento em vez de mover direto', () => {
    expect(resolverSolta(ana, 'perdido')).toEqual({ acao: 'encerrar' });
  });

  it('para frente: move', () => {
    expect(resolverSolta(ana, 'matricula')).toEqual({ acao: 'mover', para: 'matricula' });
  });

  it('card perdido volta ao funil (reabre)', () => {
    expect(resolverSolta(c('perdido'), 'lead')).toEqual({ acao: 'mover', para: 'lead' });
  });
});
