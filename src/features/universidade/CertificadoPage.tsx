/**
 * A.7 · /certificado/<hash> — a conferência pública. Sem login: quem recebeu
 * o link confere se o certificado existe e se o que ele afirma bate com o
 * hash. O banco recalcula o SHA-256 (verificar_certificado).
 */
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { verificarCertificado } from './universidadeService';

export function CertificadoPage() {
  const { hash = '' } = useParams<{ hash: string }>();
  const formatoOk = /^[0-9a-f]{64}$/i.test(hash);
  const cert = useQuery({ queryKey: ['certificado', hash], queryFn: () => verificarCertificado(hash), enabled: formatoOk });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section aria-label="Conferência do certificado" className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Conferência de certificado</p>
        {!formatoOk && <p className="text-[15px] font-semibold text-rose-700">Esse código não é de um certificado.</p>}
        {formatoOk && cert.isLoading && <p className="text-[14px] text-slate-500">Conferindo…</p>}
        {cert.isError && <p role="alert" className="text-[14px] text-rose-700">Não deu para conferir agora. Tente de novo.</p>}
        {cert.data && !cert.data.valido && !cert.data.nome && <p className="text-[15px] font-semibold text-rose-700">Nenhum certificado com esse código.</p>}
        {cert.data && !cert.data.valido && cert.data.nome && (
          <p className="text-[15px] font-semibold text-rose-700">O certificado existe, mas os dados não batem com o código: ele foi alterado.</p>
        )}
        {cert.data?.valido && (
          <>
            <p className="text-[15px] font-semibold text-emerald-700">Certificado válido ✓</p>
            <p className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">{cert.data.nome}</p>
            <p className="text-[14px] text-slate-700 dark:text-slate-300">
              concluiu <b>{cert.data.curso}</b>{cert.data.nota != null ? ` com nota ${cert.data.nota}` : ''}
              {' '}em {new Date(cert.data.emitido_em!).toLocaleDateString('pt-BR')}, pela {cert.data.imobiliaria}.
            </p>
          </>
        )}
        <p className="break-all font-mono text-[11px] text-slate-500">SHA-256: {hash}</p>
      </section>
    </main>
  );
}
