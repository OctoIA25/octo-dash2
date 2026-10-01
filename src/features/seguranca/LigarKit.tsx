/**
 * Kit de segurança · a virada, para o dono da plataforma ligar na reunião.
 * Antes disso, ninguém é obrigado a trocar a senha nem a cadastrar o MFA.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ativarKit, minhaSeguranca } from './segurancaService';

export function LigarKit() {
  const qc = useQueryClient();
  const seg = useQuery({ queryKey: ['minha-seguranca'], queryFn: minhaSeguranca });
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!seg.data) return null;
  if (seg.data.kit_ativo) {
    return <p className="text-[12.5px] text-emerald-700 dark:text-emerald-400">Kit de segurança ligado: senhas novas na regra forte, e MFA para dono, admin e líder.</p>;
  }
  const ligar = async () => {
    const r = await ativarKit();
    if (!r.success) { setErro(r.error ?? 'Não deu para ligar.'); return; }
    setConfirmando(false);
    qc.invalidateQueries({ queryKey: ['minha-seguranca'] });
  };
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] dark:border-amber-900 dark:bg-amber-950/30">
      <p className="font-medium">Kit de segurança — a virada</p>
      <p className="text-slate-600 dark:text-slate-300">
        Ao ligar, todo mundo troca a senha no próximo acesso, e dono, admins e líderes cadastram o autenticador no celular.
        Faça na reunião, com todos juntos.
      </p>
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="destructive" onClick={ligar}>Ligar agora</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirmando(true)}>Ligar o kit de segurança</Button>
      )}
      {erro && <p role="alert" className="text-rose-600">{erro}</p>}
    </div>
  );
}
