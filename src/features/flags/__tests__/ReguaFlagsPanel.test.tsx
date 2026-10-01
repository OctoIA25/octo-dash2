/**
 * A.3 · o editor da régua: grava caminhos limpos, salvar vazio tira o nível,
 * valor fora da regra do banco não sai, e quem não é diretoria só lê.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Reguas } from '../flagsService';

const buscar = vi.fn<(...a: unknown[]) => Promise<Reguas>>();
const salvar = vi.fn<(...a: unknown[]) => Promise<void>>();
vi.mock('../flagsService', () => ({
  buscarReguas: (...a: unknown[]) => buscar(...a),
  salvarRegua: (...a: unknown[]) => salvar(...a),
}));

import { ReguaFlagsPanel } from '../ReguaFlagsPanel';

const montar = (podeEditar = true) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ReguaFlagsPanel tenantId="lotus" podeEditar={podeEditar} />
  </QueryClientProvider>,
);

beforeEach(() => {
  buscar.mockReset(); salvar.mockReset();
  buscar.mockResolvedValue({ 'lancamentos:verde': [{ vendas: 2 }, { vendas: 1, visitas: 8 }] });
  salvar.mockResolvedValue();
});

const salvarDo = (secao: number) => screen.getAllByRole('button', { name: 'Salvar' })[secao];

describe('A.3 · editor da régua', () => {
  it('mostra os caminhos gravados e salva só o que mudou, limpo', async () => {
    montar();
    const visitas = await screen.findByLabelText('Verde · caminho 2 · Visitas realizadas');
    expect(visitas).toHaveValue(8);
    expect(salvarDo(0)).toBeDisabled();                       // nada mudou ainda
    fireEvent.change(visitas, { target: { value: '6' } });
    fireEvent.click(salvarDo(0));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith('lotus', 'lancamentos', 'verde', [{ vendas: 2 }, { vendas: 1, visitas: 6 }]));
  });

  it('criar a régua do amarelo, com um caminho', async () => {
    montar();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Criar régua do amarelo' }))[0]);
    fireEvent.change(screen.getByLabelText('Amarelo · caminho 1 · Vendas'), { target: { value: '1' } });
    fireEvent.click(salvarDo(1));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith('lotus', 'lancamentos', 'amarelo', [{ vendas: 1 }]));
  });

  it('tirar todos os caminhos e salvar apaga o nível (vai vazio)', async () => {
    montar();
    await screen.findByLabelText('Verde · caminho 1 · Vendas');
    for (const b of screen.getAllByRole('button', { name: 'Tirar' }).slice(0, 2).reverse()) fireEvent.click(b);
    expect(screen.getByText('Salvar vazio tira a régua do verde.')).toBeInTheDocument();
    fireEvent.click(salvarDo(0));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith('lotus', 'lancamentos', 'verde', []));
  });

  it('valor fora de 1..999 inteiro não sai', async () => {
    montar();
    fireEvent.change(await screen.findByLabelText('Verde · caminho 1 · Vendas'), { target: { value: '2.5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Use números inteiros de 1 a 999.');
    expect(salvarDo(0)).toBeDisabled();
  });

  it('quem não é diretoria lê a régua por extenso e não tem campo', async () => {
    montar(false);
    expect(await screen.findByText('2 vendas — ou — 1 venda e 8 visitas')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});
