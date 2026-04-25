/**
 * Autocomplete de proprietário com preview no hover.
 *
 * - Digitar 2+ caracteres dispara busca debounced em imoveis_locais
 * - Itens do dropdown mostram nome + total de imóveis
 * - Hover em um item exibe um painel abaixo com telefone, email e imóveis
 * - Click aplica os dados ao formulário
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, User, Phone, Mail, Building2, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  buscarProprietariosPorNome,
  type ProprietarioMatch,
} from '@/features/imoveis/services/proprietarioService';

interface ProprietarioAutocompleteProps {
  tenantId: string | null | undefined;
  value: string;
  onChange: (nome: string) => void;
  onSelect: (match: ProprietarioMatch) => void;
  placeholder?: string;
  disabled?: boolean;
}

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export function ProprietarioAutocomplete({
  tenantId,
  value,
  onChange,
  onSelect,
  placeholder = 'Nome completo',
  disabled,
}: ProprietarioAutocompleteProps) {
  const [matches, setMatches] = useState<ProprietarioMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [appliedKey, setAppliedKey] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastSearch = useRef<string>('');

  // Debounced fetch
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
      const data = await buscarProprietariosPorNome(tenantId, termo);
      // Evita race entre buscas
      if (lastSearch.current !== termo) return;
      setMatches(data);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [value, tenantId]);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setHoveredKey(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const keyOf = (m: ProprietarioMatch): string =>
    `${m.nome}|${m.telefone ?? ''}|${m.email ?? ''}`.toLowerCase();

  const hovered = useMemo(
    () => matches.find((m) => keyOf(m) === hoveredKey) ?? null,
    [matches, hoveredKey],
  );

  const showDropdown = open && value.trim().length >= MIN_CHARS && (loading || matches.length > 0);

  const handleSelect = (match: ProprietarioMatch) => {
    onSelect(match);
    setAppliedKey(keyOf(match));
    setOpen(false);
    setHoveredKey(null);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 pr-9"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            if (appliedKey) setAppliedKey(null);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
        {!loading && appliedKey && (
          <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover text-popover-foreground border rounded-lg shadow-lg overflow-hidden">
          {/* Lista */}
          <div className="max-h-64 overflow-y-auto">
            {matches.length === 0 && !loading && (
              <div className="p-3 text-sm text-muted-foreground text-center">
                Nenhum proprietário encontrado.
              </div>
            )}
            {matches.map((m) => {
              const k = keyOf(m);
              const isHover = k === hoveredKey;
              return (
                <button
                  key={k}
                  type="button"
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors border-b last:border-b-0',
                    isHover ? 'bg-accent' : 'hover:bg-accent/60',
                  )}
                  onMouseEnter={() => setHoveredKey(k)}
                  onMouseLeave={() => setHoveredKey((cur) => (cur === k ? null : cur))}
                  onClick={() => handleSelect(m)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="truncate font-medium">{m.nome}</span>
                  </div>
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <Building2 className="h-3 w-3" />
                    {m.total_imoveis}
                  </Badge>
                </button>
              );
            })}
          </div>

          {/* Preview do item em hover */}
          {hovered && (
            <div className="border-t bg-card/60 p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Dados salvos
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{hovered.telefone || '—'}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{hovered.email || '—'}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {hovered.total_imoveis} imóvel(is) cadastrado(s)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hovered.imoveis.slice(0, 6).map((im) => (
                    <Badge key={im.codigo_imovel} variant="outline" className="font-mono text-xs">
                      {im.codigo_imovel}
                    </Badge>
                  ))}
                  {hovered.imoveis.length > 6 && (
                    <Badge variant="outline" className="text-xs">
                      +{hovered.imoveis.length - 6}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1">
                Clique para preencher automaticamente
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
