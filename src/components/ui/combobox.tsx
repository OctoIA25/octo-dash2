import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface ComboBoxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface ComboBoxProps {
  options: ComboBoxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
  className?: string;
  disabled?: boolean;
}

export function ComboBox({
  options,
  value = "",
  onChange,
  placeholder = "Selecione...",
  emptyText = "Nenhuma opção encontrada",
  allowCustom = false,
  className,
  disabled = false,
}: ComboBoxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Filtrar opções baseado na busca
  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    return options.filter(option =>
      option.label.toLowerCase().includes(search.toLowerCase()) ||
      option.sublabel?.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  // Sincronizar valor com input
  React.useEffect(() => {
    const selectedOption = options.find(opt => opt.value === value);
    if (selectedOption) {
      setSearch(selectedOption.label);
    } else if (allowCustom) {
      setSearch(value);
    } else {
      setSearch("");
    }
  }, [value, options, allowCustom]);

  // Fechar dropdown quando clicar fora
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node) &&
          listRef.current && !listRef.current.contains(event.target as Node)) {
        setOpen(false);
        // Se allowCustom e valor não está nas opções, salvar valor customizado
        if (allowCustom && search && !options.find(opt => opt.label === search)) {
          onChange(search);
        }
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, search, options, onChange, allowCustom]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearch(newValue);
    setOpen(true);
    
    if (allowCustom) {
      onChange(newValue);
    }
  };

  const handleOptionSelect = (option: ComboBoxOption) => {
    setSearch(option.label);
    onChange(option.value);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && allowCustom && search) {
      e.preventDefault();
      onChange(search);
      setOpen(false);
    } else if (e.key === 'Escape') {
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
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => {
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
          className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
              {emptyText}
            </div>
          ) : (
            <div className="py-1">
              {filteredOptions.map((option, index) => (
                <button
                  key={`${option.value}-${index}`}
                  type="button"
                  onClick={() => handleOptionSelect(option)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between group"
                >
                  <div className="flex flex-col">
                    <span className="text-gray-900 dark:text-white font-medium">
                      {option.label}
                    </span>
                    {option.sublabel && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {option.sublabel}
                      </span>
                    )}
                  </div>
                  {value === option.value && (
                    <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
