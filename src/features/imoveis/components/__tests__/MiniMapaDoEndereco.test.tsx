import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Leaflet não desenha no jsdom; o que importa aqui é o que vai para o banco.
const leaflet = vi.hoisted(() => {
  const ouvintes: Record<string, (e: unknown) => void> = {};
  const marker = { addTo: () => marker, on: vi.fn(), setLatLng: vi.fn() };
  const mapa = {
    setView: vi.fn(() => mapa),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    getZoom: () => 12,
    on: (evento: string, fn: (e: unknown) => void) => { ouvintes[evento] = fn; },
  };
  return { ouvintes, mapa, marker };
});
vi.mock('leaflet', () => ({
  default: {
    map: () => leaflet.mapa,
    tileLayer: () => ({ addTo: vi.fn() }),
    marker: () => leaflet.marker,
    icon: () => ({}),
  },
}));
const servico = vi.hoisted(() => ({
  salvarPino: vi.fn().mockResolvedValue(undefined),
  geocodificarPendentes: vi.fn(),
  lerPino: vi.fn(),
  buscarEnderecos: vi.fn(),
}));
vi.mock('../../services/mapaPontosService', () => servico);

import { MiniMapaDoEndereco } from '../MiniMapaDoEndereco';

describe('MiniMapaDoEndereco — coordenada colada', () => {
  it('grava a coordenada copiada do Google Maps como pino posto à mão', async () => {
    const aoMover = vi.fn();
    render(<MiniMapaDoEndereco tipo="lancamento" id="l1" tenantId="t1" aoMover={aoMover} />);
    fireEvent.change(screen.getByLabelText('Coordenadas'), { target: { value: '-23.18712, -46.88452' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar' }));
    await waitFor(() => expect(servico.salvarPino).toHaveBeenCalledWith('lancamento', 'l1', -23.18712, -46.88452));
    expect(aoMover).toHaveBeenCalledWith(-23.18712, -46.88452);
    expect(screen.getByText('-23.187120, -46.884520')).toBeInTheDocument();
  });

  it('texto que não é coordenada não grava e explica o formato', () => {
    servico.salvarPino.mockClear();
    render(<MiniMapaDoEndereco tipo="imovel" id="i1" tenantId="t1" />);
    fireEvent.change(screen.getByLabelText('Coordenadas'), { target: { value: 'Rua das Flores' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar' }));
    expect(servico.salvarPino).not.toHaveBeenCalled();
    expect(screen.getByText(/Não entendi a coordenada/)).toBeInTheDocument();
  });

  it('depois de "Localizar", mostra o pino gravado sem esperar o formulário', async () => {
    servico.geocodificarPendentes.mockResolvedValue({ ok: true, tentados: 1, achados: 1, aproximados: 0, na_fila: 0, falhas: [] });
    servico.lerPino.mockResolvedValue([-23.1, -46.9]);
    render(<MiniMapaDoEndereco tipo="imovel" id="i1" tenantId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: /Localizar pelo endereço/ }));
    expect(await screen.findByText('-23.100000, -46.900000')).toBeInTheDocument();
  });
});

/**
 * Pedido de 02/10: o corretor marca o pino ele mesmo, já no cadastro novo —
 * procura a rua, o mapa vai até ela, e ele clica no ponto exato.
 */
describe('MiniMapaDoEndereco — o corretor marca o pino', () => {
  it('cadastro novo: o clique no mapa vai para o formulário, não para o banco', () => {
    servico.salvarPino.mockClear();
    const aoMarcar = vi.fn();
    render(<MiniMapaDoEndereco tipo="imovel" tenantId="t1" aoMarcar={aoMarcar} />);
    act(() => leaflet.ouvintes.click({ latlng: { lat: -23.17461, lng: -46.88737 } }));
    expect(aoMarcar).toHaveBeenCalledWith(-23.17461, -46.88737);
    expect(servico.salvarPino).not.toHaveBeenCalled();
    expect(screen.getByText(/Pino marcado à mão/)).toBeInTheDocument();
  });

  it('imóvel salvo: o clique grava na hora como pino posto à mão', async () => {
    servico.salvarPino.mockClear();
    render(<MiniMapaDoEndereco tipo="imovel" id="i1" tenantId="t1" />);
    act(() => leaflet.ouvintes.click({ latlng: { lat: -23.1, lng: -46.9 } }));
    await waitFor(() => expect(servico.salvarPino).toHaveBeenCalledWith('imovel', 'i1', -23.1, -46.9));
  });

  it('procura a rua na cidade do cadastro e, com dois trechos, a pessoa escolhe', async () => {
    servico.buscarEnderecos.mockResolvedValue([
      { lat: -23.1746, lng: -46.8873, nome: 'Rua Tiradentes, Vila Liberdade, Jundiaí', aproximado: true },
      { lat: -23.1716, lng: -46.8917, nome: 'Rua Tiradentes, Vila Margarida, Jundiaí', aproximado: true },
    ]);
    const aoMarcar = vi.fn();
    render(<MiniMapaDoEndereco tipo="imovel" tenantId="t1" cidade="Jundiaí" aoMarcar={aoMarcar} />);
    fireEvent.change(screen.getByLabelText('Procurar a rua no mapa'), { target: { value: 'Rua Tiradentes' } });
    fireEvent.click(screen.getByRole('button', { name: /Procurar/ }));
    await waitFor(() => expect(servico.buscarEnderecos).toHaveBeenCalledWith('t1', 'Rua Tiradentes, Jundiaí'));
    fireEvent.click(await screen.findByRole('button', { name: /Vila Margarida/ }));
    expect(leaflet.mapa.setView).toHaveBeenLastCalledWith([-23.1716, -46.8917], 18);
    // Achar a rua não é marcar a porta: o pino só sai do clique.
    expect(aoMarcar).not.toHaveBeenCalled();
  });

  it('sem id e sem onde guardar, não finge que salva', () => {
    render(<MiniMapaDoEndereco tipo="condominio" tenantId="t1" />);
    expect(screen.getByText(/definido depois de salvar/)).toBeInTheDocument();
  });
});
