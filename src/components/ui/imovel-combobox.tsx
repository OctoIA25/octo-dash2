import * as React from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Imovel } from "@/services/kenloService";

interface ImoveisComboBoxProps {
  imoveis: Imovel[];
  value?: string;
  onChange: (value: string, imovel?: Imovel) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

export function ImoveisComboBox({
  imoveis,
  value = "",
  onChange,
  placeholder = "Selecione um imóvel",
  emptyText = "Nenhum imóvel encontrado",
  className,
  disabled = false,
}: ImoveisComboBoxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [userInteracted, setUserInteracted] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Filtrar imóveis baseado na busca
  const filteredImoveis = React.useMemo(() => {
    // Se não há busca e não houve interação, não mostra nada
    if (!search && !userInteracted) return [];
    // Se não há busca mas houve interação (clicou na setinha), mostra todos
    if (!search) return imoveis;
    // Se há busca, filtra
    return imoveis.filter(imovel =>
      imovel.referencia.toLowerCase().includes(search.toLowerCase()) ||
      imovel.titulo.toLowerCase().includes(search.toLowerCase()) ||
      imovel.bairro.toLowerCase().includes(search.toLowerCase())
    );
  }, [imoveis, search, userInteracted]);

  // Sincronizar valor com input
  React.useEffect(() => {
    const selectedImovel = imoveis.find(imovel => imovel.referencia === value);
    if (selectedImovel) {
      setSearch(selectedImovel.referencia);
    } else {
      setSearch("");
    }
  }, [value, imoveis]);

  // Fechar dropdown quando clicar fora
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node) &&
          listRef.current && !listRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearch(newValue);
    setUserInteracted(true);
    // Só abre quando o usuário começar a digitar
    if (newValue.length > 0) {
      setOpen(true);
    }
  };

  const handleOptionSelect = (imovel: Imovel) => {
    setSearch(imovel.referencia);
    onChange(imovel.referencia, imovel);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={search}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => {
            setUserInteracted(true);
            setOpen(!open);
            inputRef.current?.focus();
          }}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              open && "transform rotate-180"
            )}
          />
        </button>
      </div>

      {open && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 max-h-72 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
        >
          {filteredImoveis.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              {emptyText}
            </div>
          ) : (
            <div className="py-1">
              {filteredImoveis.map((imovel, index) => (
                <button
                  key={`${imovel.referencia}-${index}`}
                  type="button"
                  onClick={() => handleOptionSelect(imovel)}
                  className="w-full px-3 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between gap-3 group border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Foto do imóvel */}
                    <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
                      {imovel.fotos && imovel.fotos.length > 0 ? (
                        <img
                          src={imovel.fotos[0]}
                          alt={imovel.titulo}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MapPin className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Info do imóvel */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">
                          {imovel.referencia}
                        </span>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                          {imovel.tipoSimplificado}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
                        {imovel.bairro} • {imovel.cidade}
                      </p>
                    </div>
                  </div>

                  {/* Check mark */}
                  {value === imovel.referencia && (
                    <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
