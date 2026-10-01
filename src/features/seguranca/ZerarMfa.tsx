/**
 * Kit de segurança · perdeu o celular? Quem administra a pessoa zera o
 * autenticador dela, e no próximo acesso ela cadastra de novo.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { adminRemoverMfa } from './segurancaService';

export function ZerarMfa({ userId }: { userId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const zerar = async () => {
    setEnviando(true);
    const r = await adminRemoverMfa(userId);
    setEnviando(false);
    setConfirmando(false);
    if (r.success) toast.success('Autenticador zerado. No próximo acesso, a pessoa cadastra de novo.');
    else toast.error(r.error ?? 'Não deu para zerar o autenticador.');
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
      {confirmando ? (
        <>
          <span className="text-slate-600 dark:text-slate-300">Zerar o autenticador (MFA) desta pessoa?</span>
          <button type="button" disabled={enviando} onClick={zerar} className="rounded-md bg-rose-600 px-2 py-1 font-medium text-white disabled:opacity-50">Zerar</button>
          <button type="button" onClick={() => setConfirmando(false)} className="text-slate-500 hover:underline">Cancelar</button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirmando(true)} className="text-slate-500 hover:underline">
          Perdeu o celular? Zerar o autenticador (MFA)
        </button>
      )}
    </div>
  );
}
