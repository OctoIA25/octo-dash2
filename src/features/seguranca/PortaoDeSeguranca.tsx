/**
 * Kit de segurança · o portão depois do login, na ordem:
 *   1. quem tem autenticador e ainda não deu o código nesta sessão → código;
 *   2. quem não trocou a senha depois da virada → troca (com a atual);
 *   3. dono, admin e líder sem autenticador → cadastra (QR + primeiro código).
 *
 * Falhou a consulta? Passa — derrubar a casa inteira por um erro de rede é
 * pior. O código do passo 1 não depende da consulta: vem da própria sessão.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { TrocarSenhaForm } from './TrocarSenhaForm';
import { confirmarCodigo, fatorTotp, iniciarCadastroMfa, minhaSeguranca, precisaDoCodigo, sair } from './segurancaService';

function Moldura({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section aria-label={titulo} className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">{titulo}</h1>
        {children}
        <button type="button" className="text-[12.5px] text-slate-500 hover:underline" onClick={() => sair()}>Sair</button>
      </section>
    </main>
  );
}

export function PortaoDeSeguranca({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [mfaPulado, setMfaPulado] = useState(false);
  const codigo = useQuery({ queryKey: ['seguranca-aal'], queryFn: precisaDoCodigo, staleTime: 0 });
  const seg = useQuery({ queryKey: ['minha-seguranca'], queryFn: minhaSeguranca, staleTime: 0 });
  const recarregar = () => qc.invalidateQueries({ queryKey: ['seguranca-aal'] }).then(() => qc.invalidateQueries({ queryKey: ['minha-seguranca'] }));

  if (codigo.isLoading || seg.isLoading) return <OctoDashLoader message="Conferindo o acesso…" size="md" />;

  if (codigo.data) {
    return (
      <Moldura titulo="Código do autenticador">
        <p className="text-[13px] text-slate-600 dark:text-slate-300">Abra o app autenticador no celular e digite o código de 6 dígitos da Octo Dash.</p>
        <DigitarCodigo onConfirmar={async (c) => { const id = await fatorTotp(); if (!id) throw new Error('Nenhum autenticador cadastrado.'); await confirmarCodigo(id, c); }} onConcluido={recarregar} />
      </Moldura>
    );
  }
  const s = seg.data;
  if (s?.precisa_trocar) {
    return (
      <Moldura titulo="Troque a sua senha">
        <p className="text-[13px] text-slate-600 dark:text-slate-300">
          A Octo Dash passou a exigir senhas mais fortes. Troque a sua agora — leva um minuto, e é uma vez só.
        </p>
        <TrocarSenhaForm onTrocou={recarregar} />
      </Moldura>
    );
  }
  if (s?.mfa_exigido && !s.mfa_ativo && !mfaPulado) {
    return (
      <Moldura titulo="Ative a verificação em duas etapas">
        <CadastroMfa onConcluido={recarregar} onIndisponivel={() => setMfaPulado(true)} />
      </Moldura>
    );
  }
  return <>{children}</>;
}

function DigitarCodigo({ onConfirmar, onConcluido }: { onConfirmar: (codigo: string) => Promise<void>; onConcluido: () => void }) {
  const [c, setC] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try { await onConfirmar(c); setErro(null); onConcluido(); }
    catch (x) { setErro((x as Error).message); }
    finally { setEnviando(false); }
  };
  return (
    <form onSubmit={enviar} className="space-y-3">
      <Input aria-label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={c}
        onChange={(e) => setC(e.target.value.replace(/[^\d ]/g, ''))} className="text-center text-[18px] tracking-[0.3em]" />
      {erro && <p role="alert" className="text-[13px] text-rose-600">{erro}</p>}
      <Button type="submit" disabled={enviando || c.replace(/\s/g, '').length !== 6}>Confirmar</Button>
    </form>
  );
}

function CadastroMfa({ onConcluido, onIndisponivel }: { onConcluido: () => void; onIndisponivel: () => void }) {
  const cadastro = useQuery({ queryKey: ['mfa-cadastro'], queryFn: iniciarCadastroMfa, staleTime: Infinity, retry: false });
  if (cadastro.isLoading) return <p className="text-[13px] text-slate-500">Preparando o QR code…</p>;
  if (cadastro.isError) return <p role="alert" className="text-[13px] text-rose-600">{(cadastro.error as Error).message}</p>;
  if (!cadastro.data) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-[13px] text-amber-700">
          A verificação em duas etapas ainda não foi ligada no Supabase da Octo Dash. Avise quem administra a plataforma — por ora, siga sem ela.
        </p>
        <Button onClick={onIndisponivel}>Continuar</Button>
      </div>
    );
  }
  const { factorId, qr, segredo } = cadastro.data;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-slate-600 dark:text-slate-300">
        Quem administra a casa entra com senha <b>e</b> um código do celular. Instale um app autenticador (Google Authenticator,
        Microsoft Authenticator…), leia o QR code e digite o código que aparecer.
      </p>
      <img src={qr} alt="QR code do autenticador" className="mx-auto h-44 w-44 rounded-lg bg-white p-2" />
      <p className="break-all text-center font-mono text-[11.5px] text-slate-500">Sem câmera? Digite a chave: {segredo}</p>
      <DigitarCodigo onConfirmar={(c) => confirmarCodigo(factorId, c)} onConcluido={onConcluido} />
    </div>
  );
}
