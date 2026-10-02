import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// Leaflet não desenha no jsdom; o que importa aqui é o que vai para o banco.
vi.mock('leaflet', () => {
  const marker = { addTo: () => marker, on: vi.fn(), setLatLng: vi.fn() };
  const mapa = { setView: () => mapa, invalidateSize: vi.fn(), remove: vi.fn(), getZoom: () => 12 };
  return {
    default: {
      map: () => mapa,
      tileLayer: () => ({ addTo: vi.fn() }),
      marker: () => marker,
    },
  };
});
const servico = vi.hoisted(() => ({
  salvarPino: vi.fn().mockResolvedValue(undefined),
  geocodificarPendentes: vi.fn(),
  lerPino: vi.fn(),
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
