/**
 * Seletor "visualizar como" do header global.
 *
 * Só aparece para quem pode usar (owner/admin com tenant ativo) — e o servidor
 * recusa quem não pode, mesmo que o componente seja forçado a aparecer.
 *
 * Busca no servidor com debounce (o tenant pode ter centenas de membros) e
 * cache do React Query por termo, então reabrir o menu não refaz a chamada.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Eye, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useAuthContext } from '@/contexts/AuthContext';
import { useViewAs, type ViewAsTarget } from '@/contexts/ViewAsContext';
import { fetchViewableUsers } from '@/services/viewAsService';
import { useDebounce } from '@/features/leads/hooks/useDebounce';

const SEARCH_DEBOUNCE_MS = 250;

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

export function ViewAsSelector() {
  const { target, canViewAsOthers, viewAs, clear } = useViewAs();
  const { tenantId } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounce(term, SEARCH_DEBOUNCE_MS);

  const { data: users = [], isFetching } = useQuery({
    queryKey: ['view-as', 'users', tenantId, debouncedTerm],
    queryFn: () => fetchViewableUsers({ tenantId, term: debouncedTerm }),
    enabled: open && canViewAsOthers,
    staleTime: 60_000,
  });

  if (!canViewAsOthers) return null;

  const select = (next: ViewAsTarget | null) => {
    if (next) viewAs(next);
    else clear();
    setOpen(false);
    setTerm('');
  };

  const label = target ? `Visualizando: ${firstName(target.name)}` : 'Meu usuário';

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="view-as-trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            title={target ? `Visualizando como ${target.name}` : 'Visualizar como outro usuário'}
            className={
              target
                ? 'h-9 max-w-[220px] px-3 rounded-lg flex items-center gap-2 text-[13px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40 transition-colors'
                : 'h-9 max-w-[220px] px-3 rounded-lg flex items-center gap-2 text-[13px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors'
            }
          >
            <Eye className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className="truncate">{label}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              strokeWidth={2}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-72 p-0">
          {/* shouldFilter=false: a busca é no servidor, o cmdk não deve refiltrar. */}
          <Command shouldFilter={false}>
            <CommandInput
              data-testid="view-as-search"
              placeholder="Buscar usuário..."
              value={term}
              onValueChange={setTerm}
            />
            <CommandList>
              {isFetching ? (
                <div className="px-3 py-4 text-[13px] text-slate-500">Buscando...</div>
              ) : (
                <CommandEmpty>Nenhum usuário encontrado</CommandEmpty>
              )}
              <CommandGroup>
                <CommandItem value="__self__" onSelect={() => select(null)}>
                  <Check className={`mr-2 h-4 w-4 ${target ? 'opacity-0' : 'opacity-100'}`} />
                  <span className="font-medium">Meu usuário</span>
                </CommandItem>

                {users.map((user) => (
                  <CommandItem
                    key={user.userId}
                    value={user.userId}
                    onSelect={() => select(user)}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${target?.userId === user.userId ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{user.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{user.email}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {target && (
        <button
          type="button"
          data-testid="view-as-reset"
          onClick={clear}
          title="Voltar para meu usuário"
          aria-label="Voltar para meu usuário"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-500/15 transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
