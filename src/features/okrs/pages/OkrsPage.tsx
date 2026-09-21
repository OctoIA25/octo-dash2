/**
 * /okrs e /pdi — uma rota por assunto (P3.4).
 *
 * Antes disto a mesma funcionalidade tinha três endereços: `/leads?tab=okrs`
 * (a tela de verdade), `/gestao-equipe?tab=okrs` (um cartaz "Em breve") e uma
 * terceira cópia em código morto. Quem abrisse pelo caminho errado concluía
 * que o recurso não existia.
 *
 * `?pessoa=` é o que o plano pede para vir da Gestão de Equipe. Quem não for
 * gestor não recebe as linhas de outra pessoa — quem decide isso é a política
 * do banco, e não este arquivo.
 */

import { useSearchParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { OKRManager } from '@/components/OKRManager';
import { PDIManager } from '@/components/PDIManager';

function Moldura({ pessoa, children }: { pessoa?: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5">
      <div className="mx-auto max-w-[1400px] space-y-3">
        {pessoa && (
          // Sem isto o gestor edita o plano de outra pessoa achando que é o
          // dele — as duas telas são idênticas.
          <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <Eye className="h-4 w-4 shrink-0" />
            Você está vendo o que é de <strong>{pessoa}</strong>, e não o seu.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

export function OkrsPage() {
  const [params] = useSearchParams();
  const pessoa = params.get('pessoa') ?? undefined;
  return (
    <Moldura pessoa={pessoa}>
      <OKRManager emailAlvo={pessoa} />
    </Moldura>
  );
}

export function PdiPage() {
  const [params] = useSearchParams();
  const pessoa = params.get('pessoa') ?? undefined;
  return (
    <Moldura pessoa={pessoa}>
      <PDIManager emailAlvo={pessoa} />
    </Moldura>
  );
}
