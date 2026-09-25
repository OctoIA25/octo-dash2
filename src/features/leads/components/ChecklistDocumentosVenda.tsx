import { ExternalLink } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CHECKLIST_DOCUMENTOS_VENDA,
  SITES_CERTIDOES,
  chaveDocumento,
  type ItemChecklistDocumento,
} from '../utils/checklistDocumentosVenda';

const blocoClass = 'rounded-lg border border-slate-200 p-3 dark:border-slate-800';
const tituloClass = 'text-[13px] font-semibold text-slate-900 dark:text-slate-100';

interface ChecklistDocumentosVendaProps {
  // transaction_form do negócio: item marcado = chave com a data da marcação.
  valores: Record<string, string>;
  onAlternar: (chave: string, marcar: boolean, descricao: string) => void;
}

export function ChecklistDocumentosVenda({ valores, onAlternar }: ChecklistDocumentosVendaProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {CHECKLIST_DOCUMENTOS_VENDA.map((bloco) => {
          const itens = bloco.grupos.flatMap((grupo) => grupo.itens);
          const marcados = itens.filter((item) => valores[chaveDocumento(bloco.id, item.tipo)]).length;

          return (
            <section key={bloco.id} className={blocoClass}>
              <div className="flex items-baseline justify-between gap-2">
                <h4 className={tituloClass}>{bloco.titulo}</h4>
                <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  {marcados} de {itens.length}
                </span>
              </div>
              {bloco.descricao && (
                <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{bloco.descricao}</p>
              )}
              {bloco.grupos.map((grupo, i) => (
                <div key={grupo.subtitulo ?? i} className="mt-3">
                  {grupo.subtitulo && (
                    <h5 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {grupo.subtitulo}
                    </h5>
                  )}
                  <ul className="space-y-1.5">
                    {grupo.itens.map((item) => {
                      const chave = chaveDocumento(bloco.id, item.tipo);
                      return (
                        <ItemChecklist
                          key={chave}
                          chave={chave}
                          item={item}
                          descricao={`${item.label} (${bloco.parte})`}
                          marcado={Boolean(valores[chave])}
                          onAlternar={onAlternar}
                        />
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <section className={blocoClass}>
        <h4 className={tituloClass}>Sites de certidões (Jundiaí / SP)</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SITES_CERTIDOES.map((site) => (
            <div key={site.certidao} className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200">{site.certidao}</p>
              <ul className="mt-1.5 space-y-1">
                {site.fontes.map((fonte) => (
                  <li key={fonte.orgao} className="text-[12px]">
                    {fonte.url ? (
                      <a
                        href={fonte.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {fonte.orgao}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-slate-600 dark:text-slate-400">{fonte.orgao}</span>
                    )}
                  </li>
                ))}
              </ul>
              {site.observacao && (
                <p className="mt-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">Observação: {site.observacao}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Uma linha por documento. É aqui que o anexo e o parecer da IA / do jurídico vão entrar (P4.7).
function ItemChecklist({
  chave,
  item,
  descricao,
  marcado,
  onAlternar,
}: {
  chave: string;
  item: ItemChecklistDocumento;
  descricao: string;
  marcado: boolean;
  onAlternar: ChecklistDocumentosVendaProps['onAlternar'];
}) {
  return (
    <li className="flex items-start gap-2 text-[13px] text-slate-700 dark:text-slate-300">
      <Checkbox
        id={chave}
        checked={marcado}
        aria-label={descricao}
        onCheckedChange={(valor) => onAlternar(chave, valor === true, descricao)}
        className="mt-0.5"
      />
      <label htmlFor={chave} className="cursor-pointer">
        {item.label}
      </label>
    </li>
  );
}
