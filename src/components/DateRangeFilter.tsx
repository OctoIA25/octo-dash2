import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DateRangeFilterProps {
  onDateRangeChange: (startDate: string, endDate: string) => void;
  label?: string;
}

export const DateRangeFilter = ({ onDateRangeChange, label = "Período" }: DateRangeFilterProps) => {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [isOpen, setIsOpen] = useState(false);

  const handleApply = () => {
    onDateRangeChange(startDate, endDate);
    setIsOpen(false);
  };

  const handlePreset = (days: number) => {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setStartDate(start);
    setEndDate(end);
    onDateRangeChange(start, end);
    setIsOpen(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/15 transition-colors text-sm font-medium"
      >
        <Calendar className="w-4 h-4" />
        <span>{formatDate(startDate)} - {formatDate(endDate)}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 bg-bg-card border border-white/20 rounded-lg p-4 shadow-lg z-50 min-w-[320px]">
          <div className="space-y-3">
            {/* Presets rápidos */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/60 uppercase">Períodos Rápidos</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePreset(7)}
                  className="px-2 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  Últimos 7 dias
                </button>
                <button
                  onClick={() => handlePreset(30)}
                  className="px-2 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  Últimos 30 dias
                </button>
                <button
                  onClick={() => handlePreset(90)}
                  className="px-2 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  Últimos 90 dias
                </button>
                <button
                  onClick={() => handlePreset(365)}
                  className="px-2 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  Último ano
                </button>
              </div>
            </div>

            {/* Divisor */}
            <div className="border-t border-white/10" />

            {/* Seleção customizada */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/60 uppercase">Período Customizado</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-white/60 block mb-1">Data Inicial</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/60 block mb-1">Data Final</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-white/40"
                  />
                </div>
              </div>
            </div>

            {/* Botões de ação */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 px-2 py-1.5 rounded bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApply}
                className="flex-1 px-2 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
