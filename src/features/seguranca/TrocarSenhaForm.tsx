/**
 * Kit de segurança · trocar a senha (pede a atual). A regra mora no banco:
 * a tela só confere se as duas novas batem e mostra o que o banco disser.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trocarMinhaSenha } from './segurancaService';

export function RegrasDaSenha() {
  return (
    <p className="text-[12px] text-slate-500 dark:text-slate-400">
      Pelo menos 8 caracteres, misturando três tipos (minúscula, maiúscula, número, símbolo). Nada óbvio — "senha", o nome da
      imobiliária, 1234 — e nada do seu e-mail.
    </p>
  );
}

export function TrocarSenhaForm({ onTrocou }: { onTrocou: () => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nova !== confirma) { setErro('As duas senhas novas não são iguais.'); return; }
    setSalvando(true);
    const r = await trocarMinhaSenha(atual, nova);
    setSalvando(false);
    if (!r.success) { setErro(r.error ?? 'Não deu para trocar a senha.'); return; }
    setErro(null);
    setAtual(''); setNova(''); setConfirma('');
    onTrocou();
  };

  return (
    <form onSubmit={enviar} className="space-y-3" aria-label="Trocar a senha">
      <label className="block text-[13px]">Senha atual
        <Input type="password" autoComplete="current-password" className="mt-1" value={atual} onChange={(e) => setAtual(e.target.value)} required />
      </label>
      <label className="block text-[13px]">Nova senha
        <Input type="password" autoComplete="new-password" className="mt-1" value={nova} onChange={(e) => setNova(e.target.value)} required />
      </label>
      <label className="block text-[13px]">Repita a nova senha
        <Input type="password" autoComplete="new-password" className="mt-1" value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
      </label>
      <RegrasDaSenha />
      {erro && <p role="alert" className="text-[13px] text-rose-600">{erro}</p>}
      <Button type="submit" disabled={salvando || !atual || !nova || !confirma}>{salvando ? 'Salvando…' : 'Trocar a senha'}</Button>
    </form>
  );
}
