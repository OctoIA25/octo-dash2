/**
 * Seletor de lead para colocar no forecast: busca por nome, clica, entra.
 *
 * Quem decide o que "colocar" significa é o serviço (desocultar a proposta ou
 * criar a espelho); aqui é só a busca. Leads que já estão na planilha aparecem
 * desabilitados em vez de sumirem — "já está no forecast" responde a pergunta
 * que o corretor veio fazer.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  searchLeadsParaForecast,
  type LeadParaForecast,
} from '../services/forecastService';

interface AdicionarLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Leads que já estão na planilha — mostrados desabilitados. */
  leadIdsNoForecast: Set<string>;
  onAdd: (lead: LeadParaForecast) => void;
  adicionando: boolean;
}

export function AdicionarLeadDialog({
  open,
  onOpenChange,
  leadIdsNoForecast,
  onAdd,
  adicionando,
}: AdicionarLeadDialogProps) {
  const { tenantId, user, isCorretor } = useAuthContext();
  const [termo, setTermo] = useState('');

  const buscar = termo.trim().length >= 2;
  const { data: leads, isFetching } = useQuery({
    queryKey: ['forecast-lead-search', tenantId, termo.trim(), isCorretor],
    queryFn: () =>
      searchLeadsParaForecast(
        tenantId as string,
        termo,
        isCorretor && user ? user.id : null,
      ),
    enabled: open && buscar && Boolean(tenantId),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Colocar lead no forecast</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar lead pelo nome…"
            aria-label="Buscar lead pelo nome"
            className="w-full rounded-md border border-slate-200 bg-transparent py-2 pl-8 pr-3 text-sm
                       outline-none placeholder:text-slate-400 focus:border-slate-400
                       dark:border-slate-700 dark:focus:border-slate-500"
          />
        </div>

        <div className="max-h-72 overflow-y-auto">
          {!buscar ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Digite pelo menos 2 letras para buscar.
            </p>
          ) : isFetching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando…
            </div>
          ) : !leads?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum lead ativo com esse nome.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {leads.map((lead) => {
                const jaEsta = leadIdsNoForecast.has(lead.id);
                return (
                  <li key={lead.id}>
                    <button
                      type="button"
                      disabled={jaEsta || adicionando}
                      onClick={() => onAdd(lead)}
                      className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left
                                 text-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed
                                 disabled:opacity-50 dark:hover:bg-slate-900"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
                          {lead.name || 'Lead sem nome'}
                        </span>
                        <span className="block truncate text-[12px] text-slate-500">
                          {[lead.phone, lead.assigned_agent_name].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-slate-400">
                        {jaEsta ? 'Já no forecast' : 'Colocar'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
