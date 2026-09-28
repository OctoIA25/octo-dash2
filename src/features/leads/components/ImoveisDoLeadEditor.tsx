/**
 * Imóveis do lead — o corretor acrescenta um ou mais, e o lead nunca fica sem.
 *
 * O primeiro imóvel é o campo "Código do Imóvel" logo acima (`property_code`).
 * Aqui entram os demais. Sem nenhum, o que se adiciona vira o primeiro.
 *
 * Grava na hora, como Cadência e Atividades: é uma lista, não um campo do
 * formulário. Por isso, quando o primeiro é gravado aqui, o pai precisa
 * sincronizar o campo — senão o Salvar reescreveria `property_code` com vazio.
 */
import { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adicionarImovelAoLead,
  fetchImoveisExtrasDoLead,
  removerImovelExtraDoLead,
  type ImovelExtraDoLead,
} from '../services/leadsService';

interface Props {
  tenantId: string;
  leadId: string;
  /** O que está no campo "Código do Imóvel" agora. */
  principal: string;
  canEdit: boolean;
  /** O primeiro imóvel foi gravado aqui: o pai põe o código no campo. */
  onPrincipalGravado: (codigo: string) => void;
}

export function ImoveisDoLeadEditor({ tenantId, leadId, principal, canEdit, onPrincipalGravado }: Props) {
  const { toast } = useToast();
  const [codigo, setCodigo] = useState('');
  const [lista, setLista] = useState<ImovelExtraDoLead[]>([]);
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const carregar = () =>
    fetchImoveisExtrasDoLead(leadId)
      .then((l) => { setLista(l); setErroAoCarregar(false); })
      .catch((e) => { console.error('Erro ao carregar imóveis do lead:', e); setErroAoCarregar(true); });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(); }, [leadId]);

  const adicionar = async () => {
    const gravado = codigo.trim().toUpperCase();
    setOcupado(true);
    try {
      const onde = await adicionarImovelAoLead({ tenantId, leadId, principal, codigo: gravado });
      setCodigo('');
      if (onde === 'principal') onPrincipalGravado(gravado);
      else await carregar();
      toast({ title: `Imóvel ${gravado} adicionado` });
    } catch (e) {
      toast({ title: 'Não foi possível adicionar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const remover = async (id: string) => {
    setOcupado(true);
    try {
      await removerImovelExtraDoLead(id);
      setLista((l) => l.filter((im) => im.id !== id));
    } catch (e) {
      toast({ title: 'Não foi possível remover', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const semNenhum = !principal.trim() && lista.length === 0;

  return (
    <div className="-mt-1">
      {erroAoCarregar && (
        <p className="mb-1.5 text-[11px] text-red-600">Não foi possível carregar os outros imóveis deste lead.</p>
      )}

      {lista.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {lista.map((im) => (
            <span
              key={im.id}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {im.codigo}
              {/* Os extras podem sair à vontade: o principal fica, e o lead
                  continua com pelo menos um. */}
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remover ${im.codigo}`}
                  onClick={() => remover(im.id)}
                  disabled={ocupado}
                  className="text-slate-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (codigo.trim()) adicionar();
          }}
        >
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder={semNenhum ? 'Código do primeiro imóvel' : 'Código de mais um imóvel'}
            aria-label={semNenhum ? 'Adicionar o primeiro imóvel' : 'Adicionar mais um imóvel'}
            maxLength={60}
            className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={!codigo.trim() || ocupado}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
          >
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {semNenhum ? 'Adicionar o primeiro imóvel' : 'Adicionar mais um imóvel'}
          </button>
        </form>
      )}
    </div>
  );
}
