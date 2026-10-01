/**
 * Kit de segurança · /redefinir-senha — onde o link do e-mail de recuperação
 * cai. O Supabase abre uma sessão de recuperação pelo link; o banco só aceita
 * a senha nova se a sessão for mesmo de recuperação (e recente).
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { RegrasDaSenha } from './TrocarSenhaForm';
import { redefinirPorRecuperacao, sair } from './segurancaService';

export function RedefinirSenhaPage() {
  const [pronto, setPronto] = useState<boolean | null>(null);
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // O link traz a sessão na URL; o cliente do Supabase a lê sozinho.
    supabase.auth.getSession().then(({ data }) => setPronto(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'PASSWORD_RECOVERY' || sessao) setPronto(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nova !== confirma) { setErro('As duas senhas não são iguais.'); return; }
    setSalvando(true);
    const r = await redefinirPorRecuperacao(nova);
    setSalvando(false);
    if (!r.success) { setErro(r.error ?? 'Não deu para redefinir.'); return; }
    await sair();
    setFeito(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section aria-label="Redefinir a senha" className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">Redefinir a senha</h1>
        {feito ? (
          <>
            <p role="status" className="text-[14px] text-emerald-700">Senha redefinida. Entre com a nova senha.</p>
            <a href="/" className="text-[13px] font-medium text-blue-600 hover:underline">Ir para o login</a>
          </>
        ) : pronto === false ? (
          <p className="text-[13px] text-slate-600 dark:text-slate-300">
            Este endereço só funciona pelo link que chega no seu e-mail, e o link vale por pouco tempo. Peça outro em "Esqueci minha senha".
          </p>
        ) : (
          <form onSubmit={enviar} className="space-y-3">
            <label className="block text-[13px]">Nova senha
              <Input type="password" autoComplete="new-password" className="mt-1" value={nova} onChange={(e) => setNova(e.target.value)} required />
            </label>
            <label className="block text-[13px]">Repita a nova senha
              <Input type="password" autoComplete="new-password" className="mt-1" value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
            </label>
            <RegrasDaSenha />
            {erro && <p role="alert" className="text-[13px] text-rose-600">{erro}</p>}
            <Button type="submit" disabled={salvando || !nova || !confirma || pronto === null}>Salvar a nova senha</Button>
          </form>
        )}
      </section>
    </main>
  );
}
