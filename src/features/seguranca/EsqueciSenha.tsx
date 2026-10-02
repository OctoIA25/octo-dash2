/**
 * Kit de segurança · "Esqueci minha senha" na tela de login. A resposta é a
 * mesma exista ou não a conta: o formulário não serve para descobrir quem
 * tem cadastro.
 */
import { useState } from 'react';
import { pedirRecuperacao } from './segurancaService';

export function EsqueciSenha({ emailInicial = '' }: { emailInicial?: string }) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState(emailInicial);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (!aberto) {
    return (
      <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => { setEmail(emailInicial); setAberto(true); }}>
        Esqueci minha senha
      </button>
    );
  }
  if (enviado) {
    return (
      <p role="status" className="text-sm text-gray-700">
        Se houver uma conta com esse e-mail, enviamos um link para criar uma senha nova (confira também o spam). Não chegou
        em alguns minutos? Peça ao admin da sua imobiliária para definir uma senha nova em Gestão de Equipe.
      </p>
    );
  }
  return (
    <form
      aria-label="Recuperar a senha"
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setEnviando(true);
        await pedirRecuperacao(email);
        setEnviando(false);
        setEnviado(true);
      }}
    >
      <label className="block text-sm text-gray-700">E-mail da sua conta
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={enviando || !email.includes('@')} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          Enviar o link
        </button>
        <button type="button" className="text-sm text-gray-500 hover:underline" onClick={() => setAberto(false)}>Voltar</button>
      </div>
    </form>
  );
}
