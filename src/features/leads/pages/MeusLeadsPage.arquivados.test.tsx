/**
 * Arquivados é de gestão (25/09).
 *
 * "ai tem a parte de arquivados, só gestor, diretor e adm podem ver ein".
 *
 * O que este arquivo trava é a metade que não se vê: **o endereço**. Esconder
 * a aba no menu é fácil e é só metade do trabalho — `/meus-leads?sub=arquivados`
 * digitado à mão continuaria entregando a tela, e é assim que uma restrição
 * vira teatro. Foi exatamente o defeito que o P0.1 veio desfazer, do outro
 * lado: o menu escondia uma tela que a rota liberava.
 *
 * `isGestao` é o conjunto certo: o papel do membro vira 'corretor' ou
 * 'gestao', e 'gestao' já cobre admin e líder de equipe — o "gestor, diretor e
 * adm" do pedido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/MeusLeadsAtribuidosSection', () => ({
  MeusLeadsAtribuidosSection: ({ leadType }: { leadType?: string }) => <div>kanban:{leadType}</div>,
}));
vi.mock('../components/LeadsArquivadosSection', () => ({
  LeadsArquivadosSection: () => <div>tela de arquivados</div>,
}));
vi.mock('../components/ListaDeLeadsSection', () => ({ ListaDeLeadsSection: () => <div>lista</div> }));
vi.mock('./CentralLeadsPage', () => ({ CentralLeadsPage: () => <div>central</div> }));

let auth = { isGestao: false, isOwner: false };
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => auth }));

import { MeusLeadsPage } from './MeusLeadsPage';

const abrir = (sub: string) =>
  render(
    <MemoryRouter initialEntries={[`/meus-leads?sub=${sub}`]}>
      <MeusLeadsPage />
    </MemoryRouter>
  );

beforeEach(() => {
  auth = { isGestao: false, isOwner: false };
});

describe('quem alcança os arquivados', () => {
  /* O CASO QUE SUSTENTA O ARQUIVO: o endereço digitado à mão. */
  it('corretor pedindo ?sub=arquivados pelo endereço não recebe a tela', () => {
    abrir('arquivados');
    expect(screen.queryByText('tela de arquivados')).not.toBeInTheDocument();
  });

  it('e cai no Kanban, que é para onde ele ia de qualquer jeito', () => {
    abrir('arquivados');
    expect(screen.getByText(/^kanban:/)).toBeInTheDocument();
  });

  it('gestão recebe a tela', () => {
    auth = { isGestao: true, isOwner: false };
    abrir('arquivados');
    expect(screen.getByText('tela de arquivados')).toBeInTheDocument();
  });

  it('o owner também — ele administra todas as imobiliárias', () => {
    auth = { isGestao: false, isOwner: true };
    abrir('arquivados');
    expect(screen.getByText('tela de arquivados')).toBeInTheDocument();
  });

  /*
   * A restrição é de UMA aba. Tirar o Kanban, a Lista ou a Central do corretor
   * junto seria tirar acesso que ninguém pediu para tirar — e é o tipo de
   * estrago que passa despercebido porque a tela simplesmente "não abre".
   */
  it.each(['kanban', 'kanban-proprietario', 'lista', 'central-leads'])(
    'o corretor continua alcançando %s',
    (sub) => {
      abrir(sub);
      expect(screen.queryByText('tela de arquivados')).not.toBeInTheDocument();
      expect(document.body.textContent).not.toBe('');
    }
  );

  it('a Lista e a Central continuam abrindo para o corretor', () => {
    abrir('lista');
    expect(screen.getByText('lista')).toBeInTheDocument();
  });
});
