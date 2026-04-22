import { useSearchParams } from 'react-router-dom';
import { Search, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export function ImoveisMapHeaderFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const tipoFiltro = searchParams.get('tipo') ?? 'todos';
  const finalidadeFiltro = searchParams.get('finalidade') ?? 'todas';

  const update = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === '' || value === 'todos' || value === 'todas') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
      <div className="flex items-center gap-2 mr-1 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-sm shadow-blue-500/30">
          <MapPin className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          Mapa de Imóveis
        </span>
      </div>

      <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />

      <div className="relative w-[260px] shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => update('q', e.target.value)}
          placeholder="Buscar por bairro, cidade, condomínio…"
          className="h-8 pl-9 text-[12.5px]"
        />
      </div>

      <Select value={tipoFiltro} onValueChange={(v) => update('tipo', v)}>
        <SelectTrigger className="h-8 w-[140px] text-[12.5px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os tipos</SelectItem>
          <SelectItem value="apartamento">Apartamento</SelectItem>
          <SelectItem value="casa">Casa</SelectItem>
          <SelectItem value="terreno">Terreno</SelectItem>
          <SelectItem value="comercial">Comercial</SelectItem>
          <SelectItem value="rural">Rural</SelectItem>
        </SelectContent>
      </Select>

      <Select value={finalidadeFiltro} onValueChange={(v) => update('finalidade', v)}>
        <SelectTrigger className="h-8 w-[130px] text-[12.5px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Venda + Locação</SelectItem>
          <SelectItem value="venda">Apenas Venda</SelectItem>
          <SelectItem value="locacao">Apenas Locação</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
