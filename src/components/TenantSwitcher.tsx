/**
 * Seletor de imobiliária da sidebar — owner troca de tenant sem deslogar.
 *
 * Só aparece para owner: é o mesmo poder que ele já tem no painel de owner,
 * só que sem o ciclo sair/entrar. Como toda a autorização real está no RLS do
 * Supabase e no servidor, forçar este componente a aparecer não dá acesso a
 * nada (ver src/lib/ownerEmails.ts).
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, LayoutGrid } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useAuthContext } from '@/contexts/AuthContext';
import { enterTenant, exitTenant, fetchOwnerTenants } from '@/services/ownerTenantsService';

export function TenantSwitcher() {
  const { isOwner, tenantId, tenantName } = useAuthContext();
  const [open, setOpen] = useState(false);

  const { data: tenants = [], isFetching, isError } = useQuery({
    queryKey: ['owner', 'tenants'],
    queryFn: fetchOwnerTenants,
    enabled: open && isOwner,
    staleTime: 5 * 60_000,
  });

  if (!isOwner) return null;

  const label = tenantName || 'Imobiliária';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="tenant-switcher-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          title="Trocar de imobiliária"
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
        >
          <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center text-white text-[13px] font-semibold shrink-0">
            {label.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 text-left text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">
            {label}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar imobiliária..." />
          <CommandList>
            {isFetching ? (
              <div className="px-3 py-4 text-[13px] text-slate-500">Carregando...</div>
            ) : isError ? (
              <div className="px-3 py-4 text-[13px] text-rose-600">Erro ao carregar imobiliárias</div>
            ) : (
              <CommandEmpty>Nenhuma imobiliária encontrada</CommandEmpty>
            )}

            <CommandGroup>
              {tenants.map((tenant) => {
                const isCurrent = tenant.id === tenantId;
                return (
                  <CommandItem
                    key={tenant.id}
                    value={`${tenant.name} ${tenant.code}`}
                    onSelect={() => {
                      setOpen(false);
                      if (!isCurrent) enterTenant(tenant);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 shrink-0 ${isCurrent ? 'opacity-100' : 'opacity-0'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{tenant.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{tenant.code}</p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="painel do owner" onSelect={exitTenant}>
                <LayoutGrid className="mr-2 h-4 w-4 shrink-0 text-slate-500" />
                <span className="text-[13px] font-medium">Painel do owner</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
