/**
 * Autocomplete de condomínio com preview no hover.
 *
 * - Digitar 2+ caracteres busca condomínios já cadastrados
 * - Hover mostra cidade, bairro, tipo, status, construtora e ano
 * - Click dispara onSelect com o condomínio escolhido (uso típico: carregar
 *   os dados completos no form e entrar em modo edit, evitando duplicidade)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Building2, MapPin, Hammer, CalendarDays, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  buscarCondominiosPorNome,
  type CondominioMatch,
} from '@/features/imoveis/services/condominioService';

interface CondominioAutocompleteProps {
  tenantId: string | null | undefined;
  value: string;
  onChange: (nome: string) => void;
  onSelect: (match: CondominioMatch) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  /** Quando true, exibe um check verde (ex.: já carregou dados de um condomínio existente) */
  applied?: boolean;
}

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export function CondominioAutocomplete({
  tenantId,
  value,
  onChange,
  onSelect,
  placeholder = 'Ex: Residencial das Flores, Edifício Central, etc.',
  disabled,
  className,
  autoFocus,
  applied,
}: CondominioAutocompleteProps) {
  const [matches, setMatches] = useState<CondominioMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastSearch = useRef<string>('');

  useEffect(() => {
    const termo = value.trim();
    if (!tenantId || termo.length < MIN_CHARS) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handle = setTimeout(async () => {
      lastSearch.current = termo;
      const data = await buscarCondominiosPorNome(tenantId, termo);
      if (lastSearch.current !== termo) return;
      setMatches(data);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [value, tenantId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setHoveredId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const hovered = useMemo(
    () => matches.find((m) => m.id === hoveredId) ?? null,
    [matches, hoveredId],
  );

  const showDropdown = open && value.trim().length >= MIN_CHARS && (loading || matches.length > 0);

  const handleSelect = (match: CondominioMatch) => {
    onSelect(match);
    setOpen(false);
    setHoveredId(null);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 pr-9 text-lg"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          autoComplete="off"
          autoFocus={autoFocus}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
        {!loading && applied && (
          <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[10000] bg-popover text-popover-foreground border rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {matches.length === 0 && !loading && (
              <div className="p-3 text-sm text-muted-foreground text-center">
                Nenhum condomínio encontrado.
              </div>
            )}
            {matches.map((m) => {
              const subtitle = [m.bairro, m.cidade].filter(Boolean).join(' · ');
              const isHover = m.id === hoveredId;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors border-b last:border-b-0',
                    isHover ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                  onMouseEnter={() => setHoveredId(m.id)}
                  onMouseLeave={() => setHoveredId((cur) => (cur === m.id ? null : cur))}
                  onClick={() => handleSelect(m)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.nome}</div>
                      {subtitle && (
                        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                      )}
                    </div>
                  </div>
                  {m.tipo && (
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      {m.tipo}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {hovered && (
            <div className="border-t bg-card/60 p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Dados salvos
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {[hovered.logradouro, hovered.numero].filter(Boolean).join(', ') ||
                      [hovered.bairro, hovered.cidade].filter(Boolean).join(' · ') ||
                      '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Hammer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{hovered.construtora || '—'}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {hovered.ano_construcao ? `Ano ${hovered.ano_construcao}` : 'Ano —'}
                    {hovered.num_blocos_torres
                      ? ` · ${hovered.num_blocos_torres} bloco(s)`
                      : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {[hovered.tipo, hovered.status].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1">
                Clique para carregar os dados deste condomínio (modo edição)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
