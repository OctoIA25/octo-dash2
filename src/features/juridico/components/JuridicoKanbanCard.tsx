import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SavedProposal } from '@/features/leads/services/proposalsService';

interface JuridicoKanbanCardProps {
  proposal: SavedProposal;
  brokerPhoto?: string;
  onClick?: () => void;
}

const formatCurrencyWithCents = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const getInitials = (name: string) => {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

const formatAddressLine = (proposal: SavedProposal) => {
  const street = [proposal.logradouro, proposal.numero].filter(Boolean).join(', ');
  const complement = proposal.complemento ? `, ${proposal.complemento}` : '';
  const city = [proposal.cidade, proposal.uf].filter(Boolean).join(' - ');
  const cep = proposal.cep ? `CEP ${String(proposal.cep).replace(/\D/g, '')}` : '';
  return [street ? `${street}${complement}` : '', proposal.bairro, city, cep].filter(Boolean).join(', ');
};

const parseAmount = (value: number | string | null | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value || '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function JuridicoKanbanCard({ proposal, brokerPhoto, onClick }: JuridicoKanbanCardProps) {
  const buyer = proposal.parties.find((party) => party.party_type === 'comprador');
  const clientName = buyer?.full_name?.trim() || 'Cliente pendente';
  const brokerName = proposal.agent_name?.trim() || 'A definir';
  const value = parseAmount(proposal.value);
  const propertyRef = proposal.property_reference || 'Sem código';
  const address = formatAddressLine(proposal);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full rounded-lg border border-slate-200 bg-white p-3 text-left',
        'hover:border-slate-300 hover:shadow-sm transition-all',
        'dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar className="h-9 w-9 shrink-0">
          {brokerPhoto && <AvatarImage src={brokerPhoto} alt={brokerName} />}
          <AvatarFallback className="bg-slate-200 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {getInitials(brokerName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{clientName}</p>
            {proposal.has_financing && (
              <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-50 px-1.5 py-0 text-[9px] font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                FIN
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
            {formatCurrencyWithCents(value)}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-600 dark:text-slate-300">{propertyRef}</span>
            {address ? ` ${address}` : ''}
          </p>
          <p className="mt-1.5 truncate text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {brokerName}
          </p>
        </div>
      </div>
    </button>
  );
}
