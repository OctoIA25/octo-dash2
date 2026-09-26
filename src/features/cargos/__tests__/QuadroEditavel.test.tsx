/**
 * O quadro de Cargos passou a GRAVAR no clique — 26/09.
 *
 *   "Também torne possível trocar as permissões por aquela mesma tabela."
 *
 * Isso muda a natureza do risco. Antes o quadro só mostrava, e o pior defeito
 * possível era mostrar errado. Agora cada clique escreve, e o próximo vem logo
 * atrás: são 35 permissões por 6 cargos, e quem está preenchendo clica em
 * sequência.
 *
 * O que estes casos protegem é o que acontece ENTRE o clique e a resposta:
 *
 *  1. A marca aparece na hora. Sem isso, quem clica acha que não pegou e
 *     clica de novo — e o segundo clique desfaz o primeiro.
 *  2. Quando o banco recusa, a marca VOLTA ATRÁS. Uma tela que continua
 *     mostrando o visto depois de uma recusa afirma uma permissão que ninguém
 *     tem — e é exatamente a tela onde essa mentira custa mais caro.
 *  3. Cada célula voa sozinha. Guardar uma cópia do quadro inteiro faria a
 *     resposta de uma célula desfazer o que outra pintou meio segundo antes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const marcar = vi.fn();
const catalogo = vi.fn();
const cargosDoTenant = vi.fn();

vi.mock('../cargosService', () => ({
  carregarCatalogo: () => catalogo(),
  carregarCargos: () => cargosDoTenant(),
  marcarPermissao: (...a: unknown[]) => marcar(...a),
  salvarCargo: vi.fn(),
  excluirCargo: vi.fn(),
  carregarMembros: vi.fn(async () => []),
  definirCargoDoMembro: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ tenantId: 't1', isGestao: true, isOwner: false, user: { id: 'u1' } }),
}));

import { CargosPage } from '../CargosPage';

const PERMISSOES = [
  { codigo: 'leads', modulo: 'Comercial', descricao: 'Início e Leads', ordem: 1, em_uso: true },
  { codigo: 'imoveis', modulo: 'Comercial', descricao: 'Imóveis', ordem: 2, em_uso: true },
];

const quadro = (permsDoCorretor: string[]) => ({
  membros: 3,
  sem_cargo: 3,
  cargos: [
    { id: 'c-dir', nome: 'Diretoria', descricao: '', nivel_acesso: 100, role: 'admin',
      ativo: true, pessoas: 0, permissoes: ['leads', 'imoveis'] },
    { id: 'c-cor', nome: 'Corretor', descricao: '', nivel_acesso: 10, role: 'corretor',
      ativo: true, pessoas: 0, permissoes: permsDoCorretor },
  ],
});

const abrir = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><CargosPage /></QueryClientProvider>
  );
};

/** A célula de uma permissão num cargo, pelo rótulo acessível. */
const celula = (permissao: string, cargo: string) =>
  screen.getByRole('switch', { name: `${permissao} — ${cargo}` });

beforeEach(() => {
  marcar.mockReset();
  marcar.mockResolvedValue({ marcada: true, permissoes: 1 });
  catalogo.mockResolvedValue(PERMISSOES);
  cargosDoTenant.mockResolvedValue(quadro(['leads']));
});

describe('a célula do quadro dá e tira permissão', () => {
  it('a célula vazia pede para DAR a permissão', async () => {
    abrir();
    await waitFor(() => expect(celula('Imóveis', 'Corretor')).toBeInTheDocument());

    expect(celula('Imóveis', 'Corretor')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(celula('Imóveis', 'Corretor'));

    await waitFor(() => expect(marcar).toHaveBeenCalledWith('c-cor', 'imoveis', true));
  });

  it('a célula marcada pede para TIRAR', async () => {
    abrir();
    await waitFor(() => expect(celula('Início e Leads', 'Corretor')).toBeInTheDocument());

    expect(celula('Início e Leads', 'Corretor')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(celula('Início e Leads', 'Corretor'));

    await waitFor(() => expect(marcar).toHaveBeenCalledWith('c-cor', 'leads', false));
  });

  /*
   * Sem isto, quem clica não vê nada acontecer até a resposta chegar — e
   * clica de novo. O segundo clique manda o valor contrário e desfaz o
   * primeiro, o que parece defeito e é a tela funcionando como foi feita.
   */
  it('a marca aparece antes de o banco responder', async () => {
    let liberar: (v: unknown) => void = () => {};
    marcar.mockReturnValue(new Promise((r) => { liberar = r; }));
    abrir();
    await waitFor(() => expect(celula('Imóveis', 'Corretor')).toBeInTheDocument());

    fireEvent.click(celula('Imóveis', 'Corretor'));

    await waitFor(() => expect(celula('Imóveis', 'Corretor')).toHaveAttribute('aria-checked', 'true'));
    expect(celula('Imóveis', 'Corretor')).toBeDisabled();
    liberar({ marcada: true, permissoes: 2 });
  });

  /*
   * O CASO QUE SUSTENTA O ARQUIVO. O banco recusa em pelo menos dois casos
   * reais: tirar "Gestão de Equipe" do próprio cargo, e quem não administra.
   * Se a marca ficasse, a tela mostraria uma permissão que ninguém tem — numa
   * tela cuja única função é dizer quem pode o quê.
   */
  it('quando o banco recusa, a marca volta atrás', async () => {
    marcar.mockRejectedValue(new Error('Este é o seu próprio cargo…'));
    abrir();
    await waitFor(() => expect(celula('Imóveis', 'Corretor')).toBeInTheDocument());

    fireEvent.click(celula('Imóveis', 'Corretor'));

    await waitFor(() => expect(marcar).toHaveBeenCalled());
    await waitFor(() => expect(celula('Imóveis', 'Corretor')).toHaveAttribute('aria-checked', 'false'));
    expect(celula('Imóveis', 'Corretor')).not.toBeDisabled();
  });

  /*
   * Duas células em voo ao mesmo tempo. Se a tela guardasse uma cópia do
   * quadro em vez de marcar célula a célula, a segunda marcação nasceria de um
   * estado que já não vale e apagaria a primeira.
   */
  it('duas células em voo não se desfazem', async () => {
    const presos: Array<(v: unknown) => void> = [];
    marcar.mockImplementation(() => new Promise((r) => { presos.push(r); }));
    abrir();
    await waitFor(() => expect(celula('Imóveis', 'Corretor')).toBeInTheDocument());

    fireEvent.click(celula('Imóveis', 'Corretor'));
    fireEvent.click(celula('Início e Leads', 'Diretoria'));

    await waitFor(() => expect(marcar).toHaveBeenCalledTimes(2));
    expect(celula('Imóveis', 'Corretor')).toHaveAttribute('aria-checked', 'true');
    expect(celula('Início e Leads', 'Diretoria')).toHaveAttribute('aria-checked', 'false');
    presos.forEach((r) => r({ marcada: true, permissoes: 1 }));
  });

  it('clicar no nome do cargo continua abrindo o editor, e não marca nada', async () => {
    abrir();
    await waitFor(() => expect(screen.getByTitle('Abrir Corretor')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Abrir Corretor'));
    expect(marcar).not.toHaveBeenCalled();
  });
});
