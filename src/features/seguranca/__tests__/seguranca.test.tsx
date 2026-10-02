/**
 * Kit de segurança · as telas. A regra da senha, o custo 12 e a sessão de
 * recuperação são do banco (supabase/tests/kit_de_seguranca.test.sql).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const s = vi.hoisted(() => ({
  minhaSeguranca: vi.fn(), trocarMinhaSenha: vi.fn(), redefinirPorRecuperacao: vi.fn(), pedirRecuperacao: vi.fn(),
  precisaDoCodigo: vi.fn(), fatorTotp: vi.fn(), iniciarCadastroMfa: vi.fn(), confirmarCodigo: vi.fn(), sair: vi.fn(),
  adminRemoverMfa: vi.fn(), ativarKit: vi.fn(),
}));
vi.mock('../segurancaService', () => s);
const auth = vi.hoisted(() => ({ sessao: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: {
    getSession: async () => ({ data: { session: auth.sessao } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } },
}));
vi.mock('@/components/ui/OctoDashLoader', () => ({ OctoDashLoader: () => <p>carregando</p> }));

import { PortaoDeSeguranca } from '../PortaoDeSeguranca';
import { TrocarSenhaForm } from '../TrocarSenhaForm';
import { EsqueciSenha } from '../EsqueciSenha';
import { RedefinirSenhaPage } from '../RedefinirSenhaPage';
import { LigarKit } from '../LigarKit';

const comQuery = (ui: React.ReactElement) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>,
);
const tudoCerto = { kit_ativo: true, precisa_trocar: false, mfa_exigido: false, mfa_ativo: false, aal: 'aal1' };

beforeEach(() => {
  Object.values(s).forEach((f) => f.mockReset());
  s.precisaDoCodigo.mockResolvedValue(false);
  s.minhaSeguranca.mockResolvedValue(tudoCerto);
  auth.sessao = null;
});

const preencherTroca = (atual: string, nova: string, confirma: string) => {
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: atual } });
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: confirma } });
  fireEvent.click(screen.getByRole('button', { name: 'Trocar a senha' }));
};

describe('trocar a senha', () => {
  it('as duas novas diferentes: nem vai ao banco', () => {
    render(<TrocarSenhaForm onTrocou={() => {}} />);
    preencherTroca('Antiga#2025', 'Pato-Azul-97', 'Pato-Azul-98');
    expect(screen.getByRole('alert')).toHaveTextContent('não são iguais');
    expect(s.trocarMinhaSenha).not.toHaveBeenCalled();
  });
  it('o motivo da recusa é o do banco', async () => {
    s.trocarMinhaSenha.mockResolvedValue({ success: false, error: 'A senha atual não confere.' });
    render(<TrocarSenhaForm onTrocou={() => {}} />);
    preencherTroca('errada', 'Pato-Azul-97', 'Pato-Azul-97');
    expect(await screen.findByRole('alert')).toHaveTextContent('A senha atual não confere.');
  });
  it('trocou: avisa quem chamou', async () => {
    s.trocarMinhaSenha.mockResolvedValue({ success: true });
    const onTrocou = vi.fn();
    render(<TrocarSenhaForm onTrocou={onTrocou} />);
    preencherTroca('Antiga#2025', 'Pato-Azul-97', 'Pato-Azul-97');
    await waitFor(() => expect(onTrocou).toHaveBeenCalled());
    expect(s.trocarMinhaSenha).toHaveBeenCalledWith('Antiga#2025', 'Pato-Azul-97');
  });
});

describe('o portão depois do login', () => {
  it('tudo em dia: entra', async () => {
    comQuery(<PortaoDeSeguranca><p>a Dash</p></PortaoDeSeguranca>);
    expect(await screen.findByText('a Dash')).toBeInTheDocument();
  });
  it('não deu para consultar: deixa entrar (não derruba a casa)', async () => {
    s.minhaSeguranca.mockResolvedValue(null);
    comQuery(<PortaoDeSeguranca><p>a Dash</p></PortaoDeSeguranca>);
    expect(await screen.findByText('a Dash')).toBeInTheDocument();
  });
  it('quem tem autenticador dá o código antes de tudo — mesmo se a consulta falhar', async () => {
    s.precisaDoCodigo.mockResolvedValue(true);
    s.minhaSeguranca.mockResolvedValue(null);
    s.fatorTotp.mockResolvedValue('fator-1');
    s.confirmarCodigo.mockResolvedValue(undefined);
    comQuery(<PortaoDeSeguranca><p>a Dash</p></PortaoDeSeguranca>);
    fireEvent.change(await screen.findByLabelText('Código de 6 dígitos'), { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(s.confirmarCodigo).toHaveBeenCalledWith('fator-1', '123 456'));
    expect(screen.queryByText('a Dash')).toBeNull();
  });
  it('não trocou a senha depois da virada: troca antes de entrar', async () => {
    s.minhaSeguranca.mockResolvedValue({ ...tudoCerto, precisa_trocar: true });
    comQuery(<PortaoDeSeguranca><p>a Dash</p></PortaoDeSeguranca>);
    expect(await screen.findByRole('region', { name: 'Troque a sua senha' })).toBeInTheDocument();
    expect(screen.queryByText('a Dash')).toBeNull();
  });
  it('admin sem autenticador: cadastra com o QR code', async () => {
    s.minhaSeguranca.mockResolvedValue({ ...tudoCerto, mfa_exigido: true });
    s.iniciarCadastroMfa.mockResolvedValue({ factorId: 'f', qr: 'data:image/svg+xml;utf8,<svg/>', segredo: 'ABCDEF' });
    comQuery(<PortaoDeSeguranca><p>a Dash</p></PortaoDeSeguranca>);
    expect(await screen.findByAltText('QR code do autenticador')).toBeInTheDocument();
    expect(screen.getByText(/ABCDEF/)).toBeInTheDocument();
    expect(screen.queryByText('a Dash')).toBeNull();
  });
  it('MFA desligado no Supabase: avisa e deixa seguir, sem prender o admin', async () => {
    s.minhaSeguranca.mockResolvedValue({ ...tudoCerto, mfa_exigido: true });
    s.iniciarCadastroMfa.mockResolvedValue(null);
    comQuery(<PortaoDeSeguranca><p>a Dash</p></PortaoDeSeguranca>);
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda não foi ligada no Supabase');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('a Dash')).toBeInTheDocument();
  });
  it('corretor (MFA não exigido) entra sem cadastrar', async () => {
    s.minhaSeguranca.mockResolvedValue({ ...tudoCerto, mfa_exigido: false, mfa_ativo: false });
    comQuery(<PortaoDeSeguranca><p>a Dash</p></PortaoDeSeguranca>);
    expect(await screen.findByText('a Dash')).toBeInTheDocument();
    expect(s.iniciarCadastroMfa).not.toHaveBeenCalled();
  });
});

describe('recuperação por e-mail', () => {
  it('"Esqueci minha senha" responde igual, exista ou não a conta', async () => {
    s.pedirRecuperacao.mockResolvedValue(undefined);
    render(<EsqueciSenha emailInicial="carla@lotus.com" />);
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar o link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Se houver uma conta com esse e-mail');
    // Sem SMTP próprio o e-mail não chega a quem não é da equipe do Supabase: a saída é o admin.
    expect(screen.getByRole('status')).toHaveTextContent('Peça ao admin da sua imobiliária');
    expect(s.pedirRecuperacao).toHaveBeenCalledWith('carla@lotus.com');
  });
  it('sem a sessão do link, a página explica em vez de mostrar o formulário', async () => {
    render(<RedefinirSenhaPage />);
    expect(await screen.findByText(/só funciona pelo link que chega no seu e-mail/)).toBeInTheDocument();
  });
  it('com a sessão do link, redefine, sai e manda entrar de novo', async () => {
    auth.sessao = { access_token: 'x' };
    s.redefinirPorRecuperacao.mockResolvedValue({ success: true });
    render(<RedefinirSenhaPage />);
    fireEvent.change(await screen.findByLabelText('Nova senha'), { target: { value: 'Pato-Azul-97' } });
    fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: 'Pato-Azul-97' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar a nova senha' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Senha redefinida');
    expect(s.sair).toHaveBeenCalled();
  });
});

describe('a virada', () => {
  it('desligado: o dono liga depois de confirmar', async () => {
    s.minhaSeguranca.mockResolvedValue({ ...tudoCerto, kit_ativo: false });
    s.ativarKit.mockResolvedValue({ success: true });
    comQuery(<LigarKit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ligar o kit de segurança' }));
    expect(s.ativarKit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ligar agora' }));
    await waitFor(() => expect(s.ativarKit).toHaveBeenCalled());
  });
  it('ligado: só informa', async () => {
    comQuery(<LigarKit />);
    expect(await screen.findByText(/Kit de segurança ligado/)).toBeInTheDocument();
  });
});
